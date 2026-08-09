import { mutation, v } from "@pylonsync/functions";
import { parseFields, pruneAnswers, validateAnswers, type Answers } from "../lib/forms";

export default mutation({
  args: {
    taskId: v.id("SpeakerTask"),
    completed: v.bool(),
    response: v.optional(v.any()),
  },
  async handler(ctx, args) {
    const task = await ctx.db.unsafe.get("SpeakerTask", args.taskId);
    if (!task || task.speakerUserId !== ctx.auth.userId) {
      throw ctx.error("NOT_FOUND", "Task not found.");
    }
    const template = await ctx.db.unsafe.get("TaskTemplate", task.taskTemplateId as string);
    const event = await ctx.db.unsafe.get("Event", task.eventId as string);
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", {
      eventId: task.eventId as string,
      userId: ctx.auth.userId,
    });
    if (
      !template ||
      !event ||
      template.eventId !== task.eventId ||
      template.orgId !== task.orgId ||
      event.orgId !== task.orgId ||
      !profiles.some((profile) => profile.orgId === task.orgId)
    ) {
      throw ctx.error("NOT_FOUND", "Task not found.");
    }

    let responseJson: Answers | undefined;
    if (args.completed && template.kind === "form") {
      const fields = parseFields(safeParse(template.formJson));
      const answers = pruneAnswers(fields, (args.response ?? {}) as Answers);
      const errors = validateAnswers(fields, answers);
      if (errors.length > 0) {
        throw ctx.error("INVALID_ARGS", errors.map((error) => error.message).join(" "));
      }
      responseJson = answers;
    }
    if (args.completed && template.kind === "upload") {
      const slots = await ctx.db.unsafe.query("DeliverableSlot", { taskId: args.taskId });
      const slot = slots.find(
        (candidate) =>
          candidate.orgId === task.orgId &&
          candidate.eventId === task.eventId &&
          candidate.speakerUserId === ctx.auth.userId,
      );
      const versions = slot
        ? await ctx.db.unsafe.query("DeliverableVersion", { slotId: slot.id as string })
        : [];
      if (
        !slot ||
        !versions.some(
          (version) =>
            version.orgId === task.orgId &&
            version.eventId === task.eventId &&
            version.speakerUserId === ctx.auth.userId,
        )
      ) {
        throw ctx.error("INVALID_ARGS", "Upload a file to this task before completing it.");
      }
    }

    await ctx.db.unsafe.update("SpeakerTask", args.taskId, {
      status: args.completed ? "done" : "pending",
      completedAt: args.completed ? new Date().toISOString() : undefined,
      responseJson: args.completed ? responseJson : undefined,
    });
    return { id: args.taskId, status: args.completed ? "done" : "pending" };
  },
});

// json columns are parsed-on-read since 0.3.378; the string branch covers
// rows written before the migration.
function safeParse(raw: unknown) {
  if (typeof raw !== "string") return raw ?? undefined;
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
