"use client";

import React, { useState } from "react";
import { db, useRouter } from "@pylonsync/react";
import { DashboardPage, DashboardPanel } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
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
    if (!confirm(`Delete "${event.name}" and everything in it? This can't be undone.`)) return;
    await db.delete("Event", event.id);
    window.location.assign("/dashboard");
  }

  return (
    <DashboardPage>
      <DashboardPanel title="Event details">
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
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </DashboardPanel>

      <DashboardPanel title="Danger zone">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-600">
            Deleting removes forms, submissions, and speaker data for this event.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={remove}
          >
            Delete event
          </Button>
        </div>
      </DashboardPanel>
    </DashboardPage>
  );
}
