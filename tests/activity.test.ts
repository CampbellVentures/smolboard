import { expect, test } from "bun:test";
import { fmtAgo, logActivity } from "../lib/activity";

const NOW = new Date("2026-08-12T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

test("relative timestamps step through the units the bell menu shows", () => {
  expect(fmtAgo(ago(0), NOW)).toBe("just now");
  expect(fmtAgo(ago(59_000), NOW)).toBe("just now");
  expect(fmtAgo(ago(60_000), NOW)).toBe("1m ago");
  expect(fmtAgo(ago(59 * 60_000), NOW)).toBe("59m ago");
  expect(fmtAgo(ago(60 * 60_000), NOW)).toBe("1h ago");
  expect(fmtAgo(ago(23 * 3_600_000), NOW)).toBe("23h ago");
  expect(fmtAgo(ago(24 * 3_600_000), NOW)).toBe("1d ago");
  expect(fmtAgo(ago(10 * 24 * 3_600_000), NOW)).toBe("10d ago");
});

test("a clock skewed into the future reads 'just now', never a negative age", () => {
  const future = new Date(NOW.getTime() + 5 * 60_000).toISOString();
  expect(fmtAgo(future, NOW)).toBe("just now");
});

test("an unparseable timestamp renders as nothing", () => {
  expect(fmtAgo("not a date", NOW)).toBe("");
});

test("logActivity writes the row it was given", async () => {
  const written: Array<[string, Record<string, unknown>]> = [];
  const ctx = {
    db: {
      unsafe: {
        async insert(entity: string, row: Record<string, unknown>) {
          written.push([entity, row]);
          return null;
        },
      },
    },
  };
  await logActivity(ctx, {
    orgId: "org1",
    eventId: "ev1",
    actorName: "Ada",
    kind: "submission",
    message: "New submission",
    href: "/x",
  });
  expect(written.length).toBe(1);
  expect(written[0][0]).toBe("ActivityLog");
  expect(written[0][1]).toMatchObject({
    orgId: "org1",
    eventId: "ev1",
    actorName: "Ada",
    kind: "submission",
    message: "New submission",
    href: "/x",
  });
});

test("a failed write never propagates — the audit trail must not break the action", async () => {
  const ctx = {
    db: {
      unsafe: {
        async insert() {
          throw new Error("database is gone");
        },
      },
    },
  };
  // The assertion is that this resolves rather than rejecting.
  await expect(
    logActivity(ctx, { orgId: "org1", kind: "submission", message: "New submission" }),
  ).resolves.toBeUndefined();
});
