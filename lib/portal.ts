export interface PortalSession {
  id: string;
  eventName: string;
  eventSlug: string;
  title: string;
  startTime: string;
  endTime: string;
  timezone: string;
  roomName?: string;
  schedulePublished: boolean;
}

export function parseSpeakerUserIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string");
  }
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}
