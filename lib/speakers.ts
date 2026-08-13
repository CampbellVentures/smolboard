export const SPEAKER_STATUSES = ["invited", "confirmed", "declined", "waitlisted", "inactive"] as const;
export type SpeakerStatus = (typeof SPEAKER_STATUSES)[number];

export const PROFILE_LIMITS = {
  name: 200,
  email: 320,
  shortText: 300,
  bio: 10_000,
  logistics: 5_000,
  linkKeys: 4,
  linkValue: 500,
  customKeys: 32,
  customKey: 64,
  customString: 1_000,
} as const;

const SPEAKER_LINK_KEYS = ["website", "twitter", "linkedin", "github"] as const;

export const CSV_LIMITS = {
  bytes: 256_000,
  rows: 1_000,
  columns: 32,
  cellCharacters: 4_096,
} as const;

export interface SpeakerImportRow {
  rowNumber: number;
  name: string;
  email: string;
  jobTitle?: string;
  company?: string;
  bio?: string;
  tagline?: string;
  status: SpeakerStatus;
  headshotUrl?: string;
  logistics?: string;
  tags?: string[];
}

export class SpeakerCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeakerCsvError";
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeSpeakerEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidSpeakerEmail(value: string): boolean {
  return EMAIL_RE.test(normalizeSpeakerEmail(value));
}

export function normalizeSpeakerStatus(value: string | undefined): SpeakerStatus {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return SPEAKER_STATUSES.includes(normalized as SpeakerStatus)
    ? (normalized as SpeakerStatus)
    : "invited";
}

export function parseSpeakerStatus(value: string): SpeakerStatus {
  const normalized = value.trim().toLowerCase();
  if (!SPEAKER_STATUSES.includes(normalized as SpeakerStatus)) {
    throw new Error(`Status must be one of ${SPEAKER_STATUSES.join(", ")}.`);
  }
  return normalized as SpeakerStatus;
}

export function boundedSpeakerText(
  value: string | undefined,
  label: string,
  maximum: number,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return trimmed;
}

export function sanitizeSpeakerLinks(value: unknown): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Speaker links must be an object.");
  const entries = Object.entries(value);
  if (entries.length > PROFILE_LIMITS.linkKeys) throw new Error("Speaker links contain too many fields.");
  const sanitized: Record<string, string> = {};
  for (const [key, raw] of entries) {
    if (!SPEAKER_LINK_KEYS.includes(key as (typeof SPEAKER_LINK_KEYS)[number])) {
      throw new Error(`Unsupported speaker link field "${key}".`);
    }
    if (typeof raw !== "string") throw new Error(`Speaker link "${key}" must be text.`);
    const item = boundedSpeakerText(raw, `Speaker link "${key}"`, PROFILE_LIMITS.linkValue);
    if (item) sanitized[key] = item;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function sanitizeSpeakerCustom(value: unknown): Record<string, string | number | boolean | null> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Custom speaker data must be an object.");
  const entries = Object.entries(value);
  if (entries.length > PROFILE_LIMITS.customKeys) throw new Error("Custom speaker data contains too many fields.");
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!key || key.length > PROFILE_LIMITS.customKey) {
      throw new Error(`Custom speaker data keys must be 1-${PROFILE_LIMITS.customKey} characters.`);
    }
    if (typeof rawValue === "string") {
      if (rawValue.length > PROFILE_LIMITS.customString) {
        throw new Error(`Custom speaker value "${key}" must be ${PROFILE_LIMITS.customString} characters or fewer.`);
      }
      sanitized[key] = rawValue.trim();
    } else if (
      rawValue === null ||
      typeof rawValue === "boolean" ||
      (typeof rawValue === "number" && Number.isFinite(rawValue))
    ) {
      sanitized[key] = rawValue;
    } else {
      throw new Error(`Custom speaker value "${key}" must be text, a finite number, a boolean, or null.`);
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function validatePublicHeadshotUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Headshot URL must be a valid public HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    throw new Error("Headshot URL must be a valid public HTTPS URL.");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw new Error("Headshot URL must use a public host.");
  }
  return url.toString();
}

export function parseSpeakerCsv(csv: string): SpeakerImportRow[] {
  if (new TextEncoder().encode(csv).byteLength > CSV_LIMITS.bytes) {
    throw new SpeakerCsvError(`CSV exceeds the ${CSV_LIMITS.bytes}-byte limit.`);
  }
  const matrix = parseCsvMatrix(csv.replace(/^\uFEFF/, ""));
  if (matrix.length < 2) throw new SpeakerCsvError("CSV must include a header and at least one speaker row.");
  const headers = matrix[0].map(normalizeHeader);
  if (headers.length > CSV_LIMITS.columns) {
    throw new SpeakerCsvError(`CSV exceeds the ${CSV_LIMITS.columns}-column limit.`);
  }
  const duplicates = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicates.length > 0) throw new SpeakerCsvError(`CSV contains duplicate header "${duplicates[0]}".`);
  const nameIndex = findHeader(headers, ["name", "speaker_name", "full_name"]);
  const emailIndex = findHeader(headers, ["email", "email_address"]);
  if (nameIndex < 0 || emailIndex < 0) throw new SpeakerCsvError("CSV requires name and email columns.");

  const rows: SpeakerImportRow[] = [];
  for (let index = 1; index < matrix.length; index++) {
    const values = matrix[index];
    if (values.every((value) => !value.trim())) continue;
    const rowNumber = index + 1;
    if (values.length > headers.length) {
      throw new SpeakerCsvError(`Row ${rowNumber} has more columns than the header.`);
    }
    const get = (aliases: string[]) => {
      const column = findHeader(headers, aliases);
      return column < 0 ? "" : (values[column] ?? "").trim();
    };
    const name = values[nameIndex]?.trim() ?? "";
    const email = normalizeSpeakerEmail(values[emailIndex] ?? "");
    if (!name) throw new SpeakerCsvError(`Row ${rowNumber} is missing a name.`);
    if (!isValidSpeakerEmail(email)) throw new SpeakerCsvError(`Row ${rowNumber} has an invalid email address.`);
    let headshotUrl: string | undefined;
    try {
      headshotUrl = validatePublicHeadshotUrl(get(["headshot_url", "headshot", "photo_url"]));
    } catch (error) {
      throw new SpeakerCsvError(`Row ${rowNumber}: ${error instanceof Error ? error.message : "Invalid headshot URL."}`);
    }
    rows.push({
      rowNumber,
      name,
      email,
      jobTitle: optional(get(["job_title", "title", "role"])),
      company: optional(get(["company", "organization", "organisation"])),
      bio: optional(get(["bio", "biography"])),
      tagline: optional(get(["tagline"])),
      status: normalizeSpeakerStatus(get(["status"])),
      headshotUrl,
      logistics: optional(get(["logistics", "travel", "travel_preferences"])),
      tags: parseTags(get(["tags", "labels"])),
    });
  }
  if (rows.length > CSV_LIMITS.rows) throw new SpeakerCsvError(`CSV exceeds the ${CSV_LIMITS.rows}-row limit.`);
  if (rows.length === 0) throw new SpeakerCsvError("CSV does not contain any speaker rows.");
  return rows;
}

function parseCsvMatrix(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (char === "\0") throw new SpeakerCsvError("CSV contains an unsupported null character.");
    if (quoted) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      if (cell.length > 0) throw new SpeakerCsvError("A quoted field must begin at the start of a cell.");
      quoted = true;
    } else if (char === ",") {
      pushCell(row, cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[index + 1] === "\n") index++;
      pushCell(row, cell);
      rows.push(row);
      if (rows.length > CSV_LIMITS.rows + 2) throw new SpeakerCsvError(`CSV exceeds the ${CSV_LIMITS.rows}-row limit.`);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
    if (cell.length > CSV_LIMITS.cellCharacters) {
      throw new SpeakerCsvError(`A CSV cell exceeds the ${CSV_LIMITS.cellCharacters}-character limit.`);
    }
  }
  if (quoted) throw new SpeakerCsvError("CSV ends inside a quoted field.");
  if (cell.length > 0 || row.length > 0) {
    pushCell(row, cell);
    rows.push(row);
  }
  return rows;
}

function pushCell(row: string[], cell: string) {
  if (row.length >= CSV_LIMITS.columns) throw new SpeakerCsvError(`CSV exceeds the ${CSV_LIMITS.columns}-column limit.`);
  row.push(cell);
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function findHeader(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function optional(value: string): string | undefined {
  return value || undefined;
}

function parseTags(value: string): string[] | undefined {
  const tags = [...new Set(value.split(/[;|]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
  return tags.length > 0 ? tags : undefined;
}

// Whether a speaker's identity email can still be corrected.
//
// The address ties a SpeakerProfile to its User, so rewriting it under a
// signed-in speaker would hand their account to whoever holds the new inbox.
// Before anyone proves inbox control the User row is a shell the organizer
// created, and correcting a typo there is safe. A single claimed profile
// anywhere on the account closes the window, because one account can speak at
// several events and the email is shared across all of them.
export function speakerEmailLock(
  profiles: { claimStatus?: string }[],
  isOrgMember: boolean,
): { locked: boolean; reason?: string } {
  if (isOrgMember) {
    return { locked: true, reason: "This speaker also has a workspace account. Change the email from their account settings." };
  }
  // Legacy rows predate claimStatus and store "", which is not a claim.
  if (profiles.some((profile) => profile.claimStatus === "claimed")) {
    return { locked: true, reason: "This speaker has signed in and claimed their profile, so their email is now their login." };
  }
  return { locked: false };
}
