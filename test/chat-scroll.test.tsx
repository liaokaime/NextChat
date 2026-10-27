import { jest } from "@jest/globals";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useChatScroll } from "../app/components/use-chat-scroll";

type Row = {
  id: string;
  top: number;
  height: number;
  preview?: boolean;
  bodyTop?: number;
  role?: "user" | "assistant";
};
let viewport: number;
let frames: Map<number, FrameRequestCallback>;
let observers: Set<ResizeObserverCallback>;
let disconnect: ReturnType<typeof jest.fn>;

function Chat({
  rows,
  replyId,
  tailId,
}: {
  rows: Row[];
  replyId: string;
  tailId?: string;
}) {
  const {
    scrollRef,
    contentRef,
    spacerRef,
    hitBottom,
    hasContentBelow,
    beginReply,
    followLatest,
    onScroll,
  } = useChatScroll(
    replyId,
    tailId ?? rows.filter((r) => !r.preview).at(-1)?.id,
  );
  return (
    <>
      <button onClick={beginReply}>Send</button>
      <button onClick={followLatest}>Latest</button>
      <output>{hitBottom ? "latest" : "reading"}</output>
      {hasContentBelow && <div data-testid="overflow-hint" />}
      <div
        data-testid="scroll"
        ref={scrollRef}
        onScroll={onScroll}
        style={{ paddingBottom: 40 }}
      >
        <div data-testid="content" data-top="20" ref={contentRef}>
          {rows.map((row) => (
            <div
              key={row.id}
              data-message-id={row.preview ? undefined : row.id}
              data-message-role={row.role}
              data-top={row.top}
              data-height={row.height}
            >
              {row.bodyTop !== undefined && (
                <div className="markdown-content">
                  <p data-top={row.bodyTop} data-height="100">
                    Reading anchor
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        <div data-testid="spacer" ref={spacerRef} />
      </div>
      <textarea aria-label="input" />
    </>
  );
}

const initial: Row[] = [
  { id: "user", top: 0, height: 100 },
  { id: "old", top: 100, height: 800 },
];
const reply: Row[] = [
  ...initial,
  { id: "question", top: 900, height: 100, role: "user" },
  { id: "answer", top: 1000, height: 40 },
];

function paint() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });
}

function resize() {
  act(() =>
    observers.forEach((callback) => callback([], {} as ResizeObserver)),
  );
  paint();
}

beforeEach(() => {
  viewport = 600;
  frames = new Map();
  observers = new Set();
  disconnect = jest.fn();
  let frameId = 0;
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: class {
      constructor(callback: ResizeObserverCallback) {
        observers.add(callback);
      }
      observe() {}
      disconnect() {
        disconnect();
      }
    },
  });
  jest
    .spyOn(HTMLElement.prototype, "offsetParent", "get")
    .mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === "content") return this.parentElement;
      if (this.dataset.messageId || this.dataset.height) {
        return (
          this.parentElement?.closest<HTMLElement>(
            "[data-message-id], [data-testid=content]",
          ) ?? null
        );
      }
      return null;
    });
  jest
    .spyOn(HTMLElement.prototype, "offsetTop", "get")
    .mockImplementation(function (this: HTMLElement) {
      return Number(this.dataset.top ?? 0);
    });
  jest
    .spyOn(HTMLElement.prototype, "offsetHeight", "get")
    .mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === "content") {
        return Math.max(
          0,
          ...Array.from(this.children, (row) => {
            const element = row as HTMLElement;
            return Number(element.dataset.top) + Number(element.dataset.height);
          }),
        );
      }
      return Number(this.dataset.height ?? 0);
    });
  jest
    .spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockImplementation(() => viewport);
  jest
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockImplementation(function (this: HTMLElement) {
      const content = this.querySelector(
        '[data-testid="content"]',
      ) as HTMLElement | null;
      const spacer = this.querySelector(
        '[data-testid="spacer"]',
      ) as HTMLElement | null;
      return content
        ? 20 +
            content.offsetHeight +
            40 +
            parseFloat(spacer?.style.height || "0")
        : viewport;
    });
  // Model the browser's scroll range, including clamping when no spacer exists.
  const positions = new WeakMap<HTMLElement, number>();
  Object.defineProperty(HTMLElement.prototype, "scrollTop", {
    configurable: true,
    get() {
      return positions.get(this) ?? 0;
    },
    set(value: number) {
      const content = this.querySelector(
        '[data-testid="content"]',
      ) as HTMLElement | null;
      const spacer = this.querySelector(
        '[data-testid="spacer"]',
      ) as HTMLElement | null;
      const floor = content
        ? Math.max(
            0,
            20 +
              content.offsetHeight +
              40 +
              parseFloat(spacer?.style.height || "0") -
              viewport,
          )
        : 0;
      positions.set(this, Math.min(floor, Math.max(0, value)));
    },
  });
});

const scrollTopDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollTop",
);

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  if (scrollTopDescriptor)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollTop",
      scrollTopDescriptor,
    );
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTop;
});

test("opens existing history at the latest real message and ignores input previews", () => {
  const view = render(<Chat rows={initial} replyId="old" />);
  const scroller = view.getByTestId("scroll");
  expect(scroller.scrollTop).toBe(360);
  view.rerender(
    <Chat
      rows={[
        ...initial,
        { id: "preview", top: 900, height: 500, preview: true },
      ]}
      replyId="old"
    />,
  );
  paint();
  expect(scroller.scrollTop).toBe(360);
  fireEvent.focus(view.getByLabelText("input"));
  fireEvent.click(view.getByLabelText("input"));
  expect(scroller.scrollTop).toBe(360);
});

test("positions a new answer once and consumes the spacer without pushing existing lines up", () => {
  const view = render(<Chat rows={initial} replyId="old" />);
  fireEvent.click(view.getByText("Send"));
  view.rerender(<Chat rows={reply} replyId="answer" />);
  const scroller = view.getByTestId("scroll");
  expect(scroller.scrollTop).toBe(800);
  // The preceding answer's last 120px and the full new question stay visible.
  expect(920 - scroller.scrollTop).toBe(120);
  expect(view.getByTestId("spacer")).toHaveStyle({ height: "300px" });
  expect(view.queryByTestId("overflow-hint")).not.toBeInTheDocument();
  const long = reply.map((r) =>
    r.id === "answer" ? { ...r, height: 800 } : r,
  );
  view.rerender(<Chat rows={long} replyId="answer" />);
  resize();
  expect(scroller.scrollTop).toBe(800);
  expect(view.getByTestId("spacer")).toHaveStyle({ height: "0px" });
  expect(view.getByText("reading")).toBeInTheDocument();
  expect(view.getByTestId("overflow-hint")).toBeInTheDocument();
  // A completion/stop render must not return to the end.
  view.rerender(<Chat rows={[...long]} replyId="answer" />);
  expect(scroller.scrollTop).toBe(800);
});

test("keeps space after a short answer completes and scales the initial inset on small screens", () => {
  viewport = 300;
  const view = render(<Chat rows={initial} replyId="old" />);
  fireEvent.click(view.getByText("Send"));
  view.rerender(<Chat rows={reply} replyId="answer" />);
  expect(view.getByTestId("scroll").scrollTop).toBe(860);
  const spacerHeight = view.getByTestId("spacer").style.height;
  view.rerender(<Chat rows={[...reply]} replyId="answer" />);
  resize();
  expect(view.getByTestId("scroll").scrollTop).toBe(860);
  expect(view.getByTestId("spacer").style.height).toBe(spacerHeight);
});

test("keeps the reply opening visible after a very long question", () => {
  const view = render(<Chat rows={initial} replyId="old" />);
  fireEvent.click(view.getByText("Send"));
  view.rerender(
    <Chat
      rows={reply.map((r) =>
        r.id === "question"
          ? { ...r, height: 1000 }
          : r.id === "answer"
            ? { ...r, top: 1900 }
            : r,
      )}
      replyId="answer"
    />,
  );
  expect(1920 - view.getByTestId("scroll").scrollTop).toBe(360);
});

test("shows overflow only for real content below the viewport and clears it on scroll or resize", () => {
  const view = render(<Chat rows={initial} replyId="old" />);
  const scroller = view.getByTestId("scroll");
  expect(view.queryByTestId("overflow-hint")).not.toBeInTheDocument();
  scroller.scrollTop = 200;
  fireEvent.scroll(scroller);
  expect(view.getByTestId("overflow-hint")).toBeInTheDocument();
  viewport = 800;
  resize();
  expect(view.queryByTestId("overflow-hint")).not.toBeInTheDocument();
  viewport = 600;
  resize();
  expect(view.getByTestId("overflow-hint")).toBeInTheDocument();
  scroller.scrollTop = 320; // Only bottom padding remains outside the viewport.
  fireEvent.scroll(scroller);
  expect(view.queryByTestId("overflow-hint")).not.toBeInTheDocument();
});

test("explicit latest follows growth, while an upward reader gesture cancels a queued follow", () => {
  const view = render(<Chat rows={initial} replyId="old" />);
  fireEvent.click(view.getByText("Send"));
  view.rerender(<Chat rows={reply} replyId="answer" />);
  fireEvent.click(view.getByText("Latest"));
  paint();
  const scroller = view.getByTestId("scroll");
  expect(view.getByTestId("spacer")).toHaveStyle({ height: "0px" });
  expect(scroller.scrollTop).toBe(500);
  const long = reply.map((r) =>
    r.id === "answer" ? { ...r, height: 1000 } : r,
  );
  view.rerender(<Chat rows={long} replyId="answer" />);
  paint();
  expect(scroller.scrollTop).toBe(1460);
  view.rerender(
    <Chat
      rows={long.map((r) => ({ ...r, height: r.height + 50 }))}
      replyId="answer"
    />,
  );
  fireEvent.wheel(scroller, { deltaY: -100 });
  scroller.scrollTop = 1300;
  fireEvent.scroll(scroller);
  paint();
  expect(scroller.scrollTop).toBe(1300);
  fireEvent(scroller, new Event("scrollend"));
  resize();
  expect(scroller.scrollTop).toBe(1300);
});

test("resumes follow only after actual downward user movement to the real bottom", () => {
  const long = reply.map((r) =>
    r.id === "answer" ? { ...r, height: 1000 } : r,
  );
  const view = render(<Chat rows={initial} replyId="old" />);
  fireEvent.click(view.getByText("Send"));
  view.rerender(<Chat rows={long} replyId="answer" />);
  const scroller = view.getByTestId("scroll");
  fireEvent.wheel(scroller, { deltaY: 600 });
  scroller.scrollTop = 1460;
  fireEvent.scroll(scroller);
  paint();
  view.rerender(
    <Chat
      rows={long.map((r) => (r.id === "answer" ? { ...r, height: 1200 } : r))}
      replyId="answer"
    />,
  );
  paint();
  expect(scroller.scrollTop).toBe(1660);
});

test("compensates for images above the reading anchor and overlapping history windows", () => {
  const view = render(<Chat rows={initial} replyId="old" />);
  fireEvent.click(view.getByText("Send"));
  const long = reply.map((r) =>
    r.id === "answer" ? { ...r, height: 800 } : r,
  );
  view.rerender(<Chat rows={long} replyId="answer" />);
  const scroller = view.getByTestId("scroll");
  scroller.scrollTop = 940;
  fireEvent.scroll(scroller);
  fireEvent(scroller, new Event("scrollend"));
  paint();
  const shifted = long.map((r) =>
    r.id === "old"
      ? { ...r, height: r.height + 200 }
      : r.id === "question" || r.id === "answer"
        ? { ...r, top: r.top + 200 }
        : r,
  );
  view.rerender(<Chat rows={shifted} replyId="answer" />);
  expect(scroller.scrollTop).toBe(1140);
  // Earlier messages leave the rendered window; the visible message retains its offset.
  view.rerender(
    <Chat
      rows={shifted.slice(2).map((r) => ({ ...r, top: r.top - 800 }))}
      replyId="answer"
    />,
  );
  expect(scroller.scrollTop).toBe(340);
  viewport = 400;
  resize();
  expect(scroller.scrollTop).toBe(340);
});

test("does not follow a historical window mistaken for the conversation's actual tail", () => {
  const view = render(
    <Chat rows={initial} replyId="old" tailId="outside-window" />,
  );
  expect(view.getByText("reading")).toBeInTheDocument();
  const scroller = view.getByTestId("scroll");
  fireEvent.wheel(scroller, { deltaY: -100 });
  scroller.scrollTop = 200;
  fireEvent.scroll(scroller);
  fireEvent.wheel(scroller, { deltaY: 500 });
  scroller.scrollTop = 360;
  fireEvent.scroll(scroller);
  fireEvent(scroller, new Event("scrollend"));
  view.rerender(
    <Chat
      rows={initial.map((r) => ({ ...r, height: r.height + 100 }))}
      replyId="old"
      tailId="outside-window"
    />,
  );
  paint();
  expect(scroller.scrollTop).toBe(360);
  expect(view.getByText("reading")).toBeInTheDocument();
});

test("disconnects observers and cancels pending frames on unmount", () => {
  const view = render(<Chat rows={initial} replyId="old" />);
  act(() =>
    observers.forEach((callback) => callback([], {} as ResizeObserver)),
  );
  expect(frames.size).toBe(1);
  view.unmount();
  expect(frames.size).toBe(0);
  expect(disconnect).toHaveBeenCalled();
});

test("keeps a paragraph in place when the streaming status above it disappears", () => {
  const view = render(<Chat rows={initial} replyId="old" />);
  fireEvent.click(view.getByText("Send"));
  const streaming = reply.map((r) =>
    r.id === "answer" ? { ...r, height: 800, bodyTop: 40 } : r,
  );
  view.rerender(<Chat rows={streaming} replyId="answer" />);
  const scroller = view.getByTestId("scroll");
  scroller.scrollTop = 940;
  fireEvent.scroll(scroller);
  fireEvent(scroller, new Event("scrollend"));
  paint();
  expect(view.getByTestId("scroll").scrollTop).toBe(940);
  const completed = streaming.map((r) =>
    r.id === "answer" ? { ...r, height: 777, bodyTop: 17 } : r,
  );
  view.rerender(<Chat rows={completed} replyId="answer" />);
  expect(view.getByTestId("scroll").scrollTop).toBe(917);
});

test("recognizes scrollbar and accessibility scrolling without a wheel event", () => {
  const view = render(<Chat rows={initial} replyId="old" />);
  const scroller = view.getByTestId("scroll");
  scroller.scrollTop = 200;
  fireEvent.scroll(scroller);
  fireEvent(scroller, new Event("scrollend"));
  view.rerender(
    <Chat
      rows={initial.map((r) => (r.id === "old" ? { ...r, height: 1200 } : r))}
      replyId="old"
    />,
  );
  paint();
  expect(scroller.scrollTop).toBe(200);
});

test("a reader gesture supersedes a pending reply landing", () => {
  const view = render(<Chat rows={initial} replyId="old" />);
  fireEvent.click(view.getByText("Send"));
  const scroller = view.getByTestId("scroll");
  fireEvent.wheel(scroller, { deltaY: -100 });
  scroller.scrollTop = 200;
  fireEvent.scroll(scroller);
  fireEvent(scroller, new Event("scrollend"));
  view.rerender(<Chat rows={reply} replyId="answer" />);
  expect(scroller.scrollTop).toBe(200);
});

test("scrolling into a draft preview does not jump backwards to the real answer", () => {
  const rows = [
    ...initial,
    { id: "preview", top: 900, height: 700, preview: true },
  ];
  const view = render(<Chat rows={rows} replyId="old" />);
  const scroller = view.getByTestId("scroll");
  fireEvent.wheel(scroller, { deltaY: 200 });
  scroller.scrollTop = 500;
  fireEvent.scroll(scroller);
  paint();
  expect(scroller.scrollTop).toBe(500);
});
