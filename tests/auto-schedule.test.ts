import { expect, test } from "bun:test";
import { computeAutoSchedule, durationMinutes, type DaySpec } from "../lib/auto-schedule";

const DAYS: DaySpec[] = [
  { day: "2026-10-01", tzOffsetMin: -420 }, // PDT
  { day: "2026-10-02", tzOffsetMin: -420 },
];

function sess(id: string, over: Record<string, unknown> = {}) {
  return { id, speakerUserIds: [], ...over };
}

test("durations by kind", () => {
  expect(durationMinutes("keynote")).toBe(45);
  expect(durationMinutes("workshop")).toBe(90);
  expect(durationMinutes("talk")).toBe(30);
  expect(durationMinutes(undefined)).toBe(30);
});

test("places sessions at 9am local, no overlaps in one room", () => {
  const { placements, unplacedIds } = computeAutoSchedule(
    [sess("a"), sess("b")],
    [],
    ["room1"],
    DAYS,
  );
  expect(unplacedIds).toEqual([]);
  // 9:00 PDT == 16:00 UTC
  expect(placements[0].startTime).toBe("2026-10-01T16:00:00.000Z");
  const [a, b] = placements;
  expect(Date.parse(b.startTime)).toBeGreaterThanOrEqual(Date.parse(a.endTime));
});

test("uses a second room before a later slot, keynotes first", () => {
  const { placements } = computeAutoSchedule(
    [sess("talk1", { kind: "talk" }), sess("key", { kind: "keynote" })],
    [],
    ["r1", "r2"],
    DAYS,
  );
  const byId = Object.fromEntries(placements.map((p) => [p.sessionId, p]));
  // Keynote sorted first → gets 9:00 in r1; talk shares 9:00 in r2.
  expect(byId.key.roomId).toBe("r1");
  expect(byId.talk1.startTime).toBe(byId.key.startTime);
  expect(byId.talk1.roomId).toBe("r2");
});

test("never double-books a speaker even across rooms", () => {
  const { placements } = computeAutoSchedule(
    [sess("a", { speakerUserIds: ["u1"] }), sess("b", { speakerUserIds: ["u1"] })],
    [],
    ["r1", "r2"],
    DAYS,
  );
  const [a, b] = placements;
  const clash =
    Date.parse(a.startTime) < Date.parse(b.endTime) &&
    Date.parse(b.startTime) < Date.parse(a.endTime);
  expect(clash).toBe(false);
});

test("respects existing scheduled sessions", () => {
  const { placements } = computeAutoSchedule(
    [sess("new")],
    [
      sess("existing", {
        startTime: "2026-10-01T16:00:00.000Z",
        endTime: "2026-10-01T17:00:00.000Z",
        roomId: "r1",
      }),
    ],
    ["r1"],
    DAYS,
  );
  expect(Date.parse(placements[0].startTime)).toBeGreaterThanOrEqual(
    Date.parse("2026-10-01T17:00:00.000Z"),
  );
});

test("reports unplaceable sessions instead of overflowing the day", () => {
  const many = Array.from({ length: 40 }, (_, i) => sess(`w${i}`, { kind: "workshop" }));
  const { placements, unplacedIds } = computeAutoSchedule(many, [], ["r1"], [DAYS[0]]);
  // 9:00–17:00 fits five 90-minute workshops per room-day.
  expect(placements.length).toBe(5);
  expect(unplacedIds.length).toBe(35);
});
