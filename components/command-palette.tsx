"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { db, useRouter } from "@pylonsync/react";
import {
  ArrowRight,
  CalendarDays,
  Inbox,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import { DashboardIconChip, type DashboardChipTone } from "@/components/dashboard";
import type { EventRow, SpeakerProfileRow, SubmissionRow } from "@/lib/types";
import { useMotionPresence } from "@/hooks/use-motion-presence";

// Cmd+K: jump anywhere. Sources are the nav destinations the shell passes in
// plus live entities (events, submissions, speakers) from the sync engine —
// no server round trip, results narrow as the replica updates.

export interface PaletteDestination {
  label: string;
  href: string;
  group: string;
  icon: LucideIcon;
}

interface Item {
  key: string;
  label: string;
  hint?: string;
  href: string;
  group: string;
  icon: LucideIcon;
  tone: DashboardChipTone;
}

const GROUP_ORDER = ["Go to", "Events", "Submissions", "Speakers"];

export function CommandPalette({
  workspaceId,
  destinations,
  eventId,
}: {
  workspaceId: string;
  destinations: PaletteDestination[];
  eventId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const presence = useMotionPresence(open, "--modal-close-dur", 150);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((was) => !was);
        setQ("");
        setCursor(0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open && presence.mounted) inputRef.current?.focus();
  }, [open, presence.mounted]);

  const eventQ = db.useQuery<EventRow>("Event");
  const submissionQ = db.useQuery<SubmissionRow>("Submission");
  const profileQ = db.useQuery<SpeakerProfileRow>("SpeakerProfile");

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const match = (text: string) => !needle || text.toLowerCase().includes(needle);
    const out: Item[] = [];
    for (const dest of destinations) {
      if (match(dest.label)) {
        out.push({
          key: `nav-${dest.href}`,
          label: dest.label,
          href: dest.href,
          group: "Go to",
          icon: dest.icon,
          tone: "zinc",
        });
      }
    }
    const events = (eventQ.loading ? [] : eventQ.data).filter((row) => row.orgId === workspaceId);
    for (const event of events.filter((row) => match(row.name)).slice(0, 5)) {
      out.push({
        key: `event-${event.id}`,
        label: event.name,
        hint: "Open event",
        href: `/dashboard/events/${event.id}/overview`,
        group: "Events",
        icon: CalendarDays,
        tone: "violet",
      });
    }
    // Entity search only kicks in once the user types — an empty palette
    // stays a quick nav switcher instead of a data dump.
    if (needle) {
      const submissions = (submissionQ.loading ? [] : submissionQ.data).filter(
        (row) => row.orgId === workspaceId && (!eventId || row.eventId === eventId),
      );
      for (const submission of submissions.filter((row) => match(row.title)).slice(0, 5)) {
        out.push({
          key: `sub-${submission.id}`,
          label: submission.title,
          hint: submission.status.replace(/_/g, " "),
          href: `/dashboard/events/${submission.eventId}/abstracts`,
          group: "Submissions",
          icon: Inbox,
          tone: "sky",
        });
      }
      const profiles = (profileQ.loading ? [] : profileQ.data).filter(
        (row) => row.orgId === workspaceId,
      );
      const seen = new Set<string>();
      for (const profile of profiles.filter((row) => match(row.name) || match(row.email))) {
        if (seen.has(profile.email.toLowerCase())) continue;
        seen.add(profile.email.toLowerCase());
        out.push({
          key: `spk-${profile.id}`,
          label: profile.name,
          hint: profile.email,
          href: `/dashboard/events/${profile.eventId}/speakers`,
          group: "Speakers",
          icon: Users,
          tone: "pink",
        });
        if (seen.size >= 5) break;
      }
    }
    return out
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
      .slice(0, 12);
  }, [q, destinations, eventQ, submissionQ, profileQ, workspaceId, eventId]);

  useEffect(() => {
    setCursor((prev) => Math.min(prev, Math.max(0, items.length - 1)));
  }, [items.length]);

  function go(item: Item) {
    setOpen(false);
    router.push(item.href);
  }

  if (!presence.mounted) return null;

  return (
    <div
      className={`t-scrim ${presence.motionClassName} fixed inset-0 z-[60] p-4 pt-[12vh]`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className={`t-modal ${presence.motionClassName} mx-auto w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl`}>
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((prev) => Math.min(prev + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((prev) => Math.max(prev - 1, 0));
              } else if (e.key === "Enter" && items[cursor]) {
                e.preventDefault();
                go(items[cursor]);
              }
            }}
            placeholder="Search pages, events, submissions, speakers…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matches.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto overscroll-contain py-1.5">
            {items.map((item, index) => {
              const showGroup = index === 0 || items[index - 1].group !== item.group;
              return (
                <li key={item.key}>
                  {showGroup ? (
                    <p className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {item.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => go(item)}
                    onMouseMove={() => setCursor(index)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                      index === cursor ? "bg-muted/70" : ""
                    }`}
                  >
                    <DashboardIconChip icon={item.icon} tone={item.tone} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{item.label}</span>
                      {item.hint ? (
                        <span className="block truncate text-xs capitalize text-muted-foreground">
                          {item.hint}
                        </span>
                      ) : null}
                    </span>
                    {index === cursor ? (
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
