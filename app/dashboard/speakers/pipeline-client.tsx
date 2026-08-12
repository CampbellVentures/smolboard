"use client";

import React, { useMemo, useState } from "react";
import { callFn, db } from "@pylonsync/react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  GitMerge,
  Mail,
  Plus,
  Send,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  DashboardEmptyState,
  DashboardIconChip,
  DashboardPanel,
  DashboardStatusBadge,
} from "@/components/dashboard";
import { PersonAvatar } from "@/components/person-avatar";
import { ResponsiveFormOverlay } from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { findDuplicates } from "@/lib/contacts";
import { CONTACT_MERGE_TAGS } from "@/lib/contacts-email";
import { fmtDateTime } from "@/lib/format";
import type { ContactRow, ContactStageEventRow, EventRow } from "@/lib/types";

// The sourcing side of the CRM: contacts move through stages on a board,
// carry their own history, and hand off into an event when they say yes.

export const STAGES: { key: string; label: string }[] = [
  { key: "prospect", label: "Prospect" },
  { key: "contacted", label: "Contacted" },
  { key: "invited", label: "Invited" },
  { key: "confirmed", label: "Confirmed" },
  { key: "declined", label: "Declined" },
];

export function ContactPipeline({
  orgId,
  contacts,
  stageEvents,
  events,
  selected,
  onToggleSelect,
}: {
  orgId: string;
  contacts: ContactRow[];
  stageEvents: ContactStageEventRow[];
  events: EventRow[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState<ContactRow | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  async function moveTo(contact: ContactRow, stage: string) {
    if (contact.stage === stage) return;
    try {
      await callFn("saveContact", {
        orgId,
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        company: contact.company,
        jobTitle: contact.jobTitle,
        bio: contact.bio,
        headshotUrl: contact.headshotUrl,
        tags: contact.tagsJson ?? [],
        notes: contact.notes,
        stage,
      });
      toast.success(`${contact.name} → ${STAGES.find((s) => s.key === stage)?.label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't move that contact.");
    }
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {STAGES.map((stage) => {
          const inStage = contacts.filter((c) => c.stage === stage.key);
          return (
            <div
              key={stage.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const contact = contacts.find((c) => c.id === dragging);
                if (contact) void moveTo(contact, stage.key);
                setDragging(null);
              }}
              className="flex min-h-32 min-w-0 flex-col rounded-xl border border-border bg-muted/25 p-2"
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {stage.label}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {inStage.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {inStage.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    draggable
                    onDragStart={() => setDragging(contact.id)}
                    onClick={() => setOpen(contact)}
                    className="min-w-0 rounded-lg border border-border bg-card p-2.5 text-left transition-shadow hover:shadow-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <PersonAvatar name={contact.name} src={contact.headshotUrl} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{contact.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {contact.company || contact.email}
                        </span>
                      </span>
                    </div>
                  </button>
                ))}
                {inStage.length === 0 ? (
                  <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">
                    Drag contacts here
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {open ? (
        <ContactDetail
          orgId={orgId}
          contact={open}
          history={stageEvents.filter((e) => e.contactId === open.id)}
          events={events}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function ContactDetail({
  orgId,
  contact,
  history,
  events,
  onClose,
}: {
  orgId: string;
  contact: ContactRow;
  history: ContactStageEventRow[];
  events: EventRow[];
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [stage, setStage] = useState(contact.stage);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await callFn("saveContact", {
        orgId,
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        company: contact.company,
        jobTitle: contact.jobTitle,
        bio: contact.bio,
        headshotUrl: contact.headshotUrl,
        tags: contact.tagsJson ?? [],
        notes,
        stage,
      });
      toast.success("Contact saved");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function pushToEvent() {
    if (!eventId) return;
    setBusy(true);
    try {
      const result = await callFn<{ alreadyPresent: boolean }>("pushContactToEvent", {
        contactId: contact.id,
        eventId,
      });
      toast.success(
        result.alreadyPresent
          ? `${contact.name} is already on that event`
          : `${contact.name} added to ${events.find((e) => e.id === eventId)?.name}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add them to the event.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveFormOverlay.Root open onOpenChange={(next) => !next && onClose()}>
      <ResponsiveFormOverlay.Content className="sm:max-w-lg">
        <ResponsiveFormOverlay.Header icon={Users}>
          <ResponsiveFormOverlay.Title>{contact.name}</ResponsiveFormOverlay.Title>
          <ResponsiveFormOverlay.Description>
            {[contact.jobTitle, contact.company].filter(Boolean).join(", ") || contact.email}
          </ResponsiveFormOverlay.Description>
        </ResponsiveFormOverlay.Header>
        <ResponsiveFormOverlay.Body>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-stage">Pipeline stage</Label>
              <Select id="contact-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-notes">Internal notes</Label>
              <Textarea
                id="contact-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Context only your team sees…"
              />
            </div>
            {events.length > 0 ? (
              <div className="rounded-xl border border-border p-3">
                <p className="text-sm font-medium">Add to an event</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Creates their speaker record with this profile already filled in.
                </p>
                <div className="mt-2 flex gap-2">
                  <Select
                    aria-label="Event"
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                  >
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>{event.name}</option>
                    ))}
                  </Select>
                  <Button type="button" variant="outline" disabled={busy} onClick={pushToEvent}>
                    <ArrowRight data-icon="inline-start" />
                    Add
                  </Button>
                </div>
              </div>
            ) : null}
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Stage history
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {history
                  .slice()
                  .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                  .map((event) => (
                    <li key={event.id} className="text-xs text-muted-foreground">
                      <span className="capitalize text-foreground">{event.toStage}</span>
                      {event.fromStage ? ` from ${event.fromStage}` : " added"} ·{" "}
                      {fmtDateTime(event.createdAt)}
                      {event.actorName ? ` · ${event.actorName}` : ""}
                    </li>
                  ))}
                {history.length === 0 ? (
                  <li className="text-xs text-muted-foreground">No stage changes yet.</li>
                ) : null}
              </ul>
            </div>
          </div>
        </ResponsiveFormOverlay.Body>
        <ResponsiveFormOverlay.Footer>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await callFn("deleteContact", { contactId: contact.id });
                toast.success(`Removed ${contact.name}`);
                onClose();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Couldn't remove.");
              } finally {
                setBusy(false);
              }
            }}
            className="mr-auto text-destructive hover:text-destructive"
          >
            Remove
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button type="button" disabled={busy} onClick={save}>Save contact</Button>
        </ResponsiveFormOverlay.Footer>
      </ResponsiveFormOverlay.Content>
    </ResponsiveFormOverlay.Root>
  );
}

/* --------------------------- Import / merge / email --------------------------- */

export function ImportContactsDialog({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const result = await callFn<{ created: number; updated: number; errors: string[] }>(
        "importContactsCsv",
        { orgId, csv },
      );
      toast.success(`Imported ${result.created} new, updated ${result.updated}`, {
        description: result.errors.length ? `${result.errors.length} rows skipped.` : undefined,
      });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveFormOverlay.Root open onOpenChange={(next) => !next && onClose()}>
      <ResponsiveFormOverlay.Content className="sm:max-w-lg">
        <ResponsiveFormOverlay.Header icon={Upload}>
          <ResponsiveFormOverlay.Title>Import contacts</ResponsiveFormOverlay.Title>
          <ResponsiveFormOverlay.Description>
            Paste CSV with a header row. Name and Email are required; Company, Job title, Tags,
            and Stage are optional. Existing emails are updated.
          </ResponsiveFormOverlay.Description>
        </ResponsiveFormOverlay.Header>
        <ResponsiveFormOverlay.Body>
          <Textarea
            rows={10}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"name,email,company,job title,tags\nAda Lovelace,ada@example.dev,Analytical Engines,Founder,keynote;infra"}
            className="font-mono text-xs"
            aria-label="CSV"
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setCsv(await file.text());
              }}
            />
          </label>
        </ResponsiveFormOverlay.Body>
        <ResponsiveFormOverlay.Footer>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={busy || !csv.trim()} onClick={run}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </ResponsiveFormOverlay.Footer>
      </ResponsiveFormOverlay.Content>
    </ResponsiveFormOverlay.Root>
  );
}

export function DuplicatesPanel({ orgId, contacts }: { orgId: string; contacts: ContactRow[] }) {
  const groups = useMemo(() => findDuplicates(contacts), [contacts]);
  const [busy, setBusy] = useState<string | null>(null);
  if (groups.length === 0) return null;

  async function merge(primaryId: string, ids: string[]) {
    setBusy(primaryId);
    try {
      const result = await callFn<{ merged: number }>("mergeContacts", {
        orgId,
        primaryId,
        duplicateIds: ids,
      });
      toast.success(`Merged ${result.merged} duplicate${result.merged === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't merge.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardPanel
      title="Possible duplicates"
      description="Same name, different email addresses. Merging keeps the primary record and folds in the rest."
      icon={GitMerge}
      tone="amber"
      variant="subtle"
    >
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.key} className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium capitalize">{group.members[0].name}</p>
            <ul className="mt-1 flex flex-col gap-1">
              {group.members.map((member) => (
                <li key={member.id} className="text-xs text-muted-foreground">
                  {member.email}
                  {member.company ? ` · ${member.company}` : ""}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              {group.members.map((member) => (
                <Button
                  key={member.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy === member.id}
                  onClick={() =>
                    merge(
                      member.id,
                      group.members.filter((m) => m.id !== member.id).map((m) => m.id),
                    )
                  }
                >
                  Keep {member.email}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DashboardPanel>
  );
}

export function BulkEmailDialog({
  orgId,
  contacts,
  onClose,
}: {
  orgId: string;
  contacts: ContactRow[];
  onClose: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = contacts[0];

  async function send() {
    setBusy(true);
    try {
      const result = await callFn<{ sent: number; failed: number }>("emailContacts", {
        orgId,
        contactIds: contacts.map((c) => c.id),
        subject,
        body,
      });
      toast.success(`Sent ${result.sent} email${result.sent === 1 ? "" : "s"}`, {
        description: result.failed ? `${result.failed} failed.` : undefined,
      });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveFormOverlay.Root open onOpenChange={(next) => !next && onClose()}>
      <ResponsiveFormOverlay.Content className="sm:max-w-lg">
        <ResponsiveFormOverlay.Header icon={Mail}>
          <ResponsiveFormOverlay.Title>
            Email {contacts.length} contact{contacts.length === 1 ? "" : "s"}
          </ResponsiveFormOverlay.Title>
          <ResponsiveFormOverlay.Description>
            Each person gets their own message. Merge tags: {CONTACT_MERGE_TAGS.map((t) => `{{${t}}}`).join(", ")}
          </ResponsiveFormOverlay.Description>
        </ResponsiveFormOverlay.Header>
        <ResponsiveFormOverlay.Body>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-subject">Subject</Label>
              <Input
                id="bulk-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Speaking at DevSummit, {{first_name}}?"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-body">Message</Label>
              <Textarea
                id="bulk-body"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hi {{first_name}}, we loved your work at {{company}}…"
              />
            </div>
            {preview ? (
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Preview for {preview.name}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {applyPreview(subject, preview) || "(no subject)"}
                </p>
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                  {applyPreview(body, preview) || "(no message)"}
                </p>
              </div>
            ) : null}
          </div>
        </ResponsiveFormOverlay.Body>
        <ResponsiveFormOverlay.Footer>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={busy || !subject.trim() || !body.trim()} onClick={send}>
            <Send data-icon="inline-start" />
            {busy ? "Sending…" : `Send ${contacts.length}`}
          </Button>
        </ResponsiveFormOverlay.Footer>
      </ResponsiveFormOverlay.Content>
    </ResponsiveFormOverlay.Root>
  );
}

function applyPreview(template: string, contact: ContactRow): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => {
    const vars: Record<string, string> = {
      name: contact.name,
      first_name: contact.name.split(/\s+/)[0] ?? contact.name,
      company: contact.company ?? "",
      job_title: contact.jobTitle ?? "",
      email: contact.email,
    };
    return vars[key.toLowerCase()] ?? "";
  });
}

/* ------------------------------- Metrics -------------------------------- */

// Org-wide numbers for the speaker database.
//
// These used to count only Contact rows, which are created by CSV import
// alone — so a workspace with a full roster of speakers showed 0 / 0 and an
// empty chart. The headline figures now come from the speaker database itself
// and the imported-contact pipeline is one panel inside it.
export function CrmMetrics({
  people,
  contacts,
  events,
}: {
  people: { company?: string; profiles: { eventId: string }[]; accepted: number }[];
  contacts: ContactRow[];
  events: { id: string; name: string }[];
}) {
  const byStage = STAGES.map((stage) => ({
    ...stage,
    count: contacts.filter((c) => c.stage === stage.key).length,
  }));
  const companies = new Set(
    [...people.map((p) => p.company), ...contacts.map((c) => c.company)].filter(Boolean),
  ).size;
  const accepted = people.reduce((sum, person) => sum + person.accepted, 0);

  // Speakers per event: populated whenever the workspace has any speaker at
  // all, which is what makes this widget worth showing on arrival.
  const perEvent = events
    .map((event) => ({
      id: event.id,
      name: event.name,
      count: people.filter((p) => p.profiles.some((profile) => profile.eventId === event.id)).length,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const stageMax = Math.max(1, ...byStage.map((s) => s.count));
  const eventMax = Math.max(1, ...perEvent.map((s) => s.count));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="grid grid-cols-2 gap-3">
        <Metric icon={Users} label="Speakers" value={people.length} />
        <Metric icon={Building2} label="Companies" value={companies} />
        <Metric icon={CalendarDays} label="Events" value={events.length} />
        <Metric icon={CheckCircle2} label="Accepted talks" value={accepted} />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Speakers per event
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {perEvent.map((row) => (
            <div key={row.id} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 truncate text-muted-foreground" title={row.name}>
                {row.name}
              </span>
              <span
                className="h-2 rounded-full bg-violet-300"
                style={{ width: `${(row.count / eventMax) * 60}%` }}
                aria-hidden="true"
              />
              <span className="tabular-nums text-muted-foreground">{row.count}</span>
            </div>
          ))}
          {perEvent.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">No speakers on an event yet.</p>
          )}
        </div>

        {contacts.length > 0 && (
          <>
            <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Sourcing pipeline
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              {byStage.map((stage) => (
                <div key={stage.key} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 text-muted-foreground">{stage.label}</span>
                  <span
                    className="h-2 rounded-full bg-zinc-300"
                    style={{ width: `${(stage.count / stageMax) * 60}%` }}
                    aria-hidden="true"
                  />
                  <span className="tabular-nums text-muted-foreground">{stage.count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <DashboardIconChip icon={icon} size="sm" />
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
