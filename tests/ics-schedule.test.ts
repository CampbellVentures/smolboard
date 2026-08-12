import { expect, test } from "bun:test";
import { buildScheduleCalendar, escapeIcsText, foldIcsLine, formatSessionTime } from "../lib/ics";

// The subscribable feed at /<org>/<event>/calendar.ics. Calendar clients are
// unforgiving about this format: CRLF line endings, escaped text, folded long
// lines. A malformed feed fails silently in the client, so it's worth pinning.

const NOW = new Date("2026-08-12T04:00:00.000Z");

function build(overrides: Parameters<typeof buildScheduleCalendar>[0]["events"] = []) {
  return buildScheduleCalendar({ calendarName: "DevSummit", events: overrides, now: NOW });
}

const ONE = [
  {
    uid: "s1@smolboard",
    start: "2026-10-01T16:00:00.000Z",
    end: "2026-10-01T16:30:00.000Z",
    summary: "Opening keynote",
  },
];

test("an empty schedule is still a valid, empty calendar", () => {
  const ics = build();
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  expect(ics).not.toContain("BEGIN:VEVENT");
  expect(ics).toContain("METHOD:PUBLISH");
  expect(ics).toContain("X-WR-CALNAME:DevSummit");
});

test("every line ends CRLF, as the spec requires", () => {
  const ics = build(ONE);
  // No bare LF anywhere: split on CRLF first, then look for survivors.
  expect(ics.split("\r\n").some((line) => line.includes("\n"))).toBe(false);
  expect(ics.endsWith("\r\n")).toBe(true);
});

test("a session becomes one VEVENT with UTC stamps", () => {
  const ics = build(ONE);
  expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  expect(ics).toContain("UID:s1@smolboard");
  expect(ics).toContain("DTSTART:20261001T160000Z");
  expect(ics).toContain("DTEND:20261001T163000Z");
  expect(ics).toContain("DTSTAMP:20260812T040000Z");
  expect(ics).toContain("SUMMARY:Opening keynote");
  expect(ics).toContain("STATUS:CONFIRMED");
});

test("optional fields are omitted rather than emitted empty", () => {
  const bare = build(ONE);
  expect(bare).not.toContain("DESCRIPTION:");
  expect(bare).not.toContain("LOCATION:");
  expect(bare).not.toContain("URL:");

  const full = build([
    { ...ONE[0], description: "Why demos aren't products", location: "Main Stage", url: "https://x.test/e" },
  ]);
  expect(full).toContain("DESCRIPTION:Why demos aren't products");
  expect(full).toContain("LOCATION:Main Stage");
  expect(full).toContain("URL:https://x.test/e");
});

test("commas and semicolons in titles are escaped, not left to break parsing", () => {
  const ics = build([{ ...ONE[0], summary: "Scaling, safely; a field guide" }]);
  expect(ics).toContain("SUMMARY:Scaling\\, safely\\; a field guide");
});

test("a newline in a description becomes a literal \\n", () => {
  const ics = build([{ ...ONE[0], description: "Line one\nLine two" }]);
  expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
  // and does not introduce a real break that would end the property
  expect(ics).not.toContain("DESCRIPTION:Line one\r\nLine two");
});

test("the calendar name is escaped too", () => {
  const ics = buildScheduleCalendar({
    calendarName: "DevSummit, 2026",
    events: [],
    now: NOW,
  });
  expect(ics).toContain("X-WR-CALNAME:DevSummit\\, 2026");
});

test("multiple sessions keep their order and count", () => {
  const ics = build([
    ONE[0],
    { uid: "s2@smolboard", start: "2026-10-01T17:00:00.000Z", end: "2026-10-01T17:30:00.000Z", summary: "Second" },
  ]);
  expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
  expect(ics.indexOf("UID:s1@smolboard")).toBeLessThan(ics.indexOf("UID:s2@smolboard"));
});

test("an invalid session date is rejected rather than written as garbage", () => {
  expect(() => build([{ ...ONE[0], start: "not-a-date" }])).toThrow();
});

test("long lines fold at 75 bytes with a leading space on continuations", () => {
  const long = "x".repeat(200);
  const folded = foldIcsLine(`SUMMARY:${long}`);
  const parts = folded.split("\r\n");
  expect(parts.length).toBeGreaterThan(1);
  for (const part of parts.slice(1)) expect(part.startsWith(" ")).toBe(true);
  // Unfolding restores the original.
  expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(`SUMMARY:${long}`);
});

test("folding counts bytes, not characters, so multi-byte titles stay valid", () => {
  // Emoji are 4 bytes each; a character-counting fold would overrun the limit.
  const folded = foldIcsLine(`SUMMARY:${"🎤".repeat(40)}`);
  for (const line of folded.split("\r\n")) {
    expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(76);
  }
});

test("escapeIcsText handles a backslash before it handles anything else", () => {
  // Escaping in the wrong order would double-escape the inserted backslashes.
  expect(escapeIcsText("a\\b")).toBe("a\\\\b");
  expect(escapeIcsText("a,b")).toBe("a\\,b");
});

test("formatSessionTime renders a range in the event's timezone", () => {
  const out = formatSessionTime(
    "2026-10-01T16:00:00.000Z",
    "2026-10-01T16:30:00.000Z",
    "America/Los_Angeles",
  );
  // 16:00Z is 9:00 Pacific in October (PDT).
  expect(out).toContain("9:00");
  expect(out).toContain("9:30");
  expect(out).toContain("Oct 1");
  expect(out).toContain("–");
});
