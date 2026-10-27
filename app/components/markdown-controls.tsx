"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  extractTableDataFromElement,
  tableDataToMarkdown,
  type Components,
} from "streamdown";
import Locale from "../locales";
import { copyToClipboard } from "../utils";
const MarkdownText = Locale.Markdown ?? {
  Table: "Table",
  CopyTable: "Copy table",
  Fullscreen: "Fullscreen",
  ExitFullscreen: "Exit fullscreen",
};

export function MarkdownButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return <button type="button" {...props} className="markdown-control" />;
}

/** A portal keeps expanded panels outside the chat's clipping/transform ancestors. */
export function MarkdownPanel({
  label,
  tools,
  children,
  allowFullscreen = true,
}: {
  label: string;
  tools?: React.ReactNode;
  children: React.ReactNode;
  allowFullscreen?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [font, setFont] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!expanded) return;
    returnFocus.current = document.activeElement as HTMLElement;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setExpanded(false);
      }
      if (event.key === "Tab") {
        const controls = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], [tabindex="0"]',
          ) ?? [],
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panelRef.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      returnFocus.current?.focus();
    };
  }, [expanded]);
  const content = (
    <div
      ref={panelRef}
      className={expanded ? "markdown-body markdown-panel" : "markdown-panel"}
      style={font}
      data-fullscreen={expanded || undefined}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-label={label}
      tabIndex={expanded ? -1 : undefined}
    >
      <div className="markdown-toolbar" data-export-control>
        {tools}
        {allowFullscreen && (
          <MarkdownButton
            onClick={() => {
              if (!expanded && panelRef.current) {
                const style = getComputedStyle(panelRef.current);
                setFont({
                  fontSize: style.fontSize,
                  fontFamily: style.fontFamily,
                });
              }
              setExpanded((value) => !value);
            }}
            aria-label={
              expanded ? MarkdownText.ExitFullscreen : MarkdownText.Fullscreen
            }
          >
            {expanded ? MarkdownText.ExitFullscreen : MarkdownText.Fullscreen}
          </MarkdownButton>
        )}
      </div>
      {children}
    </div>
  );
  return expanded ? createPortal(content, document.body) : content;
}

export const MarkdownTable: NonNullable<Components["table"]> = ({
  node: _node,
  children,
  ...props
}) => {
  const tableRef = useRef<HTMLTableElement>(null);
  const data = () =>
    tableRef.current ? extractTableDataFromElement(tableRef.current) : null;
  return (
    <MarkdownPanel
      label={MarkdownText.Table}
      allowFullscreen={false}
      tools={
        <MarkdownButton
          onClick={() => {
            const value = data();
            if (value) void copyToClipboard(tableDataToMarkdown(value));
          }}
        >
          {MarkdownText.CopyTable}
        </MarkdownButton>
      }
    >
      <div className="markdown-table-scroll">
        <table {...props} ref={tableRef}>
          {children}
        </table>
      </div>
    </MarkdownPanel>
  );
};
