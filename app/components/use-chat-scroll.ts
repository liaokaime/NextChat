"use client";

import { useLayoutEffect, useRef, useState } from "react";

const BOTTOM_TOLERANCE = 24;
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

type Anchor = {
  id: string;
  rowTop: number;
  element: HTMLElement;
  top: number;
};

/** Own scroll intent separately from geometry: a growing answer never implies follow. */
class ChatScroll {
  private scroller: HTMLDivElement | null = null;
  private content: HTMLDivElement | null = null;
  private spacer: HTMLDivElement | null = null;
  private observer?: ResizeObserver;
  private frame?: number;
  private inputTimer?: ReturnType<typeof setTimeout>;
  private initialized = false;
  private following = true;
  private interacting = false;
  private lastTop = 0;
  private anchor?: Anchor;
  private landingFloor = 0;
  private replyId?: string;
  private tailId?: string;
  private pendingReply?: { previousId?: string };

  constructor(
    private readonly publishBottom: (atBottom: boolean) => void,
    private readonly publishOverflow: (hasContentBelow: boolean) => void,
  ) {}

  attach(
    scroller: HTMLDivElement,
    content: HTMLDivElement,
    spacer: HTMLDivElement,
  ) {
    this.scroller = scroller;
    this.content = content;
    this.spacer = spacer;
    this.initialized = false;
    scroller.addEventListener("wheel", this.onIntent, { passive: true });
    scroller.addEventListener("touchstart", this.onIntent, { passive: true });
    scroller.addEventListener("pointerdown", this.onIntent, { passive: true });
    scroller.addEventListener("keydown", this.onIntent);
    scroller.addEventListener("beforematch", this.onIntent);
    scroller.addEventListener("scrollend", this.settleInteraction);
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(this.schedule);
      this.observer.observe(scroller);
      this.observer.observe(content);
    }
  }

  detach = () => {
    this.cancelFrame();
    this.endInteraction();
    this.observer?.disconnect();
    this.scroller?.removeEventListener("wheel", this.onIntent);
    this.scroller?.removeEventListener("touchstart", this.onIntent);
    this.scroller?.removeEventListener("pointerdown", this.onIntent);
    this.scroller?.removeEventListener("keydown", this.onIntent);
    this.scroller?.removeEventListener("beforematch", this.onIntent);
    this.scroller?.removeEventListener("scrollend", this.settleInteraction);
    this.scroller = this.content = this.spacer = null;
  };

  private rows() {
    return Array.from(
      this.content?.querySelectorAll<HTMLElement>("[data-message-id]") ?? [],
    );
  }

  // offsetTop ignores the message entrance animation's temporary transform.
  private rowTop(element: HTMLElement) {
    let top = 0;
    for (
      let node: HTMLElement | null = element;
      node && node !== this.scroller;
      node = node.offsetParent as HTMLElement | null
    ) {
      top += node.offsetTop;
    }
    return top;
  }

  private realBottom() {
    const rows = this.rows();
    const last = rows.at(-1);
    return last ? this.rowTop(last) + last.offsetHeight : 0;
  }

  private realFloor() {
    const padding = this.scroller
      ? parseFloat(getComputedStyle(this.scroller).paddingBottom) || 0
      : 0;
    return Math.max(
      0,
      this.realBottom() + padding - (this.scroller?.clientHeight ?? 0),
    );
  }

  private hasLatest() {
    return (
      !this.tailId ||
      this.rows().some((r) => r.dataset.messageId === this.tailId)
    );
  }

  private atLatest() {
    return (
      this.hasLatest() &&
      (this.scroller?.scrollTop ?? 0) >= this.realFloor() - BOTTOM_TOLERANCE
    );
  }

  private publishViewport() {
    this.publishBottom(this.atLatest());
    // Ignore the landing spacer, input previews and bottom padding. A small
    // rounding tolerance keeps the hint from flickering at fractional pixels.
    this.publishOverflow(
      !this.hasLatest() ||
        this.realBottom() >
          (this.scroller?.scrollTop ?? 0) +
            (this.scroller?.clientHeight ?? 0) +
            2,
    );
  }

  private capture() {
    const top = this.scroller?.scrollTop ?? 0;
    const line = top + Math.min(80, (this.scroller?.clientHeight ?? 0) * 0.2);
    const rows = this.rows();
    // A paragraph anchor also survives status removal and content inserted above
    // it inside a long answer (for example an image or expanded reasoning).
    let selected: { row: HTMLElement; element: HTMLElement } | undefined;
    for (const row of rows) {
      const blocks = Array.from(
        row.querySelectorAll<HTMLElement>(".markdown-content > *"),
      );
      const candidates = blocks.length
        ? blocks
        : [row.querySelector<HTMLElement>("[data-chat-message-body]") ?? row];
      const element = candidates.find(
        (block) =>
          block.offsetHeight > 0 &&
          this.rowTop(block) + block.offsetHeight > line,
      );
      if (element) {
        selected = { row, element };
        break;
      }
    }
    const row =
      selected?.row ?? rows.find((r) => this.rowTop(r) + r.offsetHeight > top);
    const element = selected?.element ?? row;
    this.anchor =
      row && element
        ? {
            id: row.dataset.messageId!,
            rowTop: this.rowTop(row) - top,
            element,
            top: this.rowTop(element) - top,
          }
        : undefined;
    this.lastTop = top;
  }

  private reserve(floor: number) {
    if (!this.scroller || !this.content || !this.spacer) return;
    const padding =
      parseFloat(getComputedStyle(this.scroller).paddingBottom) || 0;
    const naturalHeight =
      this.content.offsetTop + this.content.offsetHeight + padding;
    const height = Math.max(
      0,
      Math.ceil(floor + this.scroller.clientHeight - naturalHeight),
    );
    this.spacer.style.height = `${height}px`;
  }

  private write(top: number) {
    if (!this.scroller) return;
    this.scroller.scrollTop = Math.max(0, top);
    this.capture();
  }

  private cancelFrame() {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  private schedule = () => {
    if (!this.scroller || this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.reconcile();
    });
  };

  /** Called before send/retry, including when the reader is in an older page. */
  beginReply = () => {
    this.cancelFrame();
    this.endInteraction();
    this.following = false;
    this.pendingReply = { previousId: this.replyId };
    this.capture();
  };

  followLatest = () => {
    this.pendingReply = undefined;
    this.endInteraction();
    this.following = true;
    this.landingFloor = 0;
    this.schedule();
  };

  commit(replyId?: string, tailId?: string) {
    this.replyId = replyId;
    this.tailId = tailId;
    if (this.initialized && this.following && !this.pendingReply) {
      this.schedule();
      return;
    }
    this.cancelFrame();
    this.reconcile();
  }

  private reconcile() {
    if (!this.scroller) return;
    const row =
      this.pendingReply && this.replyId !== this.pendingReply.previousId
        ? this.rows().find((r) => r.dataset.messageId === this.replyId)
        : undefined;
    if (row) {
      this.cancelFrame();
      this.pendingReply = undefined;
      this.initialized = true;
      this.following = false;
      const rows = this.rows();
      const question = rows
        .slice(0, rows.indexOf(row))
        .findLast((r) => r.dataset.messageRole === "user");
      const height = this.scroller.clientHeight;
      const contextPeek = Math.min(120, height * 0.2);
      // Retain the previous turn above the question for continuity. With a long
      // question, keep the reply's opening in the lower part of the viewport.
      const top = Math.max(
        0,
        this.rowTop(question ?? row) - contextPeek,
        this.rowTop(row) - height * 0.6,
      );
      this.landingFloor = top;
      this.reserve(top);
      this.write(top);
    } else if (!this.initialized || (this.following && this.hasLatest())) {
      this.initialized = true;
      this.reserve(0);
      this.write(this.realFloor());
    } else if (!this.interacting) {
      const anchorRow = this.rows().find(
        (r) => r.dataset.messageId === this.anchor?.id,
      );
      const top =
        anchorRow && this.anchor
          ? this.content?.contains(this.anchor.element)
            ? this.rowTop(this.anchor.element) - this.anchor.top
            : this.rowTop(anchorRow) - this.anchor.rowTop
          : this.lastTop;
      this.reserve(Math.max(this.landingFloor, top));
      this.write(top);
    }
    this.publishViewport();
  }

  private endInteraction = () => {
    if (this.inputTimer !== undefined) clearTimeout(this.inputTimer);
    this.inputTimer = undefined;
    this.interacting = false;
  };

  private settleInteraction = () => {
    this.endInteraction();
    this.schedule();
  };

  private onIntent = (event: Event) => {
    if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
    if (
      event.target instanceof Element &&
      event.target.closest("input, textarea, select, [contenteditable=true]")
    )
      return;
    this.cancelFrame();
    this.endInteraction();
    this.interacting = true;
    this.pendingReply = undefined;
    this.capture();
    // Release follow before the browser delivers wheel/touch/scrollbar movement.
    this.following = false;
    this.inputTimer = setTimeout(this.settleInteraction, 500);
  };

  /** Return whether pagination should react to this delivery. */
  onScroll = () => {
    if (!this.scroller) return false;
    const delta = this.scroller.scrollTop - this.lastTop;
    const floor = this.scroller.scrollHeight - this.scroller.clientHeight;
    const clampedByLayout =
      this.lastTop > floor + 0.5 &&
      Math.abs(this.scroller.scrollTop - floor) < 1;
    // Scrollbar/keyboard/accessibility scrolling need not deliver a wheel event.
    // Our own writes already update lastTop before their scroll event arrives.
    const movedByReader =
      Math.abs(delta) > 0.5 && (this.interacting || !clampedByLayout);
    if (movedByReader) {
      this.cancelFrame();
      this.interacting = true;
      this.following =
        delta > 0 &&
        this.atLatest() &&
        this.scroller.scrollTop <= this.realFloor() + BOTTOM_TOLERANCE;
      this.capture();
      if (this.inputTimer !== undefined) clearTimeout(this.inputTimer);
      this.inputTimer = setTimeout(this.settleInteraction, 150);
      if (this.following) {
        this.landingFloor = 0;
        this.schedule();
      }
    }
    this.publishViewport();
    return movedByReader;
  };
}

export function useChatScroll(replyId?: string, tailId?: string) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const [hitBottom, setHitBottom] = useState(true);
  const [hasContentBelow, setHasContentBelow] = useState(false);
  const [scroll] = useState(
    () => new ChatScroll(setHitBottom, setHasContentBelow),
  );

  useLayoutEffect(() => {
    if (!scrollRef.current || !contentRef.current || !spacerRef.current) return;
    scroll.attach(scrollRef.current, contentRef.current, spacerRef.current);
    return scroll.detach;
  }, [scroll]);

  // Preserve the pre-commit anchor when pagination or message layout changes.
  useLayoutEffect(() => {
    scroll.commit(replyId, tailId);
  });

  return {
    scrollRef,
    contentRef,
    spacerRef,
    hitBottom,
    hasContentBelow,
    beginReply: scroll.beginReply,
    followLatest: scroll.followLatest,
    onScroll: scroll.onScroll,
  };
}
