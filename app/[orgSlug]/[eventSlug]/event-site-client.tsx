"use client";

import React, { useEffect, useMemo, useState } from "react";
import { callFn, Link } from "@pylonsync/react";
import { dayKey, eventSessionTime, fmtTime, minutesInDay } from "@/lib/agenda";
import { buildCalendarUrls, buildIcsInvite } from "@/lib/ics";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight, CalendarDays, Loader2, Send } from "lucide-react";
import { type PublicEventInfo } from "@/components/public-shell";
import { PersonAvatar } from "@/components/person-avatar";

// The whole public event site is ONE page: description, schedule, speakers —
// the header tabs are anchor links that scroll here. Only the CFP is a
// separate route (it's a form flow).

export interface ScheduleFeed {
  event: { timezone: string } | null;
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
    speakers: {
      name: string;
      tagline: string | null;
      company: string | null;
      jobTitle: string | null;
      bio: string | null;
      headshotUrl: string | null;
    }[];
  }[];
}

export interface SpeakersFeed {
  published: boolean;
  speakers: {
    name: string;
    tagline: string | null;
    bio: string | null;
    company: string | null;
    jobTitle: string | null;
    headshotUrl: string | null;
    talks: string[];
    sessions?: { title: string; startTime: string | null; endTime: string | null; room: string | null }[];
  }[];
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]} · ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// Day picker reads as a torn-off calendar page: weekday, big date, month.
function dayParts(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  return {
    weekday: DAY_NAMES[d.getUTCDay()].slice(0, 3).toUpperCase(),
    date: d.getUTCDate(),
    month: MONTHS[d.getUTCMonth()].toUpperCase(),
  };
}

export function EventSite({
  event,
  description,
  cfpOpen,
  initialSchedule = null,
  initialSpeakers = null,
  section,
}: {
  event: PublicEventInfo;
  description: string | null;
  cfpOpen: boolean;
  // SSR'd feeds (serverData.fn). The client fetch below is only a fallback so
  // the page still fills in if a caller ever renders without them.
  initialSchedule?: ScheduleFeed | null;
  initialSpeakers?: SpeakersFeed | null;
  // Embed mode renders exactly one section with none of the page chrome —
  // used by the iframe widgets (?embed=schedule|speakers).
  section?: "schedule" | "speakers";
}) {
  const { orgSlug, slug: eventSlug } = event;
  const [schedule, setSchedule] = useState<ScheduleFeed | null>(initialSchedule);
  const [speakers, setSpeakers] = useState<SpeakersFeed | null>(initialSpeakers);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!initialSchedule) {
      callFn<ScheduleFeed>("getPublicSchedule", { orgSlug, eventSlug })
        .then(setSchedule)
        .catch(() => setError(true));
    }
    if (!initialSpeakers) {
      callFn<SpeakersFeed>("getPublicSpeakers", { orgSlug, eventSlug })
        .then(setSpeakers)
        .catch(() => setError(true));
    }
  }, [orgSlug, eventSlug, initialSchedule, initialSpeakers]);

  if (section === "schedule") return <ScheduleSection feed={schedule} error={error} embedded eventInfo={event} />;
  if (section === "speakers")
    return <SpeakersSection feed={speakers} embedded tz={schedule?.event?.timezone ?? "UTC"} />;

  return (
    <>
      {description && (
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          {description}
        </p>
      )}
      {cfpOpen && (
        <Link
          href={`/${orgSlug}/${eventSlug}/cfp`}
          className={
            "flex items-center gap-4 rounded-xl bg-white dark:bg-zinc-900 px-6 py-5 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_2px_6px_rgba(0,0,0,0.06)]" +
            (description ? "mt-8" : "")
          }
        >
          <Send className="size-5 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-50">Call for speakers</div>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Submit a talk. The CFP is open.</p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
        </Link>
      )}

      <ScheduleSection feed={schedule} error={error} eventInfo={event} />
      <SpeakersSection feed={speakers} tz={schedule?.event?.timezone ?? "UTC"} />
    </>
  );
}

/* ------------------------------ Schedule ------------------------------ */

type PublicSession = ScheduleFeed["sessions"][number];

function ScheduleSection({
  feed,
  error,
  embedded = false,
  eventInfo,
}: {
  feed: ScheduleFeed | null;
  error: boolean;
  embedded?: boolean;
  eventInfo: PublicEventInfo;
}) {
  const tz = feed?.event?.timezone ?? "UTC";
  const days = useMemo(() => {
    if (!feed) return [];
    return [...new Set(feed.sessions.map((s) => dayKey(s.startTime!, tz)))].sort();
  }, [feed, tz]);
  const [day, setDay] = useState<string | null>(null);
  const activeDay = day ?? days[0];
  const [trackFilter, setTrackFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<PublicSession | null>(null);

  const roomName = (id: string | null) => feed?.rooms.find((r) => r.id === id)?.name;
  const track = (id: string | null) => feed?.tracks.find((t) => t.id === id);

  const daySessions = useMemo(() => {
    if (!feed || !activeDay) return [];
    let list = feed.sessions.filter((s) => dayKey(s.startTime!, tz) === activeDay);
    if (trackFilter) list = list.filter((s) => s.trackId === trackFilter);
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(needle) ||
          s.speakers.some((sp) => sp.name.toLowerCase().includes(needle)),
      );
    }
    return list.sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1));
  }, [feed, activeDay, trackFilter, search, tz]);

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
    <section id="schedule" className={embedded ? "" : "scroll-mt-6 pt-12"}>
      {embedded ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Schedule</h2>
          {feed && feed.sessions.length > 0 ? (
            <a
              href={`/${eventInfo.orgSlug}/${eventInfo.slug}/calendar.ics`}
              className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900"
            >
              <CalendarDays className="size-4" aria-hidden="true" />
              Subscribe to calendar
            </a>
          ) : null}
        </div>
      )}
      {!feed && !error && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-400 dark:text-zinc-500">
          <Loader2 className="size-4 animate-spin" /> Loading schedule…
        </div>
      )}
      {(error || (feed && !feed.published)) && (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white dark:bg-zinc-900 px-6 py-14 text-center">
          <CalendarDays className="mx-auto size-8 text-zinc-300" />
          <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">
            The schedule isn&apos;t published yet
          </p>
          <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
            Check back soon. Talks are still being confirmed.
          </p>
        </div>
      )}

      {feed?.published && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {days.map((d) => {
              const part = dayParts(d);
              const active = activeDay === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  aria-pressed={active}
                  aria-label={dayLabel(d)}
                  className={
                    "flex w-14 flex-col items-center overflow-hidden rounded-xl text-center transition-shadow " +
                    (active
                      ? "shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.12)]"
                      : "shadow-[0_0_0_1px_rgba(0,0,0,0.06)] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.14)]")
                  }
                >
                  <span
                    className={
                      "w-full py-0.5 text-[10px] font-semibold tracking-wide " +
                      (active ? "bg-zinc-900 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400")
                    }
                  >
                    {part.weekday}
                  </span>
                  <span className="flex w-full flex-col bg-white dark:bg-zinc-900 pb-1 pt-0.5">
                    <span
                      className={
                        "text-[19px] font-semibold leading-6 tabular-nums " +
                        (active ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-400")
                      }
                    >
                      {part.date}
                    </span>
                    <span className="text-[9px] font-medium tracking-wide text-zinc-400 dark:text-zinc-500">
                      {part.month}
                    </span>
                  </span>
                </button>
              );
            })}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search talks…"
              aria-label="Search schedule"
              className="ml-auto h-8 w-40 rounded-full bg-white dark:bg-zinc-900 px-3.5 text-[13px] text-zinc-600 dark:text-zinc-300 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] outline-none placeholder:text-zinc-400 focus:shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
            />
            {feed.tracks.length > 0 && (
              <select
                value={trackFilter}
                onChange={(e) => setTrackFilter(e.target.value)}
                aria-label="Filter by track"
                className="h-8 rounded-full bg-white dark:bg-zinc-900 px-3 text-[13px] text-zinc-600 dark:text-zinc-300 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] outline-none"
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

          <div className="relative mt-6 space-y-6">
            <div
              aria-hidden="true"
              className="absolute bottom-3 top-3 hidden w-px bg-zinc-200 sm:block"
              style={{ left: "5.75rem" }}
            />
            {blocks.map((b) => (
              <div key={b.start} className="grid gap-6 sm:grid-cols-[5rem_1fr]">
                <div className="relative pt-3 text-right text-[13px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
                  {fmtTime(minutesInDay(b.start, tz))}
                  <span
                    aria-hidden="true"
                    className="absolute top-[1.15rem] hidden size-[7px] rounded-full bg-white dark:bg-zinc-900 ring-2 ring-zinc-300 sm:block"
                    style={{ right: "-0.95rem" }}
                  />
                </div>
                <div className="space-y-3">
                  {b.sessions.map((s) => {
                    const t = track(s.trackId);
                    const isBreak = s.kind === "break";
                    return (
                      // A break is not interactive; a talk is. The interactive
                      // one carries a role, a tab stop, and Enter/Space, so it
                      // exists in the accessibility tree — it was a bare
                      // click-only div, which meant keyboard users (and
                      // anything driving by role) could not open a session at
                      // all.
                      <article
                        key={s.id}
                        onClick={isBreak ? undefined : () => setDetail(s)}
                        onKeyDown={
                          isBreak
                            ? undefined
                            : (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setDetail(s);
                                }
                              }
                        }
                        role={isBreak ? undefined : "button"}
                        tabIndex={isBreak ? undefined : 0}
                        aria-label={isBreak ? undefined : `${s.title} — session details`}
                        className={
                          "min-w-0 rounded-xl bg-white dark:bg-zinc-900 p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)]" +
                          (isBreak
                            ? "opacity-70"
                            : "cursor-pointer transition-shadow hover:shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_2px_6px_rgba(0,0,0,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900")
                        }
                      >
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-50">{s.title}</h3>
                          <span className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                            {fmtTime(minutesInDay(s.startTime!, tz))}–{fmtTime(minutesInDay(s.endTime!, tz))}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                          {s.speakers.map((sp) => (
                            <span key={sp.name} className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-200">
                              <PersonAvatar name={sp.name} src={sp.headshotUrl} size="xs" />
                              {sp.name}
                              {sp.company ? <span className="font-normal text-zinc-400 dark:text-zinc-500"> · {sp.company}</span> : null}
                            </span>
                          ))}
                          {roomName(s.roomId) && (
                            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                              {roomName(s.roomId)}
                            </span>
                          )}
                          {t && (
                            <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
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
                          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
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
              <p className="py-12 text-center text-sm text-zinc-400 dark:text-zinc-500">
                Nothing scheduled for this day yet.
              </p>
            )}
          </div>
        </>
      )}
      <SessionDetailDialog
        session={detail}
        onClose={() => setDetail(null)}
        tz={tz}
        roomName={detail ? roomName(detail.roomId) : undefined}
        trackName={detail ? track(detail.trackId)?.name ?? null : null}
        eventInfo={eventInfo}
      />
    </section>
  );
}

/* --------------------------- Session detail --------------------------- */

function SessionDetailDialog({
  session,
  onClose,
  tz,
  roomName,
  trackName,
  eventInfo,
}: {
  session: PublicSession | null;
  onClose: () => void;
  tz: string;
  roomName?: string;
  trackName: string | null;
  eventInfo: PublicEventInfo;
}) {
  if (!session || !session.startTime || !session.endTime) {
    return null;
  }
  const location = [roomName, eventInfo.location].filter(Boolean).join(" · ");
  const calendar = buildCalendarUrls({
    start: session.startTime,
    end: session.endTime,
    summary: `${session.title} — ${eventInfo.name}`,
    description: session.description ?? undefined,
    location: location || undefined,
    icsUrl: "",
  });
  function downloadIcs() {
    const ics = buildIcsInvite({
      uid: `${session!.id}@smolboard`,
      start: session!.startTime!,
      end: session!.endTime!,
      summary: `${session!.title} — ${eventInfo.name}`,
      description: session!.description ?? undefined,
      location: location || undefined,
    });
    const blob = new Blob([ics], { type: "text/calendar" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${session!.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-left text-lg leading-snug">{session.title}</DialogTitle>
          <DialogDescription className="text-left">
            {fmtTime(minutesInDay(session.startTime, tz))}–{fmtTime(minutesInDay(session.endTime, tz))}
            {roomName ? ` · ${roomName}` : ""}
            {trackName ? ` · ${trackName}` : ""}
            {/* Session format (keynote, workshop, panel…) — the dimension the
                CFP form collected and the handoff carried onto the session. */}
            {session.kind ? ` · ${session.kind.replace(/^./, (c) => c.toUpperCase())}` : ""}
          </DialogDescription>
        </DialogHeader>
        {session.description ? (
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-300">
            {session.description}
          </p>
        ) : null}
        {session.speakers.length > 0 ? (
          <div className="space-y-3">
            {session.speakers.map((sp) => (
              <div key={sp.name} className="flex items-start gap-3">
                <PersonAvatar name={sp.name} src={sp.headshotUrl} size="lg" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{sp.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {[sp.jobTitle, sp.company].filter(Boolean).join(", ") || sp.tagline || ""}
                  </p>
                  {sp.bio ? (
                    <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{sp.bio}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <a
            href={calendar.google}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors hover:bg-zinc-200"
          >
            Google Calendar
          </a>
          <a
            href={calendar.outlook}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors hover:bg-zinc-200"
          >
            Outlook
          </a>
          <button
            type="button"
            onClick={downloadIcs}
            className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors hover:bg-zinc-200"
          >
            Download .ics
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Speakers ------------------------------ */

function SpeakersSection({
  feed,
  embedded = false,
  // Session times belong to the event, not the viewer. SpeakersFeed has no
  // timezone of its own, so the caller passes the schedule feed's.
  tz = "UTC",
}: {
  feed: SpeakersFeed | null;
  embedded?: boolean;
  tz?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<SpeakersFeed["speakers"][number] | null>(null);
  // The unpublished case is already covered by the schedule empty state; an
  // extra "no speakers yet" box would just repeat it.
  if (!feed?.published || feed.speakers.length === 0) return null;

  const needle = q.trim().toLowerCase();
  // Directories are read by surname, so sort that way rather than by first name.
  const people = feed.speakers
    .filter(
      (sp) =>
        !needle ||
        sp.name.toLowerCase().includes(needle) ||
        (sp.company ?? "").toLowerCase().includes(needle),
    )
    .slice()
    .sort((a, b) => speakerSurname(a.name).localeCompare(speakerSurname(b.name)));

  return (
    <section id="speakers" className={embedded ? "" : "scroll-mt-6 pt-12"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {embedded ? <span /> : (
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Speakers</h2>
        )}
        <label className="relative">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search speakers…"
            aria-label="Search speakers"
            className="h-8 w-44 rounded-full bg-white dark:bg-zinc-900 px-3.5 text-[13px] text-zinc-600 dark:text-zinc-300 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] outline-none placeholder:text-zinc-400 focus:shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
          />
        </label>
      </div>
      <p className="mt-2 text-[12.5px] text-zinc-500 dark:text-zinc-400" aria-live="polite">
        {people.length} of {feed.speakers.length} speakers
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {people.map((sp) => (
          <button
            key={sp.name}
            type="button"
            onClick={() => setOpen(sp)}
            className="min-w-0 rounded-xl bg-white dark:bg-zinc-900 p-5 text-left shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)]"
          >
            <div className="flex items-center gap-3">
              <PersonAvatar name={sp.name} src={sp.headshotUrl} size="xl" />
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-semibold text-zinc-900 dark:text-zinc-50">{sp.name}</h3>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {[sp.jobTitle, sp.company].filter(Boolean).join(", ") || sp.tagline || ""}
                </p>
              </div>
            </div>
            {sp.bio && (
              <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{sp.bio}</p>
            )}
            {sp.talks.length > 0 && (
              <div className="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-2.5">
                {sp.talks.map((t) => (
                  <p key={t} className="text-[12.5px] font-medium leading-5 text-zinc-700 dark:text-zinc-200">
                    {t}
                  </p>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
      {people.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 px-6 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
          No speakers match that search.
        </p>
      ) : null}

      {open ? (
        <SpeakerDetailDialog speaker={open} onClose={() => setOpen(null)} tz={tz} />
      ) : null}
    </section>
  );
}

function speakerSurname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.at(-1) ?? name).toLowerCase();
}

// Drill-in for a speakers-list entry: bio plus where and when they speak.
function SpeakerDetailDialog({
  speaker,
  onClose,
  tz,
}: {
  tz: string;
  speaker: SpeakersFeed["speakers"][number];
  onClose: () => void;
}) {
  const sessions = speaker.sessions ?? speaker.talks.map((title) => ({
    title,
    startTime: null,
    endTime: null,
    room: null,
  }));
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <PersonAvatar name={speaker.name} src={speaker.headshotUrl} size="xl" />
            <div className="min-w-0 text-left">
              <DialogTitle className="truncate">{speaker.name}</DialogTitle>
              <DialogDescription className="truncate">
                {[speaker.jobTitle, speaker.company].filter(Boolean).join(", ") || speaker.tagline || ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {speaker.bio ? (
          <p className="text-[13.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">{speaker.bio}</p>
        ) : null}
        {sessions.length > 0 ? (
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Sessions</p>
            <ul className="mt-1.5 flex flex-col gap-2">
              {sessions.map((session) => (
                <li key={session.title}>
                  <p className="text-[13.5px] font-medium text-zinc-800 dark:text-zinc-100">{session.title}</p>
                  {session.startTime ? (
                    <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">
                      {eventSessionTime(session.startTime, session.endTime, tz)}
                      {session.room ? ` · ${session.room}` : ""}
                    </p>
                  ) : session.room ? (
                    <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">{session.room}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
