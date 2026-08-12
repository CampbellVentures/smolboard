import { mutation, v } from "@pylonsync/functions";
import { matchesEventAnchor } from "../lib/tenantAnchors";

export default mutation({
  args: { templateId: v.id("TaskTemplate") },
  async handler(ctx, args) {
    const template = await ctx.db.unsafe.get("TaskTemplate", args.templateId);
    if (!template) throw ctx.error("NOT_FOUND", "Task template not found.");
    const event = await ctx.db.unsafe.get("Event", template.eventId as string);
    if (!event || event.orgId !== template.orgId) throw ctx.error("NOT_FOUND", "Task template not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    const tasks = (await ctx.db.unsafe.query("SpeakerTask", { taskTemplateId: args.templateId })).filter(
      (task) => matchesEventAnchor(task, template.eventId as string, template.orgId as string),
    );
    for (const task of tasks) {
      const slots = await ctx.db.unsafe.query("DeliverableSlot", { taskId: task.id as string });
      if (slots.some((slot) => matchesEventAnchor(slot, template.eventId as string, template.orgId as string))) {
        // Say where to go. This used to be a dead end: the only way to clear
        // the history was through a page that had no remove control, so an
        // upload task became permanent the moment one speaker uploaded.
        throw ctx.error(
          "INVALID_ARGS",
          "Speakers have uploaded files for this task. Remove them on the Content page first.",
        );
      }
    }
    for (const task of tasks) await ctx.db.unsafe.delete("SpeakerTask", task.id as string);
    await ctx.db.unsafe.delete("TaskTemplate", args.templateId);
    return { deleted: true, tasksDeleted: tasks.length };
  },
});
