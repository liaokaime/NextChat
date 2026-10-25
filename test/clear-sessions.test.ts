import { act, fireEvent, screen } from "@testing-library/react";
import { createMessage, useChatStore } from "../app/store/chat";
import { useAppConfig } from "../app/store/config";
import { useAccessStore } from "../app/store/access";
import { useMaskStore } from "../app/store/mask";
import { ChatControllerPool } from "../app/client/controller";
import Locale from "../app/locales";
import { searchSessions } from "../app/utils/session-search";

beforeEach(async () => {
  await useChatStore.persist.rehydrate();
  useChatStore.getState().clearSessions();
});

test("bulk deletion stops generation, clears drafts, persists a fresh chat and preserves configuration", async () => {
  const config = useAppConfig.getState();
  const access = useAccessStore.getState();
  const masks = useMaskStore.getState();
  useChatStore.getState().newSession();
  const oldIds = useChatStore.getState().sessions.map((s) => s.id);
  const controller = new AbortController();
  ChatControllerPool.addController(oldIds[0], "response", controller);
  useChatStore.getState().setLastInput("unsent draft");
  useChatStore.getState().clearSessions();
  const cleared = useChatStore.getState();
  expect(controller.signal.aborted).toBe(true);
  ChatControllerPool.remove(oldIds[0], "response");
  expect(cleared.sessions).toHaveLength(1);
  expect(oldIds).not.toContain(cleared.sessions[0].id);
  expect(cleared.sessions[0].messages).toEqual([]);
  expect(cleared.currentSessionIndex).toBe(0);
  expect(cleared.lastInput).toBe("");
  expect(useAppConfig.getState()).toBe(config);
  expect(useAccessStore.getState()).toBe(access);
  expect(useMaskStore.getState()).toBe(masks);
  await useChatStore.persist.rehydrate();
  expect(useChatStore.getState().sessions.map((s) => s.id)).toEqual([
    cleared.sessions[0].id,
  ]);
});

test("an outstanding undo cannot resurrect conversations after bulk deletion", () => {
  useChatStore.getState().newSession();
  act(() => useChatStore.getState().deleteSession(0));
  const undo = screen.getByText(Locale.Home.Revert);
  useChatStore.getState().clearSessions();
  const freshId = useChatStore.getState().sessions[0].id;
  fireEvent.click(undo);
  expect(useChatStore.getState().sessions.map((s) => s.id)).toEqual([freshId]);
});

test("filtered indices select and delete the matched chat while preserving others", () => {
  useChatStore.getState().newSession();
  useChatStore.getState().newSession();
  const sessions = useChatStore.getState().sessions;
  useChatStore.getState().updateTargetSession(sessions[2], (session) => {
    session.messages = [createMessage({ content: "unique search term" })];
  });
  const match = searchSessions(
    useChatStore.getState().sessions,
    "unique search",
  )[0];
  useChatStore.getState().selectSession(match.index);
  expect(useChatStore.getState().currentSession().id).toBe(sessions[2].id);
  act(() => useChatStore.getState().deleteSession(match.index));
  expect(useChatStore.getState().sessions.map((s) => s.id)).toEqual(
    sessions.slice(0, 2).map((s) => s.id),
  );
});
