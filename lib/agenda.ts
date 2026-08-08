// Agenda math — pure, framework-free, tested in tests/agenda.test.ts.
// Sessions with null startTime/endTime/roomId live in the "unscheduled" tray
// and never conflict.

export interface AgendaSession {
  id: string;
  title: string;
  roomId?: string;
  trackId?: string;
  startTime?: string; // ISO
  endTime?: string; // ISO
  speakerUserIds?: string[];
}

export type ConflictKind = "room_overlap" | "speaker_double_booked";

export interface Conflict {
  kind: ConflictKind;
  a: string; // session id
  b: string; // session id
  // roomId for room_overlap, userId for speaker_double_booked.
  subject: string;
}

function scheduled(s: AgendaSession): s is AgendaSession & { startTime: string; endTime: string } {
  return !!s.startTime && !!s.endTime && Date.parse(s.startTime) < Date.parse(s.endTime);
}

export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}

// All pairwise conflicts: two sessions in the same room at overlapping times,
// or one speaker booked into two overlapping sessions (any rooms). Pairs are
// reported once (a < b by index), deduped per kind+subject.
export function findConflicts(sessions: AgendaSession[]): Conflict[] {
  const out: Conflict[] = [];
  const sched = sessions.filter(scheduled);
  for (let i = 0; i < sched.length; i++) {
    for (let j = i + 1; j < sched.length; j++) {
      const a = sched[i];
      const b = sched[j];
      if (!overlaps(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
      if (a.roomId && b.roomId && a.roomId === b.roomId) {
        out.push({ kind: "room_overlap", a: a.id, b: b.id, subject: a.roomId });
      }
      const shared = (a.speakerUserIds ?? []).filter((u) =>
        (b.speakerUserIds ?? []).includes(u),
      );
      for (const u of shared) {
        out.push({ kind: "speaker_double_booked", a: a.id, b: b.id, subject: u });
      }
    }
  }
  return out;
}

export function conflictSessionIds(conflicts: Conflict[]): Set<string> {
  const ids = new Set<string>();
  for (const c of conflicts) {
    ids.add(c.a);
    ids.add(c.b);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Grid helpers. The agenda grid renders one day at a time in a fixed timezone,
// with SLOT_MINUTES granularity. Times are handled as "minutes since day
// start" for layout, converted back to ISO on drop.
// ---------------------------------------------------------------------------

export const SLOT_MINUTES = 15;
export const DAY_START_MIN = 7 * 60; // 07:00
export const DAY_END_MIN = 22 * 60; // 22:00

export function slotCount(): number {
  return (DAY_END_MIN - DAY_START_MIN) / SLOT_MINUTES;
}

// ISO → minutes since midnight in the given IANA timezone.
export function minutesInDay(iso: string, timeZone: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

// ISO → YYYY-MM-DD in the given timezone (the grid's day key).
export function dayKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Build an ISO instant for (dayKey, minutes-since-midnight) in a timezone.
// Walks the actual UTC offset for that wall time (DST-safe for any sane
// conference schedule).
export function isoAt(day: string, minutes: number, timeZone: string): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const naive = new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  // Find the offset by checking what wall time the naive instant renders as.
  const rendered = minutesInDay(naive.toISOString(), timeZone);
  const renderedDay = dayKey(naive.toISOString(), timeZone);
  let deltaMin = minutes - rendered;
  if (renderedDay < day) deltaMin += 24 * 60;
  if (renderedDay > day) deltaMin -= 24 * 60;
  return new Date(naive.getTime() + deltaMin * 60_000).toISOString();
}

export function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? "am" : "pm";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hh}${ampm}` : `${hh}:${String(m).padStart(2, "0")}${ampm}`;
}

// Days a grid should offer: every day between the event's start and end
// (inclusive), falling back to days that already have sessions, else today.
export function eventDays(
  startDate: string | undefined,
  endDate: string | undefined,
  sessions: AgendaSession[],
  timeZone: string,
): string[] {
  if (startDate) {
    const days: string[] = [];
    const start = dayKey(startDate, "UTC");
    const end = endDate ? dayKey(endDate, "UTC") : start;
    const cur = new Date(`${start}T12:00:00Z`);
    for (let i = 0; i < 14 && dayKey(cur.toISOString(), "UTC") <= end; i++) {
      days.push(dayKey(cur.toISOString(), "UTC"));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    if (days.length > 0) return days;
  }
  const fromSessions = [
    ...new Set(sessions.filter((s) => s.startTime).map((s) => dayKey(s.startTime!, timeZone))),
  ].sort();
  return fromSessions.length > 0 ? fromSessions : [];
}
