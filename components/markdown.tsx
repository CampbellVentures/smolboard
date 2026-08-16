"use client";

import * as React from "react";
import { marked, type Token, type Tokens } from "marked";
import { cn } from "@/lib/utils";

// THE markdown renderer. Copilot replies, and anywhere else we show model or
// user-authored text, go through this.
//
// It parses with `marked` (a real parser, not regexes) but renders the token
// tree as REACT ELEMENTS rather than setting innerHTML. That matters: this text
// comes from a language model quoting user data, so an HTML sink here would be
// an injection surface. Building elements means raw HTML in the source can only
// ever end up as visible characters.

function renderInline(tokens: Token[] | undefined, keyPrefix: string): React.ReactNode {
  if (!tokens) return null;
  return tokens.map((token, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (token.type) {
      case "strong":
        return (
          <strong key={key} className="font-semibold text-foreground">
            {renderInline((token as Tokens.Strong).tokens, key)}
          </strong>
        );
      case "em":
        return <em key={key}>{renderInline((token as Tokens.Em).tokens, key)}</em>;
      case "codespan":
        return (
          <code
            key={key}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
          >
            {(token as Tokens.Codespan).text}
          </code>
        );
      case "del":
        return <del key={key}>{renderInline((token as Tokens.Del).tokens, key)}</del>;
      case "link": {
        const link = token as Tokens.Link;
        // Only http(s) and mailto get to be links. A javascript: or data: href
        // from model output renders as plain text instead.
        const safe = /^(https?:|mailto:|\/)/i.test(link.href);
        if (!safe) return <span key={key}>{renderInline(link.tokens, key)}</span>;
        return (
          <a
            key={key}
            href={link.href}
            target={link.href.startsWith("/") ? undefined : "_blank"}
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {renderInline(link.tokens, key)}
          </a>
        );
      }
      case "br":
        return <br key={key} />;
      case "text": {
        const text = token as Tokens.Text;
        return text.tokens ? (
          <React.Fragment key={key}>{renderInline(text.tokens, key)}</React.Fragment>
        ) : (
          <React.Fragment key={key}>{text.text}</React.Fragment>
        );
      }
      default:
        return (
          <React.Fragment key={key}>
            {"text" in token ? (token as { text: string }).text : ""}
          </React.Fragment>
        );
    }
  });
}

function renderBlocks(tokens: Token[], keyPrefix: string): React.ReactNode {
  return tokens.map((token, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (token.type) {
      case "paragraph":
        return (
          <p key={key} className="text-pretty">
            {renderInline((token as Tokens.Paragraph).tokens, key)}
          </p>
        );
      case "heading": {
        const h = token as Tokens.Heading;
        // Copilot replies live inside a pane, so headings stay close to body
        // size; they read as emphasis, not as page structure.
        const Tag = (["h3", "h4", "h5", "h6", "h6", "h6"][h.depth - 1] ?? "h6") as "h3";
        return (
          <Tag key={key} className="mt-1 text-[13.5px] font-semibold text-foreground">
            {renderInline(h.tokens, key)}
          </Tag>
        );
      }
      case "list": {
        const list = token as Tokens.List;
        const Tag = list.ordered ? "ol" : "ul";
        return (
          <Tag
            key={key}
            start={list.ordered && list.start !== 1 ? Number(list.start) : undefined}
            className={cn(
              "flex flex-col gap-1 pl-5",
              list.ordered ? "list-decimal" : "list-disc",
              "marker:text-muted-foreground",
            )}
          >
            {list.items.map((item, j) => (
              <li key={`${key}-${j}`} className="pl-0.5">
                {/* A "loose" list wraps each item in its own paragraph; a tight
                    one keeps items inline so nested lists don't gain a gap. */}
                {renderBlocks(item.tokens as Token[], `${key}-${j}`)}
              </li>
            ))}
          </Tag>
        );
      }
      case "code": {
        const code = token as Tokens.Code;
        return (
          <pre
            key={key}
            className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[12px] leading-relaxed text-foreground"
          >
            <code>{code.text}</code>
          </pre>
        );
      }
      case "blockquote":
        return (
          <blockquote
            key={key}
            className="border-l-2 border-border pl-3 text-muted-foreground"
          >
            {renderBlocks((token as Tokens.Blockquote).tokens, key)}
          </blockquote>
        );
      case "table": {
        const table = token as Tokens.Table;
        return (
          <div key={key} className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  {table.header.map((cell, j) => (
                    <th
                      key={`${key}-h-${j}`}
                      className="border-b border-border py-1.5 pr-3 font-semibold"
                    >
                      {renderInline(cell.tokens, `${key}-h-${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={`${key}-r-${r}`}>
                    {row.map((cell, c) => (
                      <td
                        key={`${key}-r-${r}-${c}`}
                        className="border-b border-border/60 py-1.5 pr-3 align-top"
                      >
                        {renderInline(cell.tokens, `${key}-r-${r}-${c}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case "hr":
        return <hr key={key} className="border-border" />;
      case "space":
        return null;
      case "text": {
        // Inside a tight list item, content arrives as bare text tokens.
        const text = token as Tokens.Text;
        return (
          <React.Fragment key={key}>
            {text.tokens ? renderInline(text.tokens, key) : text.text}
          </React.Fragment>
        );
      }
      default:
        return (
          <React.Fragment key={key}>
            {"text" in token ? (token as { text: string }).text : null}
          </React.Fragment>
        );
    }
  });
}

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const tokens = React.useMemo(() => {
    try {
      return marked.lexer(children ?? "");
    } catch {
      return null;
    }
  }, [children]);

  // A parser failure must never blank the message: fall back to the raw text.
  if (!tokens) {
    return <div className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", className)}>{children}</div>;
  }
  return (
    <div className={cn("flex flex-col gap-2 leading-6 [overflow-wrap:anywhere]", className)}>
      {renderBlocks(tokens, "md")}
    </div>
  );
}
