/** @jest-environment node */
import { jest } from "@jest/globals";

const invokeMock =
  jest.fn<
    (command: string, args?: Record<string, unknown>) => Promise<unknown>
  >();
const listenMock =
  jest.fn<
    (
      event: string,
      callback: (event: { payload: any }) => void,
      options?: unknown,
    ) => Promise<() => void>
  >();
const isTauriMock = jest.fn(() => false);
jest.unstable_mockModule("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}));
jest.unstable_mockModule("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));
const { fetch: desktopFetch } = await import("../app/utils/stream");

let handler: (event: { payload: any }) => void;
let unlisten: ReturnType<typeof jest.fn>;
function bridge(
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>,
) {
  unlisten = jest.fn();
  isTauriMock.mockReturnValue(true);
  invokeMock.mockImplementation(invoke);
  listenMock.mockImplementation(async (_name, callback) => {
    handler = callback;
    return unlisten;
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
}
afterEach(() => {
  invokeMock.mockReset();
  listenMock.mockReset();
  isTauriMock.mockReset().mockReturnValue(false);
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
  expect(listenMock).toHaveBeenCalledWith(
    "stream-response",
    expect.any(Function),
    { target: { kind: "WebviewWindow", label: "main" } },
  );
  expect(await response.text()).toBe(body);
  expect(unlisten).toHaveBeenCalledTimes(1);
});

test("web and server calls use native fetch without any desktop IPC", async () => {
  const options = { headers: { "X-Test": "web" } };
  await desktopFetch("https://example.test", options);
  expect(globalThis.fetch).toHaveBeenCalledWith(
    "https://example.test",
    options,
  );
  expect(invokeMock).not.toHaveBeenCalled();
  expect(listenMock).not.toHaveBeenCalled();
});

test("cancelling the body stops Rust and removes the listener exactly once", async () => {
  bridge(async () => ({ status: 200, status_text: "OK", headers: {} }));
  const response = await desktopFetch("https://example.test");
  await response.body!.cancel();
  expect(invokeMock.mock.calls.map(([command]) => command)).toEqual([
    "stream_fetch",
    "cancel_stream",
  ]);
  expect(unlisten).toHaveBeenCalledTimes(1);
});

test.each([204, 205, 304])(
  "bodyless HTTP %i responses release their native request",
  async (status) => {
    bridge(async () => ({ status, status_text: "", headers: {} }));
    const response = await desktopFetch("https://example.test");
    expect(response.body).toBeNull();
    expect(response.status).toBe(status);
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(
      "cancel_stream",
      expect.any(Object),
    );
  },
);

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

test("concurrent requests keep their response bytes isolated", async () => {
  bridge(async () => ({ status: 200, status_text: "OK", headers: {} }));
  const [first, second] = await Promise.all([
    desktopFetch("https://first.test"),
    desktopFetch("https://second.test"),
  ]);
  const ids = invokeMock.mock.calls.map(([, args]) => args!.requestId);
  for (const [, callback] of listenMock.mock.calls) {
    for (const [index, request_id] of ids.entries()) {
      callback({ payload: { request_id, chunk: [65 + index] } });
      callback({ payload: { request_id, status: 0 } });
    }
  }
  expect(await first.text()).toBe("A");
  expect(await second.text()).toBe("B");
});

test("an IPC failure rejects the request and releases its listener", async () => {
  bridge(async () => {
    throw new Error("command denied");
  });
  await expect(desktopFetch("https://example.test")).rejects.toThrow(
    "command denied",
  );
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
