"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db } from "@pylonsync/react";
import { callFn } from "@/lib/fn";
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
  SessionRow,
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
  initialSessions,
}: {
  event: EventRow;
  initialSlots: DeliverableSlotRow[];
  initialVersions: DeliverableVersionRow[];
  initialComments: DeliverableCommentRow[];
  initialProfiles: SpeakerProfileRow[];
  initialSessions: SessionRow[];
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

  const sessionsQ = db.useQuery<SessionRow>("Session");
  const sessions =
    !hydrated || sessionsQ.loading ? initialSessions : sessionsQ.data.filter((r) => r.eventId === event.id);

  const speakerByUser = useMemo(() => new Map(profiles.map((p) => [p.userId, p])), [profiles]);
  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [historyFor, setHistoryFor] = useState<DeliverableSlotRow | null>(null);
  const [changesFor, setChangesFor] = useState<DeliverableSlotRow | null>(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Slot ids ticked for download. Kept across filter changes on purpose: you
  // narrow to one speaker, tick their deck, clear the filter, tick another.
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
      const session = slot.sessionId ? sessionById.get(slot.sessionId) : undefined;
      return (
        slot.title.toLowerCase().includes(needle) ||
        (latest?.filename ?? "").toLowerCase().includes(needle) ||
        (speaker?.name ?? "").toLowerCase().includes(needle) ||
        (session?.title ?? "").toLowerCase().includes(needle)
      );
    });
  }

  const pendingCount = slots.filter((slot) => effectiveStatus(slot) === "pending").length;

  // Only rows with an uploaded file can go in an archive.
  const downloadable = rows.filter((slot) => latestVersion(versions, slot.id));
  const selectedSlots = slots.filter(
    (slot) => selected.has(slot.id) && latestVersion(versions, slot.id),
  );
  const allShownSelected =
    downloadable.length > 0 && downloadable.every((slot) => selected.has(slot.id));

  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const slot of downloadable) {
        if (allShownSelected) next.delete(slot.id);
        else next.add(slot.id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  // Bundle a set of deliverables' latest versions into a zip, fetched through
  // short-lived signed URLs in the organizer's browser — the files never
  // transit shared storage.
  async function downloadSlots(list: DeliverableSlotRow[], label: string) {
    if (list.length === 0) return;
    setZipping(true);
    setError(null);
    try {
      const entries = [];
      const seen = new Set<string>();
      for (const slot of list) {
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
      link.download = `${event.slug || "event"}-${label}.zip`;
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
            placeholder="Search files, speakers, sessions…"
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
          {/* Ticking rows switches the button to that set; with nothing ticked
              the common case (everything signed off) stays one click away. */}
          {selectedSlots.length > 0 ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={zipping}
                onClick={() => void downloadSlots(selectedSlots, "selected-content")}
              >
                <Archive data-icon="inline-start" />
                {zipping ? "Zipping…" : `Download selected (${selectedSlots.length})`}
              </Button>
            </>
          ) : approvedSlots.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={zipping}
              onClick={() => void downloadSlots(approvedSlots, "approved-content")}
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
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allShownSelected}
                  onChange={toggleAllShown}
                  disabled={downloadable.length === 0}
                  aria-label="Select all files shown"
                  className="size-4 rounded border-zinc-300 accent-zinc-900"
                />
              </TableHead>
              <TableHead>Speaker</TableHead>
              <TableHead>Deliverable</TableHead>
              <TableHead>Session</TableHead>
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
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(slot.id)}
                      onChange={() => toggleOne(slot.id)}
                      disabled={!latest}
                      aria-label={`Select ${latest?.filename ?? slot.title}`}
                      className="size-4 rounded border-zinc-300 accent-zinc-900 disabled:opacity-40"
                    />
                  </TableCell>
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
                  <TableCell className="max-w-48 truncate text-sm text-zinc-500">
                    {slot.sessionId ? (sessionById.get(slot.sessionId)?.title ?? "—") : "—"}
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
