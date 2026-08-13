import { mutation, v } from "@pylonsync/functions";

// Remove entries from an event's delivery log.
//
// The log is a convenience view of what went out, not the audit trail — that
// is ActivityLog, which this does not touch. Setting an event up means test
// sends to yourself and to placeholder addresses, and there was no way to take
// those back out, so the log a real organizer looks at fills with noise they
// cannot clear.
//
// Ids are explicit rather than a filter: clearing a log should be a deliberate
// act on rows the caller has looked at, not a wildcard that quietly takes more
// than intended.
export default mutation<{ eventId: string; logIds: string[] }, { deleted: number }>({
  args: {
    eventId: v.id("Event"),
    logIds: v.array(v.id("EmailLog")),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    if (args.logIds.length === 0) return { deleted: 0 };
    if (args.logIds.length > 500) {
      throw ctx.error("INVALID_ARGS", "Delete at most 500 log entries at a time.");
    }

    const wanted = new Set(args.logIds);
    // Read the event's own rows and intersect, so an id belonging to another
    // event or workspace cannot be deleted by passing it in.
    const rows = (await ctx.db.unsafe.query("EmailLog", { eventId: args.eventId })).filter(
      (row) => row.orgId === event.orgId && wanted.has(row.id as string),
    );
    for (const row of rows) {
      await ctx.db.unsafe.delete("EmailLog", row.id as string);
    }
    return { deleted: rows.length };
  },
});
