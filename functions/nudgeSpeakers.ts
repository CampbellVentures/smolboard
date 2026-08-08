import { mutation, v } from "@pylonsync/functions";
import { taskReminderList } from "../lib/tasks";
import type { SpeakerTaskRow, TaskTemplateRow } from "../lib/types";

export default mutation({
  args: {
    eventId: v.id("Event"),
    speakerUserIds: v.array(v.id("User")),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string);

    const wanted = new Set(args.speakerUserIds);
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", { eventId: args.eventId });
    const tasks = (await ctx.db.unsafe.query("SpeakerTask", {
      eventId: args.eventId,
    })) as unknown as SpeakerTaskRow[];
    const templates = (await ctx.db.unsafe.query("TaskTemplate", {
      eventId: args.eventId,
    })) as unknown as TaskTemplateRow[];
    const recipients = profiles.filter((profile) => wanted.has(profile.userId as string));

    await ctx.auth.elevate({
      admin: true,
      reason: "queue organizer-requested speaker task reminders",
    });
    let queued = 0;
    for (const profile of recipients) {
      const speakerTasks = tasks.filter(
        (task) => task.speakerUserId === profile.userId && task.status !== "done",
      );
      if (speakerTasks.length === 0) continue;
      await ctx.scheduler.runAfter(0, "sendTemplatedEmail", {
        eventId: args.eventId,
        templateKey: "task_reminder",
        toEmail: profile.email as string,
        vars: {
          speaker_name: (profile.name as string) ?? "",
          task_list: taskReminderList(speakerTasks, templates),
        },
      });
      queued++;
    }
    return { queued };
  },
});
