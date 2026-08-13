"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { callFn, db, dynamic } from "@pylonsync/react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  Pencil,
  PenLine,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardStatusBadge, DashboardWidePage } from "@/components/dashboard";
import type {
  EmailComposerContent,
  EmailComposerDocument,
  EmailComposerHandle,
  EmailComposerProps,
} from "@/components/email-composer";
import { EmailBlockRail, type MergeVariable } from "@/components/email-block-rail";
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
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DEFAULT_TEMPLATES,
  markdownToHtml,
  renderHtmlTemplate,
  renderTemplate,
} from "@/lib/email";
import { parseJson } from "@/lib/types";
import type { EmailLogRow, EmailTemplateRow, EventRow, SpeakerProfileRow } from "@/lib/types";

// The emails surface, Resend-style: a clean index (automated messages +
// delivery log) and a full-width document editor — From/Subject inline over a
// rich canvas with a floating block rail and merge variables. No stat cards,
// no tab maze.

const SAMPLE_VARS = {
  speaker_name: "Ada Speaker",
  event_name: "AI Engineer Summit",
  talk_title: "Building delightful realtime software",
  portal_link: "https://smolboard.app/portal",
  task_list: "• Upload headshot\n• Confirm session details",
  session_time: "Tuesday, Aug 11 at 10:00 AM PDT",
  room: "Main stage",
  calendar_links: "Google Calendar · Outlook · Download .ics",
};

const VARIABLES: MergeVariable[] = [
  { tag: "speaker_name", label: "Speaker name" },
  { tag: "event_name", label: "Event name" },
  { tag: "talk_title", label: "Talk title" },
  { tag: "portal_link", label: "Portal link" },
  { tag: "task_list", label: "Task list" },
  { tag: "session_time", label: "Session time" },
  { tag: "room", label: "Room" },
  { tag: "calendar_links", label: "Calendar links" },
];

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  portal_invite: "Invites a speaker into the portal after their first submission",
  submission_received: "Confirms a CFP submission landed",
  accepted: "Sent when a submission is accepted",
  rejected: "Sent when a submission is declined",
  task_reminder: "Nudges speakers with open tasks",
  schedule_invite: "Delivers session times and calendar links",
};

type View = { kind: "index" } | { kind: "template"; templateKey: string } | { kind: "compose" };

export function EmailsClient({
  event,
  fromAddress,
  initialTemplates,
  initialLogs,
  initialProfiles,
}: {
  event: EventRow;
  fromAddress: string;
  initialTemplates: EmailTemplateRow[];
  initialLogs: EmailLogRow[];
  initialProfiles: SpeakerProfileRow[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const templateQuery = db.useQuery<EmailTemplateRow>("EmailTemplate");
  const logQuery = db.useQuery<EmailLogRow>("EmailLog");
  const profileQuery = db.useQuery<SpeakerProfileRow>("SpeakerProfile");
  const templates = (!hydrated || templateQuery.loading ? initialTemplates : templateQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const logs = (!hydrated || logQuery.loading ? initialLogs : logQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const profiles = (!hydrated || profileQuery.loading ? initialProfiles : profileQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const [view, setView] = useState<View>({ kind: "index" });

  if (!hydrated) return <DashboardWidePage>{null}</DashboardWidePage>;

  if (view.kind === "template") {
    return (
      <TemplateEditor
        event={event}
        fromAddress={fromAddress}
        templateKey={view.templateKey}
        templates={templates}
        profiles={profiles}
        onBack={() => setView({ kind: "index" })}
      />
    );
  }
  if (view.kind === "compose") {
    return (
      <ComposeEditor
        event={event}
        fromAddress={fromAddress}
        profiles={profiles}
        onBack={() => setView({ kind: "index" })}
      />
    );
  }

  return (
    <EmailsIndex
      templates={templates}
      logs={logs}
      onOpenTemplate={(templateKey) => setView({ kind: "template", templateKey })}
      onCompose={() => setView({ kind: "compose" })}
    />
  );
}

/* ============================== Index ============================== */

function EmailsIndex({
  templates,
  logs,
  onOpenTemplate,
  onCompose,
}: {
  templates: EmailTemplateRow[];
  logs: EmailLogRow[];
  onOpenTemplate: (key: string) => void;
  onCompose: () => void;
}) {
  const sent = logs.filter((log) => log.status === "sent").length;
  const failed = logs.filter((log) => log.status === "failed").length;
  return (
    <DashboardWidePage>
      <div className="w-full">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Automated messages</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Sent for you as speakers move through the event. Click one to edit it.
            </p>
          </div>
          <Button type="button" onClick={onCompose}>
            <PenLine data-icon="inline-start" /> Compose
          </Button>
        </div>

        <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {DEFAULT_TEMPLATES.map((template) => {
            const saved = templates.find((row) => row.key === template.key);
            const enabled = saved?.enabled ?? true;
            return (
              <button
                key={template.key}
                type="button"
                onClick={() => onOpenTemplate(template.key)}
                className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${enabled ? "bg-emerald-500" : "bg-zinc-300"}`}
                  title={enabled ? "Enabled" : "Disabled"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {labelForKey(template.key)}
                  </span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {TEMPLATE_DESCRIPTIONS[template.key] ?? (saved?.subject || template.subject)}
                  </span>
                </span>
                {saved ? (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Customized
                  </span>
                ) : null}
                <Pencil className="size-3.5 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500" />
              </button>
            );
          })}
        </div>

        <div className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-foreground">Delivery log</h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {sent} delivered{failed > 0 ? ` · ${failed} failed` : ""}
            </span>
          </div>
          {logs.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              No emails have been sent for this event.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs
                    .slice()
                    .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))
                    .slice(0, 50)
                    .map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{log.toEmail}</TableCell>
                        <TableCell>
                          <div className="max-w-72 truncate font-medium">{log.subject}</div>
                          <div className="text-xs text-muted-foreground">
                            {labelForKey(log.templateKey ?? "custom")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DashboardStatusBadge status={log.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                          {new Date(log.sentAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </DashboardWidePage>
  );
}

// The rich-text composer carries @react-email/editor, tiptap and marked. Left
// as a static import it put all of that in this route's entry chunk, which the
// sidebar then warmed on every dashboard page: 1,048,999 bytes brotli of editor
// downloaded whether or not anyone opened a template. Deferred, it arrives on
// the render that mounts it, which is the first time someone edits.
//
// Module level on purpose. A dynamic() per render is a new component type each
// time and would remount the editor on every keystroke.
//
// ssr: false is the default and the right one here: the server renders the
// skeleton, the first client render renders the skeleton, so there is nothing
// for hydration to disagree about.
const EmailComposer = dynamic<EmailComposerProps & { ref?: React.Ref<EmailComposerHandle> }>(
  () => import("@/components/email-composer").then((m) => m.EmailComposer),
  { loading: () => <ComposerSkeleton /> },
);

function ComposerSkeleton() {
  return (
    <div className="animate-pulse space-y-3 py-2" aria-busy="true">
      <span className="sr-only">Loading the editor</span>
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-4 w-full rounded bg-muted" />
      <div className="h-4 w-5/6 rounded bg-muted" />
      <div className="h-32 w-full rounded bg-muted" />
    </div>
  );
}

/* ============================ Editor shell ============================ */

function EditorShell({
  onBack,
  title,
  controls,
  aboveCanvas,
  from,
  subject,
  onSubjectChange,
  composerRef,
  editorContent,
  initialDocument,
  onDocumentChange,
  onReadyChange,
  editorReady,
  editorKey,
  preview,
  onUploadImage,
}: {
  onBack: () => void;
  title: string;
  controls: React.ReactNode;
  aboveCanvas?: React.ReactNode;
  from: string;
  subject: string;
  onSubjectChange: (value: string) => void;
  composerRef: React.RefObject<EmailComposerHandle | null>;
  editorContent: EmailComposerContent;
  initialDocument: EmailComposerDocument;
  onDocumentChange: (document: EmailComposerDocument) => void;
  onReadyChange: (ready: boolean) => void;
  editorReady: boolean;
  editorKey: string;
  preview: { subject: string; html: string } | null;
  onUploadImage: (file: File) => Promise<{ url: string }>;
}) {
  return (
    <DashboardWidePage>
      <div className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> {title}
          </button>
          <div className="flex items-center gap-2">{controls}</div>
        </div>

        {aboveCanvas}

        <div className="mt-4 flex items-start gap-3">
          <div className="sticky top-4 hidden md:block">
            <EmailBlockRail
              composer={composerRef}
              variables={VARIABLES}
              disabled={!editorReady}
              onUploadImage={onUploadImage}
            />
          </div>

          <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            {preview ? (
              <>
                <div className="border-b border-border px-6 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Preview
                  </p>
                  <p className="mt-1 text-[15px] font-semibold text-foreground">
                    {preview.subject || "No subject"}
                  </p>
                </div>
                <iframe
                  title="Email preview"
                  className="h-[560px] w-full bg-white"
                  sandbox=""
                  srcDoc={preview.html}
                />
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-zinc-100 px-6 py-2.5 text-[13px]">
                  <span className="w-14 shrink-0 text-muted-foreground">From</span>
                  <span className="truncate text-muted-foreground">{from}</span>
                </div>
                <div className="flex items-center gap-3 border-b border-zinc-100 px-6 py-1.5 text-[13px]">
                  <label htmlFor="email-subject" className="w-14 shrink-0 text-muted-foreground">
                    Subject
                  </label>
                  <input
                    id="email-subject"
                    value={subject}
                    onChange={(event) => onSubjectChange(event.target.value)}
                    placeholder="Subject"
                    className="h-8 w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:font-normal placeholder:text-zinc-400"
                  />
                </div>
                <div className="px-6 py-4">
                  <EmailComposer
                    key={editorKey}
                    ref={composerRef}
                    frameless
                    content={editorContent}
                    initialDocument={initialDocument}
                    onDocumentChange={onDocumentChange}
                    onReadyChange={onReadyChange}
                    onUploadImage={onUploadImage}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        {!preview && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Type <span className="font-mono">/</span> for blocks — or use the rail on the left.
            Variables like {"{{speaker_name}}"} fill in per recipient.
          </p>
        )}
      </div>
    </DashboardWidePage>
  );
}

/* ===================== Image upload (shared) ===================== */

// EmailEditor hands us a File; the server action pushes it to the stack0 CDN
// and returns a public URL that email clients can fetch forever.
function makeImageUploader(eventId: string) {
  return async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return callFn<{ url: string }>("uploadEmailImage", {
      eventId,
      filename: file.name,
      mimeType: file.type,
      dataBase64: btoa(binary),
    });
  };
}

/* ======================= Preview-as (shared) ======================= */

function usePreviewVars(event: EventRow, profiles: SpeakerProfileRow[]) {
  const [previewProfileId, setPreviewProfileId] = useState("");
  const profile = profiles.find((row) => row.id === previewProfileId) ?? profiles[0];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const vars = {
    ...SAMPLE_VARS,
    event_name: event.name,
    portal_link: `${origin}/portal`,
    ...(profile ? { speaker_name: profile.name } : {}),
  };
  const selector =
    profiles.length > 0 ? (
      <Select
        aria-label="Preview as"
        value={profile?.id ?? ""}
        onChange={(event_) => setPreviewProfileId(event_.target.value)}
        className="h-8 w-44 text-[13px]"
      >
        {profiles.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </Select>
    ) : null;
  return { vars, selector };
}

/* ========================= Template editor ========================= */

function TemplateEditor({
  event,
  fromAddress,
  templateKey,
  templates,
  profiles,
  onBack,
}: {
  event: EventRow;
  fromAddress: string;
  templateKey: string;
  templates: EmailTemplateRow[];
  profiles: SpeakerProfileRow[];
  onBack: () => void;
}) {
  const effective = templateValue(templateKey, templates);
  const editorKey = `${templateKey}:${effective.id ?? "default"}`;
  const composerRef = useRef<EmailComposerHandle>(null);
  const [subject, setSubject] = useState(effective.subject);
  const [document, setDocument] = useState(() => templateDocument(effective));
  const [enabled, setEnabled] = useState(effective.enabled);
  const [editorReady, setEditorReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Editing here is explicit-save on purpose: an enabled template can be sent
  // by a queued email at any moment, so autosaving would put half-written copy
  // in front of a speaker. That makes losing the work the risk instead, and
  // Back used to discard it silently, including an image already uploaded into
  // the body.
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Compared against what is actually stored, not set by an event: the
  // composer emits onDocumentChange while it initialises, so a flag flipped
  // there claimed unsaved work the moment a template was opened and prompted
  // on the way out of an editor nobody had touched.
  // Baseline is the composer's OWN export of the unedited template, taken once
  // it is ready. Comparing against the stored template text instead reported
  // dirty on mount, because the editor round-trips markup into a form that is
  // equivalent but not byte-identical.
  const saved = useRef<{ subject: string; enabled: boolean; text: string } | null>(null);
  const editorContent = useMemo(() => templateEditorContent(effective), [editorKey]);
  const { vars, selector } = usePreviewVars(event, profiles);
  const uploadImage = useMemo(() => makeImageUploader(event.id), [event.id]);

  useEffect(() => {
    if (!editorReady) return;
    let cancelled = false;
    void composerRef.current?.exportDocument().then((doc) => {
      if (!cancelled && doc) saved.current = { subject, enabled, text: doc.text };
    });
    return () => {
      cancelled = true;
    };
    // Baseline is per template; subject/enabled are read at capture time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorReady, editorKey]);

  async function saveTemplate(notify = true) {
    setSaving(true);
    try {
      const nextDocument = await composerRef.current?.exportDocument();
      if (!nextDocument?.text.trim()) {
        toast.error("Add some email content before saving.");
        return false;
      }
      setDocument(nextDocument);
      saved.current = { subject, enabled, text: nextDocument.text };
      const existing = templates.find((row) => row.key === templateKey);
      const fields = {
        subject,
        body: nextDocument.text,
        bodyHtml: nextDocument.html,
        bodyJson: nextDocument.json,
        enabled,
      };
      if (existing) await db.update("EmailTemplate", existing.id, fields);
      else await db.insert("EmailTemplate", { orgId: event.orgId, eventId: event.id, key: templateKey, ...fields });
      if (notify) toast.success("Template saved");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the template.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!(await saveTemplate(false))) return;
    try {
      const result = await callFn<{ queued: boolean; toEmail: string }>("sendTestEmail", {
        eventId: event.id,
        templateKey,
      });
      toast.success("Test email queued", { description: result.toEmail });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the test email.");
    }
  }

  // Until the baseline exists there is nothing to compare, so nothing is dirty.
  const dirty = saved.current
    ? subject !== saved.current.subject ||
      enabled !== saved.current.enabled ||
      document.text !== saved.current.text
    : false;

  return (
    <>
    <EditorShell
      onBack={() => (dirty ? setConfirmLeave(true) : onBack())}
      title="Messages"
      controls={
        <>
          {showPreview ? selector : null}
          <label className="mr-1 flex items-center gap-2 text-[13px] text-muted-foreground">
            Enabled
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreview((current) => !current)}
          >
            {showPreview ? <Pencil data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
            {showPreview ? "Edit" : "Preview"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={sendTest} disabled={saving || !editorReady}>
            <Send data-icon="inline-start" /> Send test
          </Button>
          {dirty && !saving ? (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={() => void saveTemplate()}
            disabled={saving || !editorReady || !subject.trim()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
      aboveCanvas={
        <p className="mt-3 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">{labelForKey(templateKey)}</span>
          {TEMPLATE_DESCRIPTIONS[templateKey] ? ` — ${TEMPLATE_DESCRIPTIONS[templateKey]}.` : null}
        </p>
      }
      from={fromAddress}
      subject={subject}
      onSubjectChange={setSubject}
      composerRef={composerRef}
      editorContent={editorContent}
      initialDocument={templateDocument(effective)}
      onDocumentChange={setDocument}
      onReadyChange={setEditorReady}
      editorReady={editorReady}
      editorKey={editorKey}
      onUploadImage={uploadImage}
      preview={
        showPreview
          ? { subject: renderTemplate(subject, vars), html: renderHtmlTemplate(document.html, vars) }
          : null
      }
    />
    <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          <AlertDialogDescription>
            Your changes to this template have not been saved, including any image you uploaded
            into it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              if (await saveTemplate()) onBack();
            }}
          >
            Save and leave
          </AlertDialogAction>
          <AlertDialogAction variant="destructive" onClick={onBack}>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

/* ========================== Compose editor ========================== */

const COMPOSE_DEFAULT_BODY =
  "<p>Hi {{speaker_name}},</p><p>Welcome to {{event_name}}. We’re excited to have you join us. Your profile, sessions, and onboarding tasks are available in the speaker portal:</p><p>{{portal_link}}</p>";

function ComposeEditor({
  event,
  fromAddress,
  profiles,
  onBack,
}: {
  event: EventRow;
  fromAddress: string;
  profiles: SpeakerProfileRow[];
  onBack: () => void;
}) {
  const composerRef = useRef<EmailComposerHandle>(null);
  const [subject, setSubject] = useState(`Welcome to ${event.name} speakers`);
  const [document, setDocument] = useState<EmailComposerDocument>({
    text: "",
    html: COMPOSE_DEFAULT_BODY,
    json: "",
  });
  const [editorReady, setEditorReady] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [armed, setArmed] = useState(false);
  const [sending, setSending] = useState(false);
  const { vars, selector } = usePreviewVars(event, profiles);
  const uploadImage = useMemo(() => makeImageUploader(event.id), [event.id]);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(timer);
  }, [armed]);

  async function send() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setSending(true);
    try {
      const exported = await composerRef.current?.exportDocument();
      if (!exported?.text.trim()) {
        toast.error("Write the email before sending.");
        return;
      }
      const result = await callFn<{ queued: number }>("queueSpeakerEmail", {
        eventId: event.id,
        profileIds: selected,
        subject,
        body: exported.text,
        bodyHtml: exported.html,
        confirmed: true,
      });
      toast.success(`Queued ${result.queued} email${result.queued === 1 ? "" : "s"}`);
      onBack();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the email.");
    } finally {
      setArmed(false);
      setSending(false);
    }
  }

  return (
    <EditorShell
      onBack={onBack}
      title="Messages"
      controls={
        <>
          {showPreview ? selector : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreview((current) => !current)}
          >
            {showPreview ? <Pencil data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
            {showPreview ? "Edit" : "Preview"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={armed ? "destructive" : "default"}
            onClick={() => void send()}
            disabled={sending || !editorReady || selected.length === 0 || !subject.trim()}
          >
            <Send data-icon="inline-start" />
            {sending
              ? "Queueing…"
              : armed
                ? `Confirm send to ${selected.length}`
                : `Send to ${selected.length} speaker${selected.length === 1 ? "" : "s"}`}
          </Button>
        </>
      }
      aboveCanvas={
        <RecipientRow
          profiles={profiles}
          selected={selected}
          onChange={(next) => {
            setSelected(next);
            setArmed(false);
          }}
        />
      }
      from={fromAddress}
      subject={subject}
      onSubjectChange={setSubject}
      composerRef={composerRef}
      editorContent={COMPOSE_DEFAULT_BODY}
      initialDocument={document}
      onDocumentChange={setDocument}
      onReadyChange={setEditorReady}
      editorReady={editorReady}
      editorKey="compose"
      onUploadImage={uploadImage}
      preview={
        showPreview
          ? { subject: renderTemplate(subject, vars), html: renderHtmlTemplate(document.html, vars) }
          : null
      }
    />
  );
}

/* ========================== Recipient row ========================== */

function RecipientRow({
  profiles,
  selected,
  onChange,
}: {
  profiles: SpeakerProfileRow[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const filtered = profiles.filter((profile) => {
    const needle = search.trim().toLowerCase();
    return (
      !needle ||
      profile.name.toLowerCase().includes(needle) ||
      profile.email.toLowerCase().includes(needle)
    );
  });
  const selectedProfiles = profiles.filter((profile) => selected.includes(profile.id));

  return (
    <div ref={rootRef} className="relative mt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full flex-wrap items-center gap-1.5 rounded-xl border border-border bg-white px-4 py-2 text-left text-[13px]"
      >
        <span className="mr-1 text-muted-foreground">To</span>
        {selectedProfiles.length === 0 ? (
          <span className="text-zinc-400">Choose speakers…</span>
        ) : (
          selectedProfiles.slice(0, 6).map((profile) => (
            <span
              key={profile.id}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
            >
              {profile.name}
              <X
                className="size-3 text-zinc-400 hover:text-zinc-700"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(selected.filter((id) => id !== profile.id));
                }}
              />
            </span>
          ))
        )}
        {selectedProfiles.length > 6 ? (
          <span className="text-xs text-muted-foreground">+{selectedProfiles.length - 6} more</span>
        ) : null}
        <ChevronDown className="ml-auto size-3.5 shrink-0 text-zinc-400" />
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-border bg-white p-2 shadow-[0_2px_6px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search speakers…"
              className="h-8"
              aria-label="Search recipients"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => onChange([...new Set([...selected, ...filtered.map((p) => p.id)])])}
            >
              Add all ({filtered.length})
            </Button>
            {selected.length > 0 ? (
              <Button type="button" size="sm" variant="ghost" className="shrink-0" onClick={() => onChange([])}>
                Clear
              </Button>
            ) : null}
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto">
            {filtered.map((profile) => {
              const checked = selected.includes(profile.id);
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() =>
                    onChange(
                      checked
                        ? selected.filter((id) => id !== profile.id)
                        : [...selected, profile.id],
                    )
                  }
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-muted/60"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                      checked ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300"
                    }`}
                  >
                    {checked ? <Check className="size-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{profile.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{profile.email}</span>
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">No speakers match.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ============================= Helpers ============================= */

function templateValue(key: string, custom: EmailTemplateRow[]) {
  const saved = custom.find((row) => row.key === key);
  const fallback = DEFAULT_TEMPLATES.find((row) => row.key === key)!;
  return {
    id: saved?.id,
    subject: saved?.subject ?? fallback.subject,
    body: saved?.body ?? fallback.body,
    bodyHtml: saved?.bodyHtml,
    bodyJson: saved?.bodyJson,
    enabled: saved?.enabled ?? true,
  };
}

function templateDocument(template: ReturnType<typeof templateValue>): EmailComposerDocument {
  return {
    text: template.body,
    html: template.bodyHtml ?? markdownToHtml(template.body),
    json: template.bodyJson ?? "",
  };
}

function templateEditorContent(template: ReturnType<typeof templateValue>): EmailComposerContent {
  if (template.bodyJson) {
    try {
      return parseJson<EmailComposerContent>(template.bodyJson) as EmailComposerContent;
    } catch {
      // A malformed legacy document should still open through its HTML export.
    }
  }
  return template.bodyHtml ?? markdownToHtml(template.body);
}

function labelForKey(key: string) {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
