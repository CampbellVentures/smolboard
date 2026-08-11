// CSV parsing for the contact directory. Deliberately small and pure so the
// import path is testable without a server: quoted fields, escaped quotes, and
// a header row whose column order doesn't matter.

export interface ParsedContact {
  name: string;
  email: string;
  company: string;
  jobTitle: string;
  tags: string[];
  stage: string;
}

const STAGES = ["prospect", "contacted", "invited", "confirmed", "declined"];

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      out.push(field.trim());
      field = "";
    } else {
      field += char;
    }
  }
  out.push(field.trim());
  return out;
}

export function parseContactCsv(csv: string): { rows: ParsedContact[]; errors: string[] } {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return { rows: [], errors: ["The file is empty."] };
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const index = (...names: string[]) => {
    for (const name of names) {
      const at = header.indexOf(name);
      if (at !== -1) return at;
    }
    return -1;
  };
  const cols = {
    name: index("name", "fullname", "speaker"),
    email: index("email", "emailaddress"),
    company: index("company", "organization", "org"),
    jobTitle: index("jobtitle", "title", "role"),
    tags: index("tags", "tag"),
    stage: index("stage", "status"),
  };
  if (cols.name === -1 || cols.email === -1) {
    return { rows: [], errors: ["The file needs at least Name and Email columns."] };
  }

  const rows: ParsedContact[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const name = (cells[cols.name] ?? "").trim();
    const email = (cells[cols.email] ?? "").trim().toLowerCase();
    if (!name || !email) {
      errors.push(`Row ${i + 1}: name and email are required.`);
      continue;
    }
    if (!email.includes("@")) {
      errors.push(`Row ${i + 1}: "${email}" is not an email address.`);
      continue;
    }
    if (seen.has(email)) {
      errors.push(`Row ${i + 1}: duplicate of an earlier row (${email}).`);
      continue;
    }
    seen.add(email);
    const stage = cols.stage === -1 ? "" : (cells[cols.stage] ?? "").trim().toLowerCase();
    rows.push({
      name,
      email,
      company: cols.company === -1 ? "" : (cells[cols.company] ?? "").trim(),
      jobTitle: cols.jobTitle === -1 ? "" : (cells[cols.jobTitle] ?? "").trim(),
      tags:
        cols.tags === -1
          ? []
          : (cells[cols.tags] ?? "")
              .split(/[;|]/)
              .map((t) => t.trim())
              .filter(Boolean),
      stage: STAGES.includes(stage) ? stage : "prospect",
    });
  }
  return { rows, errors };
}

/** Contacts that look like the same person under a different address. */
export function findDuplicates<T extends { id: string; name: string; email: string }>(
  contacts: T[],
): { key: string; members: T[] }[] {
  const byName = new Map<string, T[]>();
  for (const contact of contacts) {
    const key = contact.name.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), contact]);
  }
  return [...byName.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => ({ key, members }));
}
