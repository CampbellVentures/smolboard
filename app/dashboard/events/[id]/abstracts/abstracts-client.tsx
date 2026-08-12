"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db, Link } from "@pylonsync/react";
import { callFn } from "@/lib/fn";
import {
  BRAND_GRADIENT,
  DashboardEmptyState,
  DashboardPage,
  DashboardStatusBadge,
  DashboardToolbar,
  DashboardWidePage,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDetailOverlay } from "@/components/responsive-overlay";
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
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { fieldsOf, parseJson } from "@/lib/types";
import { aggregateSubmissionScore, normalizeCriteria, reviewRoundForNumber } from "@/lib/reviews";
import { ScorecardEditor, keyFor, type DraftCriterion } from "@/components/scorecard-editor";
import { ResponsiveFormOverlay } from "@/components/responsive-overlay";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { parseParticipantSnapshot } from "@/lib/submission-participants";
import type {
  EventRow,
  ReviewRoundRow,
  ReviewRow,
  SpeakerProfileRow,
  SubmissionFormRow,
  SubmissionRow,
} from "@/lib/types";
import { ArrowUpDown, ChevronRight, Star, Plus, Inbox, Bot } from "lucide-react";

// Abstracts: dense table + right detail drawer (row click keeps table
// context), bulk actions over setSubmissionStatus, per-round scoring. All
// queries are live — two reviewers scoring simultaneously see each other's
// scores land in real time.

const STATUSES = ["submitted", "in_review", "accepted", "rejected", "waitlisted", "withdrawn"];

function StatusPill({ status }: { status: string }) {
  return (
    <DashboardStatusBadge status={status}>
      {status.replace("_", " ")}
    </DashboardStatusBadge>
  );
}

const DEFAULT_CRITERIA = [
  { key: "relevance", label: "Relevance", max: 5 },
  { key: "quality", label: "Quality", max: 5 },
  { key: "speaker", label: "Speaker", max: 5 },
];

type SortKey = "title" | "category" | "round" | "score" | "status";
interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

// A column header that sorts. Clicking the active column flips direction;
// clicking another switches to it, descending, because for a score column
// "best first" is what you want on the first click.
function SortableHead({
  sortKey,
  sort,
  onSort,
  children,
}: {
  sortKey: SortKey;
  sort: SortState;
  onSort: (next: SortState) => void;
  children: React.ReactNode;
}) {
  const active = sort.key === sortKey;
  return (
    <TableHead aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() =>
          onSort({ key: sortKey, dir: active && sort.dir === "desc" ? "asc" : "desc" })
        }
        className="-mx-1 flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900"
      >
        {children}
        <ArrowUpDown
          aria-hidden="true"
          className={
            "size-3 transition-opacity " + (active ? "opacity-70" : "opacity-0 group-hover:opacity-40")
          }
        />
      </button>
    </TableHead>
  );
}

export function AbstractsView({
  event,
  currentUserId,
  initialSubmissions,
  initialReviews,
  initialRounds,
  profiles: initialProfiles,
  forms,
}: {
  event: EventRow;
  currentUserId: string;
  initialSubmissions: SubmissionRow[];
  initialReviews: ReviewRow[];
  initialRounds: ReviewRoundRow[];
  profiles: SpeakerProfileRow[];
  forms: SubmissionFormRow[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const subsQ = db.useQuery<SubmissionRow>("Submission");
  const revQ = db.useQuery<ReviewRow>("Review");
  const roundQ = db.useQuery<ReviewRoundRow>("ReviewRound");
  const profQ = db.useQuery<SpeakerProfileRow>("SpeakerProfile");
  const live = <T extends { eventId: string }>(
    q: { data: T[]; loading: boolean },
    initial: T[],
  ) => (!hydrated || q.loading ? initial : q.data.filter((r) => r.eventId === event.id));
  const submissions = live(subsQ, initialSubmissions);
  const reviews = live(revQ, initialReviews);
  const profiles = live(profQ, initialProfiles);
  const rounds = live(roundQ, initialRounds)
    .slice()
    .sort((a, b) => a.roundNumber - b.roundNumber);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  // Deep link: /abstracts?submission=<id> opens that proposal directly, so a
  // row on the overview can point at the proposal instead of the whole list.
  // Read once on mount; after that the drawer is ordinary local state.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("submission");
    if (wanted) setOpenId(wanted);
  }, []);
  const [busy, setBusy] = useState(false);
  const [bulkConfirmStatus, setBulkConfirmStatus] = useState<string | null>(null);
  // Highest score first is the order a program chair wants on arrival, but it
  // can't be the only order — deciding a shortlist means re-reading by title,
  // by track, and by status too.
  const [sort, setSort] = useState<SortState>({ key: "score", dir: "desc" });

  const categories = useMemo(
    () => [...new Set(submissions.map((s) => s.category).filter(Boolean))] as string[],
    [submissions],
  );

  const avgScore = useMemo(() => {
    const out: Record<string, { avg: number; n: number }> = {};
    for (const submission of submissions) {
      const round = reviewRoundForNumber(rounds, submission.currentRound);
      if (!round) continue;
      const currentReviews = reviews.filter(
        (review) => review.submissionId === submission.id && review.roundId === round.id,
      );
      const score = aggregateSubmissionScore(round.criteriaJson, currentReviews);
      if (score !== undefined) out[submission.id] = { avg: score * 5, n: currentReviews.length };
    }
    return out;
  }, [reviews, rounds, submissions]);

  const rows = useMemo(() => {
    let list = submissions;
    if (statusFilter) list = list.filter((s) => s.status === statusFilter);
    if (categoryFilter) list = list.filter((s) => s.category === categoryFilter);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(needle) ||
          (s.abstract ?? "").toLowerCase().includes(needle) ||
          (profiles.find((p) => p.userId === s.speakerUserId)?.name ?? "")
            .toLowerCase()
            .includes(needle),
      );
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    const speaker = (s: SubmissionRow) =>
      profiles.find((p) => p.userId === s.speakerUserId)?.name ?? "";
    return list.slice().sort((a, b) => {
      switch (sort.key) {
        case "title":
          return dir * (a.title.localeCompare(b.title) || speaker(a).localeCompare(speaker(b)));
        case "category":
          return dir * (a.category ?? "").localeCompare(b.category ?? "");
        case "round":
          return dir * ((a.currentRound ?? 0) - (b.currentRound ?? 0));
        case "status":
          return dir * a.status.localeCompare(b.status);
        default:
          // Unscored sorts last in both directions: an empty cell is not a
          // low score, and burying real scores under blanks helps no one.
          {
            const av = avgScore[a.id]?.avg;
            const bv = avgScore[b.id]?.avg;
            if (av === undefined && bv === undefined) return 0;
            if (av === undefined) return 1;
            if (bv === undefined) return -1;
            return sort.dir === "asc" ? av - bv : bv - av;
          }
      }
    });
  }, [submissions, statusFilter, categoryFilter, q, profiles, avgScore, sort]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkStatus(status: string) {
    const ids = [...selected];
    setBusy(true);
    try {
      for (const id of ids) {
        await callFn("setSubmissionStatus", { submissionId: id, status });
      }
      setSelected(new Set());
    } finally {
      setBusy(false);
      setBulkConfirmStatus(null);
    }
  }

  async function bulkAdvance() {
    setBusy(true);
    try {
      for (const id of selected) {
        const sub = submissions.find((s) => s.id === id);
        if (!sub) continue;
        await db.update("Submission", id, {
          currentRound: (sub.currentRound ?? 1) + 1,
          status: "in_review",
        });
      }
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  const open = openId ? submissions.find((s) => s.id === openId) : undefined;

  if (submissions.length === 0) {
    return (
      <DashboardPage className="max-w-5xl">
        <DashboardToolbar>
          <span className="text-xs tabular-nums text-muted-foreground">0 submissions</span>
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/events/${event.id}/forms`}>Submission forms</Link>
          </Button>
        </DashboardToolbar>
        <DashboardEmptyState
          icon={Inbox}
          title="No submissions yet"
          description="Publish a submission form and share its CFP link to start collecting talks."
          size="compact"
        >
          <Button asChild size="sm">
            <Link href={`/dashboard/events/${event.id}/forms`}>Open submission forms</Link>
          </Button>
        </DashboardEmptyState>
      </DashboardPage>
    );
  }

  return (
    <DashboardWidePage className="flex-row gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Pipeline tabs: one-glance counts, one-click filters. */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border">
          {["", ...STATUSES].map((value) => {
            const count = value
              ? submissions.filter((r) => r.status === value).length
              : submissions.length;
            const active = statusFilter === value;
            if (value && count === 0 && !active) return null;
            return (
              <button
                key={value || "all"}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors " +
                  (active
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-800")
                }
              >
                <span className="capitalize">{value ? value.replace(/_/g, " ") : "All"}</span>
                <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        {/* Toolbar */}
        <DashboardToolbar>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, abstract, speaker…"
              className="w-full sm:w-64"
              aria-label="Search submissions"
              autoComplete="off"
            />
            {categories.length > 0 && (
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-auto"
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {rounds.length > 0 ? (
              <ReviewOperations
                eventId={event.id}
                round={rounds[rounds.length - 1]}
                category={categoryFilter || undefined}
              />
            ) : null}
            <AddRoundButton event={event} rounds={rounds} />
            <span className="text-xs tabular-nums text-muted-foreground">
              {rows.length} of {submissions.length}
            </span>
          </div>
        </DashboardToolbar>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className={`flex items-center gap-2 rounded-lg border border-zinc-900 px-3 py-2 text-white ${BRAND_GRADIENT}`}>
            <span className="text-[13px] font-medium">{selected.size} selected</span>
            <div className="ml-auto flex items-center gap-1.5">
              <BulkBtn onClick={() => setBulkConfirmStatus("accepted")} disabled={busy}>
                Accept + email
              </BulkBtn>
              <BulkBtn onClick={() => setBulkConfirmStatus("rejected")} disabled={busy}>
                Reject + email
              </BulkBtn>
              <BulkBtn onClick={() => void bulkStatus("waitlisted")} disabled={busy}>
                Waitlist
              </BulkBtn>
              <BulkBtn onClick={bulkAdvance} disabled={busy}>
                Advance round
              </BulkBtn>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="size-4 rounded border-zinc-300 accent-zinc-900"
                  />
                </TableHead>
                <SortableHead sortKey="title" sort={sort} onSort={setSort}>
                  Title / speaker
                </SortableHead>
                <SortableHead sortKey="category" sort={sort} onSort={setSort}>
                  Category
                </SortableHead>
                <SortableHead sortKey="round" sort={sort} onSort={setSort}>
                  Round
                </SortableHead>
                <SortableHead sortKey="score" sort={sort} onSort={setSort}>
                  Score
                </SortableHead>
                <SortableHead sortKey="status" sort={sort} onSort={setSort}>
                  Status
                </SortableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const profile = profiles.find((p) => p.userId === s.speakerUserId);
                const score = avgScore[s.id];
                return (
                  <TableRow
                    key={s.id}
                    onClick={() => setOpenId(s.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setOpenId(s.id);
                      }
                    }}
                    tabIndex={0}
                    aria-selected={openId === s.id}
                    className={cn("cursor-pointer", openId === s.id && "bg-muted/50")}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        aria-label={`Select ${s.title}`}
                        className="size-4 rounded border-zinc-300 accent-zinc-900"
                      />
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium text-zinc-900">{s.title}</span>
                        {s.emailUnverified ? (
                          <span
                            title="This submitter has not confirmed their email address yet."
                            className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                          >
                            Email unverified
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-zinc-400">
                        {profile?.name ?? "—"}
                        {profile?.company ? ` · ${profile.company}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{s.category ?? "—"}</TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">{s.currentRound}</TableCell>
                    <TableCell>
                      {score ? (
                        <span className="flex items-center gap-1 text-[13px] font-medium text-zinc-700">
                          <Star className="size-3.5 fill-amber-400 text-amber-400" />
                          {score.avg.toFixed(1)}
                          <span className="text-[11px] font-normal text-zinc-400">({score.n})</span>
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-300">unscored</span>
                      )}
                      {s.triageScore ? (
                        <span
                          className="ml-2 inline-flex items-center gap-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600"
                          title={s.triageSummary}
                        >
                          <Bot className="size-3 text-violet-600" aria-hidden="true" />
                          {s.triageScore.toFixed(1)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={s.status} />
                    </TableCell>
                    <TableCell className="text-zinc-300">
                      <ChevronRight className="size-4" />
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    {submissions.length === 0
                      ? "Submissions appear here as speakers submit."
                      : "Nothing matches those filters."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Drawer */}
      {open && (
        <DetailDrawer
          key={open.id}
          submission={open}
          profile={profiles.find((p) => p.userId === open.speakerUserId)}
          form={forms.find((f) => f.id === open.formId)}
          rounds={rounds}
          reviews={reviews.filter((r) => r.submissionId === open.id)}
          currentUserId={currentUserId}
          event={event}
          onClose={() => setOpenId(null)}
        />
      )}
      <AlertDialog
        open={bulkConfirmStatus !== null}
        onOpenChange={(open) => !open && setBulkConfirmStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkConfirmStatus === "accepted" ? "Accept" : "Reject"} {selected.size}{" "}
              submission{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Their statuses will change and the speakers will be emailed immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={bulkConfirmStatus === "rejected" ? "destructive" : "default"}
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (bulkConfirmStatus) void bulkStatus(bulkConfirmStatus);
              }}
            >
              {busy
                ? "Updating…"
                : bulkConfirmStatus === "accepted"
                  ? "Accept and email"
                  : "Reject and email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardWidePage>
  );
}

function BulkBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

/* ============================ Drawer ============================ */

function DetailDrawer({
  submission,
  profile,
  form,
  rounds,
  reviews,
  currentUserId,
  event,
  onClose,
}: {
  submission: SubmissionRow;
  profile?: SpeakerProfileRow;
  form?: SubmissionFormRow;
  rounds: ReviewRoundRow[];
  reviews: ReviewRow[];
  currentUserId: string;
  event: EventRow;
  onClose: () => void;
}) {
  const answers = parseJson<Record<string, unknown>>(submission.answersJson) ?? {};
  const participants = parseParticipantSnapshot(submission.participantSnapshotJson);
  const fields = form ? fieldsOf(form) : [];
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<string | null>(null);

  async function applyStatus(status: string) {
    setBusy(status);
    try {
      await callFn("setSubmissionStatus", { submissionId: submission.id, status });
    } finally {
      setBusy(null);
      setConfirmStatus(null);
    }
  }

  function setStatus(status: string) {
    if (status === "accepted" || status === "rejected") {
      setConfirmStatus(status);
      return;
    }
    void applyStatus(status);
  }

  // Never fall back to a different round: that would silently attach a score
  // to the wrong review phase after a submission advances.
  const activeRound = reviewRoundForNumber(rounds, submission.currentRound);

  return (
    <ResponsiveDetailOverlay.Root open onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDetailOverlay.Content>
        <ResponsiveDetailOverlay.Header icon={Inbox}>
          <ResponsiveDetailOverlay.Title>{submission.title}</ResponsiveDetailOverlay.Title>
          <ResponsiveDetailOverlay.Description>
            Review submission and record your score.
          </ResponsiveDetailOverlay.Description>
        </ResponsiveDetailOverlay.Header>
        <ResponsiveDetailOverlay.Body className="flex flex-col gap-5">
          {submission.triageSummary ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Bot className="size-3.5 text-violet-600" aria-hidden="true" />
                AI first pass
                {submission.triageScore ? ` · ${submission.triageScore.toFixed(1)} of 5` : ""}
              </p>
              {/* Also model output, so it formats through the same renderer
                  as the copilot rather than printing raw markdown. */}
              <Markdown className="mt-1 text-[13px] text-zinc-600">
                {submission.triageSummary}
              </Markdown>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Advisory only. It doesn&apos;t count toward reviewer scores or decide anything.
              </p>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <StatusPill status={submission.status} />
            {submission.category && (
              <span className="text-xs capitalize text-zinc-400">{submission.category}</span>
            )}
            <span className="text-xs text-muted-foreground">round {submission.currentRound}</span>
          </div>
          {/* Quick actions */}
          <div className="flex flex-wrap gap-1.5">
            {["accepted", "rejected", "waitlisted"].map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={s === "rejected" ? "destructive" : s === "accepted" ? "default" : "outline"}
                disabled={busy !== null || submission.status === s}
                onClick={() => setStatus(s)}
                className="capitalize"
              >
                {busy === s ? "…" : s.replace("ed", "")}
              </Button>
            ))}
          </div>

          {profile && (
            <section>
              <h4 className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                Speaker
              </h4>
              <p className="mt-1 text-sm text-zinc-800">
                <span className="font-medium">{profile.name}</span>
                {profile.jobTitle || profile.company ? (
                  <span className="text-zinc-500">
                    {" "}
                    — {[profile.jobTitle, profile.company].filter(Boolean).join(", ")}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-zinc-400">{profile.email}</p>
              {profile.bio && (
                <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-zinc-500">
                  {profile.bio}
                </p>
              )}
            </section>
          )}

          {participants.length > 1 && (
            <section>
              <h4 className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                Participants
              </h4>
              <ul className="mt-1.5 space-y-1.5">
                {participants.map((participant) => (
                  <li key={participant.userId} className="text-sm text-zinc-800">
                    <span className="font-medium">{participant.name}</span>
                    <span className="text-zinc-500"> — {participant.roleLabel}</span>
                    <span className="block text-xs text-zinc-400">{participant.email}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {submission.abstract && (
            <section>
              <h4 className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                Abstract
              </h4>
              <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-zinc-700">
                {submission.abstract}
              </p>
            </section>
          )}

          {fields.length > 0 && (
            <section>
              <h4 className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                Answers
              </h4>
              <dl className="mt-1.5 space-y-2">
                {fields
                  .filter((f) => f.type !== "section" && answers[f.key] !== undefined)
                  .map((f) => (
                    <div key={f.key}>
                      <dt className="text-xs font-medium text-zinc-500">{f.label}</dt>
                      <dd className="text-[13px] text-zinc-800">
                        {Array.isArray(answers[f.key])
                          ? (answers[f.key] as string[]).join(", ")
                          : String(answers[f.key])}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          )}

          <ScorePanel
            submission={submission}
            round={activeRound}
            reviews={reviews}
            currentUserId={currentUserId}
            event={event}
          />
        </ResponsiveDetailOverlay.Body>
      </ResponsiveDetailOverlay.Content>
      <AlertDialog
        open={confirmStatus !== null}
        onOpenChange={(open) => !open && setConfirmStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmStatus === "accepted" ? "Accept" : "Reject"} “{submission.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The submission status will change and the speaker will be emailed immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmStatus === "rejected" ? "destructive" : "default"}
              disabled={busy !== null}
              onClick={(event) => {
                event.preventDefault();
                if (confirmStatus) void applyStatus(confirmStatus);
              }}
            >
              {busy
                ? "Updating…"
                : confirmStatus === "accepted"
                  ? "Accept and email"
                  : "Reject and email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ResponsiveDetailOverlay.Root>
  );
}

/* ========================= Scoring panel ========================= */

function ScorePanel({
  submission,
  round,
  reviews,
  currentUserId,
  event,
}: {
  submission: SubmissionRow;
  round?: ReviewRoundRow;
  reviews: ReviewRow[];
  currentUserId: string;
  event: EventRow;
}) {
  const criteria = normalizeCriteria(
    round ? parseJson(round.criteriaJson) ?? DEFAULT_CRITERIA : DEFAULT_CRITERIA,
  );

  const roundReviews = round ? reviews.filter((r) => r.roundId === round.id) : [];
  const mine = roundReviews.find((r) => r.reviewerUserId === currentUserId);
  const [scores, setScores] = useState<Record<string, number>>(
    () => parseJson<Record<string, number>>(mine?.scoresJson) ?? {},
  );
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [recommendation, setRecommendation] = useState(mine?.recommendation ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    try {
      let roundId = round?.id;
      if (!roundId) {
        // Create the exact round the submission is currently in.
        const result = await callFn<{ id: string }>("saveReviewRound", {
          eventId: event.id,
          roundNumber: submission.currentRound,
          name: `Round ${submission.currentRound}`,
          criteriaJson: DEFAULT_CRITERIA,
          status: "open",
        });
        roundId = result.id;
      }
      const payload = {
        scoresJson: scores,
        comment: comment.trim() || undefined,
        recommendation: recommendation || undefined,
      };
      if (mine) {
        await callFn("saveReview", {
          eventId: event.id,
          reviewId: mine.id,
          submissionId: submission.id,
          roundId,
          ...payload,
        });
      } else {
        await callFn("saveReview", {
          eventId: event.id,
          submissionId: submission.id,
          roundId,
          ...payload,
        });
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        Your score {round ? `· ${round.name}` : `· Round ${submission.currentRound}`}
      </h4>
      <div className="mt-2 space-y-2.5">
        {criteria.map((c) => {
          // A round's scorecard can mix ratings, dropdowns, and free text.
          if (c.type === "select") {
            return (
              <div key={c.key} className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-zinc-600">{c.label}</span>
                <Select
                  aria-label={c.label}
                  className="w-40"
                  value={typeof scores[c.key] === "string" ? (scores[c.key] as unknown as string) : ""}
                  onChange={(e) => {
                    setScores((s) => ({ ...s, [c.key]: e.target.value as unknown as number }));
                    setSaved(false);
                  }}
                >
                  <option value="">Select…</option>
                  {(c.options ?? []).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Select>
              </div>
            );
          }
          if (c.type === "text") {
            return (
              <div key={c.key} className="flex flex-col gap-1">
                <span className="text-[13px] text-zinc-600">{c.label}</span>
                <Textarea
                  aria-label={c.label}
                  rows={2}
                  className="resize-none bg-white"
                  value={typeof scores[c.key] === "string" ? (scores[c.key] as unknown as string) : ""}
                  onChange={(e) => {
                    setScores((s) => ({ ...s, [c.key]: e.target.value as unknown as number }));
                    setSaved(false);
                  }}
                />
              </div>
            );
          }
          const max = c.max ?? 5;
          return (
            <div key={c.key} className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-zinc-600">
                {c.label}
                {c.weight > 1 ? <span className="ml-1 text-zinc-400">×{c.weight}</span> : null}
              </span>
              <div className="flex gap-0.5">
                {Array.from({ length: max }, (_, i) => i + 1).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-label={`${c.label}: ${v} of ${max}`}
                    onClick={() => {
                      setScores((s) => ({ ...s, [c.key]: v }));
                      setSaved(false);
                    }}
                    className="p-0.5"
                  >
                    <Star
                      className={
                        "size-4 " +
                        ((Number(scores[c.key]) || 0) >= v
                          ? "fill-amber-400 text-amber-400"
                          : "text-zinc-300 hover:text-zinc-400")
                      }
                    />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div className="flex gap-1.5">
          {["accept", "neutral", "reject"].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setRecommendation(r === recommendation ? "" : r);
                setSaved(false);
              }}
              className={
                "rounded-md border px-2 py-0.5 text-[12px] font-medium capitalize transition-colors " +
                (recommendation === r
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-500 hover:border-zinc-500")
              }
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setSaved(false);
          }}
          rows={2}
          placeholder="Notes for the committee (not shown to the speaker)…"
          className="resize-none"
          aria-label="Review comment"
        />
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : mine ? "Update score" : "Save score"}
          </Button>
          {saved && <span className="text-xs text-emerald-600">Saved.</span>}
        </div>
      </div>

      {roundReviews.filter((r) => r.reviewerUserId !== currentUserId).length > 0 && (
        <div className="mt-3 border-t border-zinc-200 pt-2">
          <h5 className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Committee
          </h5>
          <ul className="mt-1 space-y-1.5">
            {roundReviews
              .filter((r) => r.reviewerUserId !== currentUserId)
              .map((r) => {
                const s = parseJson<Record<string, number>>(r.scoresJson) ?? {};
                const vals = Object.values(s);
                const mean = vals.length
                  ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
                  : "—";
                return (
                  <li key={r.id} className="text-xs text-zinc-500">
                    <span className="font-medium text-zinc-700">{mean}★</span>
                    {r.recommendation && <span> · {r.recommendation}</span>}
                    {r.comment && <span> — “{r.comment}”</span>}
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ====================== Rounds management ====================== */
// (Kept minimal: rounds are auto-created on first score; explicit multi-round
// setup happens by advancing submissions — a new ReviewRound row is created
// lazily when scoring at a round number with no row yet.)

// Round settings: name, anonymization, and the scorecard reviewers fill in.
function RoundEditor({
  event,
  round,
  nextNumber,
  onClose,
}: {
  event: EventRow;
  round?: ReviewRoundRow;
  nextNumber: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(round?.name ?? `Round ${nextNumber}`);
  const [anonymized, setAnonymized] = useState(Boolean(round?.anonymized));
  const [criteria, setCriteria] = useState<DraftCriterion[]>(() =>
    round ? normalizeCriteria(parseJson(round.criteriaJson)) : normalizeCriteria(DEFAULT_CRITERIA),
  );
  const [saving, setSaving] = useState(false);

  async function save(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const taken = new Set<string>();
    const cleaned = criteria
      .filter((c) => c.label.trim())
      .map((c) => {
        const key = c.key || keyFor(c.label, taken);
        taken.add(key);
        return { ...c, key, label: c.label.trim() };
      });
    if (cleaned.length === 0) {
      toast.error("Add at least one criterion.");
      return;
    }
    setSaving(true);
    try {
      await callFn("saveReviewRound", {
        eventId: event.id,
        roundId: round?.id,
        roundNumber: round?.roundNumber ?? nextNumber,
        name: name.trim() || `Round ${round?.roundNumber ?? nextNumber}`,
        criteriaJson: cleaned,
        status: round?.status ?? "open",
        anonymized,
      });
      toast.success(round ? "Round updated" : `Round ${nextNumber} created`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the round.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveFormOverlay.Root open onOpenChange={(open) => !open && onClose()}>
      <ResponsiveFormOverlay.Content className="sm:max-w-2xl">
        <form onSubmit={save} className="contents">
          <ResponsiveFormOverlay.Header icon={Star}>
            <ResponsiveFormOverlay.Title>
              {round ? `Edit ${round.name}` : `New review round`}
            </ResponsiveFormOverlay.Title>
            <ResponsiveFormOverlay.Description>
              Reviewers see these questions when they score a submission in this round.
            </ResponsiveFormOverlay.Description>
          </ResponsiveFormOverlay.Header>
          <ResponsiveFormOverlay.Body>
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="round-name">Round name</Label>
                  <Input
                    id="round-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={anonymized}
                    onChange={(e) => setAnonymized(e.target.checked)}
                    className="size-4"
                  />
                  Hide speaker identity from reviewers
                </label>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Scorecard</p>
                <ScorecardEditor criteria={criteria} onChange={setCriteria} />
              </div>
            </div>
          </ResponsiveFormOverlay.Body>
          <ResponsiveFormOverlay.Footer>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : round ? "Save round" : "Create round"}
            </Button>
          </ResponsiveFormOverlay.Footer>
        </form>
      </ResponsiveFormOverlay.Content>
    </ResponsiveFormOverlay.Root>
  );
}

export function AddRoundButton({ event, rounds }: { event: EventRow; rounds: ReviewRoundRow[] }) {
  const next = (rounds[rounds.length - 1]?.roundNumber ?? 0) + 1;
  const [editing, setEditing] = useState<"new" | ReviewRoundRow | null>(null);
  const latest = rounds[rounds.length - 1];
  return (
    <>
      {latest ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(latest)}>
          Scorecard
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing("new")}>
        <Plus data-icon="inline-start" /> Add round {next}
      </Button>
      {editing ? (
        <RoundEditor
          event={event}
          round={editing === "new" ? undefined : editing}
          nextNumber={next}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function ReviewOperations({
  eventId,
  round,
  category,
}: {
  eventId: string;
  round: ReviewRoundRow;
  category?: string;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [triaging, setTriaging] = useState(false);
  async function assign() {
    const result = await callFn<{ created: number }>("bulkAssignReviews", {
      eventId,
      roundId: round.id,
      category,
      assignmentsPerSubmission: 1,
    });
    setNote(`${result.created} assigned`);
  }
  async function remind() {
    const result = await callFn<{ queued: number }>("sendReviewReminders", {
      eventId,
      roundId: round.id,
    });
    setNote(`${result.queued} reminders queued`);
  }
  async function download() {
    const result = await callFn<{ filename: string; csv: string }>("exportReviewCsv", {
      eventId,
      roundId: round.id,
    });
    const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button type="button" size="sm" variant="outline" onClick={() => void assign()}>Assign reviewers</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => void remind()}>Remind</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => void download()}>Export CSV</Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={triaging}
        onClick={async () => {
          setTriaging(true);
          try {
            const result = await callFn<{ scored: number; skipped: number }>("triageSubmissions", {
              eventId,
            });
            toast.success(
              result.scored > 0
                ? `AI scored ${result.scored} submission${result.scored === 1 ? "" : "s"}`
                : "Nothing left to triage",
              { description: result.skipped ? `${result.skipped} skipped.` : undefined },
            );
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Triage failed.");
          } finally {
            setTriaging(false);
          }
        }}
      >
        <Bot data-icon="inline-start" />
        {triaging ? "Scoring…" : "AI triage"}
      </Button>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </div>
  );
}
