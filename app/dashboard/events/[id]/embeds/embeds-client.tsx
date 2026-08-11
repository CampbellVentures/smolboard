"use client";

import React, { useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Globe,
  LayoutGrid,
  ListChecks,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  DashboardHero,
  DashboardIconChip,
  DashboardWidePage,
  type DashboardChipTone,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useOrgSlug } from "@/components/use-org-slug";
import { cn } from "@/lib/utils";
import type { EventRow } from "@/lib/types";

// Embeds: live widgets organizers paste into their own conference site. The
// ?embed views are chrome-less and stay in sync with the program — the iframe
// previews here are the real thing, not screenshots.

const WIDGETS: {
  key: "schedule" | "speakers" | "sessions" | "itinerary" | "gallery";
  title: string;
  description: string;
  icon: LucideIcon;
  tone: DashboardChipTone;
  defaultHeight: number;
}[] = [
  {
    key: "schedule",
    title: "Schedule",
    description:
      "The full agenda, grouped by day and track. Updates when a session moves.",
    icon: CalendarDays,
    tone: "violet",
    defaultHeight: 900,
  },
  {
    key: "sessions",
    title: "Sessions list",
    description:
      "Every session as a card with speakers, room, and times. Search by title or speaker; filter by track, format, or location.",
    icon: ListChecks,
    tone: "sky",
    defaultHeight: 900,
  },
  {
    key: "itinerary",
    title: "Schedule itinerary",
    description:
      "A chronological day-by-day agenda. Attendees star sessions to build a personal schedule that survives a reload.",
    icon: Star,
    tone: "amber",
    defaultHeight: 900,
  },
  {
    key: "speakers",
    title: "Speakers list",
    description:
      "Speaker directory with headshot, name, job title, and company. New accepts appear automatically.",
    icon: Users,
    tone: "pink",
    defaultHeight: 700,
  },
  {
    key: "gallery",
    title: "Speaker gallery",
    description:
      "A photo grid ordered by surname, searchable by name, with a detail card for bio and sessions.",
    icon: LayoutGrid,
    tone: "emerald",
    defaultHeight: 800,
  },
];

const HEIGHTS = [500, 700, 900, 1200];

// Each widget's tone shows up on its tab: colored border and icon when active,
// neutral otherwise. Backgrounds stay white — the color belongs to the glyph
// and the outline, never a filled chip.
const TAB_TONES: Record<DashboardChipTone, { active: string; icon: string }> = {
  violet: { active: "border-violet-400 text-violet-950", icon: "text-violet-600" },
  sky: { active: "border-sky-400 text-sky-950", icon: "text-sky-600" },
  amber: { active: "border-amber-400 text-amber-950", icon: "text-amber-600" },
  emerald: { active: "border-emerald-400 text-emerald-950", icon: "text-emerald-600" },
  pink: { active: "border-pink-400 text-pink-950", icon: "text-pink-600" },
  zinc: { active: "border-zinc-400 text-zinc-900", icon: "text-zinc-600" },
};

function CopyButton({
  text,
  label = "Copy embed code",
  size = "sm",
}: {
  text: string;
  label?: string;
  size?: "sm" | "default";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

// The same browser chrome the form builder uses for its live preview: traffic
// dots + a URL pill, so the embed reads as "this is what visitors see".
function BrowserFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-red-400/80" />
          <span className="size-2.5 rounded-full bg-amber-400/80" />
          <span className="size-2.5 rounded-full bg-emerald-400/80" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-md bg-background px-2.5 py-1 text-center text-[11px] text-muted-foreground">
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}

export function EmbedsPage({ event }: { event: EventRow }) {
  const orgSlug = useOrgSlug(event.orgId);
  // window.origin is client-only; render snippets after mount so SSR and
  // hydration agree.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [active, setActive] = useState<(typeof WIDGETS)[number]["key"]>("schedule");

  const base = orgSlug && origin ? `${origin}/${orgSlug}/${event.slug}` : null;

  return (
    <DashboardWidePage className="max-w-6xl">
      <DashboardHero>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 className="text-balance text-lg font-semibold tracking-tight">
              Put {event.name} on your own site
            </h2>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              Paste one line of HTML. The widget stays in sync with your program, so
              accepting a talk or moving a session updates every embed.
            </p>
          </div>
          {base ? (
            <div className="flex shrink-0 flex-wrap gap-2">
              <CopyButton text={base} label="Copy site link" size="default" />
              <Button asChild variant="outline">
                <a href={base} target="_blank" rel="noreferrer">
                  <ExternalLink data-icon="inline-start" />
                  Open public site
                </a>
              </Button>
            </div>
          ) : null}
        </div>
      </DashboardHero>

      {/* One widget at a time: five iframes side by side loaded five copies of
          the public site and left the cards at mismatched heights. */}
      <div className="flex flex-wrap items-center gap-2">
        {WIDGETS.map((widget) => {
          const isActive = widget.key === active;
          const tone = TAB_TONES[widget.tone];
          return (
            <button
              key={widget.key}
              type="button"
              onClick={() => setActive(widget.key)}
              aria-pressed={isActive}
              className={cn(
                "flex items-center gap-2 rounded-full border bg-card px-3.5 py-2 text-[13px] font-medium transition-[color,border-color,box-shadow] duration-150",
                isActive
                  ? `${tone.active} shadow-[0_1px_2px_rgba(0,0,0,0.05)]`
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <widget.icon
                className={cn("size-4", isActive ? tone.icon : "text-muted-foreground")}
                aria-hidden="true"
              />
              {widget.title}
            </button>
          );
        })}
      </div>

      {(() => {
        const widget = WIDGETS.find((w) => w.key === active) ?? WIDGETS[0];
        const height = heights[widget.key] ?? widget.defaultHeight;
        const src = base ? `${base}?embed=${widget.key}` : null;
        const snippet = src
          ? `<iframe src="${src}" width="100%" height="${height}" frameborder="0" title="${event.name} ${widget.title.toLowerCase()}"></iframe>`
          : "";
        return (
          <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-4 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <DashboardIconChip icon={widget.icon} tone={widget.tone} size="lg" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{widget.title}</h3>
                  <p className="mt-0.5 max-w-xl text-pretty text-xs leading-5 text-muted-foreground">
                    {widget.description}
                  </p>
                </div>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                Height
                <Select
                  aria-label={`${widget.title} embed height`}
                  value={String(height)}
                  onChange={(e) =>
                    setHeights((prev) => ({ ...prev, [widget.key]: Number(e.target.value) }))
                  }
                  className="w-auto"
                >
                  {HEIGHTS.map((h) => (
                    <option key={h} value={h}>
                      {h}px
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div className="px-4">
              {src ? (
                <BrowserFrame url={src.replace(/^https?:\/\//, "")}>
                  <iframe
                    key={src}
                    src={src}
                    title={`${widget.title} preview`}
                    className="w-full"
                    style={{ height: 460 }}
                  />
                </BrowserFrame>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                  Loading preview…
                </div>
              )}
            </div>

            {snippet ? (
              <pre className="mx-4 mt-3 overflow-x-auto rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-5 text-zinc-600">
                {snippet}
              </pre>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Works on any site that allows iframes.
              </span>
              <div className="flex gap-2">
                {src ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={src} target="_blank" rel="noreferrer">
                      <ExternalLink data-icon="inline-start" />
                      Open
                    </a>
                  </Button>
                ) : null}
                {snippet ? <CopyButton text={snippet} /> : null}
              </div>
            </div>
          </section>
        );
      })()}

      {base ? (
        <section className="flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <DashboardIconChip icon={Globe} tone="sky" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Full event site</h3>
              <p className="truncate text-xs text-muted-foreground">{base}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <CopyButton text={base} label="Copy link" />
            <Button asChild size="sm" variant="ghost">
              <a href={base} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" />
                Open
              </a>
            </Button>
          </div>
        </section>
      ) : null}
    </DashboardWidePage>
  );
}
