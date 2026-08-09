import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: { sessionId: v.id("Session"), revisionId: v.id("SessionContentRevision") },
  async handler(ctx, args) {
    const session = await ctx.db.unsafe.get("Session", args.sessionId);
    if (!session) throw ctx.error("NOT_FOUND", "Session not found.");
    await ctx.requireMember(session.orgId as string, { role: ["owner", "admin"] });
    const revision = await ctx.db.unsafe.get("SessionContentRevision", args.revisionId);
    if (!revision || revision.sessionId !== args.sessionId || revision.orgId !== session.orgId || revision.eventId !== session.eventId) {
      throw ctx.error("NOT_FOUND", "Session revision not found.");
    }
    const revisions = (await ctx.db.unsafe.query("SessionContentRevision", { sessionId: args.sessionId })).filter(
      (row) => row.orgId === session.orgId && row.eventId === session.eventId,
    );
    const revisionNumber = revisions.reduce((max, row) => Math.max(max, Number(row.revisionNumber) || 0), 0) + 1;
    const user = await ctx.db.unsafe.get("User", ctx.auth.userId);
    const id = await ctx.db.unsafe.insert("SessionContentRevision", {
      orgId: session.orgId as string,
      eventId: session.eventId as string,
      sessionId: args.sessionId,
      revisionNumber,
      title: revision.title as string,
      description: revision.description as string | undefined,
      speakerUserIdsJson: revision.speakerUserIdsJson,
      editorUserId: ctx.auth.userId,
      editorName: String(user?.displayName || user?.email || "Organizer").slice(0, 200),
      restoredFromRevisionId: args.revisionId,
    });
    await ctx.db.unsafe.update("Session", args.sessionId, {
      title: revision.title,
      description: revision.description,
      speakerUserIdsJson: revision.speakerUserIdsJson,
      currentRevisionId: id,
      contentStatus: "draft",
      approvedRevisionId: undefined,
      approvedAt: undefined,
      approvedByUserId: undefined,
    });
    return { id, revisionNumber };
  },
});
