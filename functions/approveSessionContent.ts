import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: { sessionId: v.id("Session"), approved: v.bool() },
  async handler(ctx, args) {
    const session = await ctx.db.unsafe.get("Session", args.sessionId);
    if (!session) throw ctx.error("NOT_FOUND", "Session not found.");
    await ctx.requireMember(session.orgId as string, { role: ["owner", "admin"] });
    if (args.approved) {
      if (!session.currentRevisionId) throw ctx.error("INVALID_ARGS", "Save session content before approving it.");
      const revision = await ctx.db.unsafe.get("SessionContentRevision", session.currentRevisionId as string);
      if (!revision || revision.sessionId !== args.sessionId || revision.orgId !== session.orgId || revision.eventId !== session.eventId) {
        throw ctx.error("NOT_FOUND", "Current session revision not found.");
      }
    }
    const now = new Date().toISOString();
    await ctx.db.unsafe.update("Session", args.sessionId, {
      contentStatus: args.approved ? "approved" : "draft",
      approvedRevisionId: args.approved ? session.currentRevisionId : undefined,
      approvedAt: args.approved ? now : undefined,
      approvedByUserId: args.approved ? ctx.auth.userId : undefined,
    });
    return { status: args.approved ? "approved" : "draft", approvedAt: args.approved ? now : undefined };
  },
});
