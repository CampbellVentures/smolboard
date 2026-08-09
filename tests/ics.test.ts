import { expect, test } from "bun:test";
import {
  buildCalendarUrls,
  buildIcsInvite,
  calendarInviteUid,
  escapeIcsText,
  foldIcsLine,
} from "../lib/ics";

test("ICS text escaping covers reserved characters and newlines", () => {
  expect(escapeIcsText("A, B; C\\D\nNext")).toBe("A\\, B\\; C\\\\D\\nNext");
});

test("ICS folding keeps every physical line within 75 UTF-8 octets", () => {
  const folded = foldIcsLine(`DESCRIPTION:${"speaker résumé — ".repeat(10)}`);
  const encoder = new TextEncoder();
  for (const line of folded.split("\r\n")) {
    expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
  }
  expect(folded).toContain("\r\n ");
});

test("ICS invite is a stable REQUEST with attendee, sequence, and CRLF endings", () => {
  const ics = buildIcsInvite({
    uid: "session-speaker@smolboard",
    sequence: 2,
    start: "2026-08-11T17:00:00.000Z",
    end: "2026-08-11T17:30:00.000Z",
    summary: "Realtime, together",
    location: "Main stage",
    attendeeEmail: "speaker@example.com",
    now: new Date("2026-08-08T12:00:00.000Z"),
  });
  expect(ics).toContain("METHOD:REQUEST\r\n");
  expect(ics).toContain("UID:session-speaker@smolboard\r\n");
  expect(ics).toContain("SEQUENCE:2\r\n");
  expect(ics).toContain("DTSTART:20260811T170000Z\r\n");
  expect(ics).toContain("ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:speaker@example.com\r\n");
  expect(ics.endsWith("\r\n")).toBe(true);
});

test("calendar URLs encode the event for Google and Outlook", () => {
  const urls = buildCalendarUrls({
    start: "2026-08-11T17:00:00.000Z",
    end: "2026-08-11T17:30:00.000Z",
    summary: "A&B talk",
    description: "Live demo",
    location: "Room 1",
    icsUrl: "https://example.com/calendar/token",
  });
  expect(urls.ics).toBe("https://example.com/calendar/token");
  expect(new URL(urls.google).searchParams.get("text")).toBe("A&B talk");
  expect(new URL(urls.outlook).searchParams.get("subject")).toBe("A&B talk");
});

test("calendar invite identity is stable across delivery paths", () => {
  expect(calendarInviteUid("session-1", "speaker-2")).toBe(
    "session-1-speaker-2@smolboard",
  );
});
