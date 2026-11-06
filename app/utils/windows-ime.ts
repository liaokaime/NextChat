import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

type TextControl = HTMLInputElement | HTMLTextAreaElement;

function focusedTextControl(): TextControl | null {
  const element = document.activeElement;
  if (element instanceof HTMLTextAreaElement) return element;
  if (
    element instanceof HTMLInputElement &&
    ["text", "search", "url", "tel"].includes(element.type)
  ) {
    return element;
  }
  return null;
}

/** Work around stale WebView2 IME state after Windows restores native focus. */
export function installWindowsImeRecovery() {
  if (
    typeof window === "undefined" ||
    !isTauri() ||
    !/Windows NT/i.test(navigator.userAgent)
  ) {
    return;
  }

  let disposed = false;
  let composing = false;
  let targetOnBlur: TextControl | null = null;
  let frame: number | undefined;
  let unlistenFocus = () => {};

  const cancel = () => {
    targetOnBlur = null;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
  const canRefresh = (target: TextControl) =>
    !disposed &&
    !composing &&
    !document.hidden &&
    document.hasFocus() &&
    target.isConnected &&
    !target.disabled &&
    !target.readOnly &&
    document.activeElement === target;

  const refresh = (target: TextControl) => {
    frame = undefined;
    if (!canRefresh(target)) return;

    const {
      selectionStart,
      selectionEnd,
      selectionDirection,
      scrollTop,
      scrollLeft,
      value,
    } = target;
    // focus() alone is a no-op when the DOM still considers this control focused.
    // A real focus transition lets WebView2 resynchronize its native IME context.
    target.blur();
    // A blur handler may navigate, remove the control, or focus something else.
    if (
      !target.isConnected ||
      target.disabled ||
      target.readOnly ||
      !document.hasFocus() ||
      document.activeElement !== document.body
    )
      return;
    target.focus({ preventScroll: true });
    if (document.activeElement !== target) return;
    if (
      target.value === value &&
      selectionStart !== null &&
      selectionEnd !== null
    ) {
      target.setSelectionRange(
        selectionStart,
        selectionEnd,
        selectionDirection ?? undefined,
      );
    }
    target.scrollTop = scrollTop;
    target.scrollLeft = scrollLeft;
  };

  const onCompositionStart = () => {
    composing = true;
    cancel();
  };
  const onCompositionEnd = () => {
    composing = false;
  };
  document.addEventListener("compositionstart", onCompositionStart, true);
  document.addEventListener("compositionend", onCompositionEnd, true);
  // Never interrupt input or override a focus choice made during reactivation.
  for (const event of ["pointerdown", "keydown", "input"] as const) {
    document.addEventListener(event, cancel, true);
  }

  void getCurrentWindow()
    .onFocusChanged(({ payload: focused }) => {
      if (disposed) return;
      if (!focused) {
        cancel();
        targetOnBlur = composing ? null : focusedTextControl();
        return;
      }

      const target = targetOnBlur;
      if (!target) return;
      cancel();
      // Give restoration/layout a rendering opportunity before refreshing once.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => refresh(target));
      });
    })
    .then((unlisten) => {
      if (disposed) unlisten();
      else unlistenFocus = unlisten;
    })
    .catch((error) => {
      console.error("[IME] Failed to listen for window focus changes", error);
    });

  return () => {
    disposed = true;
    cancel();
    unlistenFocus();
    document.removeEventListener("compositionstart", onCompositionStart, true);
    document.removeEventListener("compositionend", onCompositionEnd, true);
    for (const event of ["pointerdown", "keydown", "input"] as const) {
      document.removeEventListener(event, cancel, true);
    }
  };
}
