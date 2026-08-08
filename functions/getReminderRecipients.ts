import { query } from "@pylonsync/functions";
import { taskReminderList } from "../lib/tasks";
import type { SpeakerTaskRow, TaskTemplateRow } from "../lib/types";

export interface ReminderRecipient {
  eventId: string;
  toEmail: string;
  speakerName: string;
  taskList: string;
}

export default query<{}, ReminderRecipient[]>({
  internal: true,
  args: {},
  async handler(ctx) {
    const now = new Date();
    const cutoff = now.getTime() + 3 * 24 * 60 * 60 * 1000;
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);

    const tasks = (await ctx.db.unsafe.list("SpeakerTask")) as unknown as SpeakerTaskRow[];
    const templates = (await ctx.db.unsafe.list("TaskTemplate")) as unknown as TaskTemplateRow[];
    const profiles = await ctx.db.unsafe.list("SpeakerProfile");
    const logs = await ctx.db.unsafe.list("EmailLog");
    const templatesById = new Map(templates.map((template) => [template.id, template]));
    const grouped = new Map<string, SpeakerTaskRow[]>();

    for (const task of tasks) {
      if (task.status === "done") continue;
      const template = templatesById.get(task.taskTemplateId);
      const due = template?.dueAt ? new Date(template.dueAt).getTime() : Number.POSITIVE_INFINITY;
      if (!Number.isFinite(due) || due > cutoff) continue;
      const key = `${task.eventId}:${task.speakerUserId}`;
      grouped.set(key, [...(grouped.get(key) ?? []), task]);
    }

    const recipients: ReminderRecipient[] = [];
    for (const speakerTasks of grouped.values()) {
      const first = speakerTasks[0];
      const profile = profiles.find(
        (row) => row.eventId === first.eventId && row.userId === first.speakerUserId,
      );
      if (!profile?.email) continue;
      const sentToday = logs.some(
        (log) =>
          log.eventId === first.eventId &&
          log.toEmail === profile.email &&
          log.templateKey === "task_reminder" &&
          log.status === "sent" &&
          new Date(log.sentAt as string).getTime() >= today.getTime(),
      );
      if (sentToday) continue;
      recipients.push({
        eventId: first.eventId,
        toEmail: profile.email as string,
        speakerName: (profile.name as string) ?? "",
        taskList: taskReminderList(speakerTasks, templates, now),
      });
    }
    return recipients;
  },
});
