import React from "react";
import { Link } from "@pylonsync/react";
import { CalendarDays, MapPin } from "lucide-react";
import { BrandMark } from "@/components/brand";

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
}

export type PublicTab = "overview" | "schedule" | "speakers" | "cfp";

const TABS: { key: PublicTab; label: string; path: string }[] = [
  { key: "overview", label: "Overview", path: "" },
  { key: "schedule", label: "Schedule", path: "/schedule" },
  { key: "speakers", label: "Speakers", path: "/speakers" },
  { key: "cfp", label: "Call for speakers", path: "/cfp" },
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
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="border-b border-zinc-200/70 bg-white">
        <div className="mx-auto w-full max-w-3xl px-6">
          <div className="pt-10">
            <BrandMark size={22} />
            <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-zinc-900">
              {event.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-zinc-500">
              {event.startDate && (
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-4 text-zinc-400" aria-hidden="true" />
                  {formatRange(event.startDate, event.endDate ?? undefined)}
                </span>
              )}
              {event.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-zinc-400" aria-hidden="true" />
                  {event.location}
                </span>
              )}
            </div>
          </div>
          <nav className="-mb-px mt-6 flex gap-6" aria-label="Event pages">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/${event.orgSlug}/${event.slug}${t.path}`}
                aria-current={active === t.key ? "page" : undefined}
                className={
                  "flex h-11 items-center border-b-2 text-[13.5px] font-medium transition-colors " +
                  (active === t.key
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-900")
                }
              >
                {t.label}
              </Link>
            ))}
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatRange(start: string, end?: string) {
  if (!end || end === start) return fmt(start);
  const s = new Date(start);
  const e = new Date(end);
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${MONTHS[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}, ${s.getUTCFullYear()}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}
