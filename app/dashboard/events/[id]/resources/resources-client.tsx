"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db } from "@pylonsync/react";
import { toast } from "sonner";
import { BookOpen, ExternalLink, Plus, Trash2 } from "lucide-react";
import { callFn } from "@/lib/fn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardPanel,
  DashboardToolbar,
} from "@/components/dashboard";
import { ResponsiveFormOverlay } from "@/components/responsive-overlay";
import { useOptimisticRemoval } from "@/components/use-optimistic-removal";
import { EMBED_ALLOWED_HOSTS } from "@/lib/portal-resources";
import type { EventRow, PortalResourceRow } from "@/lib/types";

// Reference pages an organizer publishes into the speaker portal: run of show,
// brand kit, travel notes. The embed field points at material that already
// exists somewhere else, which is the requirement — not a second CMS.

interface EditorState {
  id?: string;
  title: string;
  body: string;
  embedUrl: string;
  published: boolean;
}

const blank: EditorState = { title: "", body: "", embedUrl: "", published: false };

export function ResourcesPage({
  event,
  initialResources,
}: {
  event: EventRow;
  initialResources: PortalResourceRow[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const live = db.useQuery<PortalResourceRow>("PortalResource");
  const rows = useMemo(() => {
    const source =
      !hydrated || live.loading ? initialResources : live.data.filter((r) => r.eventId === event.id);
    return source
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title));
  }, [hydrated, live.loading, live.data, initialResources, event.id]);

  const { hide, isHidden, settle } = useOptimisticRemoval();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    setSaving(true);
    try {
      await callFn("savePortalResource", {
        eventId: event.id,
        resourceId: editor.id,
        title: editor.title,
        body: editor.body || undefined,
        embedUrl: editor.embedUrl || undefined,
        published: editor.published,
        sortOrder: rows.length,
      });
      setEditor(null);
    } catch (error) {
      // The embed sanitizer's message is the useful part: it names the host.
      toast.error(error instanceof Error ? error.message : "Could not save that page.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    hide(id);
    try {
      await callFn("deletePortalResource", { resourceId: id });
    } catch {
      toast.error("Could not delete that page.");
    } finally {
      // settle() takes the live ids so the hidden set can't grow unbounded.
      settle(rows.map((r) => r.id));
    }
  }

  const visible = rows.filter((r) => !isHidden(r.id));

  return (
    <DashboardPage>
      <DashboardToolbar>
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Speaker resources</h2>
          <p className="text-[13px] text-muted-foreground">
            Reference pages your speakers see in their portal. Published pages appear for every
            speaker on {event.name}.
          </p>
        </div>
        <Button type="button" onClick={() => setEditor({ ...blank })}>
          <Plus data-icon="inline-start" /> New page
        </Button>
      </DashboardToolbar>

      {visible.length === 0 ? (
        <DashboardEmptyState
          icon={BookOpen}
          title="No resource pages yet"
          description="Add a run of show, a brand kit, or travel notes. You can embed a doc or video you already have."
        >
          <Button type="button" size="sm" variant="outline" onClick={() => setEditor({ ...blank })}>
            <Plus data-icon="inline-start" /> New page
          </Button>
        </DashboardEmptyState>
      ) : (
        <DashboardPanel title="Pages" icon={BookOpen} tone="violet" variant="subtle">
          <ul className="divide-y divide-border/70">
            {visible.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-3">
                <button
                  type="button"
                  onClick={() =>
                    setEditor({
                      id: row.id,
                      title: row.title,
                      body: row.body ?? "",
                      embedUrl: row.embedUrl ?? "",
                      published: row.published,
                    })
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium">{row.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {row.published ? "Published" : "Draft"}
                    {row.embedUrl ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <ExternalLink className="size-3" aria-hidden="true" />
                        embed
                      </>
                    ) : null}
                  </span>
                </button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${row.title}`}
                  onClick={() => void remove(row.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </DashboardPanel>
      )}

      <ResponsiveFormOverlay.Root open={editor !== null} onOpenChange={(o) => !o && setEditor(null)}>
        <ResponsiveFormOverlay.Content>
          <ResponsiveFormOverlay.Header icon={BookOpen}>
            <ResponsiveFormOverlay.Title>
              {editor?.id ? "Edit page" : "New page"}
            </ResponsiveFormOverlay.Title>
            <ResponsiveFormOverlay.Description>
              Speakers see published pages in their portal.
            </ResponsiveFormOverlay.Description>
          </ResponsiveFormOverlay.Header>
          {editor ? (
            <form onSubmit={save} className="flex flex-col gap-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Title</span>
                <Input
                  value={editor.title}
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                  placeholder="Run of show"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Body (markdown)
                </span>
                <Textarea
                  value={editor.body}
                  onChange={(e) => setEditor({ ...editor, body: e.target.value })}
                  placeholder="Doors at 8:00. Green room is on level 2."
                  className="min-h-28"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Embed (optional)
                </span>
                <Input
                  value={editor.embedUrl}
                  onChange={(e) => setEditor({ ...editor, embedUrl: e.target.value })}
                  placeholder="Paste a share link or an <iframe> snippet"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Allowed: {EMBED_ALLOWED_HOSTS.filter((h) => !h.startsWith("www.")).join(", ")}.
                </span>
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span>
                  <span className="block text-sm font-medium">Published</span>
                  <span className="block text-xs text-muted-foreground">
                    Off keeps it a draft only you can see.
                  </span>
                </span>
                <Switch
                  checked={editor.published}
                  onCheckedChange={(next) => setEditor({ ...editor, published: next === true })}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !editor.title.trim()}>
                  {saving ? "Saving…" : "Save page"}
                </Button>
              </div>
            </form>
          ) : null}
        </ResponsiveFormOverlay.Content>
      </ResponsiveFormOverlay.Root>
    </DashboardPage>
  );
}
