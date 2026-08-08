import { action } from "@pylonsync/functions";
import type { ReminderRecipient } from "./getReminderRecipients";

export default action<{}, { queued: number }>({
  internal: true,
  args: {},
  async handler(ctx) {
    const recipients = await ctx.runQuery<ReminderRecipient[]>("getReminderRecipients", {});
    if (recipients.length === 0) return { queued: 0 };

    await ctx.auth.elevate({
      admin: true,
      reason: "queue daily due and overdue speaker task reminders",
    });
    for (const recipient of recipients) {
      await ctx.scheduler.runAfter(0, "sendTemplatedEmail", {
        eventId: recipient.eventId,
        templateKey: "task_reminder",
        toEmail: recipient.toEmail,
        vars: {
          speaker_name: recipient.speakerName,
          task_list: recipient.taskList,
        },
      });
    }
    return { queued: recipients.length };
  },
});
