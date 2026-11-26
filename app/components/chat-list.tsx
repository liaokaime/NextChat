import DeleteIcon from "../icons/delete.svg";
import TranslateIcon from "../icons/translate.svg";

import styles from "./home.styles";
import {
  DragDropContext,
  Droppable,
  Draggable,
  OnDragEndResponder,
} from "@hello-pangea/dnd";

import { useChatStore } from "../store";

import Locale from "../locales";
import { useLocation, useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { MaskAvatar } from "./mask";
import { Mask } from "../store/mask";
import { useRef, useEffect } from "react";
import { showConfirm } from "./ui-lib";
import { useMobileScreen } from "../utils";
import clsx from "clsx";
import { searchSessions } from "../utils/session-search";
import {
  getCurrentTranslationLanguage,
  getTranslationLanguageLabel,
  isTranslationSession,
} from "../translation";
import type { ChatSession } from "../store/chat";

function selectSessionById(
  id: string,
  navigate: ReturnType<typeof useNavigate>,
) {
  const index = useChatStore
    .getState()
    .sessions.findIndex((session) => session.id === id);
  if (index < 0) return;
  navigate(Path.Chat);
  useChatStore.getState().selectSession(index);
}

export function ChatItem(props: {
  onClick?: () => void;
  onDelete?: () => void;
  title: string;
  count: number;
  time: string;
  selected: boolean;
  id: string;
  index: number;
  narrow?: boolean;
  isDragDisabled?: boolean;
  mask: Mask;
}) {
  const draggableRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (props.selected && draggableRef.current) {
      draggableRef.current?.scrollIntoView({
        block: "center",
      });
    }
  }, [props.selected]);

  const { pathname: currentPath } = useLocation();
  return (
    <Draggable
      draggableId={`${props.id}`}
      index={props.index}
      isDragDisabled={props.isDragDisabled}
    >
      {(provided) => (
        <div
          className={clsx(styles["chat-item"], {
            [styles["chat-item-selected"]]:
              props.selected &&
              (currentPath === Path.Chat || currentPath === Path.Home),
          })}
          onClick={props.onClick}
          ref={(ele) => {
            draggableRef.current = ele;
            provided.innerRef(ele);
          }}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          title={`${props.title}\n${Locale.ChatItem.ChatItemCount(
            props.count,
          )}`}
        >
          {props.narrow ? (
            <div className={styles["chat-item-narrow"]}>
              <div className={clsx(styles["chat-item-avatar"], "no-dark")}>
                <MaskAvatar
                  avatar={props.mask.avatar}
                  model={props.mask.modelConfig.model}
                />
              </div>
              <div className={styles["chat-item-narrow-count"]}>
                {props.count}
              </div>
            </div>
          ) : (
            <>
              <div className={styles["chat-item-title"]}>{props.title}</div>
              <div className={styles["chat-item-info"]}>
                <div className={styles["chat-item-count"]}>
                  {Locale.ChatItem.ChatItemCount(props.count)}
                </div>
                <div className={styles["chat-item-date"]}>{props.time}</div>
              </div>
            </>
          )}

          <div
            className={styles["chat-item-delete"]}
            onClickCapture={(e) => {
              props.onDelete?.();
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <DeleteIcon />
          </div>
        </div>
      )}
    </Draggable>
  );
}

function TranslationChatItem(props: {
  session: ChatSession;
  selected: boolean;
  narrow?: boolean;
  onClick: () => void;
}) {
  const language = getTranslationLanguageLabel(
    getCurrentTranslationLanguage(props.session),
  );

  return (
    <div
      className={clsx(styles["translation-item"], {
        [styles["translation-item-selected"]]: props.selected,
      })}
      onClick={props.onClick}
      role="button"
      tabIndex={0}
      title={`${Locale.Translation.Name} · ${language}`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onClick();
        }
      }}
    >
      <div className={styles["translation-item-header"]}>
        <div className={styles["translation-item-icon"]}>
          <TranslateIcon />
        </div>
        {!props.narrow && (
          <div className={styles["translation-item-main"]}>
            <div className={styles["translation-item-title"]}>
              {Locale.Translation.Name}
            </div>
            <div className={styles["translation-item-subtitle"]}>
              {Locale.Translation.Subtitle}
            </div>
          </div>
        )}
        {!props.narrow && (
          <div className={styles["translation-item-pin"]}>
            {Locale.Translation.Pinned}
          </div>
        )}
      </div>
      <div className={styles["translation-item-language"]}>
        <span className={styles["translation-item-language-label"]}>
          {props.narrow ? language : `${Locale.Translation.Name} · ${language}`}
        </span>
        {!props.narrow && <span>{Locale.Translation.Pinned}</span>}
      </div>
    </div>
  );
}

export function ChatList(props: { narrow?: boolean; search?: string }) {
  const [sessions, selectedIndex, moveSession] = useChatStore((state) => [
    state.sessions,
    state.currentSessionIndex,
    state.moveSession,
  ]);
  const chatStore = useChatStore();
  const navigate = useNavigate();
  const isMobileScreen = useMobileScreen();
  const searching = !!props.search?.trim();
  const entries = searchSessions(sessions, props.search || "");
  const translationEntry = entries.find(({ session }) =>
    isTranslationSession(session),
  );
  const regularEntries = entries.filter(
    ({ session }) => !isTranslationSession(session),
  );

  const onDragEnd: OnDragEndResponder = (result) => {
    if (searching) return;
    const { destination, source } = result;
    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const sourceEntry = regularEntries[source.index];
    const destinationEntry = regularEntries[destination.index];
    if (!sourceEntry || !destinationEntry) return;
    moveSession(sourceEntry.index, destinationEntry.index);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="chat-list">
        {(provided) => (
          <div
            className={styles["chat-list"]}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {translationEntry && (
              <TranslationChatItem
                session={translationEntry.session}
                selected={translationEntry.index === selectedIndex}
                narrow={props.narrow}
                onClick={() =>
                  selectSessionById(translationEntry.session.id, navigate)
                }
              />
            )}
            {regularEntries.map(({ session: item, index: i }, visibleIndex) => (
              <ChatItem
                title={item.topic}
                time={new Date(item.lastUpdate).toLocaleString()}
                count={item.messages.length}
                key={item.id}
                id={item.id}
                index={visibleIndex}
                isDragDisabled={searching}
                selected={i === selectedIndex}
                onClick={() => {
                  selectSessionById(item.id, navigate);
                }}
                onDelete={async () => {
                  if (
                    (!props.narrow && !isMobileScreen) ||
                    (await showConfirm(Locale.Home.DeleteChat))
                  ) {
                    const index = useChatStore
                      .getState()
                      .sessions.findIndex((s) => s.id === item.id);
                    if (index >= 0) chatStore.deleteSession(index);
                  }
                }}
                narrow={props.narrow}
                mask={item.mask}
              />
            ))}
            {!entries.length && (
              <div role="status" className={styles["session-search-empty"]}>
                {Locale.SessionSearch.Empty}
              </div>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
