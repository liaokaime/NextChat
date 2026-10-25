import { jest } from "@jest/globals";
import type { SpiedFunction } from "jest-mock";
import { createMessage, useChatStore } from "../app/store/chat";
import { SdkApi } from "../app/client/platforms/ai-sdk";
import type { ModelConfig } from "../app/store/config";
import Locale from "../app/locales";

const message = (role: "user" | "assistant", i: number) =>
  // About 150 estimated tokens each, above the 100-token max_tokens below.
  createMessage({ role, content: `${i}${"问".repeat(100)}` });

function setupSession(config: Partial<ModelConfig>, count: number) {
  const store = useChatStore.getState();
  store.clearSessions();
  const session = store.currentSession();
  store.updateTargetSession(session, (s) => {
    s.mask.modelConfig = {
      ...s.mask.modelConfig,
      model: "gemini-model",
      max_tokens: 100,
      sendMemory: true,
      compressMessageLengthThreshold: 10,
      ...config,
    };
    s.messages = Array.from({ length: count }, (_, i) =>
      message(i % 2 ? "assistant" : "user", i),
    );
  });
  return session;
}

let chat: SpiedFunction<SdkApi["chat"]>;
beforeEach(() => {
  chat = jest.spyOn(SdkApi.prototype, "chat").mockResolvedValue(undefined);
});
afterEach(() => chat.mockRestore());

test("history for SDK instances is limited by message count, not max_tokens", async () => {
  setupSession({ providerId: "gemini", historyMessageCount: 4 }, 6);
  const sdk = await useChatStore.getState().getMessagesWithMemory();
  expect(sdk.map((m) => m.content)).toEqual(
    useChatStore
      .getState()
      .currentSession()
      .messages.slice(-4)
      .map((m) => m.content),
  );

  setupSession({ providerId: undefined, historyMessageCount: 4 }, 6);
  const legacy = await useChatStore.getState().getMessagesWithMemory();
  expect(legacy).toHaveLength(1);
});

test("SDK summaries keep all unsummarized history and end with a user turn", () => {
  const session = setupSession(
    { providerId: "gemini", historyMessageCount: 2 },
    6,
  );
  useChatStore.getState().summarizeSession(false, session);

  const requests = chat.mock.calls.map(([options]) => options);
  expect(requests.find((o) => o.config.stream === false)).toBeDefined();
  const summary = requests.find((o) => o.config.stream)!;
  // Gemini via the AI SDK rejects system messages after the first user turn.
  expect(summary.messages.at(-1)).toMatchObject({
    role: "user",
    content: Locale.Store.Prompt.Summarize,
  });
  expect(summary.messages).toHaveLength(7);
  for (const request of requests)
    expect(request.config.providerId).toBe("gemini");
});
