"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db, callFn } from "@pylonsync/react";
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardStatusBadge,
  DashboardToolbar,
  DashboardWidePage,
} from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Archive, Check, Download, FileStack, History, MessageSquareWarning } from "lucide-react";
import { buildZip, zipSafeName } from "@/lib/zip";
import { latestVersion, versionsForSlot } from "@/lib/deliverables";
import { reviewStatusLabel } from "@/lib/content";
import type {
  DeliverableCommentRow,
  DeliverableSlotRow,
  DeliverableVersionRow,
  EventRow,
  SpeakerProfileRow,
} from "@/lib/types";

// Organizer review desk over the deliverable system: one row per slot, showing
// the latest uploaded version, the verdict, and the version history. Verdicts
// write through reviewDeliverable; downloads mint short-lived signed URLs via
// getDeliverableFileUrl (the raw /api/files path is owner-scoped).

const STATUS_FILTERS = [
  ["all", "All statuses"],
  ["pending", "Pending review"],
  ["approved", "Approved"],
  ["changes_requested", "Changes requested"],
  ["awaiting_upload", "Awaiting upload"],
] as const;

import { fmtDateTime as fmtDate } from "@/lib/format";

function DownloadLink({ version, children }: { version: DeliverableVersionRow; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        callFn<{ url: string }>("getDeliverableFileUrl", { versionId: version.id })
          .then((r) => window.open(r.url, "_blank", "noreferrer"))
          .finally(() => setBusy(false));
      }}
      className="inline-flex min-w-0 items-center gap-1.5 text-sm underline-offset-2 hover:underline disabled:opacity-60"
      title={`Open ${version.filename}`}
    >
      {children}
    </button>
  );
}

export function ContentTable({
  event,
  initialSlots,
  initialVersions,
  initialComments,
  initialProfiles,
}: {
  event: EventRow;
  initialSlots: DeliverableSlotRow[];
  initialVersions: DeliverableVersionRow[];
  initialComments: DeliverableCommentRow[];
  initialProfiles: SpeakerProfileRow[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const slotsQ = db.useQuery<DeliverableSlotRow>("DeliverableSlot");
  const versionsQ = db.useQuery<DeliverableVersionRow>("DeliverableVersion");
  const commentsQ = db.useQuery<DeliverableCommentRow>("DeliverableComment");
  const profilesQ = db.useQuery<SpeakerProfileRow>("SpeakerProfile");
  const slots =
    !hydrated || slotsQ.loading ? initialSlots : slotsQ.data.filter((r) => r.eventId === event.id);
  const versions =
    !hydrated || versionsQ.loading ? initialVersions : versionsQ.data.filter((r) => r.eventId === event.id);
  const comments =
    !hydrated || commentsQ.loading ? initialComments : commentsQ.data.filter((r) => r.eventId === event.id);
  const profiles =
    !hydrated || profilesQ.loading ? initialProfiles : profilesQ.data.filter((r) => r.eventId === event.id);

  const speakerByUser = useMemo(() => new Map(profiles.map((p) => [p.userId, p])), [profiles]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [historyFor, setHistoryFor] = useState<DeliverableSlotRow | null>(null);
  const [changesFor, setChangesFor] = useState<DeliverableSlotRow | null>(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveStatus = (slot: DeliverableSlotRow) =>
    latestVersion(versions, slot.id) ? (slot.status ?? "pending") : "awaiting_upload";

  let rows = slots
    .slice()
    .sort((a, b) => (latestVersion(versions, b.id)?.createdAt ?? "").localeCompare(latestVersion(versions, a.id)?.createdAt ?? ""));
  if (status !== "all") rows = rows.filter((slot) => effectiveStatus(slot) === status);
  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    rows = rows.filter((slot) => {
      const speaker = speakerByUser.get(slot.speakerUserId);
      const latest = latestVersion(versions, slot.id);
      return (
        slot.title.toLowerCase().includes(needle) ||
        (latest?.filename ?? "").toLowerCase().includes(needle) ||
        (speaker?.name ?? "").toLowerCase().includes(needle)
      );
    });
  }

  const pendingCount = slots.filter((slot) => effectiveStatus(slot) === "pending").length;

  async function review(slot: DeliverableSlotRow, verdict: "approved" | "changes_requested", reviewNote?: string) {
    setBusyId(slot.id);
    setError(null);
    try {
      await callFn("reviewDeliverable", { slotId: slot.id, status: verdict, note: reviewNote });
      setChangesFor(null);
      setNote("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save that review.");
    } finally {
      setBusyId(null);
    }
  }

  const approvedSlots = slots.filter(
    (slot) => effectiveStatus(slot) === "approved" && latestVersion(versions, slot.id),
  );

  // Bundle every approved deliverable's latest version into a zip, fetched
  // through short-lived signed URLs in the organizer's browser — the files
  // never transit shared storage.
  async function downloadApproved() {
    setZipping(true);
    setError(null);
    try {
      const entries = [];
      const seen = new Set<string>();
      for (const slot of approvedSlots) {
        const version = latestVersion(versions, slot.id)!;
        const { url } = await callFn<{ url: string }>("getDeliverableFileUrl", {
          versionId: version.id,
        });
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Couldn't fetch ${version.filename}.`);
        const data = new Uint8Array(await response.arrayBuffer());
        const speaker = speakerByUser.get(slot.speakerUserId)?.name ?? "speaker";
        let name = zipSafeName(`${speaker}/${version.filename}`);
        if (seen.has(name)) name = zipSafeName(`${speaker}/v${version.versionNumber}-${version.filename}`);
        seen.add(name);
        entries.push({ name, data });
      }
      const bytes = buildZip(entries, new Date());
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${event.slug || "event"}-approved-content.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't build the archive.");
    } finally {
      setZipping(false);
    }
  }

  if (slots.length === 0) {
    return (
      <DashboardWidePage>
        <DashboardEmptyState
          icon={FileStack}
          title="No deliverables yet"
          description="Create upload tasks under Tasks; files speakers upload against them land here for review."
        />
      </DashboardWidePage>
    );
  }

  return (
    <DashboardWidePage>
      <DashboardToolbar>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search files or speakers…"
            className="w-full sm:w-64"
            aria-label="Search files"
            autoComplete="off"
          />
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-44"
          >
            {STATUS_FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">
            {pendingCount} pending · {rows.length} shown
          </span>
          {approvedSlots.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={zipping}
              onClick={() => void downloadApproved()}
            >
              <Archive data-icon="inline-start" />
              {zipping ? "Zipping…" : `Download approved (${approvedSlots.length})`}
            </Button>
          ) : null}
        </div>
      </DashboardToolbar>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Speaker</TableHead>
              <TableHead>Deliverable</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((slot) => {
              const speaker = speakerByUser.get(slot.speakerUserId);
              const slotVersions = versionsForSlot(versions, slot.id);
              const latest = slotVersions[0];
              const slotComments = comments.filter((c) => c.slotId === slot.id);
              const rowStatus = effectiveStatus(slot);
              return (
                <TableRow key={slot.id}>
                  <TableCell className="font-medium">{speaker?.name ?? "Unknown speaker"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {latest ? (
                        <DownloadLink version={latest}>
                          <Download className="size-3.5 shrink-0 text-zinc-400" />
                          <span className="max-w-56 truncate">{latest.filename}</span>
                        </DownloadLink>
                      ) : (
                        <span className="text-sm text-zinc-400">{slot.title}</span>
                      )}
                      <Badge variant="outline" className="capitalize">{slot.kind}</Badge>
                      {latest ? (
                        <span className="whitespace-nowrap text-xs tabular-nums text-zinc-400">
                          v{latest.versionNumber}
                        </span>
                      ) : null}
                      {slotVersions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setHistoryFor(slot)}
                          className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-zinc-500 underline-offset-2 hover:underline"
                        >
                          <History className="size-3" /> {slotVersions.length - 1} previous
                        </button>
                      )}
                      {slotComments.length > 0 && (
                        <span className="whitespace-nowrap text-xs tabular-nums text-zinc-400">
                          {slotComments.length} comment{slotComments.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    {rowStatus === "changes_requested" && slot.reviewNote ? (
                      <p className="mt-1 text-xs text-amber-700">“{slot.reviewNote}”</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-zinc-500">
                    {/* Viewer-local time: differs from the SSR (UTC) render by design. */}
                    <span suppressHydrationWarning>{fmtDate(latest?.createdAt)}</span>
                  </TableCell>
                  <TableCell>
                    <DashboardStatusBadge status={rowStatus}>
                      {rowStatus === "awaiting_upload" ? "Awaiting upload" : reviewStatusLabel(rowStatus)}
                    </DashboardStatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    {latest ? (
                      <div className="flex justify-end gap-1.5">
                        {rowStatus !== "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === slot.id}
                            onClick={() => void review(slot, "approved")}
                          >
                            <Check className="size-3.5" /> Approve
                          </Button>
                        )}
                        {rowStatus !== "changes_requested" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === slot.id}
                            onClick={() => {
                              setChangesFor(slot);
                              setNote("");
                            }}
                          >
                            <MessageSquareWarning className="size-3.5" /> Request changes
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Request-changes note */}
      <Dialog open={changesFor !== null} onOpenChange={(open) => !open && setChangesFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>
              The speaker sees this note in their portal next to{" "}
              <span className="font-medium">{changesFor?.title ?? "the file"}</span>.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Please export as PDF and use the 16:9 template."
            rows={4}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangesFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={!note.trim() || (changesFor !== null && busyId === changesFor.id)}
              onClick={() => changesFor && void review(changesFor, "changes_requested", note.trim())}
            >
              Send to speaker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version history */}
      <Dialog open={historyFor !== null} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>{historyFor?.title}</DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {historyFor &&
              versionsForSlot(versions, historyFor.id).map((version) => (
                <li key={version.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <DownloadLink version={version}>
                    <span className="truncate">{version.filename}</span>
                  </DownloadLink>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-400" suppressHydrationWarning>
                    v{version.versionNumber} · {fmtDate(version.createdAt)}
                  </span>
                </li>
              ))}
          </ul>
        </DialogContent>
      </Dialog>
    </DashboardWidePage>
  );
}
