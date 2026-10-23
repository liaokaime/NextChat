import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Locale from "../locales";
import { Path } from "../constant";
import { useAppConfig } from "../store/config";
import { useAllModels } from "../utils/hooks";
import { llmModelSelection } from "../client/providers";
import {
  modelConnectionKey,
  modelConnectionName,
  rememberModel,
} from "../client/connections";
import type { LLMModel } from "../client/api";
import { Modal } from "./ui-lib";
import { IconButton } from "./button";
import styles from "./model-services.module.scss";

export function ModelPicker(props: {
  current: string;
  allowFollow?: boolean;
  onSelect: (model?: LLMModel) => void;
  onClose: () => void;
}) {
  const t = Locale.ModelServices;
  const config = useAppConfig();
  const allModels = useAllModels();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const available = allModels.filter((m) => m.available) as LLMModel[];
  const matches = available.filter((m) =>
    `${m.name} ${m.displayName} ${modelConnectionName(m)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const preferences = config.modelPicker;
  const favorite = (preferences?.favorites || []).filter((key) =>
    available.some((m) => llmModelSelection(m) === key),
  );
  const recent = (preferences?.recent || []).filter((key) =>
    available.some((m) => llmModelSelection(m) === key),
  );
  const seen = new Set<string>();
  const group = (keys: string[]) =>
    keys.flatMap((key) => {
      const model = matches.find((m) => llmModelSelection(m) === key);
      if (!model || seen.has(key)) return [];
      seen.add(key);
      return [model];
    });
  const groups = [
    { label: t.Favorites, models: group(favorite) },
    { label: t.Recent, models: group(recent) },
    {
      label: t.AllModels,
      models: matches.filter((m) => !seen.has(llmModelSelection(m))),
    },
  ];
  const select = (model?: LLMModel) => {
    if (model)
      config.update((state) => {
        state.modelPicker.recent = rememberModel(
          state.modelPicker.recent,
          llmModelSelection(model),
        );
      });
    props.onSelect(model);
    props.onClose();
  };
  const current = available.find((m) => llmModelSelection(m) === props.current);
  return (
    <div className="modal-mask">
      <Modal
        title={t.ChooseModel}
        onClose={props.onClose}
        actions={[
          <IconButton
            key="manage"
            text={t.Manage}
            onClick={() => {
              props.onClose();
              navigate(
                `${Path.ModelServices}${
                  current
                    ? `?connection=${encodeURIComponent(
                        modelConnectionKey(current),
                      )}`
                    : ""
                }`,
                { state: { returnTo: location.pathname } },
              );
            }}
          />,
          <IconButton key="close" text={t.Cancel} onClick={props.onClose} />,
        ]}
      >
        <div className={styles.picker}>
          <input
            ref={input}
            type="search"
            aria-label={t.Search}
            placeholder={t.Search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div
            role="group"
            aria-label={t.ChooseModel}
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                return;
              const choices = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button[data-model-choice]",
                ),
              );
              const index = choices.indexOf(event.target as HTMLButtonElement);
              if (index < 0 || !choices.length) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                  ? choices.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      choices.length) %
                    choices.length;
              choices[next].focus();
            }}
          >
            {props.allowFollow && (
              <button
                className={styles.modelChoice}
                data-model-choice
                aria-pressed={props.current === "@"}
                onClick={() => select()}
              >
                {t.Following}
              </button>
            )}
            {groups
              .filter((g) => g.models.length)
              .map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <h3>{g.label}</h3>
                  {g.models.map((model) => {
                    const key = llmModelSelection(model);
                    return (
                      <div className={styles.choiceRow} key={key}>
                        <button
                          className={styles.modelChoice}
                          data-model-choice
                          aria-pressed={props.current === key}
                          onClick={() => select(model)}
                        >
                          <span>{model.displayName || model.name}</span>
                          <small>{modelConnectionName(model)}</small>
                        </button>
                        <button
                          className={styles.favorite}
                          aria-label={
                            favorite.includes(key) ? t.Unfavorite : t.Favorite
                          }
                          aria-pressed={favorite.includes(key)}
                          onClick={() =>
                            config.update((state) => {
                              const keys = state.modelPicker.favorites;
                              state.modelPicker.favorites = keys.includes(key)
                                ? keys.filter((k) => k !== key)
                                : [...keys, key];
                            })
                          }
                        >
                          {favorite.includes(key) ? "★" : "☆"}
                        </button>
                      </div>
                    );
                  })}
                </section>
              ))}
          </div>
          {!matches.length && <p role="status">{t.NoResults}</p>}
        </div>
      </Modal>
    </div>
  );
}
