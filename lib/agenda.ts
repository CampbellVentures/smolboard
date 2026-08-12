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

// Side-by-side placement for a calendar column that holds every room at once
// (the week view). Two talks at 10:00 in different rooms must not stack on top
// of each other, so each gets a horizontal lane.
//
// Lanes are computed per CLUSTER of transitively overlapping items, not across
// the whole day: a lone 4pm keynote spans the full column width even if the
// morning had four parallel tracks.
export interface LaneItem {
  id: string;
  start: number;
  end: number;
}

export interface LanePlacement {
  /** 0-based horizontal slot. */
  lane: number;
  /** How many lanes this item's cluster needs; the divisor for its width. */
  lanes: number;
}

export function packLanes(items: LaneItem[]): Map<string, LanePlacement> {
  // Longest-first on a tie so a 3-hour workshop anchors the left edge and the
  // short talks cycle beside it, the way a calendar app lays it out.
  const sorted = items.slice().sort((a, b) => a.start - b.start || b.end - a.end);
  const placements = new Map<string, LanePlacement>();

  let cluster: string[] = [];
  let clusterEnd = -Infinity;
  // laneEnds[i] is when lane i last became free.
  const laneEnds: number[] = [];
  const laneOf = new Map<string, number>();

  function flush() {
    for (const id of cluster) placements.set(id, { lane: laneOf.get(id) ?? 0, lanes: laneEnds.length });
    cluster = [];
    laneEnds.length = 0;
    clusterEnd = -Infinity;
  }

  for (const item of sorted) {
    // Starting at or after every open item ends means a fresh cluster.
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    laneOf.set(item.id, lane);
    cluster.push(item.id);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length > 0) flush();

  return placements;
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
