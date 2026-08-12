"use client";

import React, { useEffect, useState } from "react";
import { callFn, db, Link } from "@pylonsync/react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileText,
  Gauge,
  Inbox,
  ListTodo,
  MapPin,
  Send,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  DashboardEmptyState,
  DashboardHero,
  DashboardIconChip,
  DashboardPage,
  DashboardPanel,
  DashboardStatusBadge,
  type DashboardChipTone,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildOnboardingRows } from "@/lib/tasks";
import { assignmentProgress } from "@/lib/reviews";
import type { DeliverableSlotRow, DeliverableVersionRow, SessionRow } from "@/lib/types";
import { useOrgSlug } from "@/components/use-org-slug";
import type {
  EventRow,
  ReviewAssignmentRow,
  ReviewRoundRow,
  SpeakerFileRow,
  SpeakerProfileRow,
  SpeakerTaskRow,
  SubmissionFormRow,
  SubmissionRow,
  TaskTemplateRow,
} from "@/lib/types";

type PrimaryAction = "forms" | "open-cfp" | "review" | "share" | "tasks" | "settings";

interface OverviewState {
  label: string;
  status: string;
  title: string;
  description: string;
  primaryAction: PrimaryAction;
  primaryLabel: string;
}

interface NextStep {
  icon: typeof FileText;
  title: string;
  description: string;
  label: string;
  href?: string;
  action?: "open-cfp" | "share";
}

// Event operations stay live after hydration while server data keeps the first
// render complete and stable.
export function EventOverview({
  event: eventProp,
  initialSubmissions,
  initialSessions,
  initialSlots,
  initialVersions,
  forms,
  initialProfiles,
  initialTasks,
  initialTemplates,
  initialFiles,
  initialAssignments,
  initialRounds,
}: {
  event: EventRow;
  initialSubmissions: SubmissionRow[];
  initialSessions: SessionRow[];
  initialSlots: DeliverableSlotRow[];
  initialVersions: DeliverableVersionRow[];
  forms: SubmissionFormRow[];
  initialProfiles: SpeakerProfileRow[];
  initialTasks: SpeakerTaskRow[];
  initialTemplates: TaskTemplateRow[];
  initialFiles: SpeakerFileRow[];
  initialAssignments: ReviewAssignmentRow[];
  initialRounds: ReviewRoundRow[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // The event row itself is live too — opening/closing the CFP or edits from
  // Settings reflect here without a reload.
  const eventQuery = db.useQuery<EventRow>("Event");
  const event =
    (!hydrated || eventQuery.loading
      ? undefined
      : eventQuery.data.find((row) => row.id === eventProp.id)) ?? eventProp;
  const formQuery = db.useQuery<SubmissionFormRow>("SubmissionForm");
  const liveForms =
    !hydrated || formQuery.loading
      ? forms
      : formQuery.data.filter((row) => row.eventId === eventProp.id);

  const submissionQuery = db.useQuery<SubmissionRow>("Submission");
  const profileQuery = db.useQuery<SpeakerProfileRow>("SpeakerProfile");
  const taskQuery = db.useQuery<SpeakerTaskRow>("SpeakerTask");
  const templateQuery = db.useQuery<TaskTemplateRow>("TaskTemplate");
  const fileQuery = db.useQuery<SpeakerFileRow>("SpeakerFile");
  const assignmentQuery = db.useQuery<ReviewAssignmentRow>("ReviewAssignment");
  const roundQuery = db.useQuery<ReviewRoundRow>("ReviewRound");

  const submissions = (
    !hydrated || submissionQuery.loading ? initialSubmissions : submissionQuery.data
  ).filter((row) => row.eventId === event.id);
  const profiles = (!hydrated || profileQuery.loading ? initialProfiles : profileQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const tasks = (!hydrated || taskQuery.loading ? initialTasks : taskQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const templates = (
    !hydrated || templateQuery.loading ? initialTemplates : templateQuery.data
  ).filter((row) => row.eventId === event.id);
  const files = (!hydrated || fileQuery.loading ? initialFiles : fileQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const assignments = (
    !hydrated || assignmentQuery.loading ? initialAssignments : assignmentQuery.data
  ).filter(
    (row) => row.eventId === event.id,
  );
  const rounds = (!hydrated || roundQuery.loading ? initialRounds : roundQuery.data).filter(
    (row) => row.eventId === event.id,
  );

  const counts = submissionStatusCounts(submissions);
  const accepted = counts.accepted ?? 0;
  const awaitingReview = (counts.submitted ?? 0) + (counts.in_review ?? 0);
  const openForms = liveForms.filter((form) => form.status === "open");
  const onboarding = buildOnboardingRows({ submissions, profiles, tasks, templates, files });
  const onboardingComplete = onboarding.filter((row) => row.state === "complete").length;
  const overdueSpeakers = onboarding.filter((row) => row.overdue > 0).length;
  const missingEventDetails = [
    !event.startDate ? "dates" : null,
    !event.location ? "location" : null,
  ].filter((value): value is string => Boolean(value));
  const overview = getOverviewState({
    cfpStatus: event.cfpStatus,
    openFormCount: openForms.length,
    submissionCount: submissions.length,
    awaitingReview,
    accepted,
    overdueSpeakers,
  });
  const sessionQuery = db.useQuery<SessionRow>("Session");
  const slotQuery = db.useQuery<DeliverableSlotRow>("DeliverableSlot");
  const versionQuery = db.useQuery<DeliverableVersionRow>("DeliverableVersion");
  const sessions = (!hydrated || sessionQuery.loading ? initialSessions : sessionQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const slots = (!hydrated || slotQuery.loading ? initialSlots : slotQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const versions = (!hydrated || versionQuery.loading ? initialVersions : versionQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const scheduledBySubmission = new Set(
    sessions.filter((s) => s.startTime && s.submissionId).map((s) => s.submissionId),
  );
  const unscheduledAccepted = submissions.filter(
    (s) => s.status === "accepted" && !scheduledBySubmission.has(s.id),
  ).length;
  const uploadedSlots = new Set(versions.map((v) => v.slotId));
  const pendingFiles = slots.filter(
    (slot) => uploadedSlots.has(slot.id) && (slot.status ?? "pending") === "pending",
  ).length;

  const acceptedSpeakerIds = new Set(
    submissions.filter((s) => s.status === "accepted").map((s) => s.speakerUserId),
  );
  const incompleteProfiles = profiles.filter(
    (p) => acceptedSpeakerIds.has(p.userId) && (!p.bio?.trim() || !p.headshotUrl?.trim()),
  ).length;
  const crossChecks: NextStep[] = [
    ...(unscheduledAccepted > 0
      ? [{
          icon: CalendarDays,
          title: `Schedule ${unscheduledAccepted} accepted talk${unscheduledAccepted === 1 ? "" : "s"}`,
          description: "Accepted talks aren't on the agenda yet.",
          label: "Open agenda",
          href: `/dashboard/events/${event.id}/agenda`,
        }]
      : []),
    ...(pendingFiles > 0
      ? [{
          icon: FileText,
          title: `Review ${pendingFiles} uploaded file${pendingFiles === 1 ? "" : "s"}`,
          description: "Speaker files are waiting for approval.",
          label: "Open content",
          href: `/dashboard/events/${event.id}/content`,
        }]
      : []),
    ...(incompleteProfiles > 0
      ? [{
          icon: Users,
          title: `Complete ${incompleteProfiles} speaker profile${incompleteProfiles === 1 ? "" : "s"}`,
          description: "Accepted speakers are missing a bio or headshot for the public site.",
          label: "Open speakers",
          href: `/dashboard/events/${event.id}/speakers`,
        }]
      : []),
  ];
  const nextSteps = [
    ...getNextSteps({
      event,
      formCount: liveForms.length,
      openFormCount: openForms.length,
      submissionCount: submissions.length,
      awaitingReview,
      overdueSpeakers,
    }),
    ...crossChecks,
  ].slice(0, 4);

  const [selectedSpeakers, setSelectedSpeakers] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const orgSlug = useOrgSlug(event.orgId);
  const cfpUrl = orgSlug ? `/${orgSlug}/${event.slug}/cfp` : null;

  async function copyCfp() {
    if (!cfpUrl) return;
    await navigator.clipboard.writeText(`${window.location.origin}${cfpUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function setCfpStatus(status: string) {
    // Live queries pick the change up — no reload, the hero recomputes in place.
    await db.update("Event", event.id, { cfpStatus: status });
  }

  async function nudgeSelected() {
    try {
      const result = await callFn<{ queued: number }>("nudgeSpeakers", {
        eventId: event.id,
        speakerUserIds: selectedSpeakers,
      });
      toast.success(`Queued ${result.queued} reminder${result.queued === 1 ? "" : "s"}`);
      setSelectedSpeakers([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue reminders.");
    }
  }

  function renderPrimaryAction(action: PrimaryAction, label: string) {
    if (action === "open-cfp") {
      return (
        <Button type="button" onClick={() => setCfpStatus("open")}>
          <Send data-icon="inline-start" />
          {label}
        </Button>
      );
    }
    if (action === "share") {
      return (
        <Button type="button" onClick={copyCfp}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? "Link copied" : label}
        </Button>
      );
    }
    const href = {
      forms: `/dashboard/events/${event.id}/forms`,
      review: `/dashboard/events/${event.id}/abstracts`,
      tasks: `/dashboard/events/${event.id}/tasks`,
      settings: `/dashboard/events/${event.id}/settings`,
    }[action];
    return (
      <Button asChild>
        <Link href={href}>
          {label}
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    );
  }

  return (
    <DashboardPage className="max-w-4xl gap-6">
      <DashboardHero>
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:justify-between">
          <div className="max-w-xl">
            <DashboardStatusBadge status={overview.status}>{overview.label}</DashboardStatusBadge>
            <h2 className="mt-3 text-balance text-lg font-semibold tracking-tight">
              {overview.title}
            </h2>
            <p className="mt-2 max-w-lg text-pretty text-sm leading-6 text-muted-foreground">
              {overview.description}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {renderPrimaryAction(overview.primaryAction, overview.primaryLabel)}
            {cfpUrl && (
              <Button asChild variant="outline">
                <a href={cfpUrl} target="_blank" rel="noreferrer">
                  <ExternalLink data-icon="inline-start" />
                  Preview CFP
                </a>
              </Button>
            )}
          </div>
        </div>

        <Separator className="my-5" />

        <dl className="grid grid-cols-3 gap-3 sm:gap-0">
          <OverviewMetric label="Submissions" value={submissions.length} />
          <OverviewMetric label="Need review" value={awaitingReview} />
          <OverviewMetric label="Accepted" value={accepted} />
        </dl>
      </DashboardHero>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.75fr)]">
        <DashboardPanel title="Next steps" icon={ListTodo} tone="violet" variant="subtle">
          {nextSteps.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-muted/35 p-4">
              <CheckCircle2 className="size-5 text-emerald-500" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">You are caught up</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  New submissions and speaker tasks will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {nextSteps.map((step) => (
                <NextStepRow
                  key={step.title}
                  step={step}
                  copied={copied}
                  onOpenCfp={() => setCfpStatus("open")}
                  onShare={copyCfp}
                />
              ))}
            </div>
          )}
        </DashboardPanel>

        <div className="flex min-w-0 flex-col gap-6">
        <DashboardPanel title="Event readiness" icon={Gauge} tone="emerald" variant="subtle">
          <div className="flex flex-col gap-4">
            <ReadinessRow
              icon={Send}
              label="Call for speakers"
              value={event.cfpStatus === "open" ? "Open" : capitalize(event.cfpStatus)}
              ready={event.cfpStatus === "open"}
            />
            <ReadinessRow
              icon={FileText}
              label="Submission form"
              value={openForms.length > 0 ? `${openForms.length} published` : "Needs publishing"}
              ready={openForms.length > 0}
            />
            <ReadinessRow
              icon={CalendarDays}
              label="Event details"
              value={
                missingEventDetails.length === 0
                  ? formatEventDetails(event)
                  : `Add ${humanList(missingEventDetails)}`
              }
              ready={missingEventDetails.length === 0}
            />
            <ReadinessRow
              icon={Users}
              label="Speaker onboarding"
              value={onboarding.length > 0 ? `${onboardingComplete} of ${onboarding.length} ready` : "Not started"}
              ready={onboarding.length > 0 && onboardingComplete === onboarding.length}
            />
          </div>
        </DashboardPanel>

        <DashboardPanel title="Submission activity" icon={TrendingUp} tone="violet" variant="subtle">
          <SubmissionActivity submissions={submissions} />
        </DashboardPanel>
        </div>
      </div>

      <DashboardPanel
        title="Latest submissions"
        icon={Inbox}
        tone="sky"
        variant="subtle"
        description={submissions.length > 0 ? "Newest proposals" : undefined}
        action={
          submissions.length > 0 ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/dashboard/events/${event.id}/abstracts`}>
                View all
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          ) : null
        }
      >
        {submissions.length === 0 ? (
          <DashboardEmptyState
            icon={Inbox}
            title="No submissions yet"
            description={
              openForms.length > 0
                ? "Share your CFP link to start collecting proposals."
                : "Publish a submission form before you invite speakers."
            }
            size="compact"
          >
            {openForms.length > 0 ? (
              <Button type="button" size="sm" variant="outline" onClick={copyCfp}>
                {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                {copied ? "Link copied" : "Copy CFP link"}
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href={`/dashboard/events/${event.id}/forms`}>Go to forms</Link>
              </Button>
            )}
          </DashboardEmptyState>
        ) : (
          <div className="divide-y divide-border/70">
            {submissions
              .slice()
              .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
              .slice(0, 5)
              .map((submission) => (
                <Link
                  key={submission.id}
                  href={`/dashboard/events/${event.id}/abstracts?submission=${submission.id}`}
                  className="group flex items-center gap-3 rounded-lg py-3 transition-colors hover:bg-muted/40"
                >
                  <DashboardIconChip icon={Inbox} tone="zinc" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{submission.title}</p>
                    <p className="mt-0.5 truncate text-xs capitalize text-muted-foreground">
                      {submission.category?.trim() || "Uncategorized"}
                    </p>
                  </div>
                  <DashboardStatusBadge status={submission.status} />
                  <ArrowRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              ))}
          </div>
        )}
      </DashboardPanel>

      {onboarding.length > 0 ? (
        <DashboardPanel
          title="Speaker onboarding"
          icon={Users}
          tone="pink"
          variant="subtle"
          description="Accepted speakers, profiles, and assigned tasks update live."
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={selectedSpeakers.length === 0}
              onClick={nudgeSelected}
            >
              Nudge selected{selectedSpeakers.length ? ` (${selectedSpeakers.length})` : ""}
            </Button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
                <TableHead>Speaker</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {onboarding.map((row) => {
                const checked = selectedSpeakers.includes(row.userId);
                return (
                  <TableRow key={row.userId}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${row.name}`}
                        checked={checked}
                        onCheckedChange={(next) =>
                          setSelectedSpeakers((current) =>
                            next === true
                              ? [...new Set([...current, row.userId])]
                              : current.filter((id) => id !== row.userId),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {/* The name links rather than the whole row, so the
                          select checkbox next to it stays clickable. */}
                      <Link
                        href={`/dashboard/events/${event.id}/speakers?speaker=${row.userId}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {row.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{row.email}</div>
                    </TableCell>
                    <TableCell className="min-w-36">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span>
                          {row.tasksDone} of {row.tasksTotal}
                        </span>
                        {row.overdue > 0 ? (
                          <span className="text-destructive">{row.overdue} overdue</span>
                        ) : null}
                      </div>
                      <Progress value={row.taskPercent} className="mt-2" />
                    </TableCell>
                    <TableCell className="tabular-nums" title="Bio, headshot, and slides">
                      {row.profileComplete} of {row.profileTotal}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.lastActivity
                        ? new Date(row.lastActivity).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "No activity"}
                    </TableCell>
                    <TableCell>
                      <DashboardStatusBadge status={row.state === "complete" ? "completed" : row.state}>
                        {row.state}
                      </DashboardStatusBadge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DashboardPanel>
      ) : null}
    </DashboardPage>
  );
}

function OverviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

function NextStepRow({
  step,
  copied,
  onOpenCfp,
  onShare,
}: {
  step: NextStep;
  copied: boolean;
  onOpenCfp: () => void;
  onShare: () => void;
}) {
  const Icon = step.icon;
  const action = step.href ? (
    <Button asChild size="sm" variant="ghost">
      <Link href={step.href}>
        {step.label}
        <ArrowRight data-icon="inline-end" />
      </Link>
    </Button>
  ) : (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={step.action === "share" ? onShare : onOpenCfp}
    >
      {step.action === "share" && copied ? "Copied" : step.label}
      {step.action === "share" && copied ? (
        <Check data-icon="inline-end" />
      ) : (
        <ArrowRight data-icon="inline-end" />
      )}
    </Button>
  );

  return (
    <div className="flex items-start gap-3 rounded-lg py-3">
      <DashboardIconChip icon={Icon} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{step.title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{step.description}</p>
        <div className="mt-1 -ml-3">{action}</div>
      </div>
    </div>
  );
}

function ReadinessRow({
  icon: Icon,
  label,
  value,
  ready,
}: {
  icon: typeof Send;
  label: string;
  value: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <DashboardIconChip icon={Icon} tone="zinc" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{label}</p>
          {ready ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="Ready" />
          ) : (
            <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-label="Incomplete" />
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

function getOverviewState({
  cfpStatus,
  openFormCount,
  submissionCount,
  awaitingReview,
  accepted,
  overdueSpeakers,
}: {
  cfpStatus: string;
  openFormCount: number;
  submissionCount: number;
  awaitingReview: number;
  accepted: number;
  overdueSpeakers: number;
}): OverviewState {
  if (openFormCount === 0) {
    return {
      label: "Setup needed",
      status: "pending",
      title: "Finish your call for speakers",
      description:
        cfpStatus === "open"
          ? "Your CFP page is live, but speakers cannot submit until you publish a form."
          : "Publish a submission form, then open your CFP when you are ready to invite speakers.",
      primaryAction: "forms",
      primaryLabel: "Publish a form",
    };
  }
  if (cfpStatus !== "open" && submissionCount === 0) {
    return {
      label: "Ready to open",
      status: "draft",
      title: "Your call for speakers is ready",
      description: "The submission form is published. Open the CFP to start collecting proposals.",
      primaryAction: "open-cfp",
      primaryLabel: "Open CFP",
    };
  }
  if (awaitingReview > 0) {
    return {
      label: cfpStatus === "open" ? "Collecting submissions" : "Reviewing",
      status: cfpStatus === "open" ? "open" : "pending",
      title: `${awaitingReview} submission${awaitingReview === 1 ? " needs" : "s need"} review`,
      description: "Keep decisions moving while new proposals and reviewer scores update in real time.",
      primaryAction: "review",
      primaryLabel: "Review submissions",
    };
  }
  if (overdueSpeakers > 0) {
    return {
      label: "Speaker onboarding",
      status: "pending",
      title: `${overdueSpeakers} speaker${overdueSpeakers === 1 ? " needs" : "s need"} attention`,
      description: "Follow up on overdue tasks so profiles, materials, and session details stay on schedule.",
      primaryAction: "tasks",
      primaryLabel: "View speaker tasks",
    };
  }
  if (cfpStatus === "open" && submissionCount === 0) {
    return {
      label: "CFP open",
      status: "open",
      title: "Your call for speakers is ready to share",
      description: "Invite speakers with the public CFP link. New submissions will appear here automatically.",
      primaryAction: "share",
      primaryLabel: "Copy CFP link",
    };
  }
  if (accepted > 0) {
    return {
      label: "Onboarding",
      status: "open",
      title: "Prepare your accepted speakers",
      description: "Track profiles, files, and assigned tasks as speakers get ready for the event.",
      primaryAction: "tasks",
      primaryLabel: "View speaker tasks",
    };
  }
  return {
    label: "Event overview",
    status: cfpStatus,
    title: "Keep your event moving",
    description: "Review the current event state and complete the next item that needs your attention.",
    primaryAction: "settings",
    primaryLabel: "Event settings",
  };
}

function getNextSteps({
  event,
  formCount,
  openFormCount,
  submissionCount,
  awaitingReview,
  overdueSpeakers,
}: {
  event: EventRow;
  formCount: number;
  openFormCount: number;
  submissionCount: number;
  awaitingReview: number;
  overdueSpeakers: number;
}): NextStep[] {
  const base = `/dashboard/events/${event.id}`;
  const steps: NextStep[] = [];

  if (openFormCount === 0) {
    steps.push({
      icon: FileText,
      title: formCount === 0 ? "Create a submission form" : "Publish a submission form",
      description:
        formCount === 0
          ? "Choose the questions speakers answer when they submit."
          : "A draft form exists, but speakers cannot use it yet.",
      label: formCount === 0 ? "Create form" : "Review forms",
      href: `${base}/forms`,
    });
  }

  const missing = [!event.startDate ? "dates" : null, !event.location ? "location" : null].filter(
    (value): value is string => Boolean(value),
  );
  if (missing.length > 0) {
    steps.push({
      icon: missing.includes("dates") ? CalendarDays : MapPin,
      title: "Complete event details",
      description: `Add ${humanList(missing)} so speakers know what they are applying for.`,
      label: "Add details",
      href: `${base}/settings`,
    });
  }

  if (openFormCount > 0 && event.cfpStatus !== "open") {
    steps.push({
      icon: Send,
      title: "Open your call for speakers",
      description: "Make the CFP public and start accepting proposals.",
      label: "Open CFP",
      action: "open-cfp",
    });
  }

  if (awaitingReview > 0) {
    steps.push({
      icon: ClipboardCheck,
      title: `Review ${awaitingReview} submission${awaitingReview === 1 ? "" : "s"}`,
      description: "Score new proposals and move decisions forward.",
      label: "Start review",
      href: `${base}/abstracts`,
    });
  }

  if (overdueSpeakers > 0) {
    steps.push({
      icon: Users,
      title: `Follow up with ${overdueSpeakers} speaker${overdueSpeakers === 1 ? "" : "s"}`,
      description: "Speaker tasks have passed their due date.",
      label: "View tasks",
      href: `${base}/tasks`,
    });
  }

  if (event.cfpStatus === "open" && openFormCount > 0 && submissionCount === 0) {
    steps.push({
      icon: Copy,
      title: "Share your CFP",
      description: "Send the public link to speakers and your community.",
      label: "Copy link",
      action: "share",
    });
  }

  return steps;
}

function submissionStatusCounts(submissions: SubmissionRow[]) {
  const counts: Record<string, number> = {};
  for (const submission of submissions) {
    counts[submission.status] = (counts[submission.status] ?? 0) + 1;
  }
  return counts;
}

function categoryCounts(submissions: SubmissionRow[]) {
  const counts: Record<string, number> = {};
  for (const submission of submissions) {
    const category = submission.category?.trim() || "Uncategorized";
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "details";
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

function formatEventDetails(event: EventRow) {
  const date = event.startDate
    ? new Date(event.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : "Dates set";
  return event.location ? `${date}, ${event.location}` : date;
}

// Fourteen-day sparkline + status funnel, no chart library — a polyline and a
// few tinted bars. Counts come from the same live submissions the page holds.
const FUNNEL_STEPS: { status: string; label: string; dot: string }[] = [
  { status: "submitted", label: "Submitted", dot: "bg-amber-400" },
  { status: "in_review", label: "In review", dot: "bg-violet-500" },
  { status: "accepted", label: "Accepted", dot: "bg-emerald-500" },
  { status: "waitlisted", label: "Waitlisted", dot: "bg-amber-400" },
  { status: "rejected", label: "Rejected", dot: "bg-red-500" },
];

function SubmissionActivity({ submissions }: { submissions: SubmissionRow[] }) {
  const days = 14;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const perDay = Array.from({ length: days }, (_, i) => {
    const day = new Date(today.getTime() - (days - 1 - i) * 86_400_000);
    const key = day.toISOString().slice(0, 10);
    return submissions.filter((s) => s.submittedAt?.slice(0, 10) === key).length;
  });
  const max = Math.max(1, ...perDay);
  const points = perDay
    .map((count, i) => `${(i / (days - 1)) * 100},${28 - (count / max) * 24}`)
    .join(" ");
  const recent = perDay.reduce((total, count) => total + count, 0);
  const counts: Record<string, number> = {};
  for (const s of submissions) counts[s.status] = (counts[s.status] ?? 0) + 1;
  const funnelMax = Math.max(1, ...FUNNEL_STEPS.map((step) => counts[step.status] ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted-foreground">Last 14 days</span>
          <span className="text-xs tabular-nums text-muted-foreground">{recent} new</span>
        </div>
        <svg
          viewBox="0 0 100 30"
          preserveAspectRatio="none"
          className="mt-2 h-10 w-full"
          aria-label={`${recent} submissions in the last 14 days`}
          role="img"
        >
          <polyline points={`0,30 ${points} 100,30`} fill="rgb(124 58 237 / 0.08)" stroke="none" />
          <polyline
            points={points}
            fill="none"
            stroke="rgb(124 58 237)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        {FUNNEL_STEPS.map((step) => {
          const count = counts[step.status] ?? 0;
          if (count === 0) return null;
          return (
            <div key={step.status} className="flex items-center gap-2 text-xs">
              <span className={`size-1.5 shrink-0 rounded-full ${step.dot}`} aria-hidden="true" />
              <span className="w-16 shrink-0 text-muted-foreground">{step.label}</span>
              <span
                className="h-1.5 rounded-full bg-zinc-200"
                style={{ width: `${(count / funnelMax) * 60}%` }}
                aria-hidden="true"
              />
              <span className="tabular-nums text-muted-foreground">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
