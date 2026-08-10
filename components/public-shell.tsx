import React from "react";
import { fmtDateRange } from "@/lib/format";
import { Link } from "@pylonsync/react";
import { CalendarDays, MapPin } from "lucide-react";
import { BrandMark } from "@/components/brand";
import type { EventBranding } from "@/lib/branding";

// The one shell every public event page renders inside: same width, same
// header, same tab nav, same footer. Schedule, speakers, and the CFP pages are
// tabs of a single event site, not three separate pages.

export interface PublicEventInfo {
  name: string;
  slug: string;
  orgSlug: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  branding?: EventBranding;
}

export type PublicTab = "home" | "cfp";

// Schedule and Speakers are sections of the one event page, so their nav
// entries are anchors; only the CFP is a separate route.
const TABS: { key: string; cfp?: boolean; label: string; path: string }[] = [
  { key: "schedule", label: "Schedule", path: "#schedule" },
  { key: "speakers", label: "Speakers", path: "#speakers" },
  { key: "cfp", cfp: true, label: "Call for speakers", path: "/cfp" },
];

export function PublicEventShell({
  event,
  active,
  children,
}: {
  event: PublicEventInfo;
  active: PublicTab;
  children: React.ReactNode;
}) {
  const branding = event.branding ?? { accent: null, logoUrl: null, tagline: null, heroUrl: null };
  const accent = branding.accent;
  const hero = branding.heroUrl;
  // With a hero image the masthead goes full-bleed (image + dark scrim, white
  // text, ai.engineer-style); without one it stays the quiet white header.
  const heading = (
    <div className={hero ? "pb-8 pt-10" : "pt-10"}>
      <Link href={`/${event.orgSlug}/${event.slug}`} className="inline-flex items-center gap-3">
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt={`${event.name} logo`}
            className={
              "h-7 w-auto max-w-40 object-contain" +
              (hero ? " drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" : "")
            }
          />
        ) : (
          <BrandMark size={22} />
        )}
      </Link>
      <h1
        className={
          "mt-4 text-balance text-3xl font-semibold tracking-tight " +
          (hero ? "text-white" : "text-zinc-900")
        }
      >
        <Link href={`/${event.orgSlug}/${event.slug}`}>{event.name}</Link>
      </h1>
      {branding.tagline ? (
        <p className={"mt-2 text-pretty text-[15px] " + (hero ? "text-white/85" : "text-zinc-500")}>
          {branding.tagline}
        </p>
      ) : null}
      <div
        className={
          "mt-3 flex flex-wrap items-center gap-4 text-sm " +
          (hero ? "text-white/80" : "text-zinc-500")
        }
      >
        {event.startDate && (
          <span className="flex items-center gap-1.5">
            <CalendarDays
              className={"size-4 " + (hero ? "text-white/60" : "text-zinc-400")}
              aria-hidden="true"
            />
            {formatRange(event.startDate, event.endDate ?? undefined)}
          </span>
        )}
        {event.location && (
          <span className="flex items-center gap-1.5">
            <MapPin
              className={"size-4 " + (hero ? "text-white/60" : "text-zinc-400")}
              aria-hidden="true"
            />
            {event.location}
          </span>
        )}
      </div>
    </div>
  );
  return (
    <div
      className="flex min-h-screen scroll-smooth flex-col bg-zinc-50"
      style={accent ? ({ "--event-accent": accent } as React.CSSProperties) : undefined}
    >
      <header className="border-b border-zinc-200/70 bg-white">
        {/* Branded accent strip — the event's color across the very top. */}
        {accent ? <div className="h-1 w-full" style={{ background: accent }} aria-hidden="true" /> : null}
        {hero ? (
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${hero})` }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-black/65"
            />
            <div className="relative mx-auto w-full max-w-3xl px-6">{heading}</div>
          </div>
        ) : null}
        <div className="mx-auto w-full max-w-3xl px-6">
          {hero ? null : heading}
          <nav className={"-mb-px flex gap-6" + (hero ? " mt-1" : " mt-6")} aria-label="Event pages">
            {TABS.map((t) => {
              const isActive = t.cfp === true && active === "cfp";
              return (
                <Link
                  key={t.key}
                  href={`/${event.orgSlug}/${event.slug}${t.path}`}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    "flex h-11 items-center border-b-2 text-[13.5px] font-medium transition-colors " +
                    (isActive
                      ? "border-zinc-900 text-zinc-900"
                      : "border-transparent text-zinc-500 hover:text-zinc-900")
                  }
                  style={isActive && accent ? { borderColor: accent } : undefined}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">{children}</main>

      <footer className="mx-auto flex w-full max-w-3xl items-center justify-center gap-1.5 px-6 pb-10 text-xs text-zinc-400">
        <BrandMark size={14} />
        <a href="/" className="transition-colors hover:text-zinc-900">
          Powered by smolboard
        </a>
      </footer>
    </div>
  );
}

// Neutral initials chip shared by the schedule and speaker pages. One quiet
// treatment instead of per-name pastel colors.
export function InitialsAvatar({
  name,
  className = "size-5 text-[9px]",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={
        "flex shrink-0 items-center justify-center rounded-full bg-zinc-100 font-semibold text-zinc-600 ring-1 ring-black/5 " +
        className
      }
    >
      {initials(name)}
    </span>
  );
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function formatRange(start: string, end?: string) {
  return fmtDateRange(start, end);
}
