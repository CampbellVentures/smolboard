"use client";

import React, { useEffect, useRef, useState, type RefObject } from "react";
import {
  BULLET_LIST,
  BUTTON,
  CODE,
  DIVIDER,
  H1,
  H2,
  H3,
  NUMBERED_LIST,
  SECTION,
  TEXT,
  THREE_COLUMNS,
  TWO_COLUMNS,
  type SlashCommandItem,
} from "@react-email/editor/ui";
import {
  Braces,
  Columns2,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  LayoutPanelTop,
  List,
  ListOrdered,
  Minus,
  MousePointerClick,
  Shapes,
  SquareCode,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EmailComposerHandle } from "./email-composer";

// Resend-style floating insert rail: four icon buttons, each opening a flyout
// of blocks. Insertion reuses the editor's own slash-command handlers, so the
// rail and typing "/" produce identical results.

interface RailEntry {
  label: string;
  Icon: LucideIcon;
  action: { block: SlashCommandItem } | { mergeTag: string } | { image: true };
}

interface RailGroup {
  key: string;
  label: string;
  Icon: LucideIcon;
  entries: RailEntry[];
}

export interface MergeVariable {
  tag: string;
  label: string;
}

function groups(variables: MergeVariable[]): RailGroup[] {
  return [
    {
      key: "text",
      label: "Text blocks",
      Icon: Type,
      entries: [
        { label: "Text", Icon: Type, action: { block: TEXT } },
        { label: "Title", Icon: Heading1, action: { block: H1 } },
        { label: "Subtitle", Icon: Heading2, action: { block: H2 } },
        { label: "Heading", Icon: Heading3, action: { block: H3 } },
        { label: "Bullet list", Icon: List, action: { block: BULLET_LIST } },
        { label: "Numbered list", Icon: ListOrdered, action: { block: NUMBERED_LIST } },
      ],
    },
    {
      key: "blocks",
      label: "Layout blocks",
      Icon: Shapes,
      entries: [
        { label: "Button", Icon: MousePointerClick, action: { block: BUTTON } },
        { label: "Divider", Icon: Minus, action: { block: DIVIDER } },
        { label: "Section", Icon: LayoutPanelTop, action: { block: SECTION } },
        { label: "2 columns", Icon: Columns2, action: { block: TWO_COLUMNS } },
        { label: "3 columns", Icon: Columns3, action: { block: THREE_COLUMNS } },
        { label: "Code", Icon: SquareCode, action: { block: CODE } },
      ],
    },
    {
      key: "media",
      label: "Media",
      Icon: ImageIcon,
      // No slash item ships for images; the rail uploads the file itself and
      // inserts the image node with the returned CDN URL.
      entries: [{ label: "Image", Icon: ImageIcon, action: { image: true } }],
    },
    {
      key: "variables",
      label: "Variables",
      Icon: Braces,
      entries: variables.map((variable) => ({
        label: variable.label,
        Icon: Braces,
        action: { mergeTag: variable.tag },
      })),
    },
  ];
}

export function EmailBlockRail({
  composer,
  variables,
  disabled,
  onUploadImage,
}: {
  composer: RefObject<EmailComposerHandle | null>;
  variables: MergeVariable[];
  disabled?: boolean;
  onUploadImage?: (file: File) => Promise<{ url: string }>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const railGroups = groups(variables).filter((group) => group.entries.length > 0);

  function run(entry: RailEntry) {
    if ("mergeTag" in entry.action) composer.current?.insertMergeTag(entry.action.mergeTag);
    else if ("image" in entry.action) fileRef.current?.click();
    else composer.current?.insertBlock(entry.action.block);
    setOpen(null);
  }

  async function onFilePicked(file: File | undefined) {
    if (!file || !onUploadImage) return;
    try {
      const { url } = await onUploadImage(file);
      composer.current?.insertImage(url);
    } catch {
      // The editors surface upload errors via their own toasts; the rail
      // simply leaves the document unchanged.
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(event) => {
          void onFilePicked(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <div className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.05)]">
        {railGroups.map((group) => (
          <button
            key={group.key}
            type="button"
            title={group.label}
            aria-label={group.label}
            disabled={disabled}
            onClick={() => setOpen((current) => (current === group.key ? null : group.key))}
            className={`flex size-9 items-center justify-center rounded-xl transition-colors ${
              open === group.key
                ? "bg-zinc-200 text-zinc-900"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            } disabled:opacity-40`}
          >
            <group.Icon className="size-4" />
          </button>
        ))}
      </div>
      {railGroups.map((group) =>
        open === group.key ? (
          <div
            key={group.key}
            className="absolute left-full top-0 z-20 ml-2 w-52 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_2px_6px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.08)]"
          >
            {group.entries.map((entry) => (
              <button
                key={entry.label}
                type="button"
                onClick={() => run(entry)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-zinc-700 hover:bg-zinc-100"
              >
                <entry.Icon className="size-3.5 shrink-0 text-zinc-400" />
                {entry.label}
              </button>
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
}
