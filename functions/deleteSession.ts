import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: { sessionId: v.id("Session") },
  async handler(ctx, args) {
    const session = await ctx.db.unsafe.get("Session", args.sessionId);
    if (!session) throw ctx.error("NOT_FOUND", "Session not found.");
    const event = await ctx.db.unsafe.get("Event", session.eventId as string);
    if (!event || event.orgId !== session.orgId) throw ctx.error("NOT_FOUND", "Session event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    await ctx.db.unsafe.delete("Session", args.sessionId);
    return { deleted: true };
  },
});
