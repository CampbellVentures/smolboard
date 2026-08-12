import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: { roomId: v.id("Room") },
  async handler(ctx, args) {
    const room = await ctx.db.unsafe.get("Room", args.roomId);
    if (!room) throw ctx.error("NOT_FOUND", "Room not found.");
    const event = await ctx.db.unsafe.get("Event", room.eventId as string);
    if (!event || event.orgId !== room.orgId) throw ctx.error("NOT_FOUND", "Room event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    const sessions = (await ctx.db.unsafe.query("Session", { eventId: event.id as string })).filter(
      (row) => row.orgId === event.orgId,
    );
    for (const session of sessions.filter((row) => row.roomId === args.roomId)) {
      // null CLEARS the column; undefined would be ignored, which used to
      // leave these sessions pointing at a room that no longer exists —
      // invisible in the day grid and impossible to re-place, despite the
      // confirm dialog promising they move back to Unscheduled.
      await ctx.db.unsafe.update("Session", session.id as string, {
        roomId: null,
        startTime: null,
        endTime: null,
      });
    }
    await ctx.db.unsafe.delete("Room", args.roomId);
    return {
      deleted: true,
      sessionsUnscheduled: sessions.filter((row) => row.roomId === args.roomId).length,
    };
  },
});
