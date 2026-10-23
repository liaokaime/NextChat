import type { LLMApi, LLMConfig } from "./api";

// Callbacks are used because some legacy streaming adapters return before finishing.
export function testConnection(
  api: LLMApi,
  config: LLMConfig,
  signal: AbortSignal,
  messages: { empty: string; timeout: string },
  timeoutMs = 30000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let controller: AbortController | undefined;
    let settled = false;
    let reasoning = "";
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    };
    const abort = () => {
      finish(new Error(messages.timeout));
      controller?.abort();
    };
    const timer = setTimeout(abort, timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    Promise.resolve()
      .then(() =>
        settled
          ? undefined
          : api.chat({
              messages: [{ role: "user", content: "Reply with OK." }],
              config: { ...config, stream: true },
              onController(value) {
                controller = value;
                if (settled || signal.aborted) value.abort();
              },
              onReasoning(value) {
                reasoning = value;
              },
              onError(error) {
                finish(error);
                controller?.abort();
              },
              onFinish(text, response) {
                if (!response?.ok) {
                  finish(new Error(`HTTP ${response?.status ?? "error"}`));
                  return;
                }
                if (!text.trim() && !reasoning.trim()) {
                  finish(new Error(messages.empty));
                  return;
                }
                try {
                  const data = JSON.parse(text);
                  if (
                    data?.error ||
                    data?.error_code ||
                    data?.Error ||
                    data?.Response?.Error
                  ) {
                    finish(
                      new Error(
                        String(
                          data.error?.message ||
                            data.error_msg ||
                            data.Error?.Message ||
                            data.Response?.Error?.Message ||
                            text,
                        ),
                      ),
                    );
                    return;
                  }
                } catch {
                  /* A normal text reply is expected. */
                }
                finish();
              },
            }),
      )
      .catch((error) =>
        finish(error instanceof Error ? error : new Error(String(error))),
      );
  });
}
