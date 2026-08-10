import { mutation, v } from "@pylonsync/functions";
import { canonicalSessionForSubmission } from "./_submissionHandoff";

export default mutation({
  args: {
    eventId: v.id("Event"),
    submissionId: v.id("Submission"),
    roomId: v.optional(v.id("Room")),
    startTime: v.optional(v.datetime()),
    endTime: v.optional(v.datetime()),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    const { result } = await canonicalSessionForSubmission(ctx, event, args.submissionId);
    if (!result.data) return { materialized: false, unresolved: result.unresolved };
    if ((args.startTime && !args.endTime) || (!args.startTime && args.endTime)) {
      throw ctx.error("INVALID_ARGS", "Session start and end must be set together.");
    }
    if (args.startTime && args.endTime && Date.parse(args.endTime) <= Date.parse(args.startTime)) {
      throw ctx.error("INVALID_ARGS", "Session end must be after its start.");
    }
    if (args.roomId) {
      const room = await ctx.db.unsafe.get("Room", args.roomId);
      if (!room || room.eventId !== event.id || room.orgId !== event.orgId) {
        throw ctx.error("NOT_FOUND", "Room does not belong to this event.");
      }
    }
    const prior = (await ctx.db.unsafe.query("Session", {
      eventId: args.eventId,
      submissionId: args.submissionId,
    })).find((session) => session.orgId === event.orgId);
    const payload = {
      ...result.data,
      roomId: args.roomId,
      startTime: args.startTime,
      endTime: args.endTime,
    };
    if (prior) {
      await ctx.db.unsafe.update("Session", prior.id as string, payload);
      return { materialized: true, sessionId: prior.id as string, unresolved: [] };
    }
    const id = await ctx.db.unsafe.insert("Session", {
      orgId: event.orgId as string,
      eventId: event.id as string,
      ...payload,
    });
    // Seed revision 1 from the submission content so the session can go
    // through content approval (and reach the public schedule) without an
    // extra manual edit first.
    const user = await ctx.db.unsafe.get("User", ctx.auth.userId);
    const revisionId = await ctx.db.unsafe.insert("SessionContentRevision", {
      orgId: event.orgId as string,
      eventId: event.id as string,
      sessionId: id,
      revisionNumber: 1,
      title: result.data.title,
      description: result.data.description,
      speakerUserIdsJson: result.data.speakerUserIdsJson,
      editorUserId: ctx.auth.userId,
      editorName: String(user?.displayName || user?.email || "Organizer").slice(0, 200),
    });
    await ctx.db.unsafe.update("Session", id, { currentRevisionId: revisionId });
    return { materialized: true, sessionId: id, unresolved: [] };
  },
});
