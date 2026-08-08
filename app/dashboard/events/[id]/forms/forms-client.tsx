"use client";

import React, { useEffect, useState } from "react";
import { db, Link, useRouter } from "@pylonsync/react";
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardPanel,
  DashboardStatusBadge,
  DashboardToolbar,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilePlus2, ExternalLink } from "lucide-react";
import { slugify } from "@/lib/forms";
import type { EventRow, SubmissionFormRow } from "@/lib/types";

// Starter fields for a new CFP form — matches the common conference shape so
// organizers edit rather than start blank.
const STARTER_FIELDS = [
  {
    key: "format",
    type: "select",
    label: "Session format",
    required: true,
    options: ["Talk (25 min)", "Lightning talk (10 min)", "Workshop (90 min)"],
  },
  {
    key: "track",
    type: "select",
    label: "Which track fits best?",
    required: true,
    options: ["AI Engineering", "Agents", "Infrastructure", "Other"],
  },
  {
    key: "audience_level",
    type: "select",
    label: "Audience level",
    options: ["Beginner", "Intermediate", "Advanced"],
  },
  {
    key: "previous_talk",
    type: "url",
    label: "Link to a previous talk (optional)",
    helpText: "A recording helps reviewers calibrate.",
  },
];

function StatusBadge({ status }: { status: string }) {
  return <DashboardStatusBadge status={status} />;
}

export function FormsList({ event, initial }: { event: EventRow; initial: SubmissionFormRow[] }) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const { data, loading } = db.useQuery<SubmissionFormRow>("SubmissionForm");
  const rows = !hydrated || loading ? initial : data.filter((f) => f.eventId === event.id);
  const forms = rows.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Call for speakers");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    try {
      const id = await db.insert("SubmissionForm", {
        orgId: event.orgId,
        eventId: event.id,
        name: n,
        slug: slugify(n),
        status: "draft",
        fieldsJson: JSON.stringify(STARTER_FIELDS),
      });
      router.push(`/dashboard/events/${event.id}/forms/${id}`);
    } catch {
      setError("Couldn't create the form — a form with that name may already exist.");
      setBusy(false);
    }
  }

  return (
    <DashboardPage>
      {creating ? (
        <DashboardPanel title="New form">
          <form onSubmit={create} className="flex items-center gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Form name"
              autoComplete="off"
            />
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {busy ? "…" : "Create"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
          </form>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <p className="mt-2 text-xs text-zinc-400">
            Starts with a sensible CFP template — add your own fields, conditions,
            and routing in the builder.
          </p>
        </DashboardPanel>
      ) : (
        <DashboardToolbar>
          <p className="text-sm text-zinc-500">
            Each form gets a public URL under /cfp/{event.slug}. Open a form (and the
            event&apos;s CFP) to accept submissions.
          </p>
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <FilePlus2 data-icon="inline-start" /> New form
          </Button>
        </DashboardToolbar>
      )}

      {forms.length === 0 && !creating ? (
        <DashboardEmptyState
          icon={FilePlus2}
          title="No forms yet"
          description="Create a submission form to open your CFP."
        />
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {forms.map((f) => (
            <li key={f.id} className="flex items-center gap-4 px-5 py-4">
              <Link
                href={`/dashboard/events/${event.id}/forms/${f.id}`}
                className="min-w-0 flex-1"
              >
                <div className="flex items-center gap-2.5">
                  <span className="truncate text-sm font-semibold text-zinc-900 hover:underline">
                    {f.name}
                  </span>
                  <StatusBadge status={f.status} />
                </div>
                <div className="mt-0.5 text-xs text-zinc-400">/cfp/{event.slug}/{f.slug}</div>
              </Link>
              {f.status === "open" && (
                <a
                  href={`/cfp/${event.slug}/${f.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[13px] font-medium text-zinc-400 hover:text-zinc-700"
                >
                  <ExternalLink className="size-3.5" /> View
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  );
}
