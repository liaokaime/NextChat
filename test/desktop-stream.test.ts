/** @jest-environment node */
import { jest } from "@jest/globals";
import { fetch as desktopFetch } from "../app/utils/stream";

let handler: (event: { payload: any }) => void;
let unlisten: ReturnType<typeof jest.fn>;
function bridge(
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>,
) {
  unlisten = jest.fn();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __TAURI__: {
        invoke,
        event: {
          listen: async (_name: string, callback: typeof handler) => {
            handler = callback;
            return unlisten;
          },
        },
      },
    },
  });
}
afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

test("subscribes before dispatch, keeps early bytes and preserves complete error bodies", async () => {
  const body = JSON.stringify({ error: "详细错误信息".repeat(300) });
  bridge(async (command, args) => {
    expect(command).toBe("stream_fetch");
    handler({ payload: { request_id: "different-request", chunk: [88] } });
    handler({
      payload: {
        request_id: args!.requestId,
        chunk: Array.from(new TextEncoder().encode(body)),
      },
    });
    handler({ payload: { request_id: args!.requestId, status: 0 } });
    return {
      request_id: args!.requestId,
      status: 401,
      status_text: "Unauthorized",
      headers: { "content-type": "application/json" },
    };
  });
  const response = await desktopFetch(
    new Request("https://example.test/v1/messages", {
      method: "POST",
      headers: new Headers({ "X-Test": "yes" }),
      body: "{}",
    }),
  );
  expect(response.status).toBe(401);
  expect(await response.text()).toBe(body);
  expect(unlisten).toHaveBeenCalledTimes(1);
});

test("abort before response headers cancels the actual Rust request and rejects promptly", async () => {
  const calls: string[] = [];
  bridge(async (command) => {
    calls.push(command);
    return command === "stream_fetch" ? new Promise(() => {}) : undefined;
  });
  const controller = new AbortController();
  const pending = desktopFetch("https://example.test", {
    signal: controller.signal,
  });
  await new Promise(setImmediate);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toEqual(["stream_fetch", "cancel_stream"]);
  expect(unlisten).toHaveBeenCalledTimes(1);
});

test("stream errors propagate to the reader and release the listener", async () => {
  let id: unknown;
  bridge(async (_command, args) => {
    id = args!.requestId;
    return { status: 200, status_text: "OK", headers: {} };
  });
  const response = await desktopFetch("https://example.test");
  const reading = response.text();
  handler({ payload: { request_id: id, error: "socket closed" } });
  await expect(reading).rejects.toThrow("socket closed");
  expect(unlisten).toHaveBeenCalledTimes(1);
});

test("aborted inputs never dispatch a request", async () => {
  const invoke = jest.fn<() => Promise<unknown>>();
  bridge(invoke);
  await expect(
    desktopFetch("https://example.test", { signal: AbortSignal.abort() }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(invoke).not.toHaveBeenCalled();
});

test("abort between an early end event and response metadata still settles the request", async () => {
  const controller = new AbortController();
  bridge(async (command, args) => {
    if (command === "cancel_stream") return;
    handler({ payload: { request_id: args!.requestId, status: 0 } });
    controller.abort();
    return { status: 200, status_text: "OK", headers: {} };
  });
  await expect(
    desktopFetch("https://example.test", { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
});
