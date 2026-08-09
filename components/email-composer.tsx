"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  EmailEditor,
  type EmailEditorProps,
  type EmailEditorRef,
} from "@react-email/editor";
import type { SlashCommandItem } from "@react-email/editor/ui";

export type EmailComposerContent = EmailEditorProps["content"];

export interface EmailComposerDocument {
  html: string;
  text: string;
  json: string;
}

export interface EmailComposerHandle {
  exportDocument: () => Promise<EmailComposerDocument>;
  insertMergeTag: (tag: string) => void;
  // Run a slash-command block (Button, Divider, 2 columns, …) at the caret —
  // powers the floating block rail, same handlers as typing "/".
  insertBlock: (item: SlashCommandItem) => void;
  insertImage: (src: string) => void;
  focusEditor: () => void;
}

interface EmailComposerProps {
  content: EmailComposerContent;
  initialDocument: EmailComposerDocument;
  onDocumentChange: (document: EmailComposerDocument) => void;
  onReadyChange?: (ready: boolean) => void;
  onUploadImage?: (file: File) => Promise<{ url: string }>;
  // Frameless: no border/background — the parent owns the canvas chrome.
  frameless?: boolean;
}

const CANVAS_CLASSES =
  "[&_.tiptap]:min-h-80 [&_.tiptap]:text-sm [&_.tiptap]:leading-6 [&_.tiptap_h1]:mb-3 [&_.tiptap_h1]:text-2xl [&_.tiptap_h1]:font-semibold [&_.tiptap_h2]:mb-2 [&_.tiptap_h2]:text-xl [&_.tiptap_h2]:font-semibold [&_.tiptap_h3]:mb-2 [&_.tiptap_h3]:text-lg [&_.tiptap_h3]:font-semibold [&_.tiptap_p]:my-3 [&_.tiptap_a]:text-primary [&_.tiptap_a]:underline [&_.tiptap_ul]:my-3 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6 [&_.tiptap_ol]:my-3 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_blockquote]:border-l-2 [&_.tiptap_blockquote]:pl-4 [&_.tiptap_blockquote]:text-muted-foreground";

export const EmailComposer = forwardRef<EmailComposerHandle, EmailComposerProps>(
  function EmailComposer(
    { content, initialDocument, onDocumentChange, onReadyChange, onUploadImage, frameless = false },
    forwardedRef,
  ) {
    const editorRef = useRef<EmailEditorRef>(null);
    const latestDocument = useRef(initialDocument);
    const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const exportVersion = useRef(0);

    async function exportDocument(ref = editorRef.current) {
      if (!ref) return latestDocument.current;
      const { html, text } = await ref.getEmail();
      const document = { html, text, json: JSON.stringify(ref.getJSON()) };
      latestDocument.current = document;
      return document;
    }

    async function publishDocument(ref: EmailEditorRef) {
      const version = ++exportVersion.current;
      const document = await exportDocument(ref);
      if (version === exportVersion.current) onDocumentChange(document);
    }

    useImperativeHandle(
      forwardedRef,
      () => ({
        exportDocument,
        insertMergeTag(tag) {
          editorRef.current?.editor?.chain().focus().insertContent(`{{${tag}}}`).run();
        },
        insertBlock(item) {
          const editor = editorRef.current?.editor;
          if (!editor) return;
          editor.chain().focus().run();
          const { from, to } = editor.state.selection;
          item.command({ editor, range: { from, to } });
        },
        insertImage(src) {
          editorRef.current?.editor
            ?.chain()
            .focus()
            .insertContent({ type: "image", attrs: { src } })
            .run();
        },
        focusEditor() {
          editorRef.current?.editor?.chain().focus().run();
        },
      }),
      [],
    );

    useEffect(
      () => () => {
        if (updateTimer.current) clearTimeout(updateTimer.current);
        onReadyChange?.(false);
      },
      [onReadyChange],
    );

    return (
      <div
        className={
          frameless
            ? undefined
            : "overflow-hidden rounded-lg border bg-background shadow-xs"
        }
      >
        <EmailEditor
          ref={editorRef}
          content={content}
          onUploadImage={onUploadImage}
          placeholder="Write your email, or type / for blocks…"
          className={
            frameless
              ? CANVAS_CLASSES
              : `${CANVAS_CLASSES} [&_.tiptap]:px-5 [&_.tiptap]:py-4`
          }
          onReady={(ref) => {
            editorRef.current = ref;
            onReadyChange?.(true);
            void publishDocument(ref);
          }}
          onUpdate={(ref) => {
            if (updateTimer.current) clearTimeout(updateTimer.current);
            updateTimer.current = setTimeout(() => void publishDocument(ref), 300);
          }}
        />
      </div>
    );
  },
);
