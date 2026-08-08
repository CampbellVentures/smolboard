import { query, v } from "@pylonsync/functions";
import { findConflicts, type AgendaSession } from "../lib/agenda";

// Agent tool: current agenda conflicts, named for humans.
export default query({
  args: { eventId: v.id("Event") },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string);

    // ctx.db.unsafe: membership verified above.
    const rows = await ctx.db.unsafe.query("Session", { eventId: args.eventId });
    const rooms = await ctx.db.unsafe.query("Room", { eventId: args.eventId });
    const sessions: AgendaSession[] = rows.map((s) => ({
      id: s.id as string,
      title: s.title as string,
      roomId: s.roomId as string | undefined,
      startTime: s.startTime as string | undefined,
      endTime: s.endTime as string | undefined,
      speakerUserIds: Array.isArray(s.speakerUserIdsJson) ? (s.speakerUserIdsJson as string[]) : [],
    }));
    const conflicts = findConflicts(sessions).map((c) => {
      const a = sessions.find((s) => s.id === c.a);
      const b = sessions.find((s) => s.id === c.b);
      return {
        kind: c.kind,
        sessions: [
          { id: c.a, title: a?.title },
          { id: c.b, title: b?.title },
        ],
        detail:
          c.kind === "room_overlap"
            ? `Overlap in ${rooms.find((r) => r.id === c.subject)?.name ?? "a room"}`
            : "Same speaker in both sessions",
      };
    });
    return { count: conflicts.length, conflicts };
  },
});
