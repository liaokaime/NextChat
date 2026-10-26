"use client";

import React, {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Streamdown,
  defaultRehypePlugins,
  defaultRemarkPlugins,
  useIsCodeFenceIncomplete,
  type Components,
  type HighlightResult,
  type CodeHighlighterPlugin,
} from "streamdown";
import { createCodePlugin } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import RemarkBreaks from "remark-breaks";
import { copyToClipboard, useWindowSize } from "../utils";
import { prepareMarkdown, wrapCodeLanguages } from "../utils/markdown";
import Locale from "../locales";
import LoadingIcon from "../icons/three-dots.svg";
import ReloadButtonIcon from "../icons/reload.svg";
import { showImageModal, FullScreen } from "./ui-lib";
import {
  ArtifactsShareButton,
  HTMLPreview,
  type HTMLPreviewHandler,
} from "./artifacts";
import { useChatStore } from "../store/chat";
import { useAppConfig } from "../store/config";
import { IconButton } from "./button";
import clsx from "clsx";

const codePlugin: CodeHighlighterPlugin = createCodePlugin({
  themes: ["tokyo-night", "tokyo-night"],
});
const plugins = {
  code: codePlugin,
  math: createMathPlugin({ singleDollarTextMath: true }),
  cjk,
};
const remarkPlugins = [...Object.values(defaultRemarkPlugins), RemarkBreaks];
// Keep raw HTML literal; executable documents belong in the existing sandbox.
const rehypePlugins = [
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
];
const remend = {
  linkMode: "text-only" as const,
  inlineKatex: false,
  htmlTags: false,
};
const linkSafety = { enabled: false };

export const Mermaid = React.memo(function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState<{ code: string; svg: string }>();
  useEffect(() => {
    let cancelled = false;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        const container = document.createElement("div");
        container.style.cssText =
          "position:absolute;visibility:hidden;pointer-events:none";
        document.body.appendChild(container);
        try {
          const { svg } = await mermaid.render(
            `mermaid-${id}`,
            code,
            container,
          );
          if (!cancelled) setRendered({ code, svg });
        } finally {
          container.remove();
        }
      })
      .catch(() => {
        if (!cancelled) setRendered({ code, svg: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [code, id]);
  const ready = rendered?.code === code;
  return (
    <div data-render-pending={!ready} data-mermaid-preview>
      {ready && rendered.svg && (
        <div
          className="no-dark mermaid cursor-pointer overflow-auto"
          ref={ref}
          onClick={() => {
            const svg = ref.current?.querySelector("svg");
            if (!svg) return;
            const blob = new Blob(
              [new XMLSerializer().serializeToString(svg)],
              { type: "image/svg+xml" },
            );
            const url = URL.createObjectURL(blob);
            showImageModal(url);
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
          }}
          dangerouslySetInnerHTML={{ __html: rendered.svg }}
        />
      )}
    </div>
  );
});

function HtmlArtifact({ code }: { code: string }) {
  const previewRef = useRef<HTMLPreviewHandler>(null);
  const { height } = useWindowSize();
  const [loadedCode, setLoadedCode] = useState("");
  return (
    <div data-render-pending={loadedCode !== code}>
      <FullScreen className="no-dark html" right={70}>
        <div data-export-control>
          <ArtifactsShareButton
            style={{ position: "absolute", right: 20, top: 10 }}
            getCode={() => code}
          />
          <IconButton
            style={{ position: "absolute", right: 120, top: 10 }}
            bordered
            icon={<ReloadButtonIcon />}
            shadow
            onClick={() => previewRef.current?.reload()}
          />
        </div>
        <HTMLPreview
          ref={previewRef}
          code={code}
          onLoad={() => setLoadedCode(code)}
          autoHeight={!document.fullscreenElement}
          height={!document.fullscreenElement ? 600 : height}
        />
      </FullScreen>
    </div>
  );
}

export const ProjectCodeBlock = React.memo(function ProjectCodeBlock({
  code,
  language,
  isIncomplete,
}: {
  code: string;
  language: string;
  isIncomplete: boolean;
}) {
  const globalFold = useAppConfig((s) => s.enableCodeFold);
  const globalArtifacts = useAppConfig((s) => s.enableArtifacts);
  const sessionFold = useChatStore(
    (s) => s.sessions[s.currentSessionIndex]?.mask?.enableCodeFold !== false,
  );
  const sessionArtifacts = useChatStore(
    (s) => s.sessions[s.currentSessionIndex]?.mask?.enableArtifacts !== false,
  );
  const enableCodeFold = globalFold && sessionFold;
  const enableArtifacts = globalArtifacts && sessionArtifacts;
  const [collapsed, setCollapsed] = useState(true);
  const [showToggle, setShowToggle] = useState(false);
  const [highlight, setHighlight] = useState<{
    code: string;
    language: string;
    result: HighlightResult | null;
  }>();
  const codeRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let cancelled = false;
    const apply = (result: HighlightResult | null) => {
      if (!cancelled) setHighlight({ code, language, result });
    };
    const timeout = window.setTimeout(() => apply(null), 8000);
    const result = codePlugin.highlight(
      { code, language, themes: codePlugin.getThemes(), isIncomplete },
      (tokens) => {
        window.clearTimeout(timeout);
        apply(tokens);
      },
    );
    if (result) {
      window.clearTimeout(timeout);
      apply(result);
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [code, language, isIncomplete]);
  const ready = highlight?.code === code && highlight?.language === language;
  const tokens = ready ? highlight.result : null;
  useEffect(() => {
    const element = codeRef.current;
    if (!element) return;
    const measure = () => setShowToggle(element.scrollHeight > 400);
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [code, tokens]);
  const html =
    language === "html" || /^\s*(?:<!DOCTYPE|<svg|<\?xml)/i.test(code);
  return (
    <>
      <div
        className="group/code relative my-[16px] overflow-hidden rounded-[6px] bg-[#1a1b26] text-[#cbd2ea]"
        data-code-block
        data-render-pending={!ready}
        data-incomplete={isIncomplete || undefined}
      >
        <div
          className="flex items-center justify-between px-[14px] pt-[8px] text-[11px] text-[#a9b1d6]"
          data-export-control
        >
          <span>{language}</span>
          <button
            type="button"
            data-copy-code
            className="cursor-pointer rounded-[10px] border-0 bg-transparent px-[5px] text-inherit opacity-60 hover:opacity-100"
            aria-label={Locale.Chat.Actions.Copy}
            onClick={() => copyToClipboard(code)}
          >
            copy
          </button>
        </div>
        <pre
          className={clsx(
            "!m-0 !px-[14px] !pt-[8px] !pb-[14px]",
            enableCodeFold && collapsed
              ? "max-h-[400px] !overflow-y-hidden"
              : "max-h-none",
          )}
        >
          <code
            ref={codeRef}
            className={clsx(
              language && `language-${language}`,
              wrapCodeLanguages.has(language) && "!whitespace-pre-wrap",
            )}
          >
            {tokens
              ? tokens.tokens.map((line, index) => (
                  <React.Fragment key={index}>
                    {line.map((token, tokenIndex) => (
                      <span
                        key={tokenIndex}
                        style={{
                          color: token.color ?? token.htmlStyle?.color,
                          fontStyle: token.htmlStyle?.["font-style"],
                          fontWeight: token.htmlStyle?.[
                            "font-weight"
                          ] as React.CSSProperties["fontWeight"],
                          textDecoration: token.htmlStyle?.["text-decoration"],
                        }}
                      >
                        {token.content}
                      </span>
                    ))}
                    {index < tokens.tokens.length - 1 ? "\n" : null}
                  </React.Fragment>
                ))
              : code}
          </code>
        </pre>
        {showToggle && enableCodeFold && collapsed && (
          <div
            className="pointer-events-none absolute inset-x-0 top-[30px] flex justify-center rounded-[10px] bg-linear-to-b from-black/80 to-black/5"
            data-export-control
          >
            <button
              className="pointer-events-auto my-[3em] cursor-pointer rounded-[14px] border-0 bg-[#464e4e] px-[16px] py-[5px] text-white"
              type="button"
              onClick={() => setCollapsed(false)}
            >
              {Locale.NewChat.More}
            </button>
          </div>
        )}
      </div>
      {!isIncomplete && language === "mermaid" && <Mermaid code={code} />}
      {!isIncomplete && html && enableArtifacts && <HtmlArtifact code={code} />}
    </>
  );
});

const Code: NonNullable<Components["code"]> = ({
  node: _node,
  children,
  className,
  ...props
}) => {
  const isIncomplete = useIsCodeFenceIncomplete();
  if (!("data-block" in props))
    return (
      <code {...props} className={className}>
        {children}
      </code>
    );
  const code = String(children ?? "");
  const language = /language-([^\s]+)/.exec(className ?? "")?.[1] ?? "";
  return (
    <ProjectCodeBlock
      code={code}
      language={language}
      isIncomplete={isIncomplete}
    />
  );
};
const components: Components = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  p: "p",
  strong: "strong",
  ul: "ul",
  ol: "ol",
  li: "li",
  hr: "hr",
  table: "table",
  thead: "thead",
  tbody: "tbody",
  tr: "tr",
  th: "th",
  td: "td",
  blockquote: "blockquote",
  img: "img",
  sup: "sup",
  sub: "sub",
  section: "section",
  code: Code,
  a: ({ node: _node, href = "", ...props }) => {
    if (/\.(aac|mp3|opus|wav)$/i.test(href))
      return (
        <figure>
          <audio controls src={href} />
        </figure>
      );
    if (/\.(3gp|3g2|webm|ogv|mpeg|mp4|avi)$/i.test(href))
      return (
        <video controls width="99.9%">
          <source src={href} />
        </video>
      );
    return (
      <a
        {...props}
        href={href}
        target={/^\/?#/i.test(href) ? "_self" : "_blank"}
        rel="noopener noreferrer"
      />
    );
  },
};

export type MarkdownContentProps = {
  content: string;
  isStreaming?: boolean;
  mode?: "streaming" | "static";
};
export function MarkdownContent({
  content,
  isStreaming = false,
  mode = "static",
}: MarkdownContentProps) {
  const prepared = useMemo(() => prepareMarkdown(content), [content]);
  return (
    <Streamdown
      className="markdown-content !space-y-0"
      mode={mode}
      isAnimating={isStreaming}
      parseIncompleteMarkdown={isStreaming}
      remend={remend}
      plugins={plugins}
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
      controls={false}
      lineNumbers={false}
      codeBlockMaxHeight={0}
      tableMaxHeight={0}
      linkSafety={linkSafety}
      dir="auto"
    >
      {prepared}
    </Streamdown>
  );
}

export function Markdown(
  props: MarkdownContentProps & {
    loading?: boolean;
    fontSize?: number;
    fontFamily?: string;
    parentRef?: RefObject<HTMLDivElement | null>;
    defaultShow?: boolean;
  } & React.DOMAttributes<HTMLDivElement>,
) {
  return (
    <div
      className="markdown-body"
      style={{
        fontSize: `${props.fontSize ?? 14}px`,
        fontFamily: props.fontFamily || "inherit",
      }}
      onContextMenu={props.onContextMenu}
      onDoubleClickCapture={props.onDoubleClickCapture}
      dir="auto"
    >
      {props.loading ? (
        <LoadingIcon />
      ) : (
        <MarkdownContent
          content={props.content}
          isStreaming={props.isStreaming}
          mode={props.mode}
        />
      )}
    </div>
  );
}
