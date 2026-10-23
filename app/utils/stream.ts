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
  const tauri = typeof window !== "undefined" ? window.__TAURI__ : undefined;
  if (!tauri) return globalThis.fetch(input, options);
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
  let rejectRequest: ((error: Error) => void) | undefined;
  const cleanup = () => {
    unlisten?.();
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
  const abort = () => {
    if (dispatched)
      void tauri.invoke("cancel_stream", { requestId }).catch(() => {});
    fail(new DOMException("The operation was aborted.", "AbortError"));
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      finished = true;
      cleanup();
      if (dispatched)
        void tauri.invoke("cancel_stream", { requestId }).catch(() => {});
    },
  });
  // Install the listener before Rust can emit any bytes.
  unlisten = await tauri.event.listen<{
    request_id: string;
    chunk?: number[];
    status?: number;
    error?: string;
  }>("stream-response", ({ payload }) => {
    if (payload.request_id !== requestId || finished) return;
    if (payload.error) fail(new Error(payload.error));
    else if (payload.chunk)
      streamController.enqueue(new Uint8Array(payload.chunk));
    else if (payload.status === 0) {
      finished = true;
      streamController.close();
      cleanup();
    }
  });
  return new Promise<Response>((resolve, reject) => {
    rejectRequest = reject;
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    dispatched = true;
    tauri
      .invoke("stream_fetch", {
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
