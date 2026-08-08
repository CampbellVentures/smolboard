"use client";

import React, { useEffect, useState } from "react";
import { db, useRouter } from "@pylonsync/react";
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardPanel,
  DashboardToolbar,
} from "@/components/dashboard";
import { EventCard } from "@/components/event-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarPlus } from "lucide-react";
import { slugify } from "@/lib/forms";
import { fmtDate } from "./dashboard-client";
import type { EventRow } from "@/lib/types";

// Events list: server-seeded, then live. Creating an event is a direct
// db.insert — the tenant policy scopes it to the active org.

export function EventsList({
  tenantId,
  initial,
  submissionCounts,
}: {
  tenantId: string;
  initial: EventRow[];
  submissionCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const { data, loading } = db.useQuery<EventRow>("Event");
  const rows = !hydrated || loading ? initial : data.filter((e) => e.orgId === tenantId);
  const events = rows.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const s = slugify(slugTouched ? slug : n);
    if (!n || !s) return;
    setBusy(true);
    setError(null);
    try {
      const id = await db.insert("Event", {
        orgId: tenantId,
        name: n,
        slug: s,
        cfpStatus: "draft",
        timezone: "America/Los_Angeles",
        schedulePublished: false,
      });
      router.push(`/dashboard/events/${id}`);
    } catch {
      setError(`The URL handle "${s}" is taken — pick another.`);
      setBusy(false);
    }
  }

  return (
    <DashboardPage>
      {creating ? (
        <DashboardPanel title="New event" variant="subtle">
          <form onSubmit={create} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-name">Name</Label>
                <Input
                  id="event-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="AI Engineer World's Fair 2026…"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-slug">URL handle</Label>
                <Input
                  id="event-slug"
                  value={slugTouched ? slug : slugify(name)}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  placeholder="aie-2026…"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
            <p className="text-pretty text-xs text-muted-foreground">
              The handle sets your public URLs: /cfp/&lt;handle&gt; and /&lt;handle&gt;/schedule.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={busy || !name.trim()}>
                {busy ? "Creating…" : "Create event"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DashboardPanel>
      ) : (
        <DashboardToolbar>
          <p className="text-pretty text-sm text-muted-foreground">
            {events.length === 0
              ? "Run your call for speakers, reviews, and agenda from one place."
              : `${events.length} event${events.length === 1 ? "" : "s"} in this workspace.`}
          </p>
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <CalendarPlus data-icon="inline-start" /> New event
          </Button>
        </DashboardToolbar>
      )}

      {events.length === 0 && !creating ? (
        <DashboardEmptyState
          icon={CalendarPlus}
          title="No events yet"
          description="Create your first event to open a call for speakers."
        />
      ) : (
        <ul className="grid gap-4">
          {events.map((ev) => (
            <li key={ev.id}>
              <EventCard
                event={ev}
                submissionCount={submissionCounts[ev.id] ?? 0}
                dateLabel={ev.startDate ? fmtDate(ev.startDate) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  );
}
