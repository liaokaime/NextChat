export const TRANSLATION_SESSION_KIND = "translation" as const;

export const TRANSLATION_LANGUAGES = [
  { id: "english", label: "英文" },
  { id: "vietnamese", label: "越南语" },
  { id: "arabic", label: "阿拉伯语" },
  { id: "indonesian", label: "印尼语" },
  { id: "bengali", label: "孟加拉语" },
] as const;

export type TranslationLanguage = (typeof TRANSLATION_LANGUAGES)[number]["id"];

export type TranslationSessionInfo = {
  kind: typeof TRANSLATION_SESSION_KIND;
  language: TranslationLanguage;
};

export function getTranslationLanguageLabel(language: TranslationLanguage) {
  return (
    TRANSLATION_LANGUAGES.find((item) => item.id === language)?.label ??
    TRANSLATION_LANGUAGES[0].label
  );
}

export function isTranslationSession(session: {
  translation?: TranslationSessionInfo;
}) {
  return session.translation?.kind === TRANSLATION_SESSION_KIND;
}
