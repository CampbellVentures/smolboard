import { mutation, v } from "@pylonsync/functions";
import { parseJson } from "../lib/types";

export default mutation({
  args: {
    taskId: v.optional(v.id("SpeakerTask")),
    sessionId: v.optional(v.id("Session")),
  },
  async handler(ctx, args) {
    if (Boolean(args.taskId) === Boolean(args.sessionId)) {
      throw ctx.error("INVALID_ARGS", "Choose exactly one task or session.");
    }
    if (args.taskId) {
      const task = await ctx.db.unsafe.get("SpeakerTask", args.taskId);
      if (!task || task.speakerUserId !== ctx.auth.userId) throw ctx.error("NOT_FOUND", "Task not found.");
      const [event, template] = await Promise.all([
        ctx.db.unsafe.get("Event", task.eventId as string),
        ctx.db.unsafe.get("TaskTemplate", task.taskTemplateId as string),
      ]);
      if (
        !event || !template || template.kind !== "upload" ||
        event.orgId !== task.orgId || template.orgId !== task.orgId || template.eventId !== task.eventId
      ) throw ctx.error("NOT_FOUND", "Upload task not found.");
      const profiles = await ctx.db.unsafe.query("SpeakerProfile", {
        eventId: task.eventId as string,
        userId: ctx.auth.userId,
      });
      if (!profiles.some((profile) => profile.orgId === task.orgId)) {
        throw ctx.error("NOT_FOUND", "Speaker profile not found.");
      }
      const existing = (await ctx.db.unsafe.query("DeliverableSlot", { taskId: args.taskId })).find(
        (slot) => slot.orgId === task.orgId && slot.eventId === task.eventId && slot.speakerUserId === ctx.auth.userId,
      );
      if (existing) return { id: existing.id as string };
      const speakerSessions = (await ctx.db.unsafe.query("Session", { eventId: task.eventId as string })).filter(
        (session) =>
          session.orgId === task.orgId &&
          (parseJson<string[]>(session.speakerUserIdsJson) ?? []).includes(ctx.auth.userId),
      );
      const id = await ctx.db.unsafe.insert("DeliverableSlot", {
        orgId: task.orgId as string,
        eventId: task.eventId as string,
        speakerUserId: ctx.auth.userId,
        taskId: args.taskId,
        sessionId: speakerSessions.length === 1 ? speakerSessions[0].id as string : undefined,
        kind: (template.target as string) || "document",
        title: template.title as string,
      });
      return { id };
    }

    const session = await ctx.db.unsafe.get("Session", args.sessionId!);
    if (!session) throw ctx.error("NOT_FOUND", "Session not found.");
    const speakerIds = parseJson<string[]>(session.speakerUserIdsJson) ?? [];
    if (!speakerIds.includes(ctx.auth.userId)) throw ctx.error("NOT_FOUND", "Session not found.");
    const event = await ctx.db.unsafe.get("Event", session.eventId as string);
    if (!event || event.orgId !== session.orgId) throw ctx.error("NOT_FOUND", "Session not found.");
    const existing = (await ctx.db.unsafe.query("DeliverableSlot", { sessionId: args.sessionId! })).find(
      (slot) => slot.orgId === session.orgId && slot.eventId === session.eventId && slot.speakerUserId === ctx.auth.userId,
    );
    if (existing) return { id: existing.id as string };
    const id = await ctx.db.unsafe.insert("DeliverableSlot", {
      orgId: session.orgId as string,
      eventId: session.eventId as string,
      speakerUserId: ctx.auth.userId,
      sessionId: args.sessionId,
      kind: "session-file",
      title: session.title as string,
    });
    return { id };
  },
});
