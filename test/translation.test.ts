import { jest } from "@jest/globals";
import { SdkApi } from "../app/client/platforms/ai-sdk";
import { ServiceProvider } from "../app/constant";
import { createMessage, useChatStore } from "../app/store/chat";
import { useAppConfig } from "../app/store/config";
import {
  addTranslationLanguage,
  ensureTranslationSession,
  getCurrentTranslationLanguage,
  getTranslationLanguages,
  isTranslationSession,
  moveTranslationLanguage,
  removeTranslationLanguage,
  switchTranslationLanguage,
} from "../app/translation";

beforeEach(async () => {
  await useChatStore.persist.rehydrate();
  useChatStore.setState((state) => ({
    sessions: state.sessions.filter((session) => !isTranslationSession(session)),
  }));
  useChatStore.getState().clearSessions();
});

test("creates one pinned translation session without changing the selected chat", () => {
  const ordinarySession = useChatStore.getState().currentSession();

  ensureTranslationSession();
  useChatStore.getState().moveSession(0, 1);
  ensureTranslationSession();

  const sessions = useChatStore.getState().sessions;
  const translationSessions = sessions.filter(isTranslationSession);
  const translationSession = translationSessions[0];

  expect(translationSessions).toHaveLength(1);
  expect(sessions[0]).toBe(translationSession);
  expect(useChatStore.getState().currentSession().id).toBe(
    ordinarySession.id,
  );
  expect(translationSession.topic).toBe("翻译");
  expect(translationSession.mask.hideContext).toBe(true);
  expect(translationSession.mask.context).toHaveLength(2);
  expect(translationSession.mask.context[1].content).toBe("好的");
  expect(translationSession.mask.context[0].content).toContain("英文翻译");
  expect(translationSession.mask.modelConfig).toEqual(
    useAppConfig.getState().modelConfig,
  );
});

test("switches language while preserving visible messages and truncating context", () => {
  ensureTranslationSession();
  const translationSession = useChatStore
    .getState()
    .sessions.find(isTranslationSession)!;
  translationSession.messages = [
    createMessage({ role: "user", content: "hello" }),
    createMessage({ role: "assistant", content: "你好" }),
  ];

  switchTranslationLanguage(translationSession, "vietnamese");

  const updated = useChatStore
    .getState()
    .sessions.find((session) => session.id === translationSession.id)!;
  expect(updated.messages).toHaveLength(2);
  expect(updated.clearContextIndex).toBe(2);
  expect(updated.translation?.language).toBe("vietnamese");
  expect(updated.mask.context[0].content).toContain("越南语翻译");
});

test("keeps the translation session through bulk chat deletion and blocks direct deletion", () => {
  ensureTranslationSession();
  const store = useChatStore.getState();
  const translationSession = store.sessions.find(isTranslationSession)!;
  translationSession.messages.push(createMessage({ content: "hello" }));

  store.deleteSession(0);
  expect(useChatStore.getState().sessions.some(isTranslationSession)).toBe(
    true,
  );

  useChatStore.getState().clearSessions();
  const sessions = useChatStore.getState().sessions;
  const preserved = sessions.find(isTranslationSession);
  expect(preserved).toBeDefined();
  expect(preserved?.messages).toEqual([]);
  expect(sessions).toHaveLength(2);
});

test("persists custom names, order and selection, and switches when the active language is removed", async () => {
  ensureTranslationSession();
  const session = useChatStore.getState().sessions.find(isTranslationSession)!;
  const english = getCurrentTranslationLanguage(session);
  expect(addTranslationLanguage(session, "   ")).toBe(false);
  expect(addTranslationLanguage(session, "  日本語 ")).toBe(true);
  expect(addTranslationLanguage(session, "日本語")).toBe(false);
  const japanese = getTranslationLanguages(session).at(-1)!;
  expect(japanese.label).toBe("日本語");
  moveTranslationLanguage(session, japanese.id, 0);
  switchTranslationLanguage(session, japanese.id);

  await useChatStore.persist.rehydrate();
  ensureTranslationSession();
  const restored = useChatStore.getState().sessions.find(isTranslationSession)!;
  expect(restored).not.toBe(session);
  expect(getTranslationLanguages(restored).slice(0, 2)).toEqual([
    japanese,
    english,
  ]);
  expect(getCurrentTranslationLanguage(restored)).toEqual(japanese);
  expect(restored.mask.context[0].content).toContain("日本語翻译");

  const message = createMessage({ role: "assistant", content: "こんにちは" });
  restored.messages = [message];
  removeTranslationLanguage(restored, japanese.id);
  expect(getCurrentTranslationLanguage(restored)).toEqual(english);
  expect(restored.mask.context[0].content).toContain("英文翻译");
  expect(restored.messages).toEqual([message]);
  expect(restored.clearContextIndex).toBe(1);

  for (const { id } of getTranslationLanguages(restored).slice(1)) {
    removeTranslationLanguage(restored, id);
  }
  removeTranslationLanguage(restored, english.id);
  expect(getTranslationLanguages(restored)).toEqual([english]);
});

test("uses the translation session's chosen model after reload and language changes", async () => {
  const chat = jest.spyOn(SdkApi.prototype, "chat").mockResolvedValue(undefined);
  try {
    ensureTranslationSession();
    const store = useChatStore.getState();
    const session = store.sessions.find(isTranslationSession)!;
    const selection = {
      model: "custom-translator",
      providerId: "translation-provider",
      providerName: ServiceProvider.OpenAI,
    };
    store.updateTargetSession(session, (current) => {
      current.mask.syncGlobalConfig = false;
      Object.assign(current.mask.modelConfig, selection);
    });
    store.selectSession(store.sessions.indexOf(session));

    await useChatStore.persist.rehydrate();
    ensureTranslationSession();
    const restored = useChatStore.getState().currentSession();
    await useChatStore.getState().onUserInput("Hello");
    switchTranslationLanguage(restored, "vietnamese");
    await useChatStore.getState().onUserInput("Hello again");

    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[0][0].config).toMatchObject(selection);
    expect(chat.mock.calls[1][0].config).toMatchObject(selection);
    expect(chat.mock.calls[1][0].messages).toContainEqual(
      expect.objectContaining({ content: expect.stringContaining("越南语翻译") }),
    );
  } finally {
    chat.mockRestore();
  }
});
