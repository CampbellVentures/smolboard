"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db, callFn, Link } from "@pylonsync/react";
import {
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
import { cn } from "@/lib/utils";
import { fieldsOf, parseJson } from "@/lib/types";
import type {
  EventRow,
  ReviewRoundRow,
  ReviewRow,
  SpeakerProfileRow,
  SubmissionFormRow,
  SubmissionRow,
} from "@/lib/types";
import { X, ChevronRight, Star, Plus, Inbox } from "lucide-react";

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

export function AbstractsView({
  event,
  currentUserId,
  initialSubmissions,
  initialReviews,
  initialRounds,
  profiles,
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
  const live = <T extends { eventId: string }>(
    q: { data: T[]; loading: boolean },
    initial: T[],
  ) => (!hydrated || q.loading ? initial : q.data.filter((r) => r.eventId === event.id));
  const submissions = live(subsQ, initialSubmissions);
  const reviews = live(revQ, initialReviews);
  const rounds = live(roundQ, initialRounds)
    .slice()
    .sort((a, b) => a.roundNumber - b.roundNumber);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useMemo(
    () => [...new Set(submissions.map((s) => s.category).filter(Boolean))] as string[],
    [submissions],
  );

  const avgScore = useMemo(() => {
    const by: Record<string, { total: number; n: number }> = {};
    for (const r of reviews) {
      const scores = parseJson<Record<string, number>>(r.scoresJson);
      if (!scores) continue;
      const vals = Object.values(scores).filter((v) => typeof v === "number");
      if (vals.length === 0) continue;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      by[r.submissionId] ??= { total: 0, n: 0 };
      by[r.submissionId].total += mean;
      by[r.submissionId].n += 1;
    }
    const out: Record<string, { avg: number; n: number }> = {};
    for (const [k, v] of Object.entries(by)) out[k] = { avg: v.total / v.n, n: v.n };
    return out;
  }, [reviews]);

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
    return list
      .slice()
      .sort((a, b) => (avgScore[b.id]?.avg ?? -1) - (avgScore[a.id]?.avg ?? -1));
  }, [submissions, statusFilter, categoryFilter, q, profiles, avgScore]);

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
    const label =
      status === "accepted" || status === "rejected"
        ? `${status === "accepted" ? "Accept" : "Reject"} ${ids.length} submission${ids.length === 1 ? "" : "s"} and email the speakers?`
        : null;
    if (label && !confirm(label)) return;
    setBusy(true);
    try {
      for (const id of ids) {
        await callFn("setSubmissionStatus", { submissionId: id, status });
      }
      setSelected(new Set());
    } finally {
      setBusy(false);
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
        {/* Toolbar */}
        <DashboardToolbar>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, abstract, speaker…"
              className="w-64"
              aria-label="Search submissions"
              autoComplete="off"
            />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-auto"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </Select>
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
          <div className="flex items-center gap-3">
            <AddRoundButton event={event} rounds={rounds} />
            <span className="text-xs tabular-nums text-muted-foreground">
              {rows.length} of {submissions.length}
            </span>
          </div>
        </DashboardToolbar>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-2 text-white">
            <span className="text-[13px] font-medium">{selected.size} selected</span>
            <div className="ml-auto flex items-center gap-1.5">
              <BulkBtn onClick={() => bulkStatus("accepted")} disabled={busy}>
                Accept + email
              </BulkBtn>
              <BulkBtn onClick={() => bulkStatus("rejected")} disabled={busy}>
                Reject + email
              </BulkBtn>
              <BulkBtn onClick={() => bulkStatus("waitlisted")} disabled={busy}>
                Waitlist
              </BulkBtn>
              <BulkBtn onClick={bulkAdvance} disabled={busy}>
                Advance round
              </BulkBtn>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
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
                <TableHead>Title / speaker</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
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
                      <div className="truncate font-medium text-zinc-900">{s.title}</div>
                      <div className="truncate text-xs text-zinc-400">
                        {profile?.name ?? "—"}
                        {profile?.company ? ` · ${profile.company}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.category ?? "—"}</TableCell>
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
  const fields = form ? fieldsOf(form) : [];
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(status: string) {
    const notify = status === "accepted" || status === "rejected";
    if (notify && !confirm(`${status === "accepted" ? "Accept" : "Reject"} “${submission.title}” and email the speaker?`)) return;
    setBusy(status);
    try {
      await callFn("setSubmissionStatus", { submissionId: submission.id, status });
    } finally {
      setBusy(null);
    }
  }

  // Round to score against: the submission's current round, else the last
  // defined, else an implicit round 1 (auto-created on first score).
  const activeRound =
    rounds.find((r) => r.roundNumber === submission.currentRound) ?? rounds[rounds.length - 1];

  return (
    <aside className="hidden w-[380px] shrink-0 lg:block">
      <div className="sticky top-6 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-4">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-snug text-zinc-900">
              {submission.title}
            </h3>
            <div className="mt-1 flex items-center gap-2">
              <StatusPill status={submission.status} />
              {submission.category && (
                <span className="text-xs text-zinc-400">{submission.category}</span>
              )}
              <span className="text-xs text-zinc-400">round {submission.currentRound}</span>
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Close details"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>

        <div className="space-y-5 p-4">
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
        </div>
      </div>
    </aside>
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
  const criteria = round
    ? (parseJson<{ key: string; label: string; max: number }[]>(round.criteriaJson) ??
      DEFAULT_CRITERIA)
    : DEFAULT_CRITERIA;

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
        // First score on an event with no rounds: create round 1 implicitly.
        roundId = await db.insert("ReviewRound", {
          orgId: event.orgId,
          eventId: event.id,
          roundNumber: 1,
          name: "Round 1",
          criteriaJson: DEFAULT_CRITERIA,
          status: "open",
        });
      }
      const payload = {
        scoresJson: scores,
        comment: comment.trim() || undefined,
        recommendation: recommendation || undefined,
        updatedAt: new Date().toISOString(),
      };
      if (mine) {
        await db.update("Review", mine.id, payload);
      } else {
        await db.insert("Review", {
          orgId: event.orgId,
          eventId: event.id,
          submissionId: submission.id,
          roundId,
          reviewerUserId: currentUserId,
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
        Your score {round ? `· ${round.name}` : "· Round 1"}
      </h4>
      <div className="mt-2 space-y-2.5">
        {criteria.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-zinc-600">{c.label}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: c.max }, (_, i) => i + 1).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-label={`${c.label}: ${v} of ${c.max}`}
                  onClick={() => {
                    setScores((s) => ({ ...s, [c.key]: v }));
                    setSaved(false);
                  }}
                  className="p-0.5"
                >
                  <Star
                    className={
                      "size-4 " +
                      ((scores[c.key] ?? 0) >= v
                        ? "fill-amber-400 text-amber-400"
                        : "text-zinc-300 hover:text-zinc-400")
                    }
                  />
                </button>
              ))}
            </div>
          </div>
        ))}
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
// lazily when scoring at a round number with no row yet. A dedicated rounds
// editor can come with M3 polish if organizers ask for custom criteria per
// round.)

export function AddRoundButton({ event, rounds }: { event: EventRow; rounds: ReviewRoundRow[] }) {
  const next = (rounds[rounds.length - 1]?.roundNumber ?? 0) + 1;
  async function add() {
    await db.insert("ReviewRound", {
      orgId: event.orgId,
      eventId: event.id,
      roundNumber: next,
      name: `Round ${next}`,
      criteriaJson: DEFAULT_CRITERIA,
      status: "open",
    });
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={add}
    >
      <Plus data-icon="inline-start" /> Add round {next}
    </Button>
  );
}
