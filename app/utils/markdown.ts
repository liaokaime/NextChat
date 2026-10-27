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
  let fence: { character: string; length: number } | undefined;
  let prose = "";
  let result = "";
  const lines = content.split(/(?<=\n)/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
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
    } else if (/^ {0,3}<!doctype html\b/i.test(line)) {
      // Only wrap complete, top-level documents. Their contents may be indented
      // and may contain backticks, so consume the document before parsing lines.
      const remaining = lines.slice(index).join("");
      const document = /^ {0,3}<!doctype html\b[^>]*>[\s\S]*?<\/html\s*>/i.exec(
        remaining,
      );
      if (document) {
        const html = document[0];
        const delimiter = "`".repeat(
          Math.max(
            3,
            ...Array.from(html.matchAll(/`+/g), (m) => m[0].length + 1),
          ),
        );
        result +=
          normalizeMath(prose) + `\n${delimiter}html\n${html}\n${delimiter}\n`;
        prose = "";
        // The wrapper supplies the separator after the document. Consume one
        // original line break so trailing prose keeps its original placement.
        const rawSuffix = remaining.slice(html.length);
        const suffix = rawSuffix.replace(/^\r?\n/, "");
        const consumedLines =
          html.split("\n").length + (/^\r?\n/.test(rawSuffix) ? 1 : 0);
        lines.splice(
          index,
          consumedLines,
          ...(suffix ? suffix.split(/(?<=\n)/) : []),
        );
        index--;
      } else prose += line;
    } else if (/^(?: {4}|\t)/.test(unquoted)) {
      result += normalizeMath(prose) + line;
      prose = "";
    } else prose += line;
  }
  result += normalizeMath(prose);
  return result;
}

/** Raster data URLs and same-origin object URLs are permitted only for images. */
export function isSafeMarkdownImage(source: string, origin?: string) {
  if (/^data:/i.test(source))
    return /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon);base64,[a-z\d+/]+={0,2}$/i.test(
      source,
    );
  if (/^blob:/i.test(source)) {
    try {
      return !!origin && new URL(source).origin === origin;
    } catch {
      return false;
    }
  }
  return !/^(?:javascript|vbscript|file):/i.test(source.trim());
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
