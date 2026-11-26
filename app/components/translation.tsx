import clsx from "clsx";

import Locale from "../locales";
import {
  getCurrentTranslationLanguage,
  getTranslationLanguageLabel,
  isTranslationSession,
  switchTranslationLanguage,
  TRANSLATION_LANGUAGES,
  type TranslationLanguage,
} from "../translation";
import type { ChatSession } from "../store/chat";
import styles from "./chat.styles";

export function TranslationLanguageBar(props: { session: ChatSession }) {
  if (!isTranslationSession(props.session)) return null;

  const currentLanguage = getCurrentTranslationLanguage(props.session);

  return (
    <div
      className={styles["translation-language-bar"]}
      aria-label={Locale.Translation.LanguageSelector}
    >
      <span className={styles["translation-language-title"]}>
        {Locale.Translation.Name}
      </span>
      <div className={styles["translation-language-options"]}>
        {TRANSLATION_LANGUAGES.map((language) => (
          <button
            type="button"
            key={language.id}
            className={clsx(styles["translation-language-option"], {
              [styles["translation-language-option-active"]]:
                language.id === currentLanguage,
            })}
            aria-pressed={language.id === currentLanguage}
            onClick={() =>
              switchTranslationLanguage(
                props.session,
                language.id as TranslationLanguage,
              )
            }
          >
            {getTranslationLanguageLabel(language.id)}
          </button>
        ))}
      </div>
    </div>
  );
}
