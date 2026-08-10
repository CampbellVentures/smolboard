"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { callFn, db, useRoomMessages } from "@pylonsync/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toolByName } from "@/lib/agent-tools";
import type { CopilotMessageRow, CopilotThreadRow } from "@/lib/types";
import { Bot, Loader2, Plus, Send, Wrench, X } from "lucide-react";

// The live copilot chat (SPEC → Differentiators #1). Three data paths:
//   - persisted turns: db.useQuery("CopilotMessage") — live rows, any device
//   - in-flight streaming: useRoomMessages(`copilot:{threadId}`) — token
//     deltas + tool start/end events broadcast by functions/copilotChat.ts
//   - sending: callFn("copilotChat") — resolves with the final text, at which
//     point the persisted row has landed and the stream buffer clears
// Actions the agent takes hit the same functions as the UI buttons, and every
// table in the content pane is a live query — so agent writes visibly land
// next door in real time.

interface ToolEvent {
  name: string;
  phase: "start" | "end";
  isError?: boolean;
}

export function CopilotChat({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restore the last thread per event.
  useEffect(() => {
    setThreadId(localStorage.getItem(`sb.copilot.thread.${eventId}`) || null);
  }, [eventId]);
  function selectThread(id: string | null) {
    setThreadId(id);
    if (id) localStorage.setItem(`sb.copilot.thread.${eventId}`, id);
    else localStorage.removeItem(`sb.copilot.thread.${eventId}`);
  }

  const threadsQ = db.useQuery<CopilotThreadRow>("CopilotThread");
  const threads = useMemo(
    () =>
      threadsQ.data
        .filter((t) => t.eventId === eventId)
        .sort((a, b) => ((a.updatedAt ?? a.createdAt) < (b.updatedAt ?? b.createdAt) ? 1 : -1)),
    [threadsQ.data, eventId],
  );
  const messagesQ = db.useQuery<CopilotMessageRow>("CopilotMessage");
  const messages = useMemo(
    () =>
      threadId
        ? messagesQ.data
            .filter((m) => m.threadId === threadId)
            .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        : [],
    [messagesQ.data, threadId],
  );

  useRoomMessages(threadId ? `copilot:${threadId}` : "copilot:none", (msg) => {
    if (msg.topic === "delta") {
      setStreamText((t) => t + ((msg.payload as { text?: string }).text ?? ""));
    } else if (msg.topic === "tool") {
      const p = msg.payload as ToolEvent;
      setToolEvents((prev) => {
        if (p.phase === "end") {
          return prev.map((e) =>
            e.name === p.name && e.phase === "start" ? { ...e, phase: "end", isError: p.isError } : e,
          );
        }
        return [...prev, { name: p.name, phase: "start" }];
      });
    } else if (msg.topic === "done") {
      setStreamText("");
      setToolEvents([]);
    }
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, streamText, toolEvents.length]);

  async function send() {
    const message = draft.trim();
    if (!message || busy) return;
    setDraft("");
    setBusy(true);
    setError(null);
    setStreamText("");
    setToolEvents([]);
    try {
      const res = await callFn<{ threadId: string }>("copilotChat", {
        eventId,
        threadId: threadId ?? undefined,
        message,
      });
      if (!threadId) selectThread(res.threadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The copilot hit an error — try again.");
    } finally {
      setBusy(false);
      setStreamText("");
      setToolEvents([]);
    }
  }

  const prompts = [
    "Who still needs onboarding?",
    "Top 5 unreviewed submissions",
    "Find agenda conflicts",
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Thread strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={() => selectThread(null)}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
            threadId === null
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          <Plus className="size-3" /> New
        </button>
        {threads.slice(0, 6).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectThread(t.id)}
            title={t.title}
            className={cn(
              "max-w-36 shrink-0 truncate rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              threadId === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t.title}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streamText && !busy ? (
          <div className="flex h-full flex-col">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Bot className="size-4" aria-hidden="true" />
              </span>
              <p className="min-w-0 pt-1 text-pretty text-sm leading-6">
                I can run {eventName} from here — review submissions, schedule
                sessions, and follow up with speakers. My changes land in the
                tables next to you, live.
              </p>
            </div>
            <div className="mt-auto flex flex-col gap-2 pt-8">
              <div className="px-1 text-[11px] font-medium text-muted-foreground">Try asking</div>
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setDraft(prompt)}
                  className="min-h-10 rounded-xl bg-muted/50 px-3 py-2 text-left text-xs transition-[background-color,scale] duration-150 ease-out hover:bg-muted active:scale-[0.98] motion-reduce:transform-none"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {(streamText || toolEvents.length > 0 || busy) && (
              <div className="space-y-1.5">
                {toolEvents.map((t, i) => (
                  <ToolChip key={`${t.name}-${i}`} event={t} />
                ))}
                {streamText ? (
                  <p className="whitespace-pre-wrap text-[13px] leading-6">{streamText}</p>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Thinking…
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 p-3">
        <div className="rounded-2xl bg-muted/45 p-2 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)] transition-[box-shadow] duration-150 focus-within:shadow-[0_0_0_2px_var(--ring)]">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            aria-label="Message copilot"
            placeholder={`Ask about ${eventName}…`}
            className="min-h-14 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="mt-1 flex items-center justify-between gap-2 px-1">
            <span className="text-[10px] text-muted-foreground">smolboard tools</span>
            <Button
              type="button"
              size="icon"
              className="size-8 rounded-full"
              disabled={busy || !draft.trim()}
              onClick={() => void send()}
              aria-label="Send message"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send data-icon="inline-start" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolChip({ event }: { event: ToolEvent }) {
  const def = toolByName(event.name);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium",
        event.isError
          ? "bg-red-50 text-red-600"
          : event.phase === "end"
            ? "bg-muted text-muted-foreground"
            : "bg-blue-50 text-blue-600",
      )}
    >
      {event.phase === "start" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : event.isError ? (
        <X className="size-3" />
      ) : (
        <Wrench className="size-3" />
      )}
      {def?.name ?? event.name}
    </span>
  );
}

function MessageBubble({ message }: { message: CopilotMessageRow }) {
  const isUser = message.role === "user";
  const toolCalls = Array.isArray(message.toolCallsJson) ? message.toolCallsJson : [];
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[92%] space-y-1.5",
          isUser ? "rounded-2xl rounded-br-md bg-primary px-3 py-2 text-primary-foreground" : "",
        )}
      >
        {!isUser && toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {toolCalls.map((t, i) => (
              <ToolChip
                key={i}
                event={{ name: t.name, phase: "end", isError: t.isError }}
              />
            ))}
          </div>
        )}
        <p
          className={cn(
            "whitespace-pre-wrap text-[13px] leading-6",
            isUser ? "" : "text-foreground",
          )}
        >
          {message.text}
        </p>
      </div>
    </div>
  );
}
