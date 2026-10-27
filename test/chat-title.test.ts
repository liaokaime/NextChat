import { jest } from "@jest/globals";
import { ChatGPTApi } from "../app/client/platforms/openai";
import { SdkApi } from "../app/client/platforms/ai-sdk";
import { ServiceProvider } from "../app/constant";
import { createMessage, DEFAULT_TOPIC, useChatStore } from "../app/store/chat";
import { useAppConfig } from "../app/store/config";
import type { ChatOptions } from "../app/client/api";

const originalAutoTitle = useAppConfig.getState().enableAutoGenerateTitle;
const ok = { ok: true, status: 200 } as Response;
const routes = [
  { name: "legacy", providerId: undefined, api: ChatGPTApi },
  { name: "SDK", providerId: "relay", api: SdkApi },
];

beforeEach(() => {
  useAppConfig.setState({ enableAutoGenerateTitle: true });
  useChatStore.getState().clearSessions();
  const session = useChatStore.getState().currentSession();
  session.mask.context = [];
  Object.assign(session.mask.modelConfig, {
    model: "gpt-4o",
    providerName: ServiceProvider.OpenAI,
    compressModel: "",
    sendMemory: false,
    enableInjectSystemPrompts: false,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  useAppConfig.setState({ enableAutoGenerateTitle: originalAutoTitle });
});

describe.each(routes)("$name titles", ({ providerId, api }) => {
  function setup() {
    const chat = jest.spyOn(api.prototype, "chat").mockResolvedValue(undefined);
    const store = useChatStore.getState();
    const session = store.currentSession();
    session.mask.modelConfig.providerId = providerId;
    session.messages = [
      createMessage({ role: "user", content: "你好" }),
      createMessage({ role: "assistant", content: "你好！" }),
    ];
    return { chat, store, session };
  }

  test("generates a title after the first short reply completes", async () => {
    const { chat, store, session } = setup();
    session.messages = [];
    await store.onUserInput("你好");
    expect(chat).toHaveBeenCalledTimes(1);
    const reply = chat.mock.calls[0][0];
    await reply.onFinish("你好！", ok);
    expect(chat).toHaveBeenCalledTimes(2);
    const title = chat.mock.calls[1][0];
    expect(title).toMatchObject({
      outputTask: "title",
      config: { providerId, model: "gpt-4o", stream: false },
    });
    title.onFinish("“日常问候”。", ok);
    expect(store.currentSession().topic).toBe("日常问候");
    store.onNewMessage(session.messages.at(-1)!, session);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  test("keeps automatic generation disabled but allows manual refresh", () => {
    const { chat, store, session } = setup();
    useAppConfig.setState({ enableAutoGenerateTitle: false });
    store.summarizeSession(false, session);
    expect(chat).not.toHaveBeenCalled();
    store.summarizeSession(true, session);
    chat.mock.calls[0][0].onFinish("手动总结", ok);
    expect(store.currentSession().topic).toBe("手动总结");
  });

  test("keeps custom titles and checks the current title after a deep clone", () => {
    const { chat, store, session } = setup();
    session.topic = "自定义标题";
    store.summarizeSession(false, session);
    expect(chat).not.toHaveBeenCalled();
    store.summarizeSession(true, session);
    store.update((state) => {
      state.sessions[0].topic = "新手动标题";
    });
    chat.mock.calls[0][0].onFinish("过期标题", ok);
    expect(store.currentSession().topic).toBe("新手动标题");
  });

  test("writes to the correct session after cloning state and switching chats", () => {
    const { chat, store, session } = setup();
    store.summarizeSession(false, session);
    store.update(() => {});
    expect(store.currentSession()).not.toBe(session);
    store.newSession();
    chat.mock.calls[0][0].onFinish("原会话标题", ok);
    expect(store.currentSession().topic).toBe(DEFAULT_TOPIC);
    expect(
      useChatStore.getState().sessions.find((s) => s.id === session.id)?.topic,
    ).toBe("原会话标题");
  });

  test("only the latest title request may update the session", () => {
    const { chat, store, session } = setup();
    store.summarizeSession(false, session);
    store.summarizeSession(true, session);
    chat.mock.calls[1][0].onFinish("最新标题", ok);
    chat.mock.calls[0][0].onFinish("过期标题", ok);
    expect(store.currentSession().topic).toBe("最新标题");
  });

  test.each(["reset", "delete", "clear", "new-message", "clear-context"])(
    "discards pending results after %s",
    (action) => {
      const { chat, store, session } = setup();
      store.summarizeSession(false, session);
      if (action === "reset") store.resetSession(session);
      if (action === "delete") store.deleteSession(0);
      if (action === "clear") store.clearSessions();
      if (action === "new-message")
        session.messages.push(createMessage({ content: "下一条" }));
      if (action === "clear-context") session.clearContextIndex = 2;
      chat.mock.calls[0][0].onFinish("过期标题", ok);
      expect(store.currentSession().topic).toBe(DEFAULT_TOPIC);
    },
  );

  test.each(["pending", "error", "empty", "user"])(
    "does not generate titles for a %s reply",
    (kind) => {
      const { chat, store, session } = setup();
      const message = session.messages.at(-1)!;
      if (kind === "pending") message.streaming = true;
      if (kind === "error") message.isError = true;
      if (kind === "empty") message.content = "  ";
      if (kind === "user") message.role = "user";
      store.summarizeSession(false, session);
      expect(chat).not.toHaveBeenCalled();
    },
  );

  test("preserves the default title on failure and retries after a later reply", () => {
    const { chat, store, session } = setup();
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    store.summarizeSession(false, session);
    const request: ChatOptions = chat.mock.calls[0][0];
    request.onError?.(new Error("Service unavailable"));
    expect(store.currentSession().topic).toBe(DEFAULT_TOPIC);
    session.messages.push(
      createMessage({ role: "assistant", content: "再试一次" }),
    );
    store.onNewMessage(session.messages.at(-1)!, session);
    chat.mock.calls[1][0].onFinish("重试成功", ok);
    expect(store.currentSession().topic).toBe("重试成功");
    expect(log).toHaveBeenCalled();
  });
});
