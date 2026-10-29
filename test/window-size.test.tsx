import React from "react";
import { jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const saved = new Map<string, string>();
const getItem = jest.fn<(key: string) => Promise<string | null>>(
  async (key) => saved.get(key) ?? null,
);
jest.unstable_mockModule("@/app/utils/indexedDB-storage", () => ({
  indexedDBStorage: {
    getItem,
    setItem: async (key: string, value: string) => {
      saved.set(key, value);
    },
    removeItem: async (key: string) => {
      saved.delete(key);
    },
  },
}));
const isTauri = jest.fn(() => true);
const invoke = jest
  .fn<(...args: unknown[]) => Promise<void>>()
  .mockResolvedValue(undefined);
const tauriCore = await import("@tauri-apps/api/core");
jest.unstable_mockModule("@tauri-apps/api/core", () => ({
  ...tauriCore,
  isTauri,
  invoke,
}));
const innerSize = jest.fn(async () => ({ width: 1920, height: 1200 }));
const getCurrentWindow = jest.fn(() => ({
  innerSize,
  scaleFactor: async () => 2,
}));
jest.unstable_mockModule("@tauri-apps/api/window", () => ({
  getCurrentWindow,
}));

// Initialize the existing store dependency graph before importing settings.
await import("../app/store/chat");
const { useAppConfig } = await import("../app/store/config");
const { WindowSizeSettings } =
  await import("../app/components/window-size-settings");
const { initializeDesktopWindowSettings } =
  await import("../app/utils/desktop-window");
const { default: Locale } = await import("../app/locales");
const { StoreKey } = await import("../app/constant");
const subscriptions: Array<() => void> = [];
function startSync() {
  const stop = initializeDesktopWindowSettings();
  if (stop) subscriptions.push(stop);
  return stop;
}
afterEach(() => subscriptions.splice(0).forEach((stop) => stop()));

beforeEach(async () => {
  saved.clear();
  getItem.mockClear();
  await useAppConfig.persist.rehydrate();
  useAppConfig.getState().reset();
  invoke.mockReset().mockResolvedValue(undefined);
  getCurrentWindow.mockClear();
  innerSize.mockReset().mockResolvedValue({ width: 1920, height: 1200 });
  isTauri.mockReturnValue(true);
});

test("width and height persist without calling the window API", async () => {
  const view = render(<WindowSizeSettings />);
  fireEvent.change(screen.getByLabelText(Locale.Settings.WindowSize.Width), {
    target: { value: "1280" },
  });
  fireEvent.blur(screen.getByLabelText(Locale.Settings.WindowSize.Width));
  fireEvent.change(screen.getByLabelText(Locale.Settings.WindowSize.Height), {
    target: { value: "800" },
  });
  fireEvent.blur(screen.getByLabelText(Locale.Settings.WindowSize.Height));
  expect(useAppConfig.getState().windowSize).toEqual({
    width: 1280,
    height: 800,
  });
  await waitFor(() =>
    expect(JSON.parse(saved.get(StoreKey.Config)!).state.windowSize).toEqual({
      width: 1280,
      height: 800,
    }),
  );
  expect(getCurrentWindow).not.toHaveBeenCalled();
  view.unmount();
});

test("old preferences migrate to native storage after hydration without resizing or hiding", async () => {
  const persisted = JSON.stringify({
    state: {
      ...useAppConfig.getState(),
      windowSize: { width: 1280, height: 800 },
    },
    version: 4.4,
  });
  let finishRead!: (value: string) => void;
  getItem.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  );
  const loading = useAppConfig.persist.rehydrate();
  startSync();
  expect(invoke).not.toHaveBeenCalled();
  finishRead(persisted);
  await loading;
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("save_startup_window_size", {
      size: { width: 1280, height: 800 },
    }),
  );
  expect(getCurrentWindow).not.toHaveBeenCalled();
});

test("empty, fractional and out-of-range input cannot overwrite the saved size", () => {
  render(<WindowSizeSettings />);
  for (const value of ["", "0", "479", "7681", "960.5"]) {
    fireEvent.change(screen.getByLabelText(Locale.Settings.WindowSize.Width), {
      target: { value },
    });
    fireEvent.blur(screen.getByLabelText(Locale.Settings.WindowSize.Width));
    expect(screen.getByLabelText(Locale.Settings.WindowSize.Width)).toHaveValue(
      960,
    );
  }
  expect(useAppConfig.getState().windowSize).toEqual({
    width: 960,
    height: 600,
  });
});

test("filling the current size converts physical pixels and saves the preference", async () => {
  innerSize.mockResolvedValue({ width: 2560, height: 1600 });
  render(<WindowSizeSettings />);
  fireEvent.click(
    screen.getByRole("button", { name: Locale.Settings.WindowSize.UseCurrent }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText(Locale.Settings.WindowSize.Width)).toHaveValue(
      1280,
    ),
  );
  expect(screen.getByLabelText(Locale.Settings.WindowSize.Height)).toHaveValue(
    800,
  );
  expect(useAppConfig.getState().windowSize).toEqual({
    width: 1280,
    height: 800,
  });
});

test("reset restores both default dimensions and discards unfinished edits", () => {
  useAppConfig.getState().update((config) => {
    config.windowSize = { width: 1280, height: 800 };
  });
  render(<WindowSizeSettings />);
  const width = screen.getByLabelText(Locale.Settings.WindowSize.Width);
  fireEvent.change(width, { target: { value: "12" } });
  fireEvent.blur(width);
  fireEvent.click(
    screen.getByRole("button", { name: Locale.Settings.WindowSize.Reset }),
  );
  expect(width).toHaveValue(960);
  expect(screen.getByLabelText(Locale.Settings.WindowSize.Height)).toHaveValue(
    600,
  );
  expect(useAppConfig.getState().windowSize).toEqual({
    width: 960,
    height: 600,
  });
});

test("browser startup does not call desktop APIs", () => {
  isTauri.mockReturnValue(false);
  startSync();
  expect(invoke).not.toHaveBeenCalled();
  expect(getCurrentWindow).not.toHaveBeenCalled();
});

test("rapid edits reach native storage in order, including reset", async () => {
  let finishWrite!: () => void;
  invoke.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishWrite = resolve;
      }),
  );
  startSync();
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
  useAppConfig.getState().update((config) => {
    config.windowSize = { width: 1280, height: 800 };
  });
  useAppConfig.getState().update((config) => {
    config.windowSize = { width: 1440, height: 900 };
  });
  useAppConfig.getState().reset();
  expect(invoke).toHaveBeenCalledTimes(1);
  finishWrite();
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(4));
  expect(invoke.mock.calls.map((call) => call[1])).toEqual([
    { size: { width: 960, height: 600 } },
    { size: { width: 1280, height: 800 } },
    { size: { width: 1440, height: 900 } },
    { size: { width: 960, height: 600 } },
  ]);
  expect(getCurrentWindow).not.toHaveBeenCalled();
});

test("a failed native save reports an error and allows subsequent saves", async () => {
  const error = new Error("disk full");
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    invoke.mockRejectedValueOnce(error);
    startSync();
    await waitFor(() =>
      expect(
        screen.getByText(Locale.Settings.WindowSize.SaveFailed),
      ).toBeInTheDocument(),
    );
    expect(log).toHaveBeenCalledWith(
      "[Window] Failed to save startup size",
      error,
    );
    useAppConfig.getState().update((config) => {
      config.windowSize = { width: 1280, height: 800 };
    });
    await waitFor(() =>
      expect(invoke).toHaveBeenLastCalledWith("save_startup_window_size", {
        size: { width: 1280, height: 800 },
      }),
    );
  } finally {
    log.mockRestore();
  }
});

test("cleanup cancels pending hydration work", async () => {
  let finishRead!: (value: null) => void;
  getItem.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  );
  const loading = useAppConfig.persist.rehydrate();
  const stop = startSync();
  stop?.();
  finishRead(null);
  await loading;
  expect(invoke).not.toHaveBeenCalled();
});

test.each([undefined, null, { width: -1, height: "800" }])(
  "old or corrupt stored sizes fall back to defaults: %p",
  (windowSize) => {
    const merge = useAppConfig.persist.getOptions().merge!;
    const restored = merge({ windowSize }, useAppConfig.getState());
    expect(restored.windowSize).toEqual({ width: 960, height: 600 });
  },
);
