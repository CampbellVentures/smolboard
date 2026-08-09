"use client";

import React, { useEffect, useMemo, useState } from "react";
import { callFn, db } from "@pylonsync/react";
import { toast } from "sonner";
import { FileSpreadsheet, Mail, Plus, Users } from "lucide-react";
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardStatusBadge,
  DashboardToolbar,
} from "@/components/dashboard";
import { ResponsiveFormOverlay } from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseSpeakerCsv, SPEAKER_STATUSES, type SpeakerImportRow } from "@/lib/speakers";
import type {
  EventRow,
  SessionRow,
  SpeakerFileRow,
  SpeakerProfileRow,
  SpeakerTaskRow,
  SubmissionRow,
  TaskTemplateRow,
} from "@/lib/types";

interface SpeakerEditorState {
  id?: string;
  name: string;
  email: string;
  jobTitle: string;
  company: string;
  bio: string;
  tagline: string;
  status: string;
  headshotUrl: string;
  logistics: string;
  website: string;
  twitter: string;
  linkedin: string;
}

const blankSpeaker: SpeakerEditorState = {
  name: "",
  email: "",
  jobTitle: "",
  company: "",
  bio: "",
  tagline: "",
  status: "invited",
  headshotUrl: "",
  logistics: "",
  website: "",
  twitter: "",
  linkedin: "",
};

export function SpeakersTable({
  event,
  initialProfiles,
  initialSubmissions,
  initialSessions,
  initialTasks,
  initialTemplates,
  initialFiles,
}: {
  event: EventRow;
  initialProfiles: SpeakerProfileRow[];
  initialSubmissions: SubmissionRow[];
  initialSessions: SessionRow[];
  initialTasks: SpeakerTaskRow[];
  initialTemplates: TaskTemplateRow[];
  initialFiles: SpeakerFileRow[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const profQ = db.useQuery<SpeakerProfileRow>("SpeakerProfile");
  const subsQ = db.useQuery<SubmissionRow>("Submission");
  const taskQ = db.useQuery<SpeakerTaskRow>("SpeakerTask");
  const profiles = eventRows(hydrated, profQ, initialProfiles, event.id);
  const submissions = eventRows(hydrated, subsQ, initialSubmissions, event.id);
  const tasks = eventRows(hydrated, taskQ, initialTasks, event.id);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [editor, setEditor] = useState<SpeakerEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [csvRows, setCsvRows] = useState<SpeakerImportRow[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return profiles
      .filter((profile) => status === "all" || profile.status === status)
      .filter(
        (profile) =>
          !needle ||
          profile.name.toLowerCase().includes(needle) ||
          profile.email.toLowerCase().includes(needle) ||
          (profile.company ?? "").toLowerCase().includes(needle) ||
          (profile.jobTitle ?? "").toLowerCase().includes(needle),
      )
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles, q, status]);

  function openProfile(profile: SpeakerProfileRow) {
    const links = profile.linksJson ?? {};
    setEditor({
      id: profile.id,
      name: profile.name,
      email: profile.email,
      jobTitle: profile.jobTitle ?? "",
      company: profile.company ?? "",
      bio: profile.bio ?? "",
      tagline: profile.tagline ?? "",
      status: profile.status || "invited",
      headshotUrl: profile.headshotUrl ?? "",
      logistics: profile.logistics ?? "",
      website: links.website ?? "",
      twitter: links.twitter ?? "",
      linkedin: links.linkedin ?? "",
    });
  }

  async function saveSpeaker(event_: React.FormEvent) {
    event_.preventDefault();
    if (!editor) return;
    setSaving(true);
    try {
      await callFn("saveSpeakerProfile", {
        eventId: event.id,
        profileId: editor.id,
        name: editor.name,
        email: editor.email,
        jobTitle: editor.jobTitle || undefined,
        company: editor.company || undefined,
        bio: editor.bio || undefined,
        tagline: editor.tagline || undefined,
        status: editor.status,
        headshotUrl: editor.headshotUrl || undefined,
        logistics: editor.logistics || undefined,
        linksJson: compact({ website: editor.website, twitter: editor.twitter, linkedin: editor.linkedin }),
      });
      toast.success(editor.id ? "Speaker updated" : "Speaker added");
      setEditor(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the speaker.");
    } finally {
      setSaving(false);
    }
  }

  async function invite(profileId: string) {
    try {
      await callFn("inviteSpeaker", { profileId });
      toast.success("Portal invitation queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the invitation.");
    }
  }

  async function readCsv(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    try {
      setCsvRows(parseSpeakerCsv(text));
      setCsvError(null);
    } catch (error) {
      setCsvRows([]);
      setCsvError(error instanceof Error ? error.message : "Could not parse CSV.");
    }
  }

  async function runImport() {
    try {
      const result = await callFn<{ created: unknown[]; duplicates: unknown[] }>("importSpeakers", {
        eventId: event.id,
        csv,
      });
      toast.success(`Imported ${result.created.length} speaker${result.created.length === 1 ? "" : "s"}`, {
        description: result.duplicates.length ? `${result.duplicates.length} duplicate row(s) skipped.` : undefined,
      });
      setImportOpen(false);
      setCsv("");
      setCsvRows([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import speakers.");
    }
  }

  const selectedProfile = editor?.id ? profiles.find((profile) => profile.id === editor.id) : undefined;

  return (
    <DashboardPage>
      <DashboardToolbar>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(event_) => setQ(event_.target.value)}
            placeholder="Search speakers…"
            className="w-64"
            aria-label="Search speakers"
          />
          <Select aria-label="Filter speaker status" value={status} onChange={(event_) => setStatus(event_.target.value)} className="w-40">
            <option value="all">All statuses</option>
            {SPEAKER_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet data-icon="inline-start" /> Import CSV
          </Button>
          <Button type="button" onClick={() => setEditor({ ...blankSpeaker })}>
            <Plus data-icon="inline-start" /> Add speaker
          </Button>
        </div>
      </DashboardToolbar>

      {profiles.length === 0 ? (
        <DashboardEmptyState
          icon={Users}
          title="No speakers yet"
          description="Add speakers manually or import a CSV to start the event roster."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Speaker</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Portal</TableHead>
                <TableHead>Submissions</TableHead>
                <TableHead>Tasks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((profile) => {
                const speakerSubmissions = submissions.filter((row) => row.speakerUserId === profile.userId);
                const speakerTasks = tasks.filter((row) => row.speakerUserId === profile.userId);
                return (
                  <TableRow key={profile.id} className="cursor-pointer" onClick={() => openProfile(profile)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {profile.headshotUrl ? <img src={profile.headshotUrl} alt="" className="size-10 rounded-full object-cover" /> : null}
                        <div>
                          <div className="font-medium">{profile.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {[profile.jobTitle, profile.company].filter(Boolean).join(" · ") || profile.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><DashboardStatusBadge status={profile.status || "invited"}>{label(profile.status || "invited")}</DashboardStatusBadge></TableCell>
                    <TableCell><DashboardStatusBadge status={profile.claimStatus || "unclaimed"}>{label(profile.claimStatus || "unclaimed")}</DashboardStatusBadge></TableCell>
                    <TableCell>{speakerSubmissions.length}</TableCell>
                    <TableCell>{speakerTasks.filter((task) => task.status === "done").length}/{speakerTasks.length}</TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">No speakers match those filters.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}

      <SpeakerEditor
        editor={editor}
        setEditor={setEditor}
        saving={saving}
        onSubmit={saveSpeaker}
        profile={selectedProfile}
        sessions={initialSessions.filter((session) => selectedProfile && speakerIds(session).includes(selectedProfile.userId))}
        tasks={tasks.filter((task) => task.speakerUserId === selectedProfile?.userId)}
        templates={initialTemplates}
        files={initialFiles.filter((file) => file.userId === selectedProfile?.userId)}
        onInvite={invite}
      />

      <ResponsiveFormOverlay.Root open={importOpen} onOpenChange={setImportOpen}>
        <ResponsiveFormOverlay.Content className="max-w-3xl">
          <ResponsiveFormOverlay.Header>
            <ResponsiveFormOverlay.Title>Import speakers from CSV</ResponsiveFormOverlay.Title>
            <ResponsiveFormOverlay.Description>Name and email are required. Existing event emails are skipped deterministically.</ResponsiveFormOverlay.Description>
          </ResponsiveFormOverlay.Header>
          <ResponsiveFormOverlay.Body>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="speaker-csv">CSV file</FieldLabel>
                <Input id="speaker-csv" type="file" accept=".csv,text/csv" onChange={(event_) => void readCsv(event_.target.files?.[0])} />
                <FieldDescription>Supported: title, company, bio, status, headshot_url, logistics, and tags.</FieldDescription>
              </Field>
              {csvError ? <p className="text-sm text-destructive">{csvError}</p> : null}
              {csvRows.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Title / company</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>{csvRows.slice(0, 20).map((row) => (
                      <TableRow key={`${row.rowNumber}:${row.email}`}><TableCell>{row.name}</TableCell><TableCell>{row.email}</TableCell><TableCell>{[row.jobTitle, row.company].filter(Boolean).join(" · ")}</TableCell><TableCell>{label(row.status)}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                </div>
              ) : null}
            </FieldGroup>
          </ResponsiveFormOverlay.Body>
          <ResponsiveFormOverlay.Footer>
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button type="button" disabled={csvRows.length === 0} onClick={runImport}>Import {csvRows.length || ""} speakers</Button>
          </ResponsiveFormOverlay.Footer>
        </ResponsiveFormOverlay.Content>
      </ResponsiveFormOverlay.Root>
    </DashboardPage>
  );
}

function SpeakerEditor({
  editor,
  setEditor,
  saving,
  onSubmit,
  profile,
  sessions,
  tasks,
  templates,
  files,
  onInvite,
}: {
  editor: SpeakerEditorState | null;
  setEditor: (value: SpeakerEditorState | null) => void;
  saving: boolean;
  onSubmit: (event: React.FormEvent) => void;
  profile?: SpeakerProfileRow;
  sessions: SessionRow[];
  tasks: SpeakerTaskRow[];
  templates: TaskTemplateRow[];
  files: SpeakerFileRow[];
  onInvite: (profileId: string) => Promise<void>;
}) {
  if (!editor) return null;
  const set = <K extends keyof SpeakerEditorState>(key: K, value: SpeakerEditorState[K]) => setEditor({ ...editor, [key]: value });
  const templateById = new Map(templates.map((template) => [template.id, template]));
  return (
    <ResponsiveFormOverlay.Root open onOpenChange={(open) => !open && setEditor(null)}>
      <ResponsiveFormOverlay.Content className="max-w-4xl">
        <form className="contents" onSubmit={onSubmit}>
          <ResponsiveFormOverlay.Header>
            <ResponsiveFormOverlay.Title>{editor.id ? editor.name : "Add speaker"}</ResponsiveFormOverlay.Title>
            <ResponsiveFormOverlay.Description>{editor.id ? "Profile, status, sessions, tasks, and portal access." : "Provision an unclaimed passwordless speaker identity."}</ResponsiveFormOverlay.Description>
          </ResponsiveFormOverlay.Header>
          <ResponsiveFormOverlay.Body>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <FieldGroup className="gap-4">
                {editor.headshotUrl ? <img src={editor.headshotUrl} alt={`${editor.name} headshot`} className="size-24 rounded-xl object-cover" /> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field><FieldLabel htmlFor="speaker-name">Name</FieldLabel><Input id="speaker-name" value={editor.name} onChange={(event) => set("name", event.target.value)} required /></Field>
                  <Field><FieldLabel htmlFor="speaker-email">Email</FieldLabel><Input id="speaker-email" type="email" value={editor.email} onChange={(event) => set("email", event.target.value)} disabled={Boolean(editor.id)} required /></Field>
                  <Field><FieldLabel htmlFor="speaker-title">Job title</FieldLabel><Input id="speaker-title" value={editor.jobTitle} onChange={(event) => set("jobTitle", event.target.value)} /></Field>
                  <Field><FieldLabel htmlFor="speaker-company">Company</FieldLabel><Input id="speaker-company" value={editor.company} onChange={(event) => set("company", event.target.value)} /></Field>
                  <Field><FieldLabel htmlFor="speaker-status">Status</FieldLabel><Select id="speaker-status" value={editor.status} onChange={(event) => set("status", event.target.value)}>{SPEAKER_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field>
                  <Field><FieldLabel htmlFor="speaker-headshot">Public headshot URL</FieldLabel><Input id="speaker-headshot" type="url" placeholder="https://cdn.example.com/photo.jpg" value={editor.headshotUrl} onChange={(event) => set("headshotUrl", event.target.value)} /><FieldDescription>HTTPS image visible to organizers and the speaker. Private Pylon uploads remain speaker-only.</FieldDescription></Field>
                </div>
                <Field><FieldLabel htmlFor="speaker-tagline">Tagline</FieldLabel><Input id="speaker-tagline" value={editor.tagline} onChange={(event) => set("tagline", event.target.value)} /></Field>
                <Field><FieldLabel htmlFor="speaker-bio">Bio</FieldLabel><Textarea id="speaker-bio" rows={6} value={editor.bio} onChange={(event) => set("bio", event.target.value)} /></Field>
                <Field><FieldLabel htmlFor="speaker-logistics">Travel and logistics</FieldLabel><Textarea id="speaker-logistics" rows={3} value={editor.logistics} onChange={(event) => set("logistics", event.target.value)} placeholder="Arrival, dietary, accessibility, or travel preferences" /></Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field><FieldLabel htmlFor="speaker-website">Website</FieldLabel><Input id="speaker-website" value={editor.website} onChange={(event) => set("website", event.target.value)} /></Field>
                  <Field><FieldLabel htmlFor="speaker-twitter">Twitter / X</FieldLabel><Input id="speaker-twitter" value={editor.twitter} onChange={(event) => set("twitter", event.target.value)} /></Field>
                  <Field><FieldLabel htmlFor="speaker-linkedin">LinkedIn</FieldLabel><Input id="speaker-linkedin" value={editor.linkedin} onChange={(event) => set("linkedin", event.target.value)} /></Field>
                </div>
              </FieldGroup>
              {profile ? (
                <div className="space-y-5 text-sm">
                  <DetailList title="Sessions" empty="No sessions assigned.">{sessions.map((session) => <div key={session.id}><div className="font-medium">{session.title}</div><div className="text-xs text-muted-foreground">{session.startTime ? new Date(session.startTime).toLocaleString() : "Unscheduled"}</div></div>)}</DetailList>
                  <DetailList title="Tasks" empty="No tasks assigned.">{tasks.map((task) => <div key={task.id} className="flex items-center justify-between gap-2"><div><div className="font-medium">{templateById.get(task.taskTemplateId)?.title ?? "Task"}</div><div className="text-xs text-muted-foreground">{templateById.get(task.taskTemplateId)?.dueAt ? `Due ${new Date(templateById.get(task.taskTemplateId)!.dueAt!).toLocaleDateString()}` : "No due date"}</div></div><DashboardStatusBadge status={task.status}>{task.status === "done" ? "Complete" : "Incomplete"}</DashboardStatusBadge></div>)}</DetailList>
                  <DetailList title="Private upload metadata" empty="No private uploads recorded.">{files.map((file) => <div key={file.id}><div className="font-medium">{file.label || file.kind}</div><div className="text-xs text-muted-foreground">Uploaded {new Date(file.createdAt).toLocaleString()} · bytes remain private to the speaker</div></div>)}</DetailList>
                  <Button type="button" variant="outline" className="w-full" onClick={() => onInvite(profile.id)}><Mail data-icon="inline-start" /> Send portal invite</Button>
                  {profile.invitedAt ? <p className="text-xs text-muted-foreground">Last invited {new Date(profile.invitedAt).toLocaleString()}</p> : null}
                </div>
              ) : null}
            </div>
          </ResponsiveFormOverlay.Body>
          <ResponsiveFormOverlay.Footer>
            <Button type="button" variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
            <Button type="submit" disabled={saving || !editor.name.trim() || !editor.email.trim()}>{saving ? "Saving…" : "Save speaker"}</Button>
          </ResponsiveFormOverlay.Footer>
        </form>
      </ResponsiveFormOverlay.Content>
    </ResponsiveFormOverlay.Root>
  );
}

function DetailList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3><div className="space-y-2 rounded-lg border p-3">{children.length ? children : <p className="text-xs text-muted-foreground">{empty}</p>}</div></section>;
}

function eventRows<T extends { eventId: string }>(hydrated: boolean, query: { loading: boolean; data: T[] }, initial: T[], eventId: string) {
  return (!hydrated || query.loading ? initial : query.data).filter((row) => row.eventId === eventId);
}

function compact(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value));
}

function label(value: string) {
  return value.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}

function speakerIds(session: SessionRow) {
  return Array.isArray(session.speakerUserIdsJson) ? session.speakerUserIdsJson : [];
}
