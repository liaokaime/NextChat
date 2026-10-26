import React from "react";
import { jest } from "@jest/globals";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const copy = jest.fn();
jest.unstable_mockModule("@/app/locales", () => ({
  default: { Chat: { Actions: { Copy: "Copy" } }, NewChat: { More: "More" } },
}));
jest.unstable_mockModule("@/app/utils", () => ({
  copyToClipboard: copy,
  useWindowSize: () => ({ height: 900 }),
}));
jest.unstable_mockModule("@/app/components/ui-lib", () => ({
  showImageModal: jest.fn(),
  FullScreen: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.unstable_mockModule("@/app/components/artifacts", () => ({
  ArtifactsShareButton: () => null,
  HTMLPreview: () => <iframe title="HTML preview" />,
}));
for (const icon of ["three-dots", "reload"]) {
  jest.unstable_mockModule(`@/app/icons/${icon}.svg`, () => ({
    default: () => <svg />,
  }));
}
jest.unstable_mockModule("@/app/store/config", () => ({
  useAppConfig: (select: (state: unknown) => unknown) =>
    select({ enableCodeFold: true, enableArtifacts: true }),
}));
jest.unstable_mockModule("@/app/store/chat", () => ({
  useChatStore: (select: (state: unknown) => unknown) =>
    select({ sessions: [{ mask: {} }], currentSessionIndex: 0 }),
}));
const renderMermaid = jest
  .fn<() => Promise<{ svg: string }>>()
  .mockResolvedValue({ svg: '<svg aria-label="diagram"></svg>' });
jest.unstable_mockModule("mermaid", () => ({
  default: { render: renderMermaid },
}));

const { Markdown } = await import("../app/components/markdown");
afterEach(cleanup);

test("real Streamdown renders project typography, GFM, CJK, math and literal HTML", () => {
  const { container } = render(
    <Markdown
      content={
        "# 标题\n\n中文**粗体**文本\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n\n$e^{i\\pi}+1=0$\n\n\\[x^2\\]\n\n<script>alert(1)</script>\n\nfootnote[^1]\n\n[^1]: note"
      }
    />,
  );
  expect(container.querySelector("h1")).toHaveTextContent("标题");
  expect(container.querySelector("strong")).toHaveTextContent("粗体");
  expect(container.querySelectorAll("td")).toHaveLength(2);
  expect(container.querySelector('input[type="checkbox"]')).toBeChecked();
  expect(container.querySelectorAll(".katex")).toHaveLength(2);
  expect(container.querySelector("script")).toBeNull();
  expect(container).toHaveTextContent("<script>alert(1)</script>");
  expect(container.querySelector("[data-footnote-ref]")).toBeTruthy();
  expect(container.querySelector("[data-footnote-ref]")).toHaveAttribute(
    "target",
    "_self",
  );
});

test("streaming repairs unfinished emphasis and links and completes without remounting a settled block", () => {
  const { container, rerender } = render(
    <Markdown
      mode="streaming"
      isStreaming
      content={"stable\n\n**unfinished"}
    />,
  );
  const settled = container.querySelector("p");
  expect(container.querySelector("strong")).toHaveTextContent("unfinished");
  rerender(
    <Markdown
      mode="streaming"
      isStreaming
      content={"stable\n\n**finished** [link](https://example.com"}
    />,
  );
  expect(container.querySelector('a[href="https://example.com"]')).toBeNull();
  rerender(
    <Markdown
      mode="streaming"
      content={"stable\n\n**finished** [link](https://example.com)"}
    />,
  );
  expect(container.querySelector("p")).toBe(settled);
  expect(container.querySelector("a")).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
});

test("highlights code and copies the raw source", async () => {
  const source = 'const value = "<tag>";\nconsole.log(value);';
  const { container } = render(
    <Markdown content={"```javascript\n" + source + "\n```"} />,
  );
  await waitFor(() =>
    expect(container.querySelector("[data-code-block]")).toHaveAttribute(
      "data-render-pending",
      "false",
    ),
  );
  expect(container.querySelector("pre code")).toHaveTextContent(
    'const value = "<tag>";',
  );
  expect(container.querySelectorAll("pre code span").length).toBeGreaterThan(1);
  fireEvent.click(container.querySelector("[data-copy-code]")!);
  expect(copy).toHaveBeenLastCalledWith(source + "\n");
});

test("previews wait for a closed fence or the end of the message", async () => {
  const { container, rerender } = render(
    <Markdown
      mode="streaming"
      isStreaming
      content={"```mermaid\ngraph TD\nA-->B"}
    />,
  );
  expect(container.querySelector("[data-mermaid-preview]")).toBeNull();
  rerender(
    <Markdown
      mode="streaming"
      isStreaming
      content={"```mermaid\ngraph TD\nA-->B\n```\n\nnext"}
    />,
  );
  await waitFor(() =>
    expect(container.querySelector("[data-mermaid-preview] svg")).toBeTruthy(),
  );
  rerender(
    <Markdown
      mode="streaming"
      isStreaming
      content={"```html\n<h1>preview</h1>"}
    />,
  );
  expect(container.querySelector("iframe")).toBeNull();
  rerender(<Markdown mode="streaming" content={"```html\n<h1>preview</h1>"} />);
  await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
});

test("expanding long code survives subsequent chunks and stream completion", async () => {
  const height = jest
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockReturnValue(1000);
  try {
    const first = "```text\n" + "a line\n".repeat(80);
    const { container, rerender, getByRole, queryByRole } = render(
      <Markdown mode="streaming" isStreaming content={first} />,
    );
    fireEvent.click(getByRole("button", { name: "More" }));
    const block = container.querySelector("[data-code-block]");
    rerender(
      <Markdown
        mode="streaming"
        isStreaming
        content={first + "another line\n"}
      />,
    );
    rerender(
      <Markdown mode="streaming" content={first + "another line\n```"} />,
    );
    expect(container.querySelector("[data-code-block]")).toBe(block);
    expect(queryByRole("button", { name: "More" })).toBeNull();
    await waitFor(() =>
      expect(block).toHaveAttribute("data-render-pending", "false"),
    );
  } finally {
    height.mockRestore();
  }
});

test("invalid Mermaid keeps its source and settles export readiness", async () => {
  renderMermaid.mockRejectedValueOnce(new Error("Invalid diagram"));
  const { container } = render(
    <Markdown content={"```mermaid\ninvalid diagram\n```"} />,
  );
  await waitFor(() =>
    expect(container.querySelector("[data-mermaid-preview]")).toHaveAttribute(
      "data-render-pending",
      "false",
    ),
  );
  expect(container.querySelector("pre code")).toHaveTextContent(
    "invalid diagram",
  );
  expect(container.querySelector("[data-mermaid-preview] svg")).toBeNull();
});
