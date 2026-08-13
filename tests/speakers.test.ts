import { expect, test } from "bun:test";
import {
  CSV_LIMITS,
  PROFILE_LIMITS,
  SpeakerCsvError,
  boundedSpeakerText,
  normalizeSpeakerEmail,
  parseSpeakerStatus,
  parseSpeakerCsv,
  sanitizeSpeakerCustom,
  sanitizeSpeakerLinks,
  speakerEmailLock,
  validatePublicHeadshotUrl,
} from "../lib/speakers";
import { matchesEventAnchor } from "../lib/tenantAnchors";

test("speaker identity normalization is deterministic", () => {
  expect(normalizeSpeakerEmail(" Priya.Raman@Example.COM ")).toBe("priya.raman@example.com");
});

test("speaker CSV supports BOM, CRLF, quoted commas/newlines, and escaped quotes", () => {
  const rows = parseSpeakerCsv(
    '\uFEFFName,Email,Title,Company,Bio,Tags\r\n"Priya Raman",PRIYA@example.com,"Principal Engineer","Latticework, Inc.","Line one\nLine ""two""","keynote|platform"\r\n',
  );
  expect(rows).toEqual([
    expect.objectContaining({
      rowNumber: 2,
      name: "Priya Raman",
      email: "priya@example.com",
      jobTitle: "Principal Engineer",
      company: "Latticework, Inc.",
      bio: 'Line one\nLine "two"',
      tags: ["keynote", "platform"],
    }),
  ]);
});

test("speaker CSV returns deterministic validation errors", () => {
  expect(() => parseSpeakerCsv("name,email\nPriya,not-an-email")).toThrow(
    new SpeakerCsvError("Row 2 has an invalid email address."),
  );
  expect(() => parseSpeakerCsv(`name,email\nPriya,priya@example.com,extra`)).toThrow(
    "Row 2 has more columns than the header.",
  );
  expect(() => parseSpeakerCsv(`name,email\nPriya,priya@example.com\n`.repeat(CSV_LIMITS.rows + 2))).toThrow(
    `CSV exceeds the ${CSV_LIMITS.rows}-row limit.`,
  );
});

test("shared headshots require a public HTTPS URL", () => {
  expect(validatePublicHeadshotUrl("https://cdn.example.com/priya.png")).toBe(
    "https://cdn.example.com/priya.png",
  );
  expect(() => validatePublicHeadshotUrl("http://cdn.example.com/priya.png")).toThrow();
  expect(() => validatePublicHeadshotUrl("https://127.0.0.1/priya.png")).toThrow();
});

test("organizer status validation rejects typos while CSV keeps its documented default", () => {
  expect(parseSpeakerStatus("confirmed")).toBe("confirmed");
  expect(() => parseSpeakerStatus("confimed")).toThrow("Status must be one of");
  expect(parseSpeakerCsv("name,email,status\nPriya,priya@example.com,confimed")[0].status).toBe("invited");
});

test("profile text, links, and shallow custom fields are bounded", () => {
  expect(boundedSpeakerText("  concise  ", "Bio", 20)).toBe("concise");
  expect(() => boundedSpeakerText("x".repeat(21), "Bio", 20)).toThrow("20 characters or fewer");
  expect(sanitizeSpeakerLinks({ website: " https://example.com ", linkedin: "" })).toEqual({
    website: "https://example.com",
  });
  expect(() => sanitizeSpeakerLinks({ unknown: "value" })).toThrow("Unsupported speaker link field");
  expect(() => sanitizeSpeakerLinks({ website: "x".repeat(PROFILE_LIMITS.linkValue + 1) })).toThrow();
  expect(sanitizeSpeakerCustom({ dietary: " Vegetarian ", guests: 1, accessible: true, note: null })).toEqual({
    dietary: "Vegetarian",
    guests: 1,
    accessible: true,
    note: null,
  });
  expect(() => sanitizeSpeakerCustom({ nested: { unsafe: true } })).toThrow("must be text");
  expect(() => sanitizeSpeakerCustom(Object.fromEntries(Array.from({ length: PROFILE_LIMITS.customKeys + 1 }, (_, index) => [`key-${index}`, index])))).toThrow("too many fields");
});

test("duplicate candidates exclude malformed legacy rows from another organization", () => {
  const rows = [
    { eventId: "event-a", orgId: "org-a", email: "valid@example.com" },
    { eventId: "event-a", orgId: "org-b", email: "foreign@example.com" },
  ];
  expect(rows.filter((row) => matchesEventAnchor(row, "event-a", "org-a")).map((row) => row.email)).toEqual([
    "valid@example.com",
  ]);
});

test("speakerEmailLock: an unclaimed speaker can be corrected", () => {
  expect(speakerEmailLock([{ claimStatus: "unclaimed" }], false).locked).toBe(false);
});

test("speakerEmailLock: legacy rows with no claimStatus are not a claim", () => {
  expect(speakerEmailLock([{ claimStatus: "" }, {}], false).locked).toBe(false);
});

test("speakerEmailLock: one claimed profile locks every profile on the account", () => {
  const lock = speakerEmailLock([{ claimStatus: "unclaimed" }, { claimStatus: "claimed" }], false);
  expect(lock.locked).toBe(true);
  expect(lock.reason).toContain("claimed their profile");
});

test("speakerEmailLock: a workspace account is locked even when unclaimed", () => {
  const lock = speakerEmailLock([{ claimStatus: "unclaimed" }], true);
  expect(lock.locked).toBe(true);
  expect(lock.reason).toContain("workspace account");
});

test("speakerEmailLock: a speaker with no profiles is not locked", () => {
  expect(speakerEmailLock([], false).locked).toBe(false);
});
