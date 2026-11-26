import { nanoid } from "nanoid";

import { createMessage, type ChatSession, useChatStore } from "../store/chat";
import { createEmptyMask } from "../store/mask";
import { useAppConfig } from "../store/config";
import { getLang } from "../locales";
import {
  getTranslationLanguageLabel,
  isTranslationSession,
  TRANSLATION_LANGUAGES,
  TRANSLATION_SESSION_KIND,
  type TranslationLanguage,
} from "./types";

export {
  getTranslationLanguageLabel,
  isTranslationSession,
  TRANSLATION_LANGUAGES,
  TRANSLATION_SESSION_KIND,
};
export type { TranslationLanguage } from "./types";

export const TRANSLATION_SESSION_NAME = "翻译";

export function translationPrompt(language: TranslationLanguage) {
  const label = getTranslationLanguageLabel(language);
  return `你是一个专业的${label}翻译，我说任何话，你都原封不动地翻译为对应的语言，当我说中文时，你翻译为${label}，当我说${label}时，你翻译成中文，翻译尽量信达雅，你不要说翻译之外的任何事，明白请说“好的”`;
}

export function translationContext(language: TranslationLanguage) {
  return [
    createMessage({
      id: nanoid(),
      role: "user",
      content: translationPrompt(language),
    }),
    createMessage({
      id: nanoid(),
      role: "assistant",
      content: "好的",
    }),
  ];
}

function createTranslationMask(language: TranslationLanguage) {
  const mask = createEmptyMask();
  return {
    ...mask,
    name: TRANSLATION_SESSION_NAME,
    context: translationContext(language),
    hideContext: true,
    syncGlobalConfig: true,
    modelConfig: { ...useAppConfig.getState().modelConfig },
    lang: getLang(),
    builtin: true,
  };
}

function findTranslationSession(sessions: ChatSession[]) {
  return sessions.find(isTranslationSession);
}

export function getCurrentTranslationLanguage(session: ChatSession) {
  return session.translation?.language ?? TRANSLATION_LANGUAGES[0].id;
}

export function ensureTranslationSession() {
  const store = useChatStore.getState();
  const selectedSessionId = store.currentSession()?.id;
  const existing = findTranslationSession(store.sessions);

  if (existing) {
    const index = store.sessions.findIndex(
      (session) => session.id === existing.id,
    );
    if (index !== 0) {
      store.moveSession(index, 0);
    }
    const selectedIndex = useChatStore
      .getState()
      .sessions.findIndex((session) => session.id === selectedSessionId);
    store.selectSession(selectedIndex >= 0 ? selectedIndex : 0);
    store.updateTargetSession(existing, (session) => {
      const language = getCurrentTranslationLanguage(session);
      session.topic = TRANSLATION_SESSION_NAME;
      session.mask.name = TRANSLATION_SESSION_NAME;
      session.mask.hideContext = true;
      session.mask.syncGlobalConfig = true;
      session.mask.modelConfig = { ...useAppConfig.getState().modelConfig };
      session.mask.context = translationContext(language);
      session.translation = {
        kind: TRANSLATION_SESSION_KIND,
        language,
      };
    });
    return useChatStore.getState().currentSession();
  }

  store.newSession(createTranslationMask(TRANSLATION_LANGUAGES[0].id));
  const created = useChatStore.getState().currentSession();
  store.updateTargetSession(created, (session) => {
    session.translation = {
      kind: TRANSLATION_SESSION_KIND,
      language: TRANSLATION_LANGUAGES[0].id,
    };
    session.topic = TRANSLATION_SESSION_NAME;
  });
  const selectedIndex = useChatStore
    .getState()
    .sessions.findIndex((session) => session.id === selectedSessionId);
  if (selectedIndex >= 0) {
    useChatStore.getState().selectSession(selectedIndex);
  }
  return useChatStore.getState().currentSession();
}

export function switchTranslationLanguage(
  session: ChatSession,
  language: TranslationLanguage,
) {
  if (!isTranslationSession(session)) return;
  if (getCurrentTranslationLanguage(session) === language) return;

  useChatStore.getState().updateTargetSession(session, (current) => {
    current.translation = {
      kind: TRANSLATION_SESSION_KIND,
      language,
    };
    current.topic = TRANSLATION_SESSION_NAME;
    current.mask.name = TRANSLATION_SESSION_NAME;
    current.mask.hideContext = true;
    current.mask.syncGlobalConfig = true;
    current.mask.context = translationContext(language);
    current.mask.modelConfig = { ...useAppConfig.getState().modelConfig };
    current.clearContextIndex = current.messages.length;
    current.memoryPrompt = "";
    current.lastUpdate = Date.now();
  });
}
