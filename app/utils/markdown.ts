function normalizeMath(text: string) {
  const convert = (prose: string) =>
    prose.replace(
      /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g,
      (_match, display, inline) =>
        display !== undefined ? `$$${display}$$` : `$${inline}$`,
    );
  const ticks = Array.from(text.matchAll(/`+/g));
  let start = 0;
  let result = "";
  for (let i = 0; i < ticks.length; i++) {
    const open = ticks[i];
    result += convert(text.slice(start, open.index));
    let close = i + 1;
    while (close < ticks.length && ticks[close][0].length !== open[0].length)
      close++;
    if (close === ticks.length) return result + text.slice(open.index);
    start = ticks[close].index! + ticks[close][0].length;
    result += text.slice(open.index, start);
    i = close;
  }
  return result + convert(text.slice(start));
}

/** Normalize legacy delimiters without rewriting fenced or inline code. */
export function prepareMarkdown(content: string) {
  if (
    !/^ {0,3}(`{3,}|~{3,})/m.test(content) &&
    /<!DOCTYPE html>[\s\S]*<\/html>\s*$/i.test(content)
  ) {
    content = content
      .replace(/<!DOCTYPE html>/i, "\n```html\n$&")
      .replace(/<\/html>\s*$/i, "$&\n```\n");
  }
  let fence: { character: string; length: number } | undefined;
  let prose = "";
  let result = "";
  for (const line of content.split(/(?<=\n)/)) {
    const unquoted = line.replace(/^(?: {0,3}> ?)+/, "");
    const marker = /^ {0,3}(?:(?:[-+*]|\d+[.)]) +)?(`{3,}|~{3,})(.*)/.exec(
      unquoted,
    );
    if (!fence && marker) {
      result += normalizeMath(prose) + line;
      prose = "";
      fence = { character: marker[1][0], length: marker[1].length };
    } else if (fence) {
      result += line;
      if (
        marker &&
        marker[1][0] === fence.character &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      )
        fence = undefined;
    } else if (/^(?: {4}|\t)/.test(unquoted)) {
      result += normalizeMath(prose) + line;
      prose = "";
    } else prose += line;
  }
  result += normalizeMath(prose);
  return result;
}

export const wrapCodeLanguages = new Set([
  "",
  "md",
  "markdown",
  "text",
  "txt",
  "plaintext",
  "tex",
  "latex",
]);

/** Wait for fonts, highlighters, diagrams and images before capturing an export. */
export async function waitForMarkdown(root: HTMLElement) {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await document.fonts?.ready;
  const started = Date.now();
  while (root.querySelector('[data-render-pending="true"]')) {
    if (Date.now() - started > 15000)
      throw new Error("Markdown rendering timed out");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 30));
  }
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map((image) =>
      image.decode?.().catch(() => undefined),
    ),
  );
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}
