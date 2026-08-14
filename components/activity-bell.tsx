"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db, Link } from "@pylonsync/react";
import { Popover } from "radix-ui";
import {
  Bell,
  Bot,
  CalendarClock,
  ClipboardCheck,
  FileText,
  Inbox,
  Send,
  Star,
  type LucideIcon,
} from "lucide-react";
import { DashboardIconChip, type DashboardChipTone } from "@/components/dashboard";
import { fmtAgo, type ActivityRow } from "@/lib/activity";

// The bell: everything that happened in the workspace, live. Rows come from
// ActivityLog (server-written only); the unread dot compares against a
// per-workspace last-seen timestamp in localStorage.

const KIND_STYLE: Record<string, { icon: LucideIcon; tone: DashboardChipTone }> = {
  "submission.created": { icon: Inbox, tone: "violet" },
  "submission.status": { icon: ClipboardCheck, tone: "emerald" },
  "submission.triage": { icon: Bot, tone: "violet" },
  "content.uploaded": { icon: FileText, tone: "sky" },
  "content.reviewed": { icon: FileText, tone: "emerald" },
  "agenda.autoscheduled": { icon: CalendarClock, tone: "amber" },
  "review.submitted": { icon: Star, tone: "amber" },
  "form.published": { icon: Send, tone: "pink" },
};

function lastSeenKey(orgId: string): string {
  return `smolboard.activity.seen.${orgId}`;
}

export function ActivityBell({ workspaceId }: { workspaceId: string }) {
  const { data, loading } = db.useQuery<ActivityRow>("ActivityLog");
  const [hydrated, setHydrated] = useState(false);
  const [lastSeen, setLastSeen] = useState<string>("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setHydrated(true);
    try {
      setLastSeen(window.localStorage.getItem(lastSeenKey(workspaceId)) ?? "");
    } catch {
      // Private mode — the dot just stays on.
    }
  }, [workspaceId]);

  const rows = useMemo(
    () =>
      (loading ? [] : data)
        .filter((row) => row.orgId === workspaceId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 20),
    [data, loading, workspaceId],
  );
  const unread = hydrated ? rows.filter((row) => row.createdAt > lastSeen).length : 0;

  function markSeen() {
    const now = new Date().toISOString();
    setLastSeen(now);
    try {
      window.localStorage.setItem(lastSeenKey(workspaceId), now);
    } catch {
      // Ignore — worst case the dot shows again next load.
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) markSeen();
      }}
    >
      <Popover.Trigger asChild>
      <button
        type="button"
        className="relative flex size-10 cursor-pointer select-none list-none items-center justify-center rounded-lg transition-[background-color] hover:bg-muted marker:hidden [&::-webkit-details-marker]:hidden"
        aria-label={unread > 0 ? `Activity (${unread} new)` : "Activity"}
      >
        <Bell className="size-4.5 text-muted-foreground" aria-hidden="true" />
        <span className="t-badge" style={{ right: "0.5rem", top: "0.5rem" }} data-open={unread > 0 ? "true" : "false"} aria-hidden="true">
          <span className="t-badge-dot block size-2 rounded-full bg-red-500 ring-2 ring-background" />
        </span>
      </button>
      </Popover.Trigger>
      <Popover.Portal>
      <Popover.Content
        align="end"
        sideOffset={4}
        data-origin="top-right"
        className="t-dropdown z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-card shadow-lg"
      >
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
          <span className="text-sm font-semibold">Activity</span>
          <span className="text-[11px] text-muted-foreground">
            Newest first
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing here yet. New submissions, uploads, and decisions will show up.
          </p>
        ) : (
          <ul className="max-h-96 divide-y divide-border/70 overflow-y-auto overscroll-contain">
            {rows.map((row) => {
              const style = KIND_STYLE[row.kind] ?? { icon: Bell, tone: "zinc" as const };
              const body = (
                <span className="flex min-w-0 items-start gap-3">
                  <DashboardIconChip icon={style.icon} tone={style.tone} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] leading-5 text-foreground">
                      {row.message}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {row.actorName ? `${row.actorName} · ` : ""}
                      {fmtAgo(row.createdAt)}
                    </span>
                  </span>
                </span>
              );
              return (
                <li key={row.id}>
                  {row.href ? (
                    <Link href={row.href} className="block px-4 py-2.5 hover:bg-muted/50">
                      {body}
                    </Link>
                  ) : (
                    <span className="block px-4 py-2.5">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
