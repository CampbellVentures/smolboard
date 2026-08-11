"use client";

import React, { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, MapPin, Search, Star } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { dayKey, fmtTime } from "@/lib/agenda";
import type { ScheduleFeed, SpeakersFeed } from "@/app/[orgSlug]/[eventSlug]/event-site-client";

// The embeddable widget surfaces beyond the one-page site: a sessions list, a
// chronological itinerary with a personal starred schedule, and a speaker
// gallery. Each renders standalone inside an iframe for anonymous viewers, so
// nothing here may depend on organizer state.

type Session = ScheduleFeed["sessions"][number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.at(-1) ?? name).toLowerCase();
}

function dayHeading(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function sessionTime(s: Session, tz: string): string {
  if (!s.startTime || !s.endTime) return "";
  const day = dayHeading(dayKey(s.startTime, tz));
  return `${day} · ${fmtTime(minutesOf(s.startTime, tz))}–${fmtTime(minutesOf(s.endTime, tz))}`;
}

function minutesOf(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function Empty({ label }: { label: string }) {
  return (
    <p className="rounded-xl border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">
      {label}
    </p>
  );
}

/* ------------------------------ Sessions list ------------------------------ */

export function SessionsListWidget({ feed }: { feed: ScheduleFeed | null }) {
  const [q, setQ] = useState("");
  const [track, setTrack] = useState("");
  const [format, setFormat] = useState("");
  const [room, setRoom] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tz = feed?.event?.timezone ?? "UTC";

  const sessions = useMemo(() => {
    const all = (feed?.sessions ?? []).filter((s) => s.startTime);
    const needle = q.trim().toLowerCase();
    return all.filter((s) => {
      if (track && s.trackId !== track) return false;
      if (format && (s.kind || "talk") !== format) return false;
      if (room && s.roomId !== room) return false;
      if (!needle) return true;
      // Search covers titles AND speaker names.
      return (
        s.title.toLowerCase().includes(needle) ||
        s.speakers.some((sp) => sp.name.toLowerCase().includes(needle))
      );
    });
  }, [feed, q, track, format, room]);

  if (!feed?.published) return <Empty label="The schedule isn't published yet." />;
  const formats = [...new Set((feed.sessions ?? []).map((s) => s.kind || "talk"))];
  const roomName = (id: string | null) => feed.rooms.find((r) => r.id === id)?.name;
  const trackOf = (id: string | null) => feed.tracks.find((t) => t.id === id);
  const clearable = q || track || format || room;

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sessions or speakers…"
            aria-label="Search sessions"
            className="h-9 w-full rounded-full bg-white pl-9 pr-3 text-[13px] text-zinc-700 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] outline-none placeholder:text-zinc-400 focus:shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
          />
        </label>
        <select
          value={track}
          onChange={(e) => setTrack(e.target.value)}
          aria-label="Filter by track"
          className="h-9 rounded-full bg-white px-3 text-[13px] text-zinc-600 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] outline-none"
        >
          <option value="">All tracks</option>
          {feed.tracks.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          aria-label="Filter by format"
          className="h-9 rounded-full bg-white px-3 text-[13px] capitalize text-zinc-600 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] outline-none"
        >
          <option value="">All formats</option>
          {formats.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <select
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          aria-label="Filter by location"
          className="h-9 rounded-full bg-white px-3 text-[13px] text-zinc-600 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] outline-none"
        >
          <option value="">All locations</option>
          {feed.rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        {clearable ? (
          <button
            type="button"
            onClick={() => { setQ(""); setTrack(""); setFormat(""); setRoom(""); }}
            className="h-9 rounded-full px-3 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"
          >
            Clear
          </button>
        ) : null}
      </div>

      <p className="mt-3 text-[12.5px] text-zinc-500" aria-live="polite">
        {sessions.length} of {(feed.sessions ?? []).filter((s) => s.startTime).length} sessions
      </p>

      <div className="mt-3 grid gap-3">
        {sessions.map((s) => {
          const track = trackOf(s.trackId);
          const open = expanded.has(s.id);
          return (
            <article
              key={s.id}
              className="min-w-0 rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold text-zinc-900">{s.title}</h3>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium capitalize text-zinc-600">
                  {s.kind || "talk"}
                </span>
                {track ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                    <span className="size-1.5 rounded-full" style={{ background: track.color ?? "#a1a1aa" }} />
                    {track.name}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[12.5px] text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 text-zinc-400" aria-hidden="true" />
                  {sessionTime(s, tz)}
                </span>
                {roomName(s.roomId) ? (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-zinc-400" aria-hidden="true" />
                    {roomName(s.roomId)}
                  </span>
                ) : null}
              </div>
              {s.speakers.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {s.speakers.map((sp) => (
                    <span key={sp.name} className="flex items-center gap-2 text-[12.5px] text-zinc-600">
                      <PersonAvatar name={sp.name} src={sp.headshotUrl} size="xs" />
                      <span className="font-medium text-zinc-800">{sp.name}</span>
                      <span className="text-zinc-400">
                        {[sp.jobTitle, sp.company].filter(Boolean).join(", ")}
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}
              {s.description ? (
                <>
                  <p className={"mt-2 text-[13px] leading-relaxed text-zinc-500" + (open ? "" : " line-clamp-2")}>
                    {s.description}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      })
                    }
                    className="mt-1 text-[12.5px] font-medium text-zinc-500 hover:text-zinc-900"
                  >
                    {open ? "Show less" : "Show more"}
                  </button>
                </>
              ) : null}
            </article>
          );
        })}
        {sessions.length === 0 ? <Empty label="No sessions match those filters." /> : null}
      </div>
    </section>
  );
}

/* ------------------------------- Itinerary -------------------------------- */

const STAR_KEY = "smolboard.itinerary";

function loadStars(eventSlug: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(`${STAR_KEY}.${eventSlug}`);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function ItineraryWidget({
  feed,
  eventSlug,
  icsHref,
}: {
  feed: ScheduleFeed | null;
  eventSlug: string;
  icsHref: string;
}) {
  const tz = feed?.event?.timezone ?? "UTC";
  const [stars, setStars] = useState<Set<string>>(new Set());
  const [mineOnly, setMineOnly] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  // Restore the personal schedule after mount so it survives a full reload.
  React.useEffect(() => setStars(loadStars(eventSlug)), [eventSlug]);

  function toggle(id: string) {
    setStars((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(`${STAR_KEY}.${eventSlug}`, JSON.stringify([...next]));
      } catch {
        // Private mode: the selection just won't persist.
      }
      return next;
    });
  }

  if (!feed?.published) return <Empty label="The schedule isn't published yet." />;
  const scheduled = feed.sessions.filter((s) => s.startTime);
  const days = [...new Set(scheduled.map((s) => dayKey(s.startTime!, tz)))].sort();
  const activeDay = day ?? days[0];
  const roomName = (id: string | null) => feed.rooms.find((r) => r.id === id)?.name;
  const trackOf = (id: string | null) => feed.tracks.find((t) => t.id === id);
  const rows = scheduled
    .filter((s) => dayKey(s.startTime!, tz) === activeDay)
    .filter((s) => (mineOnly ? stars.has(s.id) : true))
    .sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1));

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            aria-pressed={activeDay === d}
            className={
              "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors " +
              (activeDay === d
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-600 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] hover:text-zinc-900")
            }
          >
            {dayHeading(d)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMineOnly((v) => !v)}
          aria-pressed={mineOnly}
          className={
            "ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors " +
            (mineOnly ? "bg-amber-100 text-amber-900" : "bg-white text-zinc-600 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]")
          }
        >
          <Star className={"size-3.5 " + (mineOnly ? "fill-amber-500 text-amber-500" : "text-zinc-400")} aria-hidden="true" />
          My schedule ({stars.size})
        </button>
        <a
          href={icsHref}
          className="rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-600 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] hover:text-zinc-900"
        >
          Add to calendar
        </a>
      </div>

      <ol className="mt-4 grid gap-2">
        {rows.map((s) => {
          const track = trackOf(s.trackId);
          const starred = stars.has(s.id);
          return (
            <li
              key={s.id}
              className="flex min-w-0 items-start gap-3 rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <span className="w-24 shrink-0 text-[12.5px] font-medium tabular-nums text-zinc-500">
                {fmtTime(minutesOf(s.startTime!, tz))}–{fmtTime(minutesOf(s.endTime!, tz))}
              </span>
              <span className="min-w-0 flex-1">
                {track ? (
                  <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                    <span className="size-1.5 rounded-full" style={{ background: track.color ?? "#a1a1aa" }} />
                    {track.name}
                  </span>
                ) : null}
                <span className="block text-[14.5px] font-semibold text-zinc-900">{s.title}</span>
                <span className="mt-0.5 block text-[12.5px] text-zinc-500">
                  {[roomName(s.roomId), s.speakers.map((sp) => sp.name).join(", ")].filter(Boolean).join(" · ")}
                </span>
                {s.description ? (
                  <span className="mt-1 line-clamp-2 block text-[13px] leading-relaxed text-zinc-500">
                    {s.description}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-pressed={starred}
                aria-label={starred ? `Remove ${s.title} from my schedule` : `Add ${s.title} to my schedule`}
                className="shrink-0 p-1"
              >
                <Star className={"size-4 " + (starred ? "fill-amber-400 text-amber-400" : "text-zinc-300 hover:text-zinc-400")} aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <Empty label={mineOnly ? "Star sessions to build your schedule." : "Nothing scheduled that day."} />
        ) : null}
      </ol>
    </section>
  );
}

/* ---------------------------- Speaker gallery ----------------------------- */

export function SpeakerGalleryWidget({ feed }: { feed: SpeakersFeed | null }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<SpeakersFeed["speakers"][number] | null>(null);
  if (!feed?.published || feed.speakers.length === 0) return <Empty label="No speakers published yet." />;
  const needle = q.trim().toLowerCase();
  const people = feed.speakers
    .filter((sp) => !needle || sp.name.toLowerCase().includes(needle))
    .slice()
    .sort((a, b) => surname(a.name).localeCompare(surname(b.name)));

  return (
    <section>
      <label className="relative block max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search speakers by name…"
          aria-label="Search speakers"
          className="h-9 w-full rounded-full bg-white pl-9 pr-3 text-[13px] text-zinc-700 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] outline-none placeholder:text-zinc-400"
        />
      </label>
      <p className="mt-3 text-[12.5px] text-zinc-500" aria-live="polite">
        {people.length} of {feed.speakers.length} speakers
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {people.map((sp) => (
          <button
            key={sp.name}
            type="button"
            onClick={() => setOpen(sp)}
            className="flex min-w-0 flex-col items-center rounded-xl bg-white p-4 text-center shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)]"
          >
            <PersonAvatar name={sp.name} src={sp.headshotUrl} size="xl" />
            <span className="mt-2 w-full truncate text-[13.5px] font-semibold text-zinc-900">{sp.name}</span>
            <span className="w-full truncate text-[11.5px] text-zinc-500">{sp.jobTitle ?? ""}</span>
            <span className="w-full truncate text-[11.5px] text-zinc-400">{sp.company ?? ""}</span>
          </button>
        ))}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-[10vh]"
          role="dialog"
          aria-modal="true"
          aria-label={open.name}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(null); }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Back
            </button>
            <div className="flex items-center gap-3">
              <PersonAvatar name={open.name} src={open.headshotUrl} size="xl" />
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-zinc-900">{open.name}</h3>
                <p className="truncate text-[12.5px] text-zinc-500">
                  {[open.jobTitle, open.company].filter(Boolean).join(", ")}
                </p>
              </div>
            </div>
            {open.bio ? (
              <p className="mt-3 text-[13px] leading-relaxed text-zinc-600">{open.bio}</p>
            ) : null}
            {open.talks.length > 0 ? (
              <div className="mt-3 border-t border-zinc-100 pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Sessions</p>
                {open.talks.map((t) => (
                  <p key={t} className="mt-1 text-[13px] font-medium text-zinc-700">{t}</p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
