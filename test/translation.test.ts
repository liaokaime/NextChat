import { createMessage, useChatStore } from "../app/store/chat";
import { useAppConfig } from "../app/store/config";
import {
  ensureTranslationSession,
  getTranslationLanguageLabel,
  isTranslationSession,
  switchTranslationLanguage,
} from "../app/translation";

beforeEach(() => {
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
  expect(updated.mask.context[0].content).toContain(
    `${getTranslationLanguageLabel("vietnamese")}翻译`,
  );
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
