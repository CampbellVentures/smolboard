"use client";

import React, { useEffect, useState } from "react";
import { db, Link } from "@pylonsync/react";
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardStatusBadge,
  DashboardToolbar,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, Circle, Users } from "lucide-react";
import type { EventRow, SpeakerProfileRow, SubmissionRow } from "@/lib/types";

// Speaker roster for the event: profile completeness at a glance (the
// onboarding table on the event dashboard focuses on accepted speakers' tasks;
// this is everyone who has ever submitted).

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs" title={label}>
      {ok ? (
        <CheckCircle2 className="size-3.5 text-emerald-500" />
      ) : (
        <Circle className="size-3.5 text-zinc-300" />
      )}
      <span className={ok ? "text-zinc-600" : "text-zinc-400"}>{label}</span>
    </span>
  );
}

export function SpeakersTable({
  event,
  initialProfiles,
  initialSubmissions,
}: {
  event: EventRow;
  initialProfiles: SpeakerProfileRow[];
  initialSubmissions: SubmissionRow[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const profQ = db.useQuery<SpeakerProfileRow>("SpeakerProfile");
  const subsQ = db.useQuery<SubmissionRow>("Submission");
  const profiles =
    !hydrated || profQ.loading
      ? initialProfiles
      : profQ.data.filter((p) => p.eventId === event.id);
  const submissions =
    !hydrated || subsQ.loading
      ? initialSubmissions
      : subsQ.data.filter((s) => s.eventId === event.id);

  const [q, setQ] = useState("");
  const [acceptedOnly, setAcceptedOnly] = useState(false);

  const acceptedBy = new Set(
    submissions.filter((s) => s.status === "accepted").map((s) => s.speakerUserId),
  );
  let rows = profiles;
  if (acceptedOnly) rows = rows.filter((p) => acceptedBy.has(p.userId));
  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    rows = rows.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.email.toLowerCase().includes(needle) ||
        (p.company ?? "").toLowerCase().includes(needle),
    );
  }
  rows = rows.slice().sort((a, b) => a.name.localeCompare(b.name));

  if (profiles.length === 0) {
    return (
      <DashboardPage>
        <DashboardEmptyState
          icon={Users}
          title="No speakers yet"
          description="Speakers appear here after they submit through an open form."
        >
          <Button asChild>
            <Link href={`/dashboard/events/${event.id}/forms`}>Open submission forms</Link>
          </Button>
        </DashboardEmptyState>
      </DashboardPage>
    );
  }

  return (
    <DashboardPage>
      <DashboardToolbar>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search speakers…"
            className="w-64"
            aria-label="Search speakers"
            autoComplete="off"
          />
        <label className="flex items-center gap-1.5 text-[13px] text-zinc-600">
          <input
            type="checkbox"
            checked={acceptedOnly}
            onChange={(e) => setAcceptedOnly(e.target.checked)}
            className="size-4 rounded border-zinc-300 accent-zinc-900"
          />
          Accepted only
        </label>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{rows.length} speakers</span>
      </DashboardToolbar>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Speaker</TableHead>
              <TableHead>Submissions</TableHead>
              <TableHead>Profile</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const subs = submissions.filter((s) => s.speakerUserId === p.userId);
              const accepted = subs.filter((s) => s.status === "accepted").length;
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium text-zinc-900">{p.name}</div>
                    <div className="text-xs text-zinc-400">
                      {[p.jobTitle, p.company].filter(Boolean).join(", ") || p.email}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {subs.length} total
                    {accepted > 0 && (
                      <DashboardStatusBadge status="accepted">
                        {accepted} accepted
                      </DashboardStatusBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-3">
                      <Dot ok={!!p.bio} label="bio" />
                      <Dot ok={!!p.tagline} label="tagline" />
                      <Dot ok={!!p.headshotFileId} label="headshot" />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                  No speakers match those filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </DashboardPage>
  );
}
