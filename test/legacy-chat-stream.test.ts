/** @jest-environment node */
import { jest } from "@jest/globals";
import { ChatGPTApi } from "../app/client/platforms/openai";
import { GeminiProApi } from "../app/client/platforms/google";
import { ClaudeApi } from "../app/client/platforms/anthropic";
import { MoonshotApi } from "../app/client/platforms/moonshot";
import { DeepSeekApi } from "../app/client/platforms/deepseek";
import { ServiceProvider } from "../app/constant";
import { useAccessStore, useChatStore } from "../app/store";
import type { ChatOptions } from "../app/client/api";

const fixtures = [
  {
    provider: ServiceProvider.DeepSeek,
    model: "deepseek-flash",
    api: new DeepSeekApi(),
    events: [
      { choices: [{ delta: { content: "你好" } }] },
      { choices: [{ delta: { content: "世界" } }] },
    ],
    expected: "你好世界",
  },
  {
    provider: ServiceProvider.Moonshot,
    model: "kimi-k3.1-pro",
    api: new MoonshotApi(),
    events: [
      { choices: [{ delta: { content: "你好" } }] },
      { choices: [{ delta: { content: "世界" } }] },
    ],
    expected: "你好世界",
  },
  {
    provider: ServiceProvider.OpenAI,
    model: "gpt-6-luna",
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
    model: "gemini-3.8-flash",
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
    model: "claude-haiku-5-5",
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
      messages: [
        {
          role: "user",
          content:
            fixture.provider === ServiceProvider.Moonshot ||
            fixture.provider === ServiceProvider.DeepSeek
              ? [
                  { type: "text", text: "你好" },
                  {
                    type: "image_url",
                    image_url: { url: "data:image/png;base64,iVBORw0KGgo=" },
                  },
                ]
              : "你好",
        },
      ],
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
    if (
      fixture.provider === ServiceProvider.Moonshot ||
      fixture.provider === ServiceProvider.DeepSeek
    ) {
      expect(body.messages[0].content).toEqual(options.messages[0].content);
    }
    if (
      fixture.provider === ServiceProvider.OpenAI ||
      fixture.provider === ServiceProvider.Moonshot
    ) {
      if (fixture.provider === ServiceProvider.OpenAI)
        expect(body).toHaveProperty("max_completion_tokens");
      for (const key of [
        "temperature",
        "top_p",
        "presence_penalty",
        "frequency_penalty",
        "max_tokens",
      ])
        expect(body).not.toHaveProperty(key);
    }
    if (fixture.provider === ServiceProvider.Anthropic) {
      for (const key of ["temperature", "top_p", "top_k"])
        expect(body).not.toHaveProperty(key);
    }
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("functions");
    jest.runOnlyPendingTimers();
  },
);
