"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { db, useRoomMessages } from "@pylonsync/react";
import { callFn } from "@/lib/fn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
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

// Recent conversations for this event, newest first. Lives in the nav sidebar
// so the chat pane itself only ever shows the conversation you're in.
export function useCopilotThreads(eventId: string): CopilotThreadRow[] {
  const threadsQ = db.useQuery<CopilotThreadRow>("CopilotThread");
  return useMemo(
    () =>
      threadsQ.data
        .filter((t) => t.eventId === eventId)
        .sort((a, b) => ((a.updatedAt ?? a.createdAt) < (b.updatedAt ?? b.createdAt) ? 1 : -1)),
    [threadsQ.data, eventId],
  );
}

// The conversation list lives in the nav sidebar (copilotThreads below), so the
// active thread is owned by AppShell and passed in. This component renders one
// conversation and reports the thread it creates on the first send.
export function CopilotChat({
  eventId,
  eventName,
  threadId,
  onSelectThread,
}: {
  eventId: string;
  eventName: string;
  threadId: string | null;
  onSelectThread: (id: string | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      if (!threadId) onSelectThread(res.threadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The copilot hit an error. Try again.");
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
      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streamText && !busy ? (
          <div className="flex h-full flex-col">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Bot className="size-4" aria-hidden="true" />
              </span>
              <p className="min-w-0 pt-1 text-pretty text-sm leading-6">
                I can run {eventName} from here. Ask me to review submissions,
                schedule sessions, or follow up with speakers. My changes land in
                the tables next to you, live.
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
                  <Markdown className="text-[13px] text-foreground">{streamText}</Markdown>
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
        {isUser ? (
          <p className="whitespace-pre-wrap text-[13px] leading-6">{message.text}</p>
        ) : (
          <Markdown className="text-[13px] text-foreground">{message.text}</Markdown>
        )}
      </div>
    </div>
  );
}
