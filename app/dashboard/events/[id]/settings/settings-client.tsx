"use client";

import React, { useState } from "react";
import { db, useRouter } from "@pylonsync/react";
import { useOrgSlug } from "@/components/use-org-slug";
import { DashboardPage, DashboardPanel } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/forms";
import type { EventRow } from "@/lib/types";

// Straight db.update under the tenant policy; datetime fields post as
// YYYY-MM-DD from <input type=date> and store as ISO midnight UTC.

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function toDateInput(iso?: string) {
  return iso ? iso.slice(0, 10) : "";
}
function fromDateInput(v: string): string | undefined {
  return v ? new Date(`${v}T00:00:00Z`).toISOString() : undefined;
}

export function EventSettings({ event }: { event: EventRow }) {
  const router = useRouter();
  const [name, setName] = useState(event.name);
  const [slug, setSlug] = useState(event.slug);
  const [description, setDescription] = useState(event.description ?? "");
  const [location, setLocation] = useState(event.location ?? "");
  const [timezone, setTimezone] = useState(event.timezone);
  const [startDate, setStartDate] = useState(toDateInput(event.startDate));
  const [endDate, setEndDate] = useState(toDateInput(event.endDate));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const s = slugify(slug);
    if (!name.trim() || !s) return;
    setSaving(true);
    setError(null);
    try {
      await db.update("Event", event.id, {
        name: name.trim(),
        slug: s,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        timezone,
        startDate: fromDateInput(startDate),
        endDate: fromDateInput(endDate),
      });
      setSaved(true);
      router.refresh();
    } catch {
      setError(`Couldn't save — is the handle "${s}" already taken?`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await db.delete("Event", event.id);
      window.location.assign("/dashboard");
    } catch {
      setDeleting(false);
      setDeleteError("Could not delete the event. Try again.");
    }
  }

  return (
    <DashboardPage>
      <DashboardPanel title="Event details" variant="subtle">
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-name">Name</Label>
              <Input id="event-name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-slug">URL handle</Label>
              <Input id="event-slug" value={slug} onChange={(e) => { setSlug(e.target.value); setSaved(false); }} autoComplete="off" spellCheck={false} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-description">Description</Label>
            <Textarea
              id="event-description"
              value={description}
              onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
              rows={3}
              className="resize-none"
              placeholder="Shown on the public CFP page…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-start">Starts</Label>
              <Input id="event-start" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setSaved(false); }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-end">Ends</Label>
              <Input id="event-end" type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setSaved(false); }} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-location">Location</Label>
              <Input id="event-location" value={location} onChange={(e) => { setLocation(e.target.value); setSaved(false); }} autoComplete="off" placeholder="San Francisco, CA…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-timezone">Timezone</Label>
              <Select id="event-timezone" value={timezone} onChange={(e) => { setTimezone(e.target.value); setSaved(false); }}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </Select>
            </div>
          </div>
          {saved && <p className="text-xs text-green-600">Saved.</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="submit" size="sm" disabled={saving} className="self-start sm:self-end">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </DashboardPanel>

      <EmbedWidgets event={event} />

      <DashboardPanel title="Danger zone" variant="subtle">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-pretty text-sm text-muted-foreground">
            Deleting removes forms, submissions, and speaker data for this event.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive">Delete event</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{event.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes its forms, submissions, sessions, and speaker data. This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteError ? (
                <p role="alert" className="text-sm text-destructive">
                  {deleteError}
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleting}
                  onClick={(event) => {
                    event.preventDefault();
                    void remove();
                  }}
                >
                  {deleting ? "Deleting…" : "Delete event"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DashboardPanel>
    </DashboardPage>
  );
}

/* ========================= Embed widgets ========================= */

// Copy-paste iframes so organizers can put the live schedule and speaker
// gallery on their own conference site. The ?embed views are chrome-less and
// update as the program changes — no re-embed needed.
function EmbedWidgets({ event }: { event: EventRow }) {
  const orgSlug = useOrgSlug(event.orgId);
  const [copied, setCopied] = useState<string | null>(null);
  if (!orgSlug) return null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const base = `${origin}/${orgSlug}/${event.slug}`;
  const widgets = [
    { key: "schedule", label: "Schedule widget", height: 900 },
    { key: "speakers", label: "Speaker gallery widget", height: 700 },
  ];
  return (
    <DashboardPanel
      title="Embed widgets"
      description="Drop the live schedule or speaker gallery into your own site — they update automatically as the program changes."
      variant="subtle"
    >
      <div className="space-y-4">
        {widgets.map((widget) => {
          const snippet = `<iframe src="${base}?embed=${widget.key}" width="100%" height="${widget.height}" frameborder="0" title="${event.name} ${widget.key}"></iframe>`;
          return (
            <div key={widget.key}>
              <div className="flex items-center justify-between gap-3">
                <Label>{widget.label}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(snippet);
                    setCopied(widget.key);
                    setTimeout(() => setCopied(null), 1500);
                  }}
                >
                  {copied === widget.key ? "Copied" : "Copy embed code"}
                </Button>
              </div>
              <pre className="mt-1.5 overflow-x-auto rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-5 text-zinc-600">
                {snippet}
              </pre>
            </div>
          );
        })}
      </div>
    </DashboardPanel>
  );
}
