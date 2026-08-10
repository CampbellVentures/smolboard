// THE date formatters. Event dates are stored as midnight-UTC ISO strings, so
// date-only rendering must read UTC parts — a local-tz read shifts the day.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Aug 10" — date-only fields (event dates, deadlines). */
export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Aug 10, 2026" — date-only fields with year. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${fmtDateShort(iso)}, ${d.getUTCFullYear()}`;
}

/** "Oct 1–2, 2026" / "Oct 30 – Nov 1, 2026" / "Oct 1, 2026". */
export function fmtDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start) return "";
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return "";
  if (!end || end === start) return fmtDate(start);
  const e = new Date(end);
  if (Number.isNaN(e.getTime())) return fmtDate(start);
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${MONTHS[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}, ${s.getUTCFullYear()}`;
  }
  return `${fmtDateShort(start)} – ${fmtDateShort(end)}, ${e.getUTCFullYear()}`;
}

/** "Aug 10, 4:32 PM" — real timestamps, viewer-local. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
