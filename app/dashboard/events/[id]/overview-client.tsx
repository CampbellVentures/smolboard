"use client";

import React, { useEffect, useState } from "react";
import { db, Link } from "@pylonsync/react";
import { Inbox, FileText, CheckCircle2, ExternalLink, Copy, Check } from "lucide-react";
import {
  DashboardMetricCard,
  DashboardPage,
  DashboardPanel,
  DashboardStatusBadge,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import type { EventRow, SubmissionRow, SubmissionFormRow } from "@/lib/types";

// Event dashboard. Submissions stream in live (db.useQuery) — during an open
// CFP the counters tick up without a refresh.

export function EventOverview({
  event,
  initialSubmissions,
  forms,
}: {
  event: EventRow;
  initialSubmissions: SubmissionRow[];
  forms: SubmissionFormRow[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const { data, loading } = db.useQuery<SubmissionRow>("Submission");
  const subs =
    !hydrated || loading
      ? initialSubmissions
      : data.filter((s) => s.eventId === event.id);

  const byStatus: Record<string, number> = {};
  for (const s of subs) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  const accepted = byStatus.accepted ?? 0;
  const openForms = forms.filter((f) => f.status === "open");

  const [copied, setCopied] = useState(false);
  const cfpUrl = `/cfp/${event.slug}`;
  function copyCfp() {
    navigator.clipboard.writeText(`${window.location.origin}${cfpUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function setCfpStatus(status: string) {
    await db.update("Event", event.id, { cfpStatus: status });
    window.location.reload();
  }

  return (
    <DashboardPage>
      <div className="grid gap-4 sm:grid-cols-3">
        <DashboardMetricCard
          icon={Inbox}
          label="Submissions"
          value={subs.length}
          hint={
            byStatus.submitted
              ? `${byStatus.submitted} awaiting review`
              : subs.length === 0
                ? "none yet"
                : "all triaged"
          }
        />
        <DashboardMetricCard
          icon={CheckCircle2}
          label="Accepted"
          value={accepted}
          hint={byStatus.rejected ? `${byStatus.rejected} rejected` : undefined}
        />
        <DashboardMetricCard
          icon={FileText}
          label="Open forms"
          value={openForms.length}
          hint={`${forms.length} total`}
        />
      </div>

      <DashboardPanel
        title="Call for speakers"
        action={
          <DashboardStatusBadge status={event.cfpStatus}>
            {event.cfpStatus === "open" ? "Live" : event.cfpStatus}
          </DashboardStatusBadge>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-md bg-zinc-50 px-2.5 py-1.5 text-[13px] text-zinc-600">
            {cfpUrl}
          </code>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={copyCfp}
          >
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href={cfpUrl} target="_blank" rel="noreferrer">
              <ExternalLink data-icon="inline-start" /> Preview
            </a>
          </Button>
          <div className="ml-auto">
            {event.cfpStatus === "open" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setCfpStatus("closed")}
              >
                Close CFP
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => setCfpStatus("open")}
              >
                Open CFP
              </Button>
            )}
          </div>
        </div>
        {event.cfpStatus === "open" && openForms.length === 0 && (
          <p className="mt-3 text-xs text-amber-600">
            The CFP is open but no form is published —{" "}
            <Link href={`/dashboard/events/${event.id}/forms`} className="underline">
              open a submission form
            </Link>{" "}
            so speakers have something to fill in.
          </p>
        )}
      </DashboardPanel>

      <DashboardPanel title="Latest submissions">
        {subs.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">
            Submissions land here the moment a speaker hits submit.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {subs
              .slice()
              .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
              .slice(0, 8)
              .map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-900">{s.title}</div>
                    <div className="text-xs text-zinc-400">
                      {s.category ? `${s.category} · ` : ""}
                      {s.status}
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/events/${event.id}/abstracts`}
                    className="text-[13px] font-medium text-zinc-400 hover:text-zinc-700"
                  >
                    Review →
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </DashboardPanel>
    </DashboardPage>
  );
}
