import { describe, expect, test } from "bun:test";
import {
  type AgendaSession,
  conflictSessionIds,
  dayKey,
  eventDays,
  findConflicts,
  fmtTime,
  isoAt,
  minutesInDay,
  overlaps,
} from "../lib/agenda";

const s = (
  id: string,
  roomId: string | undefined,
  start: string | undefined,
  end: string | undefined,
  speakers: string[] = [],
): AgendaSession => ({
  id,
  title: id,
  roomId,
  startTime: start,
  endTime: end,
  speakerUserIds: speakers,
});

describe("overlaps", () => {
  test("touching intervals do not overlap", () => {
    expect(overlaps("2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z", "2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z")).toBe(false);
  });
  test("nested and partial overlaps detected", () => {
    expect(overlaps("2026-10-01T10:00:00Z", "2026-10-01T12:00:00Z", "2026-10-01T10:30:00Z", "2026-10-01T11:00:00Z")).toBe(true);
    expect(overlaps("2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z", "2026-10-01T10:30:00Z", "2026-10-01T11:30:00Z")).toBe(true);
  });
});

describe("findConflicts", () => {
  test("same room, overlapping times", () => {
    const conflicts = findConflicts([
      s("a", "r1", "2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z"),
      s("b", "r1", "2026-10-01T10:30:00Z", "2026-10-01T11:30:00Z"),
    ]);
    expect(conflicts).toEqual([{ kind: "room_overlap", a: "a", b: "b", subject: "r1" }]);
  });
  test("different rooms no conflict; same speaker double-booked", () => {
    const conflicts = findConflicts([
      s("a", "r1", "2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z", ["u1"]),
      s("b", "r2", "2026-10-01T10:30:00Z", "2026-10-01T11:30:00Z", ["u1", "u2"]),
    ]);
    expect(conflicts).toEqual([{ kind: "speaker_double_booked", a: "a", b: "b", subject: "u1" }]);
  });
  test("back-to-back same room is fine", () => {
    expect(
      findConflicts([
        s("a", "r1", "2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z"),
        s("b", "r1", "2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z"),
      ]),
    ).toEqual([]);
  });
  test("unscheduled and half-scheduled sessions never conflict", () => {
    expect(
      findConflicts([
        s("a", "r1", undefined, undefined),
        s("b", "r1", "2026-10-01T10:00:00Z", undefined),
        s("c", "r1", "2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z"),
      ]),
    ).toEqual([]);
  });
  test("inverted interval ignored", () => {
    expect(
      findConflicts([
        s("a", "r1", "2026-10-01T11:00:00Z", "2026-10-01T10:00:00Z"),
        s("b", "r1", "2026-10-01T10:00:00Z", "2026-10-01T12:00:00Z"),
      ]),
    ).toEqual([]);
  });
  test("both kinds at once + conflictSessionIds", () => {
    const conflicts = findConflicts([
      s("a", "r1", "2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z", ["u1"]),
      s("b", "r1", "2026-10-01T10:15:00Z", "2026-10-01T10:45:00Z", ["u1"]),
      s("c", "r2", "2026-10-01T14:00:00Z", "2026-10-01T15:00:00Z"),
    ]);
    expect(conflicts).toHaveLength(2);
    expect([...conflictSessionIds(conflicts)].sort()).toEqual(["a", "b"]);
  });
});

describe("timezone helpers", () => {
  test("minutesInDay respects timezone", () => {
    // 17:00 UTC = 10:00 PDT (UTC-7 in October).
    expect(minutesInDay("2026-10-01T17:00:00Z", "America/Los_Angeles")).toBe(10 * 60);
    expect(minutesInDay("2026-10-01T17:00:00Z", "UTC")).toBe(17 * 60);
  });
  test("dayKey respects timezone", () => {
    // 02:00 UTC Oct 2 = Oct 1 in LA.
    expect(dayKey("2026-10-02T02:00:00Z", "America/Los_Angeles")).toBe("2026-10-01");
    expect(dayKey("2026-10-02T02:00:00Z", "UTC")).toBe("2026-10-02");
  });
  test("isoAt round-trips through minutesInDay/dayKey", () => {
    const iso = isoAt("2026-10-01", 9 * 60 + 30, "America/Los_Angeles");
    expect(minutesInDay(iso, "America/Los_Angeles")).toBe(9 * 60 + 30);
    expect(dayKey(iso, "America/Los_Angeles")).toBe("2026-10-01");
    // And in a UTC+ timezone across the date line.
    const iso2 = isoAt("2026-10-01", 8 * 60, "Asia/Tokyo");
    expect(minutesInDay(iso2, "Asia/Tokyo")).toBe(8 * 60);
    expect(dayKey(iso2, "Asia/Tokyo")).toBe("2026-10-01");
  });
  test("fmtTime", () => {
    expect(fmtTime(9 * 60)).toBe("9am");
    expect(fmtTime(13 * 60 + 30)).toBe("1:30pm");
    expect(fmtTime(12 * 60)).toBe("12pm");
    expect(fmtTime(0)).toBe("12am");
  });
});

describe("eventDays", () => {
  test("uses event date range inclusive", () => {
    expect(eventDays("2026-10-01T00:00:00Z", "2026-10-03T00:00:00Z", [], "UTC")).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
  });
  test("single-day event", () => {
    expect(eventDays("2026-10-01T00:00:00Z", undefined, [], "UTC")).toEqual(["2026-10-01"]);
  });
  test("falls back to session days when no dates", () => {
    const days = eventDays(undefined, undefined, [
      s("a", "r1", "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z"),
      s("b", "r1", "2026-10-04T10:00:00Z", "2026-10-04T11:00:00Z"),
    ], "UTC");
    expect(days).toEqual(["2026-10-04", "2026-10-05"]);
  });
});
