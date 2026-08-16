"use client";

import React, { useEffect, useState } from "react";
import { callFn } from "@pylonsync/react";
import { Inbox } from "lucide-react";

import { DashboardEmptyState } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StarRating } from "@/components/star-rating";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { NormalizedReviewCriterion } from "@/lib/reviews";
import type { ReviewerQueueItem } from "@/lib/types";

export function ReviewerQueue({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<ReviewerQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    try {
      const result = await callFn<{ items: ReviewerQueueItem[] }>("getReviewerQueue", { orgId });
      setItems(result.items);
      setError(null);
    } catch {
      setError("Reviewer access is not active for this workspace.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [orgId]);
  if (loading) return <p className="text-sm text-muted-foreground">Loading assigned reviews…</p>;
  if (error) {
    return (
      <DashboardEmptyState
        icon={Inbox}
        title="Reviewer access is not active"
        description="Your account is not a reviewer in this workspace. A workspace owner can turn it on from the Team page."
      />
    );
  }
  if (items.length === 0) {
    return (
      <DashboardEmptyState
        icon={Inbox}
        title="No reviews assigned"
        description="When an organizer assigns you submissions to score, they show up here."
      />
    );
  }
  return (
    <div className="space-y-4" data-reviewer-queue>
      {items.map((item) => <ReviewCard key={item.assignmentId} item={item} onSaved={load} />)}
    </div>
  );
}

function ReviewCard({ item, onSaved }: { item: ReviewerQueueItem; onSaved: () => Promise<void> }) {
  const [scores, setScores] = useState<Record<string, string | number>>(
    (item.review?.scoresJson as Record<string, string | number> | undefined) ?? {},
  );
  const [comment, setComment] = useState(item.review?.comment ?? "");
  const [recommendation, setRecommendation] = useState(item.review?.recommendation ?? "");
  const [busy, setBusy] = useState(false);
  const criteria = item.round.criteria as NormalizedReviewCriterion[];
  async function submit() {
    setBusy(true);
    try {
      await callFn("submitReview", {
        assignmentId: item.assignmentId,
        scoresJson: scores,
        comment,
        recommendation: recommendation || undefined,
      });
      await onSaved();
    } finally {
      setBusy(false);
    }
  }
  async function recuse() {
    const reason = window.prompt("Why are you recusing from this review?")?.trim();
    if (!reason) return;
    setBusy(true);
    try {
      await callFn("recuseReview", { assignmentId: item.assignmentId, reason });
      await onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">{item.event.name} · {item.round.name}</p>
          <h2 className="mt-1 text-base font-semibold">{item.submission.title}</h2>
          {item.author ? <p className="text-xs text-muted-foreground">{item.author.name} · {item.author.email}</p> : <p className="text-xs text-muted-foreground">Blind review</p>}
          {item.submission.participants?.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Participants: {item.submission.participants.map((participant) => participant.name ? `${participant.name} (${participant.roleLabel})` : participant.roleLabel).join(", ")}
            </p>
          ) : null}
        </div>
        <span className="text-xs capitalize text-muted-foreground">{item.assignmentStatus}</span>
      </div>
      {item.submission.abstract ? <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{item.submission.abstract}</p> : null}
      {item.assignmentStatus !== "recused" ? (
        <div className="mt-5 space-y-3">
          {criteria.map((criterion) => (
            <CriterionField
              key={criterion.key}
              criterion={criterion}
              value={scores[criterion.key]}
              onChange={(value) => setScores((current) => ({ ...current, [criterion.key]: value }))}
            />
          ))}
          <Select value={recommendation} onChange={(event) => setRecommendation(event.target.value)} aria-label="Recommendation">
            <option value="">No recommendation</option>
            <option value="accept">Accept</option>
            <option value="neutral">Neutral</option>
            <option value="reject">Reject</option>
          </Select>
          <Textarea value={comment} onChange={(event) => setComment(event.target.value)} aria-label="Review comment" placeholder="Private review notes" />
          <div className="flex gap-2">
            <Button type="button" onClick={() => void submit()} disabled={busy}>Submit review</Button>
            {item.assignmentStatus !== "complete" ? <Button type="button" variant="outline" onClick={() => void recuse()} disabled={busy}>Recuse</Button> : null}
          </div>
        </div>
      ) : <p className="mt-4 text-sm text-muted-foreground">You recused from this assignment.</p>}
    </article>
  );
}

function CriterionField({ criterion, value, onChange }: { criterion: NormalizedReviewCriterion; value: unknown; onChange: (value: string | number) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{criterion.label}{criterion.required ? " *" : ""}</span>
      {criterion.type === "numeric" ? (
        <StarRating
          label={criterion.label}
          value={typeof value === "number" ? value : null}
          max={criterion.max ?? 5}
          onChange={(next) => onChange(next)}
        />
      ) : criterion.type === "select" ? (
        <Select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select…</option>
          {criterion.options?.map((option) => <option key={option}>{option}</option>)}
        </Select>
      ) : (
        <Textarea value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}
