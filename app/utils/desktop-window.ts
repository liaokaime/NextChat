import { invoke, isTauri } from "@tauri-apps/api/core";
import { useAppConfig } from "../store/config";
import { normalizeWindowSize } from "./window-size";
import Locale from "../locales";
import { showToast } from "../components/ui-lib";

export async function getCurrentWindowSize() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();
  const [size, scaleFactor] = await Promise.all([
    appWindow.innerSize(),
    appWindow.scaleFactor(),
  ]);
  return {
    width: Math.round(size.width / scaleFactor),
    height: Math.round(size.height / scaleFactor),
  };
}

export function initializeDesktopWindowSettings() {
  if (!isTauri()) return;
  let disposed = false;
  let unsubscribeSettings = () => {};
  let pending = Promise.resolve();
  const persist = () => {
    const size = normalizeWindowSize(useAppConfig.getState().windowSize);
    // Preserve edit order when several settings changes happen before disk writes finish.
    pending = pending.then(async () => {
      if (disposed) return;
      try {
        await invoke("save_startup_window_size", { size });
      } catch (error) {
        console.error("[Window] Failed to save startup size", error);
        showToast(Locale.Settings.WindowSize.SaveFailed);
      }
    });
  };
  const connect = () => {
    if (disposed) return;
    // This also migrates the previous IndexedDB-only preference on the first upgrade launch.
    persist();
    unsubscribeSettings = useAppConfig.subscribe((state, previous) => {
      if (
        state.windowSize.width !== previous.windowSize.width ||
        state.windowSize.height !== previous.windowSize.height
      )
        persist();
    });
  };
  let unsubscribeHydration = () => {};
  if (useAppConfig.persist.hasHydrated()) {
    connect();
  } else {
    unsubscribeHydration = useAppConfig.persist.onFinishHydration(() => {
      unsubscribeHydration();
      connect();
    });
  }
  return () => {
    disposed = true;
    unsubscribeHydration();
    unsubscribeSettings();
  };
}
