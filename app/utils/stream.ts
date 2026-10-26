import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type StreamResponse = {
  request_id: string;
  status: number;
  status_text: string;
  headers: Record<string, string>;
};

export async function fetch(
  input: RequestInfo | URL,
  options?: RequestInit,
): Promise<Response> {
  if (typeof window === "undefined" || !isTauri())
    return globalThis.fetch(input, options);
  const request = new Request(input, options);
  const { signal } = request;
  if (signal.aborted)
    throw new DOMException("The operation was aborted.", "AbortError");
  const body = ["GET", "HEAD"].includes(request.method)
    ? []
    : Array.from(new Uint8Array(await request.arrayBuffer()));
  const requestId = crypto.randomUUID();
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  let unlisten: (() => void) | undefined;
  let finished = false;
  let dispatched = false;
  let cancelled = false;
  let rejectRequest: ((error: Error) => void) | undefined;
  const cleanup = () => {
    unlisten?.();
    unlisten = undefined;
    signal.removeEventListener("abort", abort);
  };
  const fail = (error: Error) => {
    if (!finished) {
      finished = true;
      streamController.error(error);
    }
    cleanup();
    rejectRequest?.(error);
  };
  const cancelRequest = () => {
    if (dispatched && !cancelled) {
      cancelled = true;
      void invoke("cancel_stream", { requestId }).catch(() => {});
    }
  };
  const abort = () => {
    cancelRequest();
    fail(new DOMException("The operation was aborted.", "AbortError"));
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      finished = true;
      cleanup();
      cancelRequest();
    },
  });
  // Install the listener before Rust can emit any bytes.
  unlisten = await listen<{
    request_id: string;
    chunk?: number[];
    status?: number;
    error?: string;
  }>(
    "stream-response",
    ({ payload }) => {
      if (payload.request_id !== requestId || finished) return;
      if (payload.error) fail(new Error(payload.error));
      else if (payload.chunk)
        streamController.enqueue(new Uint8Array(payload.chunk));
      else if (payload.status === 0) {
        finished = true;
        streamController.close();
        cleanup();
      }
    },
    { target: { kind: "WebviewWindow", label: "main" } },
  );
  return new Promise<Response>((resolve, reject) => {
    rejectRequest = reject;
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    dispatched = true;
    invoke<StreamResponse>("stream_fetch", {
      requestId,
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
    })
      .then((response: StreamResponse) => {
        if (signal.aborted) {
          abort();
          return;
        }
        const noBody =
          request.method === "HEAD" ||
          [204, 205, 304].includes(response.status);
        if (noBody && !finished) {
          finished = true;
          streamController.close();
          cleanup();
          cancelRequest();
        }
        resolve(
          new Response(noBody ? null : stream, {
            status: response.status,
            statusText: response.status_text,
            headers: response.headers,
          }),
        );
      })
      .catch((error: unknown) =>
        fail(error instanceof Error ? error : new Error(String(error))),
      );
  });
}
