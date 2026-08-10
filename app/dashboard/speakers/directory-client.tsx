"use client";

import React, { useEffect, useMemo, useState } from "react";
import { callFn, db, Link } from "@pylonsync/react";
import { PersonAvatar } from "@/components/person-avatar";
import { fmtDate } from "@/lib/format";
import { BookUser, ExternalLink, Trash2 } from "lucide-react";
import {
  DashboardEmptyState,
  DashboardHero,
  DashboardPage,
  DashboardStatusBadge,
  DashboardToolbar,
  DashboardWidePage,
} from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EventRow, SpeakerNoteRow, SpeakerProfileRow, SubmissionRow } from "@/lib/types";

// Workspace-wide speaker CRM: one row per person across every event, built
// from the per-event profiles (identity = email). Read-mostly by design —
// edits happen on the event-level speaker profile, linked from the drawer.

export interface SpeakerPerson {
  email: string;
  name: string;
  company?: string;
  jobTitle?: string;
  headshotUrl?: string;
  tags: string[];
  profiles: SpeakerProfileRow[];
  submissions: SubmissionRow[];
  accepted: number;
  lastActivity: string;
}

export function aggregateSpeakers(
  profiles: SpeakerProfileRow[],
  submissions: SubmissionRow[],
): SpeakerPerson[] {
  const byEmail = new Map<string, SpeakerPerson>();
  const sorted = profiles
    .slice()
    .sort((a, b) => (a.updatedAt ?? a.createdAt).localeCompare(b.updatedAt ?? b.createdAt));
  for (const profile of sorted) {
    const email = profile.email.toLowerCase();
    const existing = byEmail.get(email);
    const person: SpeakerPerson = existing ?? {
      email,
      name: profile.name,
      tags: [],
      profiles: [],
      submissions: [],
      accepted: 0,
      lastActivity: profile.createdAt,
    };
    // Later profiles win for identity fields (sorted oldest → newest).
    person.name = profile.name || person.name;
    person.company = profile.company || person.company;
    person.jobTitle = profile.jobTitle || person.jobTitle;
    person.headshotUrl = profile.headshotUrl || person.headshotUrl;
    person.tags = [...new Set([...person.tags, ...(profile.tagsJson ?? [])])];
    person.profiles.push(profile);
    person.lastActivity = [person.lastActivity, profile.updatedAt ?? profile.createdAt]
      .sort()
      .at(-1)!;
    byEmail.set(email, person);
  }
  for (const person of byEmail.values()) {
    const userIds = new Set(person.profiles.map((profile) => profile.userId));
    person.submissions = submissions.filter((row) => userIds.has(row.speakerUserId));
    person.accepted = person.submissions.filter((row) => row.status === "accepted").length;
    person.lastActivity = [
      person.lastActivity,
      ...person.submissions.map((row) => row.updatedAt ?? row.submittedAt),
    ]
      .sort()
      .at(-1)!;
  }
  return [...byEmail.values()].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

function Avatar({ person }: { person: SpeakerPerson }) {
  return <PersonAvatar name={person.name} src={person.headshotUrl} />;
}

export function SpeakerDirectory({
  orgId,
  initialProfiles,
  initialEvents,
  initialSubmissions,
  initialNotes,
}: {
  orgId: string;
  initialProfiles: SpeakerProfileRow[];
  initialEvents: EventRow[];
  initialSubmissions: SubmissionRow[];
  initialNotes: SpeakerNoteRow[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const profileQ = db.useQuery<SpeakerProfileRow>("SpeakerProfile");
  const eventQ = db.useQuery<EventRow>("Event");
  const submissionQ = db.useQuery<SubmissionRow>("Submission");
  const noteQ = db.useQuery<SpeakerNoteRow>("SpeakerNote");
  const profiles = !hydrated || profileQ.loading ? initialProfiles : profileQ.data;
  const events = !hydrated || eventQ.loading ? initialEvents : eventQ.data;
  const submissions = !hydrated || submissionQ.loading ? initialSubmissions : submissionQ.data;
  const notes = !hydrated || noteQ.loading ? initialNotes : noteQ.data;
  const eventById = useMemo(() => new Map(events.map((row) => [row.id, row])), [events]);

  // Only profiles whose event still exists — pre-cascade deletes left orphans
  // in older workspaces, and a person built purely from orphans is noise.
  const liveProfiles = useMemo(
    () => profiles.filter((profile) => eventById.has(profile.eventId)),
    [profiles, eventById],
  );
  const people = useMemo(
    () => aggregateSpeakers(liveProfiles, submissions),
    [liveProfiles, submissions],
  );
  const allTags = useMemo(
    () => [...new Set(people.flatMap((person) => person.tags))].sort(),
    [people],
  );

  const [q, setQ] = useState("");
  const [tag, setTag] = useState("all");
  const [selected, setSelected] = useState<SpeakerPerson | null>(null);

  let rows = people;
  if (tag !== "all") rows = rows.filter((person) => person.tags.includes(tag));
  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    rows = rows.filter(
      (person) =>
        person.name.toLowerCase().includes(needle) ||
        person.email.includes(needle) ||
        (person.company ?? "").toLowerCase().includes(needle),
    );
  }

  if (people.length === 0) {
    return (
      <DashboardWidePage>
        <DashboardEmptyState
          icon={BookUser}
          title="No speakers yet"
          description="Everyone who submits to any of your events builds a history here."
        />
      </DashboardWidePage>
    );
  }

  return (
    <DashboardWidePage>
      <DashboardHero>
        <h2 className="text-balance text-lg font-semibold tracking-tight">Speaker directory</h2>
        <p className="mt-1 max-w-lg text-pretty text-sm text-muted-foreground">
          Everyone who submits or speaks across your events builds a history here —{" "}
          <span className="tabular-nums">{people.length}</span>{" "}
          {people.length === 1 ? "person" : "people"} so far.
        </p>
      </DashboardHero>
      <DashboardToolbar>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search name, email, company…"
            className="w-64"
            aria-label="Search speakers"
            autoComplete="off"
          />
          {allTags.length > 0 ? (
            <Select
              aria-label="Filter by tag"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              className="w-40"
            >
              <option value="all">All tags</option>
              {allTags.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {rows.length} of {people.length} speakers
        </span>
      </DashboardToolbar>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Speaker</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Submissions</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((person) => (
              <TableRow
                key={person.email}
                className="cursor-pointer"
                tabIndex={0}
                onClick={() => setSelected(person)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(person);
                  }
                }}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar person={person} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{person.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[person.jobTitle, person.company].filter(Boolean).join(" · ") ||
                          person.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {person.profiles
                      .filter((profile) => eventById.has(profile.eventId))
                      .slice(0, 3)
                      .map((profile) => (
                        <Badge key={profile.id} variant="outline" className="max-w-36 truncate">
                          {eventById.get(profile.eventId)!.name}
                        </Badge>
                      ))}
                    {person.profiles.length > 3 ? (
                      <span className="text-xs text-muted-foreground">
                        +{person.profiles.length - 3}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">
                  {person.submissions.length}
                  {person.accepted > 0 ? (
                    <span className="ml-1.5 text-xs text-emerald-600">
                      {person.accepted} accepted
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {person.tags.slice(0, 3).map((value) => (
                      <Badge key={value} variant="secondary">
                        {value}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                  {fmtDate(person.lastActivity)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <Avatar person={selected} />
                  <div className="min-w-0">
                    <SheetTitle className="truncate">{selected.name}</SheetTitle>
                    <SheetDescription className="truncate">
                      {selected.email}
                      {selected.company ? ` · ${selected.company}` : ""}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6">
                {selected.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selected.tags.map((value) => (
                      <Badge key={value} variant="secondary">
                        {value}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <SpeakerNotes
                  orgId={orgId}
                  email={selected.email}
                  notes={notes.filter((row) => row.email === selected.email)}
                />
                {selected.profiles
                  .slice()
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((profile) => {
                    const event = eventById.get(profile.eventId);
                    const eventSubmissions = selected.submissions.filter(
                      (row) => row.eventId === profile.eventId,
                    );
                    return (
                      <div key={profile.id} className="rounded-xl border border-border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-semibold">
                            {event?.name ?? "Event"}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <DashboardStatusBadge status={profile.status || "invited"}>
                              {(profile.status || "invited").replace(/_/g, " ")}
                            </DashboardStatusBadge>
                            <Link
                              href={`/dashboard/events/${profile.eventId}/speakers`}
                              className="text-muted-foreground transition-colors hover:text-foreground"
                              title="Open in event"
                            >
                              <ExternalLink className="size-3.5" />
                            </Link>
                          </div>
                        </div>
                        {eventSubmissions.length > 0 ? (
                          <ul className="mt-3 space-y-1.5">
                            {eventSubmissions.map((submission) => (
                              <li
                                key={submission.id}
                                className="flex items-center justify-between gap-3 text-[13px]"
                              >
                                <span className="min-w-0 truncate">{submission.title}</span>
                                <DashboardStatusBadge status={submission.status}>
                                  {submission.status.replace(/_/g, " ")}
                                </DashboardStatusBadge>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">No submissions.</p>
                        )}
                      </div>
                    );
                  })}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </DashboardWidePage>
  );
}

/* ============================= Notes ============================= */

// Organizer-only CRM notes on the person; they follow the speaker across
// events. Writes go through addSpeakerNote / deleteSpeakerNote.
function SpeakerNotes({
  orgId,
  email,
  notes,
}: {
  orgId: string;
  email: string;
  notes: SpeakerNoteRow[];
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await callFn("addSpeakerNote", { orgId, email, body: draft.trim() });
      setDraft("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save the note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 className="text-[13px] font-semibold text-foreground">Notes</h3>
      {notes.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {notes
            .slice()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((note) => (
              <li key={note.id} className="group rounded-lg bg-muted/50 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">{note.authorName}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {new Date(note.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <button
                      type="button"
                      aria-label="Delete note"
                      onClick={() => void callFn("deleteSpeakerNote", { noteId: note.id })}
                      className="text-zinc-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-5 text-zinc-700">
                  {note.body}
                </p>
              </li>
            ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing yet — notes follow this person across events.
        </p>
      )}
      <div className="mt-2 flex items-start gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a note…"
          rows={2}
          className="text-[13px]"
        />
        <Button type="button" size="sm" disabled={busy || !draft.trim()} onClick={() => void add()}>
          {busy ? "…" : "Add"}
        </Button>
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
