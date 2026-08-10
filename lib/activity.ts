// Server-side activity logging. Called from mutations after their main work;
// a logging failure must never fail the user's action, so errors are swallowed.
// Rows are read by the bell menu (live) and the daily digest email.

interface ActivityInput {
  orgId: string;
  eventId?: string;
  actorName?: string;
  kind: string;
  message: string;
  href?: string;
}

// ctx.db.unsafe is intentionally loose in the functions SDK; type just what we
// use so every mutation's ctx satisfies it.
interface UnsafeDb {
  db: { unsafe: { insert(entity: string, row: Record<string, unknown>): Promise<unknown> } };
}

export async function logActivity(ctx: UnsafeDb, input: ActivityInput): Promise<void> {
  try {
    await ctx.db.unsafe.insert("ActivityLog", {
      orgId: input.orgId,
      eventId: input.eventId,
      actorName: input.actorName,
      kind: input.kind,
      message: input.message,
      href: input.href,
    });
  } catch {
    // Never let the audit trail break the action it records.
  }
}

export interface ActivityRow {
  id: string;
  orgId: string;
  eventId?: string;
  actorName?: string;
  kind: string;
  message: string;
  href?: string;
  createdAt: string;
}

/** "just now" / "12m ago" / "3h ago" / "2d ago" — bell menu timestamps. */
export function fmtAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
