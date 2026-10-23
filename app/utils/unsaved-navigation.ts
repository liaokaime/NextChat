import type { Navigator } from "react-router-dom";

let popGuard: ((event: PopStateEvent) => void) | undefined;

// Register before HashRouter installs its own window listener.
export function installBrowserNavigationGuard() {
  const onPop = (event: PopStateEvent) => popGuard?.(event);
  window.addEventListener("popstate", onPop, true);
  return () => window.removeEventListener("popstate", onPop, true);
}

// Restore browser history before prompting so cancellation keeps the editor mounted.
export function installUnsavedNavigation(
  navigator: Pick<Navigator, "push" | "replace" | "go">,
  dirtyRef: { current: boolean },
  confirmDiscard: () => Promise<boolean>,
) {
  let pending = false;
  let historyIndex = window.history.state?.idx ?? 0;
  let currentUrl = window.location.href;
  let currentState = window.history.state;
  const remember = () => {
    historyIndex = window.history.state?.idx ?? historyIndex;
    currentUrl = window.location.href;
    currentState = window.history.state;
  };
  let restore: (() => void) | undefined;
  const guard = (proceed: () => void) => {
    if (!dirtyRef.current) {
      proceed();
      remember();
      return;
    }
    if (pending) return;
    pending = true;
    void confirmDiscard().then((yes) => {
      pending = false;
      if (yes) {
        dirtyRef.current = false;
        proceed();
        remember();
      }
    });
  };
  const push = navigator.push.bind(navigator),
    replace = navigator.replace.bind(navigator),
    go = navigator.go.bind(navigator);
  navigator.push = (...args) => guard(() => push(...args));
  navigator.replace = (...args) => guard(() => replace(...args));
  navigator.go = (...args) => guard(() => go(...args));
  const pop = (event: PopStateEvent) => {
    if (restore) {
      event.stopImmediatePropagation();
      const complete = restore;
      restore = undefined;
      complete();
      return;
    }
    if (!dirtyRef.current) {
      remember();
      return;
    }
    const delta = historyIndex - (event.state?.idx ?? historyIndex);
    if (!delta && window.location.href === currentUrl) return;
    event.stopImmediatePropagation();
    if (!delta) {
      const targetUrl = new URL(window.location.href);
      const targetState = event.state;
      window.history.pushState(currentState, "", currentUrl);
      guard(() => replace(targetUrl.hash.slice(1) || "/", targetState?.usr));
      return;
    }
    restore = () => guard(() => go(-delta));
    go(delta);
  };
  const unload = (e: BeforeUnloadEvent) => {
    if (dirtyRef.current) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", unload);
  popGuard = pop;
  return () => {
    navigator.push = push;
    navigator.replace = replace;
    navigator.go = go;
    window.removeEventListener("beforeunload", unload);
    if (popGuard === pop) popGuard = undefined;
  };
}
