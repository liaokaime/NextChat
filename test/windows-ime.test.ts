import { jest } from "@jest/globals";
import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event";

const isTauri = jest.fn(() => true);
const unlisten = jest.fn();
let focusChanged: EventCallback<boolean>;
const onFocusChanged = jest.fn<
  (callback: EventCallback<boolean>) => Promise<UnlistenFn>
>(async (callback) => {
  focusChanged = callback;
  return unlisten;
});
jest.unstable_mockModule("@tauri-apps/api/core", () => ({ isTauri }));
jest.unstable_mockModule("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onFocusChanged }),
}));
const { installWindowsImeRecovery } = await import("../app/utils/windows-ime");

const originalUserAgent = navigator.userAgent;
let stop: ReturnType<typeof installWindowsImeRecovery>;
let foreground = true;

function nativeFocus(focused: boolean) {
  foreground = focused;
  focusChanged({
    event: focused ? "tauri://focus" : "tauri://blur",
    id: 1,
    payload: focused,
  });
}

function textarea() {
  const control = document.createElement("textarea");
  control.value = "中文草稿\nsecond line";
  document.body.append(control);
  control.focus();
  return control;
}

beforeEach(() => {
  jest.useFakeTimers();
  isTauri.mockReturnValue(true);
  unlisten.mockClear();
  onFocusChanged.mockClear();
  foreground = true;
  jest.spyOn(document, "hasFocus").mockImplementation(() => foreground);
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  });
});

afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.replaceChildren();
  jest.restoreAllMocks();
  jest.useRealTimers();
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: originalUserAgent,
  });
});

test("restoring native focus refreshes the same control once and preserves its draft, selection and scroll", () => {
  const control = textarea();
  control.setSelectionRange(1, 5, "backward");
  control.scrollTop = 20;
  control.scrollLeft = 10;
  const blur = jest.spyOn(control, "blur");
  const input = jest.fn();
  control.addEventListener("input", input);
  stop = installWindowsImeRecovery();
  nativeFocus(false);
  nativeFocus(true);
  nativeFocus(true);
  expect(blur).not.toHaveBeenCalled();
  jest.advanceTimersByTime(40);
  expect(blur).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(control);
  expect(control.value).toBe("中文草稿\nsecond line");
  expect([
    control.selectionStart,
    control.selectionEnd,
    control.selectionDirection,
  ]).toEqual([1, 5, "backward"]);
  expect([control.scrollTop, control.scrollLeft]).toEqual([20, 10]);
  expect(input).not.toHaveBeenCalled();
  nativeFocus(true);
  jest.advanceTimersByTime(40);
  expect(blur).toHaveBeenCalledTimes(1);
});

test("waits for foreground state to settle before refreshing", () => {
  const control = textarea();
  const blur = jest.spyOn(control, "blur");
  stop = installWindowsImeRecovery();
  nativeFocus(false);
  focusChanged({ event: "tauri://focus", id: 1, payload: true });
  foreground = true;
  jest.advanceTimersByTime(40);
  expect(blur).toHaveBeenCalledTimes(1);
});

test.each(["pointerdown", "keydown", "input", "compositionstart"])(
  "%s during restoration cancels the refresh so typing is not interrupted",
  (event) => {
    const control = textarea();
    const blur = jest.spyOn(control, "blur");
    stop = installWindowsImeRecovery();
    nativeFocus(false);
    nativeFocus(true);
    control.dispatchEvent(new Event(event, { bubbles: true }));
    jest.advanceTimersByTime(40);
    expect(blur).not.toHaveBeenCalled();
  },
);

test("does not refresh an active composition or defer a refresh until composition ends", () => {
  const control = textarea();
  const blur = jest.spyOn(control, "blur");
  stop = installWindowsImeRecovery();
  control.dispatchEvent(new Event("compositionstart", { bubbles: true }));
  nativeFocus(false);
  nativeFocus(true);
  control.dispatchEvent(new Event("compositionend", { bubbles: true }));
  jest.advanceTimersByTime(40);
  expect(blur).not.toHaveBeenCalled();
  nativeFocus(false);
  nativeFocus(true);
  jest.advanceTimersByTime(40);
  expect(blur).toHaveBeenCalledTimes(1);
});

test.each([
  "different-control",
  "removed",
  "disabled",
  "readonly",
  "background",
  "hidden",
])(
  "skips restoration when the original control is no longer eligible: %s",
  (reason) => {
    const control = textarea();
    const blur = jest.spyOn(control, "blur");
    stop = installWindowsImeRecovery();
    nativeFocus(false);
    nativeFocus(true);
    if (reason === "different-control") textarea();
    if (reason === "removed") control.remove();
    if (reason === "disabled") control.disabled = true;
    if (reason === "readonly") control.readOnly = true;
    if (reason === "background") nativeFocus(false);
    if (reason === "hidden")
      jest.spyOn(document, "hidden", "get").mockReturnValue(true);
    jest.advanceTimersByTime(40);
    expect(blur).not.toHaveBeenCalled();
  },
);

test("respects a blur handler that focuses another control", () => {
  const other = textarea();
  const control = textarea();
  control.addEventListener("blur", () => other.focus());
  stop = installWindowsImeRecovery();
  nativeFocus(false);
  nativeFocus(true);
  jest.advanceTimersByTime(40);
  expect(document.activeElement).toBe(other);
});

test("does not focus a text field when a button was focused before minimization", () => {
  textarea();
  const button = document.createElement("button");
  document.body.append(button);
  button.focus();
  stop = installWindowsImeRecovery();
  nativeFocus(false);
  nativeFocus(true);
  jest.advanceTimersByTime(40);
  expect(document.activeElement).toBe(button);
});

test.each(["web", "macOS", "Linux"])(
  "does not install the workaround on %s",
  (platform) => {
    if (platform === "web") isTauri.mockReturnValue(false);
    else
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: platform,
      });
    stop = installWindowsImeRecovery();
    expect(onFocusChanged).not.toHaveBeenCalled();
  },
);

test("cleanup cancels frames and releases a subscription that completes after disposal", async () => {
  const control = textarea();
  const blur = jest.spyOn(control, "blur");
  stop = installWindowsImeRecovery();
  nativeFocus(false);
  nativeFocus(true);
  stop?.();
  stop = undefined;
  jest.advanceTimersByTime(40);
  await Promise.resolve();
  expect(blur).not.toHaveBeenCalled();
  expect(unlisten).toHaveBeenCalledTimes(1);
});
