"use client";

import React, { useEffect, useMemo, useState } from "react";
import { callFn, Link } from "@pylonsync/react";
import { dayKey, fmtTime, minutesInDay } from "@/lib/agenda";
import { CalendarDays, Loader2, MapPin } from "lucide-react";
import { BrandMark } from "@/components/brand";

const TONES = [
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}
function tone(name: string): string {
  const h = [...name].reduce((t, c) => t + c.charCodeAt(0), 0);
  return TONES[h % TONES.length];
}

interface Feed {
  event: {
    name: string;
    slug: string;
    description: string | null;
    timezone: string;
    startDate: string | null;
    endDate: string | null;
    location: string | null;
  } | null;
  published: boolean;
  rooms: { id: string; name: string }[];
  tracks: { id: string; name: string; color: string | null }[];
  sessions: {
    id: string;
    title: string;
    description: string | null;
    kind: string;
    roomId: string | null;
    trackId: string | null;
    startTime: string | null;
    endTime: string | null;
    speakers: { name: string; tagline: string | null; company: string | null }[];
  }[];
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]} · ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function PublicSchedule({ eventSlug, eventName }: { eventSlug: string; eventName: string }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    callFn<Feed>("getPublicSchedule", { eventSlug })
      .then(setFeed)
      .catch(() => setError(true));
  }, [eventSlug]);

  const tz = feed?.event?.timezone ?? "UTC";
  const days = useMemo(() => {
    if (!feed) return [];
    return [...new Set(feed.sessions.map((s) => dayKey(s.startTime!, tz)))].sort();
  }, [feed, tz]);
  const [day, setDay] = useState<string | null>(null);
  const activeDay = day ?? days[0];
  const [trackFilter, setTrackFilter] = useState<string>("");

  const roomName = (id: string | null) => feed?.rooms.find((r) => r.id === id)?.name;
  const track = (id: string | null) => feed?.tracks.find((t) => t.id === id);

  const daySessions = useMemo(() => {
    if (!feed || !activeDay) return [];
    let list = feed.sessions.filter((s) => dayKey(s.startTime!, tz) === activeDay);
    if (trackFilter) list = list.filter((s) => s.trackId === trackFilter);
    return list.sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1));
  }, [feed, activeDay, trackFilter, tz]);

  // Group consecutive sessions that share a start time into one time block.
  const blocks = useMemo(() => {
    const out: { start: string; sessions: typeof daySessions }[] = [];
    for (const s of daySessions) {
      const last = out[out.length - 1];
      if (last && last.start === s.startTime) last.sessions.push(s);
      else out.push({ start: s.startTime!, sessions: [s] });
    }
    return out;
  }, [daySessions]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200/70 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <div className="flex items-center gap-2">
            <BrandMark size={20} />
            <p className="text-[13px] font-semibold uppercase tracking-wide text-zinc-400">Schedule</p>
          </div>
          <h1 className="mt-1 text-balance text-3xl font-semibold tracking-tight text-zinc-900">
            {feed?.event?.name ?? eventName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-zinc-500">
            {feed?.event?.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4 text-zinc-400" /> {feed.event.location}
              </span>
            )}
            <Link href={`/${eventSlug}/speakers`} className="font-medium text-zinc-600 underline underline-offset-2">
              Speakers
            </Link>
            <Link href={`/cfp/${eventSlug}`} className="font-medium text-zinc-600 underline underline-offset-2">
              Call for speakers
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {!feed && !error && (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-400">
            <Loader2 className="size-4 animate-spin" /> Loading schedule…
          </div>
        )}
        {(error || (feed && !feed.published)) && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <CalendarDays className="mx-auto size-8 text-zinc-300" />
            <p className="mt-3 text-sm font-medium text-zinc-700">The schedule isn&apos;t published yet</p>
            <p className="mt-1 text-sm text-zinc-400">Check back soon — talks are still being confirmed.</p>
          </div>
        )}

        {feed?.published && (
          <>
            {/* Day tabs + track filter */}
            <div className="flex flex-wrap items-center gap-2">
              {days.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  className={
                    "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors " +
                    (activeDay === d
                      ? "bg-zinc-900 text-white"
                      : "bg-white text-zinc-600 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] hover:text-zinc-900")
                  }
                >
                  {dayLabel(d)}
                </button>
              ))}
              {feed.tracks.length > 0 && (
                <select
                  value={trackFilter}
                  onChange={(e) => setTrackFilter(e.target.value)}
                  aria-label="Filter by track"
                  className="ml-auto h-8 rounded-full bg-white px-3 text-[13px] text-zinc-600 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] outline-none"
                >
                  <option value="">All tracks</option>
                  {feed.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Time blocks */}
            <div className="relative mt-6 space-y-6">
              <div
                aria-hidden="true"
                className="absolute bottom-3 top-3 hidden w-px bg-zinc-200 sm:block"
                style={{ left: "5.75rem" }}
              />
              {blocks.map((b) => (
                <div key={b.start} className="grid gap-6 sm:grid-cols-[5rem_1fr]">
                  <div className="relative pt-3 text-right text-[13px] font-semibold tabular-nums text-zinc-500">
                    {fmtTime(minutesInDay(b.start, tz))}
                    <span
                      aria-hidden="true"
                      className="absolute top-[1.15rem] hidden size-[7px] rounded-full bg-white ring-2 ring-zinc-300 sm:block"
                      style={{ right: "-0.95rem" }}
                    />
                  </div>
                  <div className="space-y-3">
                    {b.sessions.map((s) => {
                      const t = track(s.trackId);
                      const isBreak = s.kind === "break";
                      return (
                        <article
                          key={s.id}
                          className={
                            "rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] " +
                            (isBreak ? "opacity-70" : "")
                          }
                        >
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <h2 className="text-[15px] font-semibold text-zinc-900">{s.title}</h2>
                            <span className="text-xs tabular-nums text-zinc-400">
                              {fmtTime(minutesInDay(s.startTime!, tz))}–{fmtTime(minutesInDay(s.endTime!, tz))}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            {s.speakers.map((sp) => (
                              <span key={sp.name} className="flex items-center gap-1.5 font-medium text-zinc-700">
                                <span
                                  aria-hidden="true"
                                  className={`flex size-5 items-center justify-center rounded-full text-[9px] font-semibold ${tone(sp.name)}`}
                                >
                                  {initials(sp.name)}
                                </span>
                                {sp.name}
                                {sp.company ? <span className="font-normal text-zinc-400"> · {sp.company}</span> : null}
                              </span>
                            ))}
                            {roomName(s.roomId) && (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                                {roomName(s.roomId)}
                              </span>
                            )}
                            {t && (
                              <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                                <span
                                  aria-hidden="true"
                                  className="size-1.5 rounded-full"
                                  style={{ backgroundColor: t.color ?? "#a1a1aa" }}
                                />
                                {t.name}
                              </span>
                            )}
                          </div>
                          {s.description && !isBreak && (
                            <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-zinc-500">
                              {s.description}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
              {blocks.length === 0 && (
                <p className="py-12 text-center text-sm text-zinc-400">Nothing scheduled for this day yet.</p>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="mx-auto flex max-w-3xl items-center justify-center gap-1.5 px-6 pb-10 text-xs text-zinc-400">
        <BrandMark size={14} />
        <a href="/" className="transition-colors hover:text-zinc-900">
          Powered by smolboard
        </a>
      </footer>
    </div>
  );
}
