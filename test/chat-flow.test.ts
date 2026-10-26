import { jest } from "@jest/globals";
import { ChatGPTApi } from "../app/client/platforms/openai";
import { SdkApi } from "../app/client/platforms/ai-sdk";
import { ServiceProvider } from "../app/constant";
import { createMessage, useChatStore } from "../app/store/chat";
import { useAppConfig } from "../app/store/config";

const routes = [
  { name: "legacy", providerId: undefined, api: ChatGPTApi },
  { name: "SDK", providerId: "openai", api: SdkApi },
];

const originalAutoTitle = useAppConfig.getState().enableAutoGenerateTitle;
beforeEach(() => {
  useAppConfig.setState({ enableAutoGenerateTitle: false });
  useChatStore.getState().clearSessions();
  const session = useChatStore.getState().currentSession();
  session.mask.context = [];
  session.mask.modelConfig = {
    ...session.mask.modelConfig,
    model: "gpt-4o",
    providerName: ServiceProvider.OpenAI,
    enableInjectSystemPrompts: false,
    sendMemory: false,
    historyMessageCount: 10,
    max_tokens: 4000,
    template: "Question: {{input}}",
  };
  jest.mocked(global.fetch).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  useAppConfig.setState({ enableAutoGenerateTitle: originalAutoTitle });
});

describe.each(routes)("$name chat", ({ providerId, api }) => {
  test.each([false, true])(
    "builds history locally with system prompt injection %s",
    async (enableInjectSystemPrompts) => {
      const store = useChatStore.getState();
      const session = store.currentSession();
      Object.assign(session.mask.modelConfig, {
        providerId,
        enableInjectSystemPrompts,
      });
      const context = createMessage({ role: "system", content: "Be concise." });
      session.mask.context = [context];
      session.messages = [
        createMessage({ role: "user", content: "Earlier question" }),
        createMessage({ role: "assistant", content: "Earlier answer" }),
      ];

      const history = await store.getMessagesWithMemory();

      expect(history).toHaveLength(enableInjectSystemPrompts ? 4 : 3);
      if (enableInjectSystemPrompts) {
        expect(history[0]).toMatchObject({ role: "system" });
        expect(history[0].content).toEqual(expect.any(String));
        expect(history[0].content.length).toBeGreaterThan(0);
      }
      expect(history.slice(enableInjectSystemPrompts ? 1 : 0)).toEqual([
        context,
        ...session.messages,
      ]);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  test("keeps former tool replies as text and never starts another turn", async () => {
    const chat = jest.spyOn(api.prototype, "chat").mockResolvedValue(undefined);
    const store = useChatStore.getState();
    const session = store.currentSession();
    session.mask.modelConfig.providerId = providerId;
    const oldReply = Object.assign(
      createMessage({
        role: "user",
        content: '```json:mcp-response:old-client\n{"result":"saved"}\n```',
      }),
      { isMcpResponse: true },
    );
    session.messages = [oldReply];

    await store.onUserInput("Explain this code");
    const request = chat.mock.calls[0][0];
    expect(request.messages[0]).toEqual(oldReply);
    const reply =
      '```json:mcp:old-client\n{"method":"tools/call","params":{"name":"example"}}\n```';
    request.onReasoning?.("Reading the example");
    request.onUpdate?.(reply, reply);
    expect(session.messages.at(-1)).toMatchObject({
      streaming: true,
      reasoning: "Reading the example",
      content: reply,
    });
    await request.onFinish(reply, { status: 200 } as Response);
    // Flush microtasks so an accidental automatic follow-up would be observed.
    await Promise.resolve();

    expect(chat).toHaveBeenCalledTimes(1);
    expect(session.messages).toHaveLength(3);
    expect(session.messages[0]).toEqual(oldReply);
    expect(session.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: reply,
      streaming: false,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("applies the input template and stores a streaming placeholder", async () => {
    const chat = jest.spyOn(api.prototype, "chat").mockResolvedValue(undefined);
    const session = useChatStore.getState().currentSession();
    session.mask.modelConfig.providerId = providerId;

    await useChatStore.getState().onUserInput("Hello");

    expect(chat.mock.calls[0][0].messages).toEqual([
      expect.objectContaining({ role: "user", content: "Question: Hello" }),
    ]);
    expect(session.messages).toEqual([
      expect.objectContaining({ role: "user", content: "Question: Hello" }),
      expect.objectContaining({ role: "assistant", streaming: true }),
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("preserves image attachments in the submitted and saved message", async () => {
    const chat = jest.spyOn(api.prototype, "chat").mockResolvedValue(undefined);
    const session = useChatStore.getState().currentSession();
    session.mask.modelConfig.providerId = providerId;
    const image = "data:image/png;base64,aGVsbG8=";

    await useChatStore.getState().onUserInput("Describe this", [image]);

    const content = [
      { type: "text", text: "Describe this" },
      { type: "image_url", image_url: { url: image } },
    ];
    expect(chat.mock.calls[0][0].messages).toEqual([
      expect.objectContaining({ role: "user", content }),
    ]);
    expect(session.messages[0]).toMatchObject({ role: "user", content });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
