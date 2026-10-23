/** @jest-environment node */
import { jest } from "@jest/globals";
import { ChatGPTApi } from "../app/client/platforms/openai";
import { GeminiProApi } from "../app/client/platforms/google";
import { ClaudeApi } from "../app/client/platforms/anthropic";
import { ServiceProvider } from "../app/constant";
import { useAccessStore, useChatStore } from "../app/store";
import type { ChatOptions } from "../app/client/api";

const fixtures = [
  {
    provider: ServiceProvider.OpenAI,
    model: "gpt-4",
    api: new ChatGPTApi(),
    events: [
      { choices: [{ delta: { reasoning_content: "先思考" } }] },
      { choices: [{ delta: { content: "你好" } }] },
      { choices: [{ delta: { content: "世界" } }] },
    ],
    expected: "> 先思考\n\n你好世界",
  },
  {
    provider: ServiceProvider.Google,
    model: "gemini-pro",
    api: new GeminiProApi(),
    events: [
      { candidates: [{ content: { parts: [{ text: "你好" }] } }] },
      {
        candidates: [
          { content: { parts: [{ text: "世界" }, { text: "再见" }] } },
        ],
      },
    ],
    expected: "你好世界\n\n再见",
  },
  {
    provider: ServiceProvider.Anthropic,
    model: "claude-3-haiku",
    api: new ClaudeApi(),
    events: [
      { type: "message_start", message: { role: "assistant" } },
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "你好" },
      },
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "世界" },
      },
      { type: "message_stop" },
    ],
    expected: "你好世界",
  },
];

beforeEach(() => {
  jest.useFakeTimers();
  globalThis.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(0), 16) as unknown as number;
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test.each(fixtures)(
  "$provider still streams a complete answer",
  async (fixture) => {
    useAccessStore.setState({ useCustomConfig: false, fetch() {} });
    const session = useChatStore.getState().currentSession();
    session.mask.modelConfig.providerName = fixture.provider;
    session.mask.modelConfig.model = fixture.model;
    const sse =
      fixture.events
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join("") + "data: [DONE]\n\n";
    const bytes = new TextEncoder().encode(sse);
    // Split UTF-8 characters and SSE fields across transport chunks.
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < bytes.length; i += 7)
            controller.enqueue(bytes.slice(i, i + 7));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
    const fetchMock = jest
      .mocked(globalThis.fetch)
      .mockResolvedValueOnce(response);
    fetchMock.mockClear();
    const onError = jest.fn();
    let finish!: (message: string) => void;
    const completed = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const options: ChatOptions = {
      messages: [{ role: "user", content: "你好" }],
      config: {
        model: fixture.model,
        providerName: fixture.provider,
        stream: true,
      },
      onFinish: finish,
      onError,
    };
    await fixture.api.chat(options);
    expect(await completed).toBe(fixture.expected);
    expect(onError).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("functions");
    jest.runOnlyPendingTimers();
  },
);
