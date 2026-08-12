"use client";

import React, { useEffect, useState } from "react";
import { callFn, db } from "@pylonsync/react";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { sendMagicLink, verifyMagicLink, useAuth } from "@pylonsync/client";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { ResponsiveFormOverlay } from "@/components/responsive-overlay";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormRenderer } from "@/components/form-renderer";
import { SyncHeartbeat } from "@/components/sync-heartbeat";
import { Markdown } from "@/components/markdown";
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  LogOut,
  Loader2,
  Pencil,
} from "lucide-react";
import { fieldsOf, parseJson } from "@/lib/types";
import { taskCompletion, taskDueState } from "@/lib/tasks";
import { latestVersion, taskSlot, versionsForSlot } from "@/lib/deliverables";
import { uploadFileDirect } from "@/lib/direct-upload";
import { formatSessionTime } from "@/lib/ics";
import type { PortalSession } from "@/lib/portal";
import { pruneAnswers, validateAnswers, type Answers } from "@/lib/forms";
import { cfpWindowState } from "@/lib/cfp-window";
import type {
  EventRow,
  OrgRow,
  DeliverableCommentRow,
  DeliverableSlotRow,
  DeliverableVersionRow,
  SpeakerFileRow,
  SpeakerProfileRow,
  SpeakerTaskRow,
  SubmissionFormRow,
  SubmissionDraftRow,
  SubmissionRow,
  TaskTemplateRow,
} from "@/lib/types";

const inputCls =
  "h-8 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13px] text-zinc-900 outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10";

/* ============================= Login ============================= */

// Passwordless: email → 6-digit code → session. The account already exists if
// the speaker ever submitted a CFP; verify also auto-creates one, so this
// screen never dead-ends.
export function PortalLogin() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendMagicLink(email.trim().toLowerCase());
      setStage("code");
    } catch {
      setError("Couldn't send a code. Check the address and try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyMagicLink(email.trim().toLowerCase(), code.trim());
      window.location.reload();
    } catch {
      setError("That code didn't work. It may have expired, so request a new one.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <BrandMark size={40} className="mx-auto" />
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-zinc-900">
            Speaker portal
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign in with the email you used to submit. No password — we email you a
            code.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          {stage === "email" ? (
            <form onSubmit={sendCode} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Email</span>
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                />
              </label>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <Button type="submit" disabled={busy || !email.trim()} className="w-full">
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Email me a code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-3">
              <p className="text-sm text-zinc-600">
                We sent a 6-digit code to <span className="font-medium">{email}</span>.
              </p>
              <input
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                aria-label="Sign-in code"
                className={inputCls + " text-center text-lg tracking-[0.4em]"}
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStage("email");
                  setCode("");
                  setError(null);
                }}
                className="w-full text-center text-xs font-medium text-zinc-400 hover:text-zinc-700"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================= Home ============================= */

function statusTone(status: string) {
  switch (status) {
    case "accepted":
      return "bg-emerald-50 text-emerald-600";
    case "rejected":
      return "bg-red-50 text-red-500";
    case "waitlisted":
      return "bg-amber-50 text-amber-700";
    case "withdrawn":
      return "bg-zinc-100 text-zinc-400";
    default:
      return "bg-blue-50 text-blue-600";
  }
}
function statusLabel(status: string) {
  return status === "submitted" ? "in review" : status.replace("_", " ");
}

export function PortalHome({
  userId,
  email,
  initialProfiles,
  initialSubmissions,
  initialDrafts,
  initialTasks,
  initialTemplates,
  initialFiles,
  initialForms,
  initialDeliverableSlots,
  initialDeliverableVersions,
  initialDeliverableComments,
  events,
  orgs,
  participantClaim,
}: {
  userId: string;
  email: string;
  initialProfiles: SpeakerProfileRow[];
  initialSubmissions: SubmissionRow[];
  initialDrafts: SubmissionDraftRow[];
  initialTasks: SpeakerTaskRow[];
  initialTemplates: TaskTemplateRow[];
  initialFiles: SpeakerFileRow[];
  initialForms: SubmissionFormRow[];
  initialDeliverableSlots: DeliverableSlotRow[];
  initialDeliverableVersions: DeliverableVersionRow[];
  initialDeliverableComments: DeliverableCommentRow[];
  events: EventRow[];
  orgs: OrgRow[];
  participantClaim?: { inviteId: string; token: string };
}) {
  const { signOut } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [sessions, setSessions] = useState<PortalSession[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
  useEffect(() => {
    setHydrated(true);
    for (const profile of initialProfiles) {
      if (profile.claimStatus !== "claimed") {
        void callFn("claimSpeakerProfile", {
          profileId: profile.id,
          expectedProvisionalUserId: userId,
        });
      }
    }
    if (participantClaim) {
      void callFn("claimSubmissionParticipant", {
        inviteId: participantClaim.inviteId,
        token: participantClaim.token,
        expectedProvisionalUserId: userId,
      }).then(() => setClaimNotice("Participant invitation claimed. The primary presenter can now finalize the submission."))
        .catch((error) => setClaimNotice(error instanceof Error ? error.message : "Could not claim this participant invitation."));
    }
    let active = true;
    callFn("getMySchedule", {})
      .then((result) => {
        if (active) setSessions((result as { sessions: PortalSession[] }).sessions);
      })
      .catch(() => {
        if (active) setSessions([]);
      })
      .finally(() => {
        if (active) setScheduleLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  // Live: status flips (accepted!) appear without a refresh.
  const subsQ = db.useQuery<SubmissionRow>("Submission");
  const draftQ = db.useQuery<SubmissionDraftRow>("SubmissionDraft");
  const profQ = db.useQuery<SpeakerProfileRow>("SpeakerProfile");
  const taskQ = db.useQuery<SpeakerTaskRow>("SpeakerTask");
  const templateQ = db.useQuery<TaskTemplateRow>("TaskTemplate");
  const fileQ = db.useQuery<SpeakerFileRow>("SpeakerFile");
  const formQ = db.useQuery<SubmissionFormRow>("SubmissionForm");
  const slotQ = db.useQuery<DeliverableSlotRow>("DeliverableSlot");
  const versionQ = db.useQuery<DeliverableVersionRow>("DeliverableVersion");
  const commentQ = db.useQuery<DeliverableCommentRow>("DeliverableComment");
  const submissions =
    !hydrated || subsQ.loading
      ? initialSubmissions
      : subsQ.data.filter((s) => s.speakerUserId === userId);
  const drafts = !hydrated || draftQ.loading
    ? initialDrafts
    : draftQ.data.filter((draft) => draft.ownerUserId === userId);
  const profiles =
    !hydrated || profQ.loading
      ? initialProfiles
      : profQ.data.filter((p) => p.userId === userId);
  const tasks =
    !hydrated || taskQ.loading
      ? initialTasks
      : taskQ.data.filter((task) => task.speakerUserId === userId);
  const templates = !hydrated || templateQ.loading ? initialTemplates : templateQ.data;
  const files =
    !hydrated || fileQ.loading
      ? initialFiles
      : fileQ.data.filter((file) => file.userId === userId);
  const forms = !hydrated || formQ.loading ? initialForms : formQ.data;
  const deliverableSlots = (!hydrated || slotQ.loading ? initialDeliverableSlots : slotQ.data).filter(
    (slot) => slot.speakerUserId === userId,
  );
  const deliverableVersions = (!hydrated || versionQ.loading ? initialDeliverableVersions : versionQ.data).filter(
    (version) => version.speakerUserId === userId,
  );
  const deliverableComments = (!hydrated || commentQ.loading ? initialDeliverableComments : commentQ.data).filter(
    (comment) => comment.speakerUserId === userId,
  );

  const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? "Event";

  async function onSignOut() {
    await signOut();
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-zinc-900">
            <BrandMark size={18} /> Speaker portal
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-400 sm:block">{email}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-800"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <SyncHeartbeat />
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        {claimNotice ? <p className="rounded-lg border bg-white p-4 text-sm">{claimNotice}</p> : null}
        <ScheduleSection sessions={sessions} loading={scheduleLoading} />
        <ResourcesSection />

        {drafts.some((draft) => draft.lifecycle === "draft") ? (
          <section>
            <h2 className="text-sm font-semibold text-zinc-900">Your CFP drafts</h2>
            <ul className="mt-3 divide-y rounded-xl border bg-white">
              {drafts.filter((draft) => draft.lifecycle === "draft").map((draft) => {
                const form = forms.find((candidate) => candidate.id === draft.formId);
                const event = events.find((candidate) => candidate.id === draft.eventId);
                const org = event ? orgs.find((candidate) => candidate.id === event.orgId) : undefined;
                const href = form && event && org?.slug ? `/${org.slug}/${event.slug}/cfp/${form.slug}` : "/portal";
                return <li key={draft.id} className="flex items-center justify-between gap-4 px-5 py-4"><span className="truncate text-sm font-medium">{draft.title}</span><Button asChild size="sm" variant="outline"><a href={href}>Resume</a></Button></li>;
              })}
            </ul>
          </section>
        ) : null}

        {submissions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
            <p className="text-sm font-medium text-zinc-700">No submissions yet</p>
            <p className="mt-1 text-sm text-zinc-400">
              Submit to an open call for speakers and it will show up here.
            </p>
            {(() => {
              const openForms = forms.filter((form) => form.status === "open");
              const formsPerEvent = new Map<string, number>();
              for (const form of openForms) {
                formsPerEvent.set(form.eventId, (formsPerEvent.get(form.eventId) ?? 0) + 1);
              }
              const openCalls = openForms
                .map((form) => {
                  const event = events.find((candidate) => candidate.id === form.eventId);
                  const org = event ? orgs.find((candidate) => candidate.id === event.orgId) : undefined;
                  // Two open forms on one event would render identical labels —
                  // qualify with the form name when it's ambiguous.
                  const name =
                    event && (formsPerEvent.get(form.eventId) ?? 0) > 1
                      ? `${event.name} · ${form.name}`
                      : event?.name ?? "";
                  return event && event.cfpStatus === "open" && org?.slug
                    ? { key: form.id, name, href: `/${org.slug}/${event.slug}/cfp/${form.slug}` }
                    : null;
                })
                .filter((call): call is NonNullable<typeof call> => call !== null)
                .slice(0, 3);
              return openCalls.length > 0 ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {openCalls.map((call) => (
                    <Button key={call.key} asChild size="sm" variant="outline">
                      <a href={call.href}>Submit to {call.name}</a>
                    </Button>
                  ))}
                </div>
              ) : null;
            })()}
          </div>
        ) : (
          <section>
            <h2 className="text-sm font-semibold text-zinc-900">Your submissions</h2>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
              {submissions
                .slice()
                .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
                .map((s) => {
                  const form = forms.find((candidate) => candidate.id === s.formId);
                  const event = events.find((candidate) => candidate.id === s.eventId);
                  const editable = Boolean(form && event && cfpWindowState({
                    eventStatus: event.cfpStatus,
                    formStatus: form.status,
                    opensAt: form.opensAt,
                    closesAt: form.closesAt,
                  }) === "open");
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-zinc-900">
                          {s.title}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-400">
                          {eventName(s.eventId)}
                        </div>
                      </div>
                      <span
                        className={
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize " +
                          statusTone(s.status)
                        }
                      >
                        {statusLabel(s.status)}
                      </span>
                      {editable && form ? (
                        <SubmissionEditor submission={s} form={form} />
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </section>
        )}

        {profiles.map((p) => (
          <React.Fragment key={p.id}>
            <TaskChecklist
              eventName={eventName(p.eventId)}
              tasks={tasks.filter((task) => task.eventId === p.eventId)}
              templates={templates.filter((template) => template.eventId === p.eventId)}
              files={files.filter((file) => file.eventId === p.eventId)}
              slots={deliverableSlots.filter((slot) => slot.eventId === p.eventId)}
              versions={deliverableVersions.filter((version) => version.eventId === p.eventId)}
              comments={deliverableComments.filter((comment) => comment.eventId === p.eventId)}
            />
            <ProfileEditor profile={p} eventName={eventName(p.eventId)} />
            <SpeakerFiles profile={p} files={files.filter((file) => file.eventId === p.eventId)} />
          </React.Fragment>
        ))}
      </main>
      <footer className="mx-auto flex max-w-3xl items-center justify-center gap-1.5 px-6 pb-10 text-xs text-zinc-400">
        <BrandMark size={14} />
        <a href="/" className="transition-colors hover:text-zinc-900">
          Powered by smolboard
        </a>
      </footer>
    </div>
  );
}

// Reference pages the organizer published for this speaker's events. Fetched
// through a function rather than a live query: PortalResource reads are scoped
// to organizers, and getPortalResources filters to published pages for events
// this speaker is actually on.
function ResourcesSection() {
  const [resources, setResources] = useState<
    { id: string; eventName: string; title: string; body: string | null; embedUrl: string | null }[]
  >([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    callFn<{ resources: typeof resources }>("getPortalResources", {})
      .then((res) => alive && setResources(res.resources ?? []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (resources.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-900">Resources</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Reference material from the organizers.
      </p>
      <ul className="mt-3 divide-y rounded-xl border bg-white">
        {resources.map((resource) => {
          const open = openId === resource.id;
          return (
            <li key={resource.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : resource.id)}
                aria-expanded={open}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-900">
                    {resource.title}
                  </span>
                  <span className="block truncate text-xs text-zinc-400">{resource.eventName}</span>
                </span>
                <span className="text-xs text-zinc-400">{open ? "Hide" : "Open"}</span>
              </button>
              {open ? (
                <div className="space-y-3 border-t px-4 py-4">
                  {resource.body ? (
                    <Markdown className="text-[13.5px] text-zinc-700">{resource.body}</Markdown>
                  ) : null}
                  {resource.embedUrl ? (
                    // Sandboxed, and the src is allowlisted server-side. The
                    // frame gets no same-origin access, so embedded material
                    // can't reach this speaker's session.
                    <iframe
                      src={resource.embedUrl}
                      title={resource.title}
                      loading="lazy"
                      sandbox="allow-scripts allow-popups allow-forms"
                      referrerPolicy="no-referrer"
                      className="aspect-video w-full rounded-lg border bg-zinc-50"
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ScheduleSection({
  sessions,
  loading,
}: {
  sessions: PortalSession[];
  loading: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-900">Your schedule</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {loading ? (
          <div className="flex items-center gap-2 px-5 py-4 text-sm text-zinc-400">
            <Loader2 className="size-4 animate-spin" /> Loading schedule…
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-4">
            <span className="flex size-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400">
              <CalendarDays className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-700">Nothing scheduled yet</p>
              <p className="text-xs text-zinc-400">Confirmed session times will appear here.</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-start gap-3 px-5 py-4">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
                  <CalendarDays className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900">{session.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatSessionTime(
                      session.startTime,
                      session.endTime,
                      session.timezone,
                    )}
                    {session.roomName ? ` · ${session.roomName}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">{session.eventName}</p>
                </div>
                {session.schedulePublished && session.orgSlug ? (
                  <Button asChild type="button" size="sm" variant="ghost">
                    <a href={`/${session.orgSlug}/${session.eventSlug}#schedule`}>
                      View <ExternalLink data-icon="inline-end" />
                    </a>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SubmissionEditor({
  submission,
  form,
}: {
  submission: SubmissionRow;
  form: SubmissionFormRow;
}) {
  const fields = fieldsOf(form);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(submission.title);
  const [abstract, setAbstract] = useState(submission.abstract ?? "");
  const [answers, setAnswers] = useState<Answers>(
    () => parseJson<Answers>(submission.answersJson) ?? {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const pruned = pruneAnswers(fields, answers);
    const validation = validateAnswers(fields, pruned);
    if (!title.trim()) {
      setError("A talk title is required.");
      return;
    }
    if (validation.length > 0) {
      setError(validation.map((item) => item.message).join(" "));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callFn("updateMySubmission", {
        submissionId: submission.id,
        title: title.trim(),
        abstract: abstract.trim() || undefined,
        answers: pruned,
      });
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your submission.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Edit ${submission.title}`}
        onClick={() => setOpen(true)}
      >
        <Pencil />
      </Button>
      <ResponsiveFormOverlay.Root open={open} onOpenChange={setOpen}>
        <ResponsiveFormOverlay.Content className="max-w-2xl">
          <form onSubmit={save} className="contents">
            <ResponsiveFormOverlay.Header icon={Pencil}>
              <ResponsiveFormOverlay.Title>Edit submission</ResponsiveFormOverlay.Title>
              <ResponsiveFormOverlay.Description>
                Changes are allowed while the call for speakers is open.
              </ResponsiveFormOverlay.Description>
            </ResponsiveFormOverlay.Header>
            <ResponsiveFormOverlay.Body>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor={`submission-title-${submission.id}`}>
                    Talk title
                  </FieldLabel>
                  <Input
                    id={`submission-title-${submission.id}`}
                    value={title}
                    maxLength={200}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`submission-abstract-${submission.id}`}>
                    Abstract
                  </FieldLabel>
                  <Textarea
                    id={`submission-abstract-${submission.id}`}
                    value={abstract}
                    rows={5}
                    onChange={(event) => setAbstract(event.target.value)}
                  />
                </Field>
                {fields.length > 0 ? (
                  <FormRenderer fields={fields} answers={answers} onChange={setAnswers} />
                ) : null}
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </FieldGroup>
            </ResponsiveFormOverlay.Body>
            <ResponsiveFormOverlay.Footer>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !title.trim()}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </ResponsiveFormOverlay.Footer>
          </form>
        </ResponsiveFormOverlay.Content>
      </ResponsiveFormOverlay.Root>
    </>
  );
}

/* ========================= Task checklist ========================= */

function TaskChecklist({
  eventName,
  tasks,
  templates,
  files,
  slots,
  versions,
  comments,
}: {
  eventName: string;
  tasks: SpeakerTaskRow[];
  templates: TaskTemplateRow[];
  files: SpeakerFileRow[];
  slots: DeliverableSlotRow[];
  versions: DeliverableVersionRow[];
  comments: DeliverableCommentRow[];
}) {
  if (tasks.length === 0) return null;
  const completion = taskCompletion(tasks);
  const templateById = new Map(templates.map((template) => [template.id, template]));
  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Onboarding · {eventName}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Complete these before the event team’s deadlines.</p>
        </div>
        <span className="text-xs tabular-nums text-zinc-500">{completion.done}/{completion.total}</span>
      </div>
      <Progress value={completion.percent} className="mt-3" aria-label={`${completion.percent}% complete`} />
      <div className="mt-3 flex flex-col gap-3">
        {tasks
          .slice()
          .sort((a, b) => {
            const aTemplate = templateById.get(a.taskTemplateId);
            const bTemplate = templateById.get(b.taskTemplateId);
            return (aTemplate?.sortOrder ?? 0) - (bTemplate?.sortOrder ?? 0);
          })
          .map((task) => {
            const template = templateById.get(task.taskTemplateId);
            return template ? (
              <SpeakerTaskItem
                key={task.id}
                task={task}
                template={template}
                files={files}
                slots={slots}
                versions={versions}
                comments={comments}
              />
            ) : null;
          })}
      </div>
    </section>
  );
}

function SpeakerTaskItem({
  task,
  template,
  files,
  slots,
  versions,
  comments,
}: {
  task: SpeakerTaskRow;
  template: TaskTemplateRow;
  files: SpeakerFileRow[];
  slots: DeliverableSlotRow[];
  versions: DeliverableVersionRow[];
  comments: DeliverableCommentRow[];
}) {
  const [answers, setAnswers] = useState<Answers>(() => parseJson<Answers>(task.responseJson) ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = task.status === "done";
  const due = taskDueState(task, template);
  const neededFileKind = template.target || "document";
  const slot = taskSlot(slots, task.id);
  const taskVersions = slot ? versionsForSlot(versions, slot.id) : [];
  const hasUpload = Boolean(slot && latestVersion(versions, slot.id));

  async function setComplete(completed: boolean) {
    setBusy(true);
    setError(null);
    try {
      await callFn("completeTask", { taskId: task.id, completed, response: answers });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${complete ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-400"}`}>
          <CheckCircle2 className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">{template.title}</h3>
            {due === "overdue" ? <Badge variant="destructive">Overdue</Badge> : null}
            {due === "due_soon" ? <Badge variant="secondary">Due soon</Badge> : null}
            {complete ? <Badge>Complete</Badge> : null}
          </div>
          {template.description ? <p className="mt-1 text-sm leading-5 text-zinc-500">{template.description}</p> : null}
          {template.dueAt ? (
            // A due date is a calendar day, not an instant: stored midnight-UTC
            // and read back in UTC, so it says the same day everywhere and
            // matches the server render.
            <p className="mt-1 text-xs text-zinc-400">Due {fmtDate(template.dueAt)}</p>
          ) : null}

          {!complete && template.kind === "form" ? (
            <div className="mt-4">
              <FormRenderer fields={fieldsOf(template)} answers={answers} onChange={setAnswers} />
            </div>
          ) : null}
          {!complete && template.kind === "link" && template.target ? (
            <Button asChild type="button" variant="outline" className="mt-4">
              <a href={template.target} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" /> Open link
              </a>
            </Button>
          ) : null}
          {template.kind === "upload" ? (
            <DeliverableUploader
              task={task}
              slot={slot}
              versions={taskVersions}
              comments={slot ? comments.filter((comment) => comment.slotId === slot.id) : []}
              fileKind={neededFileKind}
            />
          ) : null}
          {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
          <Button
            type="button"
            size="sm"
            variant={complete ? "ghost" : "default"}
            className="mt-4"
            disabled={busy || (!complete && template.kind === "upload" && !hasUpload)}
            onClick={() => setComplete(!complete)}
          >
            {busy ? "Saving…" : complete ? "Mark incomplete" : "Mark complete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DeliverableUploader({
  task,
  slot,
  versions,
  comments,
  fileKind,
}: {
  task: SpeakerTaskRow;
  slot?: DeliverableSlotRow;
  versions: DeliverableVersionRow[];
  comments: DeliverableCommentRow[];
  fileKind: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const ensured = slot ?? await callFn<{ id: string }>("ensureDeliverableSlot", { taskId: task.id });
      const stored = await uploadFileDirect(file);
      await callFn("recordDeliverableVersion", {
        slotId: ensured.id,
        fileId: stored.id,
        fileUrl: stored.url,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: stored.size,
      });
      await callFn("completeTask", { taskId: task.id, completed: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload this deliverable.");
    } finally {
      setUploading(false);
    }
  }

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    if (!slot || !comment.trim()) return;
    setCommenting(true);
    setError(null);
    try {
      await callFn("addDeliverableComment", {
        slotId: slot.id,
        versionId: versions[0]?.id,
        body: comment.trim(),
      });
      setComment("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the comment.");
    } finally {
      setCommenting(false);
    }
  }

  const reviewStatus = versions.length > 0 ? (slot?.status ?? "pending") : null;

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      {reviewStatus ? (
        <div className="flex items-center gap-2">
          {reviewStatus === "approved" ? (
            <Badge>Approved</Badge>
          ) : reviewStatus === "changes_requested" ? (
            <Badge variant="destructive">Changes requested</Badge>
          ) : (
            <Badge variant="secondary">Pending review</Badge>
          )}
        </div>
      ) : null}
      {reviewStatus === "changes_requested" && slot?.reviewNote ? (
        <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          Organizer: “{slot.reviewNote}”
        </p>
      ) : null}
      <label className="block text-xs font-medium text-zinc-700">
        {versions.length > 0 ? `Upload a new ${fileKind} version` : `Upload ${fileKind}`}
        <input
          type="file"
          className="mt-2 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
          accept={fileKind === "headshot" ? "image/*" : fileKind === "slides" ? ".pdf,.ppt,.pptx,application/pdf" : undefined}
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <p className="text-[11px] text-zinc-500">
        {fileKind === "slides" ? "PDF or PowerPoint" : fileKind === "headshot" ? "Image files" : "Documents"}; maximum 25 MB. Re-uploading creates a retained version.
      </p>
      {uploading ? <p className="text-xs text-zinc-500">Uploading and confirming…</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {versions.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-zinc-700">Versions</p>
          <ul className="mt-1 divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
            {versions.map((version, index) => (
              <li key={version.id} className="flex items-center justify-between gap-3 px-2.5 py-2 text-xs">
                <span className="min-w-0 truncate">
                  v{version.versionNumber} · {version.filename} ·{" "}
                  <span suppressHydrationWarning>{fmtDateTime(version.createdAt)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {index === 0 ? <Badge>Latest</Badge> : null}
                  <a
                    href={`/api/files/${encodeURIComponent(version.fileId)}`}
                    className="font-medium text-zinc-700 underline underline-offset-2"
                  >
                    Download
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {slot ? (
        <div>
          <p className="text-xs font-medium text-zinc-700">Comments</p>
          {comments.length > 0 ? (
            <ul className="mt-1 space-y-1.5">
              {comments
                .slice()
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                .map((item) => (
                  <li key={item.id} className="rounded-md bg-white px-2.5 py-2 text-xs">
                    <span className="font-medium">{item.authorName}</span>
                    <span className="ml-1 text-zinc-400" suppressHydrationWarning>
                      · {fmtDateTime(item.createdAt)}
                    </span>
                    <p className="mt-0.5 whitespace-pre-wrap text-zinc-600">{item.body}</p>
                  </li>
                ))}
            </ul>
          ) : null}
          <form className="mt-2 flex gap-2" onSubmit={addComment}>
            <Input
              aria-label={`Comment on ${task.id}`}
              value={comment}
              maxLength={2000}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add a comment…"
            />
            <Button type="submit" size="sm" variant="outline" disabled={commenting || !comment.trim()}>
              {commenting ? "Adding…" : "Comment"}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function SpeakerFiles({ profile, files }: { profile: SpeakerProfileRow; files: SpeakerFileRow[] }) {
  if (files.length === 0) return null;
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Legacy profile files</h2>
        <span className="text-xs text-zinc-400">{files.length} retained</span>
      </div>
      <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-5">
        <p className="text-xs text-zinc-500">These pre-versioning files are preserved. New uploads belong to a specific task above.</p>
        <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="truncate">{file.label || file.fileId}</span>
              <Badge variant="outline" className="capitalize">{file.kind}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ========================= Profile editor ========================= */

// Speaker edits pass through a mutation that requires the runtime-persisted
// magic-code verification stamp and exact invited email identity.
function ProfileEditor({
  profile,
  eventName,
}: {
  profile: SpeakerProfileRow;
  eventName: string;
}) {
  const [name, setName] = useState(profile.name);
  const [tagline, setTagline] = useState(profile.tagline ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [company, setCompany] = useState(profile.company ?? "");
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? "");
  const [headshotUrl, setHeadshotUrl] = useState(profile.headshotUrl ?? "");
  const initialLinks = parseJson<Record<string, string>>(profile.linksJson) ?? {};
  const [website, setWebsite] = useState(initialLinks.website ?? "");
  const [linkedin, setLinkedin] = useState(initialLinks.linkedin ?? "");
  const [github, setGithub] = useState(initialLinks.github ?? "");
  const [twitter, setTwitter] = useState(initialLinks.twitter ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await callFn("updateMySpeakerProfile", {
        profileId: profile.id,
        name: name.trim(),
        tagline: tagline.trim() || undefined,
        bio: bio.trim() || undefined,
        company: company.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        headshotUrl: headshotUrl.trim() || undefined,
        linksJson: compactLinks({ website, linkedin, github, twitter }),
      });
      setSaved(true);
      setSaveError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  const hasLink = [website, linkedin, github, twitter].some((value) => value.trim());
  const completeness = [name, tagline, bio, company, headshotUrl].filter((value) => value.trim()).length +
    (hasLink ? 1 : 0);

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">
          Speaker profile · {eventName}
        </h2>
        <span className="text-xs text-zinc-400">{completeness}/6 complete</span>
      </div>
      <form onSubmit={save} className="mt-3 space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        {headshotUrl ? (
          <img src={headshotUrl} alt={`${name} headshot`} className="size-24 rounded-xl object-cover" />
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Name</span>
            <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Tagline</span>
            <input
              value={tagline}
              onChange={(e) => { setTagline(e.target.value); setSaved(false); }}
              placeholder="One line about you, shown under your name."
              className={inputCls}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Company</span>
            <input value={company} onChange={(e) => { setCompany(e.target.value); setSaved(false); }} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Role</span>
            <input value={jobTitle} onChange={(e) => { setJobTitle(e.target.value); setSaved(false); }} className={inputCls} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => { setBio(e.target.value); setSaved(false); }}
            rows={4}
            placeholder="Written in third person, used in the program and on the website."
            className={inputCls + " resize-y"}
          />
        </label>
        <Field>
          <FieldLabel htmlFor={`headshot-url-${profile.id}`}>Public headshot URL</FieldLabel>
          <Input
            id={`headshot-url-${profile.id}`}
            type="url"
            value={headshotUrl}
            placeholder="https://cdn.example.com/headshot.jpg"
            onChange={(event) => { setHeadshotUrl(event.target.value); setSaved(false); }}
          />
          <p className="text-xs text-zinc-500">Use a public HTTPS image URL so you and the event team see the same photo.</p>
        </Field>
        <div>
          <h3 className="text-[13px] font-medium text-zinc-700">Links</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`website-${profile.id}`}>Website</FieldLabel>
              <Input
                id={`website-${profile.id}`}
                type="url"
                value={website}
                placeholder="https://example.com"
                onChange={(event) => { setWebsite(event.target.value); setSaved(false); }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`linkedin-${profile.id}`}>LinkedIn</FieldLabel>
              <Input
                id={`linkedin-${profile.id}`}
                type="url"
                value={linkedin}
                placeholder="https://linkedin.com/in/…"
                onChange={(event) => { setLinkedin(event.target.value); setSaved(false); }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`github-${profile.id}`}>GitHub</FieldLabel>
              <Input
                id={`github-${profile.id}`}
                type="url"
                value={github}
                placeholder="https://github.com/…"
                onChange={(event) => { setGithub(event.target.value); setSaved(false); }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`twitter-${profile.id}`}>X / Twitter</FieldLabel>
              <Input
                id={`twitter-${profile.id}`}
                type="url"
                value={twitter}
                placeholder="https://x.com/…"
                onChange={(event) => { setTwitter(event.target.value); setSaved(false); }}
              />
            </Field>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
          {saved && <span className="text-xs text-emerald-600">Saved.</span>}
        </div>
        {saveError ? <p className="text-xs text-red-600">{saveError}</p> : null}
      </form>
    </section>
  );
}

function compactLinks(links: Record<string, string>) {
  const entries = Object.entries(links)
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => value);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
