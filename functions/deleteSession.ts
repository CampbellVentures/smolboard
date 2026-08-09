import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: { sessionId: v.id("Session") },
  async handler(ctx, args) {
    const session = await ctx.db.unsafe.get("Session", args.sessionId);
    if (!session) throw ctx.error("NOT_FOUND", "Session not found.");
    const event = await ctx.db.unsafe.get("Event", session.eventId as string);
    if (!event || event.orgId !== session.orgId) throw ctx.error("NOT_FOUND", "Session event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    const slots = await ctx.db.unsafe.query("DeliverableSlot", { sessionId: args.sessionId });
    if (slots.some((slot) => slot.orgId === session.orgId && slot.eventId === session.eventId)) {
      throw ctx.error("INVALID_ARGS", "A session with deliverable history cannot be deleted.");
    }
    const revisions = (await ctx.db.unsafe.query("SessionContentRevision", { sessionId: args.sessionId })).filter(
      (revision) => revision.orgId === session.orgId && revision.eventId === session.eventId,
    );
    for (const revision of revisions) {
      await ctx.db.unsafe.delete("SessionContentRevision", revision.id as string);
    }
    await ctx.db.unsafe.delete("Session", args.sessionId);
    return { deleted: true };
  },
});
