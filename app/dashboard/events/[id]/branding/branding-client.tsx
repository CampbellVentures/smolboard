"use client";

import React, { useState } from "react";
import { db } from "@pylonsync/react";
import { Check, ExternalLink, Image as ImageIcon, Palette, Type } from "lucide-react";
import { toast } from "sonner";
import {
  DashboardHero,
  DashboardPanel,
  DashboardWidePage,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrgSlug } from "@/components/use-org-slug";
import {
  ACCENT_PRESETS,
  isValidAccent,
  parseBranding,
  type EventBranding,
} from "@/lib/branding";
import { cn } from "@/lib/utils";
import type { EventRow } from "@/lib/types";

// Branding: the event's public look. Accent color, logo, tagline — saved as
// one JSON blob on the Event row; the public shell renders it. The preview
// iframe is the real public site, reloaded after each save.

export function BrandingPage({ event }: { event: EventRow }) {
  const orgSlug = useOrgSlug(event.orgId);
  const initial = parseBranding(event.brandingJson);
  const [accent, setAccent] = useState<string>(initial.accent ?? "");
  const [customAccent, setCustomAccent] = useState<string>(
    initial.accent && !ACCENT_PRESETS.some((p) => p.value === initial.accent)
      ? initial.accent
      : "",
  );
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [tagline, setTagline] = useState(initial.tagline ?? "");
  const [saving, setSaving] = useState(false);
  // Bumps the iframe key so the preview re-renders with what was saved.
  const [previewNonce, setPreviewNonce] = useState(0);

  const publicUrl = orgSlug ? `/${orgSlug}/${event.slug}` : null;
  const activeAccent = accent || null;

  async function save() {
    if (activeAccent && !isValidAccent(activeAccent)) {
      toast.error("Accent must be a 6-digit hex color like #7c3aed.");
      return;
    }
    setSaving(true);
    try {
      const branding: EventBranding = {
        accent: activeAccent,
        logoUrl: logoUrl.trim() || null,
        tagline: tagline.trim() || null,
      };
      await db.update("Event", event.id, { brandingJson: JSON.stringify(branding) });
      setPreviewNonce((n) => n + 1);
      toast.success("Branding saved — the public site is updated.");
    } catch {
      toast.error("Couldn't save branding. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardWidePage className="max-w-6xl">
      <DashboardHero>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 className="text-balance text-lg font-semibold tracking-tight">
              Make the public site yours
            </h2>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              Accent color, logo, and tagline show up on your event site, CFP, and
              schedule — everywhere attendees and speakers see {event.name}.
            </p>
          </div>
          {publicUrl ? (
            <Button asChild variant="outline" className="shrink-0">
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" />
                Open public site
              </a>
            </Button>
          ) : null}
        </div>
      </DashboardHero>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <DashboardPanel title="Accent color" icon={Palette} tone="violet" variant="subtle">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAccent("");
                  setCustomAccent("");
                }}
                className={cn(
                  "flex h-9 items-center rounded-lg border px-3 text-xs font-medium transition-colors",
                  !activeAccent
                    ? "border-zinc-900 text-zinc-900"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                None
              </button>
              {ACCENT_PRESETS.map((preset) => {
                const selected = accent === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    title={preset.name}
                    aria-label={`${preset.name} accent`}
                    aria-pressed={selected}
                    onClick={() => {
                      setAccent(preset.value);
                      setCustomAccent("");
                    }}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg border transition-transform active:scale-[0.96]",
                      selected ? "border-zinc-900" : "border-transparent hover:border-border",
                    )}
                  >
                    <span
                      className="flex size-6 items-center justify-center rounded-full"
                      style={{ background: preset.value }}
                    >
                      {selected ? <Check className="size-3.5 text-white" aria-hidden="true" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Label htmlFor="custom-accent" className="shrink-0 text-xs text-muted-foreground">
                Custom hex
              </Label>
              <Input
                id="custom-accent"
                value={customAccent}
                onChange={(e) => {
                  setCustomAccent(e.target.value);
                  if (isValidAccent(e.target.value)) setAccent(e.target.value.trim());
                }}
                placeholder="#7c3aed"
                className="w-28 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              {activeAccent ? (
                <span
                  aria-hidden="true"
                  className="size-6 shrink-0 rounded-full outline outline-1 -outline-offset-1 outline-black/10"
                  style={{ background: activeAccent }}
                />
              ) : null}
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Logo"
            description="Replaces the smolboard mark in the site header. PNG or SVG with a transparent background works best."
            icon={ImageIcon}
            tone="sky"
            variant="subtle"
          >
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://yoursite.com/logo.svg…"
              aria-label="Logo URL"
              autoComplete="off"
              spellCheck={false}
            />
            {logoUrl.trim() ? (
              <div className="mt-3 flex h-16 items-center rounded-lg border border-dashed bg-muted/30 px-4">
                <img src={logoUrl} alt="Logo preview" className="h-8 w-auto max-w-48 object-contain" />
              </div>
            ) : null}
          </DashboardPanel>

          <DashboardPanel
            title="Tagline"
            description="One line under the event name — what this event is about."
            icon={Type}
            tone="amber"
            variant="subtle"
          >
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Two days of practical AI engineering…"
              maxLength={160}
              aria-label="Tagline"
              autoComplete="off"
            />
          </DashboardPanel>

          <Button type="button" onClick={() => void save()} disabled={saving} className="self-start">
            {saving ? "Saving…" : "Save branding"}
          </Button>
        </div>

        {publicUrl ? (
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-red-400/80" />
                <span className="size-2.5 rounded-full bg-amber-400/80" />
                <span className="size-2.5 rounded-full bg-emerald-400/80" />
              </span>
              <span className="min-w-0 flex-1 truncate rounded-md bg-background px-2.5 py-1 text-center text-[11px] text-muted-foreground">
                smolboard.app{publicUrl}
              </span>
            </div>
            <iframe
              key={previewNonce}
              src={publicUrl}
              title="Public site preview"
              className="w-full"
              style={{ height: 640 }}
            />
            <p className="border-t bg-muted/40 px-4 py-2 text-center text-[11px] text-muted-foreground">
              Live preview — updates when you save.
            </p>
          </div>
        ) : null}
      </div>
    </DashboardWidePage>
  );
}
