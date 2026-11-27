export const TRANSLATION_SESSION_KIND = "translation" as const;

export type TranslationLanguage = {
  id: string;
  label: string;
};

export const TRANSLATION_LANGUAGES: readonly TranslationLanguage[] = [
  { id: "english", label: "英文" },
  { id: "vietnamese", label: "越南语" },
  { id: "arabic", label: "阿拉伯语" },
  { id: "indonesian", label: "印尼语" },
  { id: "bengali", label: "孟加拉语" },
];

export type TranslationSessionInfo = {
  kind: typeof TRANSLATION_SESSION_KIND;
  language: string;
  languages?: TranslationLanguage[];
};

export function isTranslationSession(session: {
  translation?: TranslationSessionInfo;
}) {
  return session.translation?.kind === TRANSLATION_SESSION_KIND;
}
