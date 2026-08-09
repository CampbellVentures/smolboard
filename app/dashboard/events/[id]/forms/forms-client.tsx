"use client";

import React, { useEffect, useState } from "react";
import { callFn, db, Link, useRouter } from "@pylonsync/react";
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardStatusBadge,
  DashboardToolbar,
} from "@/components/dashboard";
import { ResponsiveFormOverlay } from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ChevronRight, FilePlus2, ExternalLink } from "lucide-react";
import { slugify } from "@/lib/forms";
import { useOrgSlug } from "@/components/use-org-slug";
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
  const orgSlug = useOrgSlug(event.orgId);
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
      const result = await callFn<{ id: string }>("saveSubmissionForm", {
        eventId: event.id,
        name: n,
        slug: slugify(n),
        status: "draft",
        fieldsJson: STARTER_FIELDS,
      });
      router.push(`/dashboard/events/${event.id}/forms/${result.id}`);
    } catch {
      setError("Couldn't create the form — a form with that name may already exist.");
      setBusy(false);
    }
  }

  return (
    <DashboardPage>
      <DashboardToolbar className="justify-end">
        <ResponsiveFormOverlay.Root
          open={creating}
          onOpenChange={(open) => {
            setCreating(open);
            if (!open) setError(null);
          }}
        >
          <ResponsiveFormOverlay.Trigger>
            <Button type="button" size="sm">
              <FilePlus2 data-icon="inline-start" /> New form
            </Button>
          </ResponsiveFormOverlay.Trigger>
          <ResponsiveFormOverlay.Content>
            <form onSubmit={create} className="contents">
              <ResponsiveFormOverlay.Header>
                <ResponsiveFormOverlay.Title>New submission form</ResponsiveFormOverlay.Title>
                <ResponsiveFormOverlay.Description>
                  Start with the common CFP questions, then customize the form builder.
                </ResponsiveFormOverlay.Description>
              </ResponsiveFormOverlay.Header>
              <ResponsiveFormOverlay.Body>
                <FieldGroup>
                  <Field data-invalid={!!error}>
                    <FieldLabel htmlFor="new-form-name">Form name</FieldLabel>
                    <Input
                      id="new-form-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="off"
                      aria-invalid={!!error}
                    />
                    {error ? <FieldError>{error}</FieldError> : null}
                  </Field>
                </FieldGroup>
              </ResponsiveFormOverlay.Body>
              <ResponsiveFormOverlay.Footer>
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !name.trim()}>
                  {busy ? "Creating…" : "Create form"}
                </Button>
              </ResponsiveFormOverlay.Footer>
            </form>
          </ResponsiveFormOverlay.Content>
        </ResponsiveFormOverlay.Root>
      </DashboardToolbar>

      {forms.length === 0 ? (
        <DashboardEmptyState
          icon={FilePlus2}
          title="No forms yet"
          description="Create a submission form to open your CFP."
        />
      ) : (
        <ul className="overflow-hidden rounded-xl border bg-card">
          {forms.map((f) => (
            <li
              key={f.id}
              className="flex min-h-14 items-center gap-3 border-b px-4 py-2.5 transition-[background-color] duration-150 ease-out last:border-b-0 hover:bg-muted/50"
            >
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
                <div className="mt-0.5 text-xs text-zinc-400">
                  /{orgSlug ?? "…"}/{event.slug}/cfp/{f.slug}
                </div>
              </Link>
              {f.status === "open" && orgSlug && (
                <a
                  href={`/${orgSlug}/${event.slug}/cfp/${f.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" /> View
                </a>
              )}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  );
}
