/** @jest-environment node */
import { jest } from "@jest/globals";
import { testConnection } from "../app/client/connection-test";
import { getHeaders, type ChatOptions, type LLMApi } from "../app/client/api";
import { useAccessStore } from "../app/store/access";
import { useChatStore } from "../app/store/chat";
import { ServiceProvider } from "../app/constant";

const messages = { empty: "empty", timeout: "timeout" };
const api = (chat: (options: ChatOptions) => Promise<void>) =>
  ({ chat }) as LLMApi;

test("connection tests wait for delayed adapter callbacks without writing chat history", async () => {
  let request: ChatOptions | undefined;
  const originalMessages = useChatStore.getState().currentSession().messages;
  const pending = testConnection(
    api(async (options) => {
      request = options;
    }),
    { model: "chosen-model", providerName: "Google" },
    new AbortController().signal,
    messages,
  );
  await Promise.resolve();
  expect(request?.config).toMatchObject({
    model: "chosen-model",
    providerName: "Google",
    stream: true,
  });
  request!.onFinish("OK", new Response());
  await expect(pending).resolves.toBeUndefined();
  expect(useChatStore.getState().currentSession().messages).toBe(
    originalMessages,
  );
});

test.each([401, 404, 500])("HTTP %s is a failed test", async (status) => {
  await expect(
    testConnection(
      api(async (options) =>
        options.onFinish("failure", new Response(null, { status })),
      ),
      { model: "model" },
      new AbortController().signal,
      messages,
    ),
  ).rejects.toThrow(`HTTP ${status}`);
});

test("an API error inside an HTTP 200 response and an empty stream are failures", async () => {
  await expect(
    testConnection(
      api(async (o) =>
        o.onFinish('{"error":{"message":"bad model"}}', new Response()),
      ),
      { model: "model" },
      new AbortController().signal,
      messages,
    ),
  ).rejects.toThrow("bad model");
  await expect(
    testConnection(
      api(async (o) => o.onFinish("", new Response())),
      { model: "model" },
      new AbortController().signal,
      messages,
    ),
  ).rejects.toThrow("empty");
});

test("timeouts abort the adapter and late success cannot override failure", async () => {
  jest.useFakeTimers();
  let request: ChatOptions | undefined;
  const controller = new AbortController();
  const pending = testConnection(
    api(async (o) => {
      request = o;
      o.onController?.(controller);
    }),
    { model: "model" },
    new AbortController().signal,
    messages,
    30,
  );
  const rejected = expect(pending).rejects.toThrow("timeout");
  await Promise.resolve();
  jest.advanceTimersByTime(30);
  await rejected;
  expect(controller.signal.aborted).toBe(true);
  request!.onFinish("late OK", new Response());
  jest.useRealTimers();
});

test("request-scoped authentication uses the selected provider rather than the current chat", () => {
  const access = useAccessStore.getState();
  useAccessStore.setState({
    openaiApiKey: "openai-test-key",
    googleApiKey: "google-test-key",
    anthropicApiKey: "anthropic-test-key",
  });
  expect(
    getHeaders(false, { providerName: ServiceProvider.Google })[
      "x-goog-api-key"
    ],
  ).toBe("google-test-key");
  expect(
    getHeaders(false, { providerName: ServiceProvider.Anthropic })["x-api-key"],
  ).toBe("anthropic-test-key");
  expect(
    getHeaders(false, { providerName: ServiceProvider.OpenAI }).Authorization,
  ).toBe("Bearer openai-test-key");
  useAccessStore.setState(access);
});
