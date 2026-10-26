import { prepareMarkdown, waitForMarkdown } from "../app/utils/markdown";
import { jest } from "@jest/globals";

test("normalizes legacy math without changing dollar math", () => {
  expect(prepareMarkdown(String.raw`\(x\) and \[y\] and $z$ and $$w$$`)).toBe(
    "$x$ and $$y$$ and $z$ and $$w$$",
  );
});

test.each(["```", "~~~~", "````"])(
  "preserves %s fenced code and resumes normalization afterwards",
  (fence) => {
    const code = `${fence}tex\n\\(x\\)\n\\[y\\]\n${fence}\n`;
    expect(prepareMarkdown(code + String.raw`\(z\)`)).toBe(code + "$z$");
    expect(prepareMarkdown(code.slice(0, -fence.length - 1))).toBe(
      code.slice(0, -fence.length - 1),
    );
  },
);

test("preserves complete and incomplete inline code", () => {
  expect(prepareMarkdown("`\\(x\\)` then \\(y\\) and `\\[z\\]")).toBe(
    "`\\(x\\)` then $y$ and `\\[z\\]",
  );
});

test("preserves nested fences, indented code and code spans containing backticks", () => {
  for (const code of [
    "> ```tex\n> \\(x\\)\n> ```\n",
    "- ```tex\n  \\(x\\)\n  ```\n",
    "    \\(x\\)\n",
    "`` ` \\(x\\) ` ``",
  ]) {
    expect(prepareMarkdown(code)).toBe(code);
  }
});

test("wraps complete HTML documents but preserves HTML inside code", () => {
  const html = "<!DOCTYPE html><html><body>Hello</body></html>";
  expect(prepareMarkdown(html)).toBe("\n```html\n" + html + "\n```\n");
  expect(prepareMarkdown("```text\n" + html + "\n```")).toBe(
    "```text\n" + html + "\n```",
  );
  expect(prepareMarkdown("<!DOCTYPE html><html>")).toBe(
    "<!DOCTYPE html><html>",
  );
});

test("export waits for pending rendering and image decoding", async () => {
  const root = document.createElement("div");
  root.innerHTML = '<div data-render-pending="true"></div><img />';
  const decode = jest.fn<() => Promise<void>>().mockResolvedValue();
  root.querySelector("img")!.decode = decode;
  let completed = false;
  const pending = waitForMarkdown(root).then(() => {
    completed = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 35));
  expect(completed).toBe(false);
  root.querySelector("div")!.dataset.renderPending = "false";
  await pending;
  expect(decode).toHaveBeenCalledTimes(1);
});
