// Conflict-aware slot packing for the agenda's "Auto-schedule" action. Pure —
// timezone offsets are computed by the caller so this stays unit-testable.

export interface SchedulableSession {
  id: string;
  kind?: string;
  startTime?: string | null;
  endTime?: string | null;
  roomId?: string | null;
  speakerUserIds: string[];
}

export interface DaySpec {
  // YYYY-MM-DD in the event's timezone.
  day: string;
  // Minutes the event tz is ahead of UTC on that day (e.g. PDT = -420).
  tzOffsetMin: number;
}

export interface Placement {
  sessionId: string;
  startTime: string;
  endTime: string;
  roomId: string;
}

const SLOT_MIN = 15;
const DAY_START_MIN = 9 * 60;
const DAY_END_MIN = 17 * 60;

export function durationMinutes(kind: string | undefined): number {
  switch (kind) {
    case "keynote":
      return 45;
    case "workshop":
      return 90;
    case "panel":
      return 45;
    case "break":
      return 60;
    default:
      return 30;
  }
}

// Keynotes first (they anchor mornings), then workshops (long blocks pack
// worst when left last), then everything else in stable order.
const KIND_ORDER: Record<string, number> = { keynote: 0, workshop: 1 };

function slotUtcMs(spec: DaySpec, minuteOfDay: number): number {
  const [y, m, d] = spec.day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) + (minuteOfDay - spec.tzOffsetMin) * 60_000;
}

interface Busy {
  startMs: number;
  endMs: number;
  roomId: string | null;
  speakers: string[];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function computeAutoSchedule(
  unscheduled: SchedulableSession[],
  scheduled: SchedulableSession[],
  roomIds: string[],
  days: DaySpec[],
): { placements: Placement[]; unplacedIds: string[] } {
  if (roomIds.length === 0 || days.length === 0) {
    return { placements: [], unplacedIds: unscheduled.map((s) => s.id) };
  }
  const busy: Busy[] = scheduled
    .filter((s) => s.startTime && s.endTime)
    .map((s) => ({
      startMs: Date.parse(s.startTime!),
      endMs: Date.parse(s.endTime!),
      roomId: s.roomId ?? null,
      speakers: s.speakerUserIds,
    }));

  const ordered = unscheduled
    .slice()
    .sort((a, b) => (KIND_ORDER[a.kind ?? ""] ?? 2) - (KIND_ORDER[b.kind ?? ""] ?? 2));

  const placements: Placement[] = [];
  const unplacedIds: string[] = [];

  for (const session of ordered) {
    const minutes = durationMinutes(session.kind);
    let placed = false;
    outer: for (const day of days) {
      for (let start = DAY_START_MIN; start + minutes <= DAY_END_MIN; start += SLOT_MIN) {
        const startMs = slotUtcMs(day, start);
        const endMs = startMs + minutes * 60_000;
        const speakerClash = busy.some(
          (b) =>
            overlaps(startMs, endMs, b.startMs, b.endMs) &&
            b.speakers.some((speaker) => session.speakerUserIds.includes(speaker)),
        );
        if (speakerClash) continue;
        for (const roomId of roomIds) {
          const roomClash = busy.some(
            (b) => b.roomId === roomId && overlaps(startMs, endMs, b.startMs, b.endMs),
          );
          if (roomClash) continue;
          placements.push({
            sessionId: session.id,
            startTime: new Date(startMs).toISOString(),
            endTime: new Date(endMs).toISOString(),
            roomId,
          });
          busy.push({ startMs, endMs, roomId, speakers: session.speakerUserIds });
          placed = true;
          break outer;
        }
      }
    }
    if (!placed) unplacedIds.push(session.id);
  }
  return { placements, unplacedIds };
}
