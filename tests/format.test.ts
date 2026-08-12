import { expect, test } from "bun:test";
import { fmtDate, fmtDateRange, fmtDateShort, fmtDateTime } from "../lib/format";

// Event dates are stored as midnight-UTC ISO strings. Reading them with
// local-timezone getters shifts the day backwards for anyone west of UTC,
// which is the bug these tests exist to catch — they must pass on a machine
// set to any timezone.

test("date-only fields read UTC parts, not local ones", () => {
  // Midnight UTC. A local read in the Americas would render this as Oct 31.
  expect(fmtDateShort("2026-11-01T00:00:00.000Z")).toBe("Nov 1");
  expect(fmtDate("2026-11-01T00:00:00.000Z")).toBe("Nov 1, 2026");
});

test("first and last day of a year", () => {
  expect(fmtDate("2026-01-01T00:00:00.000Z")).toBe("Jan 1, 2026");
  expect(fmtDate("2026-12-31T00:00:00.000Z")).toBe("Dec 31, 2026");
});

test("empty and invalid input render as an empty string, never NaN", () => {
  for (const bad of [null, undefined, "", "not a date"]) {
    expect(fmtDateShort(bad)).toBe("");
    expect(fmtDate(bad)).toBe("");
    expect(fmtDateTime(bad)).toBe("");
  }
  expect(fmtDateRange(null, "2026-10-02T00:00:00.000Z")).toBe("");
  expect(fmtDateRange("nope", "2026-10-02T00:00:00.000Z")).toBe("");
});

test("a range inside one month collapses the month name", () => {
  expect(fmtDateRange("2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z")).toBe(
    "Oct 1–2, 2026",
  );
});

test("a range crossing months names both", () => {
  expect(fmtDateRange("2026-10-30T00:00:00.000Z", "2026-11-01T00:00:00.000Z")).toBe(
    "Oct 30 – Nov 1, 2026",
  );
});

test("a range crossing a year uses the end year", () => {
  expect(fmtDateRange("2026-12-30T00:00:00.000Z", "2027-01-02T00:00:00.000Z")).toBe(
    "Dec 30 – Jan 2, 2027",
  );
});

test("a one-day event is a single date", () => {
  const day = "2026-10-01T00:00:00.000Z";
  expect(fmtDateRange(day, day)).toBe("Oct 1, 2026");
  expect(fmtDateRange(day, null)).toBe("Oct 1, 2026");
});

test("an unparseable end date falls back to the start date alone", () => {
  expect(fmtDateRange("2026-10-01T00:00:00.000Z", "garbage")).toBe("Oct 1, 2026");
});

test("timestamps render viewer-local and non-empty", () => {
  // Deliberately not asserting exact text: fmtDateTime is the one formatter
  // that reads the viewer's timezone, so the output is machine-dependent.
  const out = fmtDateTime("2026-08-10T16:32:00.000Z");
  expect(out.length).toBeGreaterThan(0);
  expect(out).toMatch(/\d/);
  expect(out).not.toContain("NaN");
  expect(out).not.toContain("Invalid");
});
