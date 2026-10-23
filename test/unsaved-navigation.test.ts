import { jest } from "@jest/globals";
import {
  installBrowserNavigationGuard,
  installUnsavedNavigation,
} from "../app/utils/unsaved-navigation";

function setup() {
  window.history.replaceState({ idx: 5 }, "", "#/settings/models");
  const dirty = { current: true };
  const confirm = jest.fn<() => Promise<boolean>>();
  const cleanupBrowser = installBrowserNavigationGuard();
  const router = jest.fn();
  window.addEventListener("popstate", router);
  const navigator = {
    push: jest.fn(),
    replace: jest.fn(),
    go: jest.fn(),
  };
  const calls = { ...navigator };
  const cleanupEditor = installUnsavedNavigation(navigator, dirty, confirm);
  const cleanup = () => {
    cleanupEditor();
    cleanupBrowser();
    window.removeEventListener("popstate", router);
  };
  return { navigator, calls, router, dirty, confirm, cleanup };
}
function pop(idx?: number, path = "#/") {
  const state = idx === undefined ? null : { idx };
  window.history.replaceState(state, "", path);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}
const flush = () => Promise.resolve();

test("browser back restores the editor before prompting, cancellation preserves the next navigation guard", async () => {
  const { calls, router, confirm, cleanup } = setup();
  const go = calls.go;
  confirm.mockResolvedValue(false);
  try {
    pop(4);
    expect(go).toHaveBeenCalledWith(1);
    expect(router).not.toHaveBeenCalled();
    pop(5, "#/settings/models");
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/settings/models");
    expect(go).not.toHaveBeenCalledWith(-1);

    pop(4);
    pop(5, "#/settings/models");
    await flush();
    expect(confirm).toHaveBeenCalledTimes(2);
  } finally {
    cleanup();
  }
});

test("confirming browser back allows the original traversal and releases the router event", async () => {
  const { calls, router, dirty, confirm, cleanup } = setup();
  const go = calls.go;
  confirm.mockResolvedValue(true);
  try {
    pop(4);
    pop(5, "#/settings/models");
    await flush();
    expect(dirty.current).toBe(false);
    expect(go).toHaveBeenLastCalledWith(-1);
    pop(4);
    expect(router).toHaveBeenCalledTimes(1);
  } finally {
    cleanup();
  }
});

test("history entries without an index restore the editor and preserve the target on confirmation", async () => {
  const { calls, confirm, cleanup } = setup();
  const replace = calls.replace;
  confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  try {
    pop();
    await flush();
    expect(window.location.hash).toBe("#/settings/models");
    expect(replace).not.toHaveBeenCalled();
    pop();
    await flush();
    expect(replace).toHaveBeenCalledWith("/", undefined);
  } finally {
    cleanup();
  }
});

test("cancelled app navigation can be retried and cleanup restores navigation", async () => {
  const { navigator, calls, dirty, confirm, cleanup } = setup();
  const push = calls.push;
  confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  navigator.push("/settings");
  await flush();
  expect(push).not.toHaveBeenCalled();
  navigator.push("/settings");
  await flush();
  expect(push).toHaveBeenCalledTimes(1);
  expect(dirty.current).toBe(false);
  cleanup();
  navigator.push("/");
  expect(push).toHaveBeenCalledTimes(2);
});
