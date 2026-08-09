export type CfpWindowState = "upcoming" | "open" | "closed";

export interface CfpWindowInput {
  eventStatus: string;
  formStatus: string;
  opensAt?: string;
  closesAt?: string;
}

export function cfpWindowState(input: CfpWindowInput, now: string | Date | number = Date.now()): CfpWindowState {
  const current = typeof now === "number" ? now : new Date(now).getTime();
  if (!Number.isFinite(current) || input.eventStatus !== "open" || input.formStatus !== "open") {
    return "closed";
  }
  const opens = input.opensAt ? Date.parse(input.opensAt) : undefined;
  const closes = input.closesAt ? Date.parse(input.closesAt) : undefined;
  if (
    (input.opensAt && !Number.isFinite(opens)) ||
    (input.closesAt && !Number.isFinite(closes)) ||
    (opens !== undefined && closes !== undefined && closes <= opens)
  ) return "closed";
  if (opens !== undefined && Number.isFinite(opens) && current < opens) return "upcoming";
  // Closing is an exclusive boundary: at the configured instant writes lock.
  if (closes !== undefined && Number.isFinite(closes) && current >= closes) return "closed";
  return "open";
}

export function formatCfpInstant(iso: string | undefined, timeZone: string): string | undefined {
  if (!iso || !Number.isFinite(Date.parse(iso))) return undefined;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return undefined;
  }
}

export function utcToZonedInput(iso: string | undefined, timeZone: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const parts = zonedParts(new Date(iso), timeZone);
  if (!parts) return "";
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function zonedInputToUtc(value: string, timeZone: string): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const wanted = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const localAsUtc = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute);
  let candidate = localAsUtc;
  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = zonedParts(new Date(candidate), timeZone);
    if (!actual) return undefined;
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    candidate += localAsUtc - actualAsUtc;
  }
  const verified = zonedParts(new Date(candidate), timeZone);
  if (!verified || Object.keys(wanted).some((key) =>
    verified[key as keyof typeof verified] !== wanted[key as keyof typeof wanted]
  )) return undefined;
  return new Date(candidate).toISOString();
}

function zonedParts(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
  } catch {
    return undefined;
  }
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
