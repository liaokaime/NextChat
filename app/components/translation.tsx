import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { GripVertical, Settings, Trash2 } from "lucide-react";

import Locale from "../locales";
import {
  addTranslationLanguage,
  getCurrentTranslationLanguage,
  getTranslationLanguages,
  moveTranslationLanguage,
  removeTranslationLanguage,
  switchTranslationLanguage,
} from "../translation";
import type { ChatSession } from "../store/chat";
import styles from "./chat.styles";

export function TranslationLanguageBar({ session }: { session: ChatSession }) {
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const managerId = useId();
  const errorId = useId();
  const languages = getTranslationLanguages(session);
  const currentLanguage = getCurrentTranslationLanguage(session);
  const activeButton = useRef<HTMLButtonElement>(null);
  const options = useRef<HTMLDivElement>(null);
  const gear = useRef<HTMLButtonElement>(null);
  const canRemove = languages.length > 1;

  useEffect(() => {
    const viewport = options.current;
    const button = activeButton.current;
    if (!viewport || !button) return;

    const viewportBounds = viewport.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    if (buttonBounds.left < viewportBounds.left) {
      viewport.scrollLeft += buttonBounds.left - viewportBounds.left - 2;
    } else if (buttonBounds.right > viewportBounds.right) {
      viewport.scrollLeft += buttonBounds.right - viewportBounds.right + 2;
    }
  }, [currentLanguage.id, languages]);

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    if (addTranslationLanguage(session, name)) {
      setName("");
      setDuplicate(false);
    } else {
      setDuplicate(true);
    }
  }

  return (
    <div
      className={styles["translation-language-bar"]}
      onKeyDown={(event) => {
        if (!managing || event.key !== "Escape" || event.defaultPrevented)
          return;
        event.preventDefault();
        setManaging(false);
        gear.current?.focus({ preventScroll: true });
      }}
    >
      <div className={styles["translation-language-toolbar"]}>
        <div
          ref={options}
          className={styles["translation-language-options"]}
          role="group"
          aria-label={Locale.Translation.LanguageSelector}
        >
          {languages.map((language) => (
            <button
              type="button"
              key={language.id}
              ref={
                language.id === currentLanguage.id ? activeButton : undefined
              }
              className={styles["translation-language-option"]}
              aria-pressed={language.id === currentLanguage.id}
              title={language.label}
              onClick={() => switchTranslationLanguage(session, language.id)}
            >
              {language.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          ref={gear}
          className={styles["translation-language-gear"]}
          aria-label={Locale.Translation.ManageLanguages}
          title={Locale.Translation.ManageLanguages}
          aria-expanded={managing}
          aria-controls={managing ? managerId : undefined}
          onClick={() => setManaging((open) => !open)}
        >
          <Settings size={17} aria-hidden="true" />
        </button>
      </div>
      {managing && (
        <section
          id={managerId}
          className={styles["translation-language-manager"]}
          aria-label={Locale.Translation.ManageLanguages}
        >
          <form
            className={styles["translation-language-form"]}
            onSubmit={handleAdd}
          >
            <input
              type="text"
              className={styles["translation-language-input"]}
              aria-label={Locale.Translation.LanguageName}
              placeholder={Locale.Translation.LanguageName}
              value={name}
              aria-invalid={duplicate}
              aria-describedby={duplicate ? errorId : undefined}
              onChange={(event) => {
                setName(event.currentTarget.value);
                setDuplicate(false);
              }}
            />
            <button
              type="submit"
              className={styles["translation-language-add"]}
              disabled={!name.trim()}
            >
              {Locale.Translation.AddLanguage}
            </button>
          </form>
          {duplicate && (
            <p
              id={errorId}
              role="status"
              className={styles["translation-language-error"]}
            >
              {Locale.Translation.DuplicateLanguage}
            </p>
          )}
          <DragDropContext
            onDragEnd={({ draggableId, destination }) => {
              if (destination) {
                moveTranslationLanguage(
                  session,
                  draggableId,
                  destination.index,
                );
              }
            }}
          >
            <Droppable droppableId="translation-languages">
              {(provided) => (
                <ul
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={styles["translation-language-list"]}
                >
                  {languages.map(({ id, label }, index) => (
                    <Draggable
                      key={id}
                      draggableId={id}
                      index={index}
                      isDragDisabled={!canRemove}
                    >
                      {(provided) => (
                        <li
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={styles["translation-language-row"]}
                        >
                          <span
                            {...provided.dragHandleProps}
                            className={styles["translation-language-handle"]}
                            aria-label={Locale.Translation.ReorderLanguage(
                              label,
                            )}
                          >
                            <GripVertical size={16} aria-hidden="true" />
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate"
                            title={label}
                          >
                            {label}
                          </span>
                          <button
                            type="button"
                            className={styles["translation-language-remove"]}
                            aria-label={Locale.Translation.RemoveLanguage(
                              label,
                            )}
                            title={
                              canRemove
                                ? Locale.Translation.RemoveLanguage(label)
                                : Locale.Translation.KeepOneLanguage
                            }
                            disabled={!canRemove}
                            onClick={() =>
                              removeTranslationLanguage(session, id)
                            }
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>
        </section>
      )}
    </div>
  );
}
