"use client";

import React, { useEffect, useState } from "react";
import { callFn, db, useRouter } from "@pylonsync/react";
import { toast } from "sonner";
import {
  DashboardEmptyState,
  DashboardHero,
  DashboardPage,
  DashboardWidePage,
} from "@/components/dashboard";
import { EventCard } from "@/components/event-card";
import { useOrgSlug } from "@/components/use-org-slug";
import { ResponsiveFormOverlay } from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  const orgSlug = useOrgSlug(tenantId);
  const [loadingSample, setLoadingSample] = useState(false);
  async function loadSample() {
    setLoadingSample(true);
    try {
      const result = await callFn<{ eventId: string }>("createSampleEvent", { orgId: tenantId });
      router.push(`/dashboard/events/${result.eventId}/overview`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Couldn't create the sample event.");
      setLoadingSample(false);
    }
  }
  const events = rows.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const s = slugify(slugTouched ? slug : n);
    // Dates are required up front: the agenda grid, schedule page, and task
    // due-date math all key off them, so an event without dates is broken on
    // arrival.
    const end = endDate || startDate;
    if (!n || !s || !startDate) return;
    if (end < startDate) {
      setError("End date is before the start date.");
      return;
    }
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
        startDate: new Date(`${startDate}T00:00:00Z`).toISOString(),
        endDate: new Date(`${end}T00:00:00Z`).toISOString(),
      });
      router.push(`/dashboard/events/${id}`);
    } catch {
      setError(`The URL handle "${s}" is taken — pick another.`);
      setBusy(false);
    }
  }

  return (
    <DashboardWidePage>
      <DashboardHero>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-lg">
            <h2 className="text-balance text-lg font-semibold tracking-tight">Your events</h2>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              {events.length === 0
                ? "Run your call for speakers, reviews, and agenda from one place."
                : `${events.length} event${events.length === 1 ? "" : "s"} in this workspace.`}
            </p>
          </div>
          <ResponsiveFormOverlay.Root
          open={creating}
          onOpenChange={(open) => {
            setCreating(open);
            if (!open) setError(null);
          }}
        >
          <ResponsiveFormOverlay.Trigger>
            <Button type="button" size="sm">
              <CalendarPlus data-icon="inline-start" /> New event
            </Button>
          </ResponsiveFormOverlay.Trigger>
          <ResponsiveFormOverlay.Content>
            <form onSubmit={create} className="contents">
              <ResponsiveFormOverlay.Header>
                <ResponsiveFormOverlay.Title>New event</ResponsiveFormOverlay.Title>
                <ResponsiveFormOverlay.Description>
                  Name, public URL, and dates. Everything else can wait.
                </ResponsiveFormOverlay.Description>
              </ResponsiveFormOverlay.Header>
              <ResponsiveFormOverlay.Body>
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="event-name">Name</FieldLabel>
                    <Input
                      id="event-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="AI Engineer World's Fair 2026…"
                      autoComplete="off"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="event-slug">URL handle</FieldLabel>
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
                    <FieldDescription>
                      The event&apos;s public pages live at
                      /&lt;workspace&gt;/&lt;handle&gt;.
                    </FieldDescription>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="event-start">Start date</FieldLabel>
                      <Input
                        id="event-start"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="event-end">End date</FieldLabel>
                      <Input
                        id="event-end"
                        type="date"
                        value={endDate}
                        min={startDate || undefined}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                      <FieldDescription>Leave empty for a one-day event.</FieldDescription>
                    </Field>
                  </div>
                  {error ? <FieldError>{error}</FieldError> : null}
                </FieldGroup>
              </ResponsiveFormOverlay.Body>
              <ResponsiveFormOverlay.Footer>
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !name.trim() || !startDate}>
                  {busy ? "Creating…" : "Create event"}
                </Button>
              </ResponsiveFormOverlay.Footer>
            </form>
          </ResponsiveFormOverlay.Content>
          </ResponsiveFormOverlay.Root>
        </div>
      </DashboardHero>

      {events.length === 0 ? (
        <DashboardEmptyState
          icon={CalendarPlus}
          title="No events yet"
          description="Create your first event to open a call for speakers — or load a sample event to explore with real-looking data."
        >
          <Button
            type="button"
            variant="outline"
            disabled={loadingSample}
            onClick={() => void loadSample()}
          >
            {loadingSample ? "Loading sample…" : "Load a sample event"}
          </Button>
        </DashboardEmptyState>
      ) : (
        <ul className="grid gap-4">
          {events.map((ev) => (
            <li key={ev.id}>
              <EventCard
                event={ev}
                orgSlug={orgSlug}
                submissionCount={submissionCounts[ev.id] ?? 0}
                dateLabel={ev.startDate ? fmtDate(ev.startDate) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </DashboardWidePage>
  );
}
