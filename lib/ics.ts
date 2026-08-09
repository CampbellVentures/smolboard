export interface CalendarEventInput {
  uid: string;
  sequence?: number;
  start: string;
  end: string;
  summary: string;
  description?: string;
  location?: string;
  organizerEmail?: string;
  attendeeEmail?: string;
  url?: string;
  now?: Date;
}

export function calendarInviteUid(sessionId: string, speakerUserId: string) {
  return `${sessionId}-${speakerUserId}@smolboard`;
}

export function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function utcStamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Calendar dates must be valid ISO timestamps.");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  const segments: string[] = [];
  let segment = "";
  let maxBytes = 75;
  for (const character of line) {
    const next = segment + character;
    if (encoder.encode(next).length > maxBytes && segment) {
      segments.push(segment);
      segment = character;
      maxBytes = 74;
    } else {
      segment = next;
    }
  }
  segments.push(segment);
  return segments.join("\r\n ");
}

export function buildIcsInvite(input: CalendarEventInput) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//smolboard//Speaker Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(input.uid)}`,
    `SEQUENCE:${input.sequence ?? 0}`,
    `DTSTAMP:${utcStamp(input.now ?? new Date())}`,
    `DTSTART:${utcStamp(input.start)}`,
    `DTEND:${utcStamp(input.end)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    ...(input.description ? [`DESCRIPTION:${escapeIcsText(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${escapeIcsText(input.location)}`] : []),
    ...(input.organizerEmail
      ? [`ORGANIZER:mailto:${escapeIcsText(input.organizerEmail)}`]
      : []),
    ...(input.attendeeEmail
      ? [`ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${escapeIcsText(input.attendeeEmail)}`]
      : []),
    ...(input.url ? [`URL:${input.url}`] : []),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function buildCalendarUrls(
  input: Pick<CalendarEventInput, "start" | "end" | "summary" | "description" | "location"> & {
    icsUrl: string;
  },
) {
  const start = new Date(input.start);
  const end = new Date(input.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new Error("Calendar dates must be valid ISO timestamps.");
  }
  const compact = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const google = new URL("https://calendar.google.com/calendar/render");
  google.searchParams.set("action", "TEMPLATE");
  google.searchParams.set("text", input.summary);
  google.searchParams.set("dates", `${compact(start)}/${compact(end)}`);
  if (input.description) google.searchParams.set("details", input.description);
  if (input.location) google.searchParams.set("location", input.location);

  const outlook = new URL("https://outlook.live.com/calendar/0/deeplink/compose");
  outlook.searchParams.set("path", "/calendar/action/compose");
  outlook.searchParams.set("rru", "addevent");
  outlook.searchParams.set("subject", input.summary);
  outlook.searchParams.set("startdt", start.toISOString());
  outlook.searchParams.set("enddt", end.toISOString());
  if (input.description) outlook.searchParams.set("body", input.description);
  if (input.location) outlook.searchParams.set("location", input.location);

  return { ics: input.icsUrl, google: google.toString(), outlook: outlook.toString() };
}

export function formatSessionTime(start: string, end: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${formatter.format(startDate)} – ${endDate.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
