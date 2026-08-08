import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: { templateId: v.id("TaskTemplate") },
  async handler(ctx, args) {
    const template = await ctx.db.unsafe.get("TaskTemplate", args.templateId);
    if (!template) throw ctx.error("NOT_FOUND", "Task template not found.");
    await ctx.requireMember(template.orgId as string);
    const tasks = await ctx.db.unsafe.query("SpeakerTask", { taskTemplateId: args.templateId });
    for (const task of tasks) await ctx.db.unsafe.delete("SpeakerTask", task.id as string);
    await ctx.db.unsafe.delete("TaskTemplate", args.templateId);
    return { deleted: true, tasksDeleted: tasks.length };
  },
});
