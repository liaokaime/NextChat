import { nanoid } from "nanoid";

import { createMessage, type ChatSession, useChatStore } from "../store/chat";
import { createEmptyMask } from "../store/mask";
import { useAppConfig } from "../store/config";
import { getLang } from "../locales";
import {
  isTranslationSession,
  TRANSLATION_LANGUAGES,
  TRANSLATION_SESSION_KIND,
  type TranslationLanguage,
} from "./types";

export { isTranslationSession };

const TRANSLATION_SESSION_NAME = "翻译";

function translationPrompt(label: string) {
  return `你是一个专业的${label}翻译，我说任何话，你都原封不动地翻译为对应的语言，当我说中文时，你翻译为${label}，当我说${label}时，你翻译成中文，翻译尽量信达雅，你不要说翻译之外的任何事，明白请说“好的”`;
}

function translationContext(language: TranslationLanguage) {
  return [
    createMessage({
      id: nanoid(),
      role: "user",
      content: translationPrompt(language.label),
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

export function getTranslationLanguages(
  session: ChatSession,
): readonly TranslationLanguage[] {
  const languages = session.translation?.languages;
  return languages?.length ? languages : TRANSLATION_LANGUAGES;
}

export function getCurrentTranslationLanguage(session: ChatSession) {
  const languages = getTranslationLanguages(session);
  return (
    languages.find(({ id }) => id === session.translation?.language) ??
    languages[0]
  );
}

export function ensureTranslationSession() {
  const store = useChatStore.getState();
  const selectedSessionId = store.currentSession()?.id;
  const existing = store.sessions.find(isTranslationSession);

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
      if (session.mask.syncGlobalConfig) {
        session.mask.modelConfig = { ...useAppConfig.getState().modelConfig };
      }
      session.mask.context = translationContext(language);
      session.translation = {
        ...session.translation,
        kind: TRANSLATION_SESSION_KIND,
        language: language.id,
      };
    });
    return useChatStore.getState().currentSession();
  }

  store.newSession(createTranslationMask(TRANSLATION_LANGUAGES[0]));
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

export function openTranslationSession() {
  ensureTranslationSession();
  const store = useChatStore.getState();
  const index = store.sessions.findIndex(isTranslationSession);
  if (index >= 0) {
    store.selectSession(index);
  }
  return store.sessions[index];
}

export function switchTranslationLanguage(
  session: ChatSession,
  languageId: string,
) {
  const language = getTranslationLanguages(session).find(
    ({ id }) => id === languageId,
  );
  if (!session.translation || !language) return;
  if (session.translation.language === language.id) return;

  useChatStore.getState().updateTargetSession(session, (current) => {
    applyTranslationLanguage(current, language);
  });
}

function applyTranslationLanguage(
  session: ChatSession,
  language: TranslationLanguage,
) {
  if (!session.translation) return;
  session.translation.language = language.id;
  session.mask.context = translationContext(language);
  session.clearContextIndex = session.messages.length;
  session.memoryPrompt = "";
  session.lastUpdate = Date.now();
}

export function addTranslationLanguage(session: ChatSession, name: string) {
  const label = name.trim();
  const languages = getTranslationLanguages(session);
  const normalizedLabel = label.normalize("NFKC").toLowerCase();
  if (!session.translation || !label) return false;
  if (
    languages.some(
      (item) => item.label.normalize("NFKC").toLowerCase() === normalizedLabel,
    )
  ) {
    return false;
  }

  useChatStore.getState().updateTargetSession(session, (current) => {
    if (current.translation) {
      current.translation.languages = [...languages, { id: nanoid(), label }];
    }
  });
  return true;
}

export function removeTranslationLanguage(
  session: ChatSession,
  languageId: string,
) {
  const languages = getTranslationLanguages(session);
  if (!session.translation || languages.length <= 1) return;
  const remaining = languages.filter(({ id }) => id !== languageId);
  if (remaining.length === languages.length) return;

  useChatStore.getState().updateTargetSession(session, (current) => {
    if (!current.translation) return;
    current.translation.languages = remaining;
    if (current.translation.language === languageId) {
      applyTranslationLanguage(current, remaining[0]);
    }
  });
}

export function moveTranslationLanguage(
  session: ChatSession,
  languageId: string,
  to: number,
) {
  const languages = getTranslationLanguages(session);
  const from = languages.findIndex(({ id }) => id === languageId);
  if (
    !session.translation ||
    from < 0 ||
    from === to ||
    to < 0 ||
    to >= languages.length
  ) {
    return;
  }

  const reordered = [...languages];
  const [language] = reordered.splice(from, 1);
  reordered.splice(to, 0, language);
  useChatStore.getState().updateTargetSession(session, (current) => {
    if (current.translation) {
      current.translation.languages = reordered;
    }
  });
}
