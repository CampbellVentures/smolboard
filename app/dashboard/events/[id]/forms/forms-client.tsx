"use client";

import React, { useEffect, useState } from "react";
import { callFn, db, Link, useRouter } from "@pylonsync/react";
import {
  DashboardEmptyState,
  DashboardHero,
  DashboardIconChip,
  DashboardPage,
  DashboardStatusBadge,
  DashboardWidePage,
} from "@/components/dashboard";
import { ResponsiveFormOverlay } from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ChevronRight, FilePlus2, FileText, ExternalLink, Trash2 } from "lucide-react";
import { parseFields, slugify } from "@/lib/forms";
import { useOrgSlug } from "@/components/use-org-slug";
import { useOptimisticRemoval } from "@/components/use-optimistic-removal";
import { parseJson } from "@/lib/types";
import type { EventRow, SubmissionFormRow, SubmissionRow } from "@/lib/types";

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

export function FormsList({
  event,
  initial,
  initialSubmissions,
}: {
  event: EventRow;
  initial: SubmissionFormRow[];
  initialSubmissions: SubmissionRow[];
}) {
  const router = useRouter();
  const orgSlug = useOrgSlug(event.orgId);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const { data, loading } = db.useQuery<SubmissionFormRow>("SubmissionForm");
  const allRows = !hydrated || loading ? initial : data.filter((f) => f.eventId === event.id);
  // A confirmed delete leaves the card up for seconds while the replica
  // catches up — hide it immediately instead.
  const removal = useOptimisticRemoval();
  const rows = allRows.filter((f) => !removal.isHidden(f.id));
  useEffect(() => {
    removal.settle(allRows.map((f) => f.id));
  }, [allRows, removal]);
  const submissionQuery = db.useQuery<SubmissionRow>("Submission");
  const submissions = (
    !hydrated || submissionQuery.loading ? initialSubmissions : submissionQuery.data
  ).filter((row) => row.eventId === event.id);
  const forms = rows.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Call for speakers");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(formId: string, name: string) {
    try {
      await callFn("deleteSubmissionForm", { formId });
      removal.hide(formId);
      toast.success(`Deleted “${name}”`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Couldn't delete the form.");
    }
  }

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
      setError("Couldn't create the form. A form with that name may already exist.");
      setBusy(false);
    }
  }

  return (
    <DashboardWidePage>
      <DashboardHero>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-lg">
            <h2 className="text-balance text-lg font-semibold tracking-tight">Submission forms</h2>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              Each form is a public CFP page. Share the link and submissions arrive in
              review as speakers send them.
            </p>
          </div>
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
              <ResponsiveFormOverlay.Header icon={FilePlus2}>
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
        </div>
      </DashboardHero>

      {forms.length === 0 ? (
        <DashboardEmptyState
          icon={FilePlus2}
          title="No forms yet"
          description="Create a submission form to open your CFP."
        />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {forms.map((f) => {
            const fieldCount = parseFields(parseJson(f.fieldsJson) ?? []).length;
            const submissionCount = submissions.filter((s) => s.formId === f.id).length;
            return (
              <section
                key={f.id}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
              >
                <Link
                  href={`/dashboard/events/${event.id}/forms/${f.id}`}
                  className="flex items-start gap-3 p-4"
                >
                  <DashboardIconChip icon={FileText} tone="violet" size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{f.name}</span>
                      <StatusBadge status={f.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      /{orgSlug ?? "…"}/{event.slug}/cfp/{f.slug}
                    </p>
                  </div>
                </Link>
                <dl className="grid grid-cols-2 gap-px border-t bg-border/60">
                  <div className="bg-card px-4 py-2.5">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Questions
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">{fieldCount + 4}</dd>
                  </div>
                  <div className="bg-card px-4 py-2.5">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Submissions
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">{submissionCount}</dd>
                  </div>
                </dl>
                <div className="mt-auto flex items-center justify-between gap-2 border-t bg-muted/40 px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/dashboard/events/${event.id}/forms/${f.id}`}>
                        Edit form
                        <ChevronRight data-icon="inline-end" />
                      </Link>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete ${f.name}`}
                        >
                          <Trash2 data-icon="inline-start" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete “{f.name}”?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {submissionCount > 0
                              ? `This form has ${submissionCount} submission${submissionCount === 1 ? "" : "s"}. Close it from the builder instead — deleting would orphan those proposals.`
                              : "The public CFP page for this form stops working immediately."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            disabled={submissionCount > 0}
                            onClick={() => void remove(f.id, f.name)}
                          >
                            Delete form
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  {f.status === "open" && orgSlug ? (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/${orgSlug}/${event.slug}/cfp/${f.slug}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink data-icon="inline-start" />
                        View public page
                      </a>
                    </Button>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </DashboardWidePage>
  );
}
