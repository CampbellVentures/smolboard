import { mutation, v } from "@pylonsync/functions";
import { logActivity } from "../lib/activity";
import { matchesEventAnchor } from "../lib/tenantAnchors";

// Remove a deliverable and everything hanging off it: versions, comments, and
// the slot itself. The content desk had no way to remove anything, which also
// made an upload task permanently undeletable — deleteTaskTemplate refuses
// while any of its tasks carry deliverable history, so one stray upload pinned
// the task to the event forever.
//
// The uploaded bytes stay in file storage. Nothing here mints a URL for them
// and every read path goes through DeliverableVersion, so they are unreachable
// once the rows are gone.
export default mutation<{ slotId: string }, { deleted: true; versionsDeleted: number }>({
  args: { slotId: v.id("DeliverableSlot") },
  async handler(ctx, args) {
    const slot = await ctx.db.unsafe.get("DeliverableSlot", args.slotId);
    if (!slot) throw ctx.error("NOT_FOUND", "Deliverable not found.");
    await ctx.requireMember(slot.orgId as string, { role: ["owner", "admin"] });

    const anchored = <T extends Record<string, unknown>>(rows: T[]) =>
      rows.filter((row) => matchesEventAnchor(row, slot.eventId as string, slot.orgId as string));

    const comments = anchored(await ctx.db.unsafe.query("DeliverableComment", { slotId: args.slotId }));
    for (const comment of comments) await ctx.db.unsafe.delete("DeliverableComment", comment.id as string);
    const versions = anchored(await ctx.db.unsafe.query("DeliverableVersion", { slotId: args.slotId }));
    for (const version of versions) await ctx.db.unsafe.delete("DeliverableVersion", version.id as string);
    await ctx.db.unsafe.delete("DeliverableSlot", args.slotId);

    // The speaker still owes the file. Uploading is what marked the task done,
    // so removing the upload has to put the task back on their list.
    if (slot.taskId) {
      const task = await ctx.db.unsafe.get("SpeakerTask", slot.taskId as string);
      if (task && matchesEventAnchor(task, slot.eventId as string, slot.orgId as string)) {
        await ctx.db.unsafe.update("SpeakerTask", slot.taskId as string, {
          status: "pending",
          completedAt: null,
        });
      }
    }

    await logActivity(ctx, {
      orgId: slot.orgId as string,
      eventId: slot.eventId as string,
      kind: "content.reviewed",
      message: `Deliverable removed: ${slot.title}`,
      href: `/dashboard/events/${slot.eventId}/content`,
    });
    return { deleted: true, versionsDeleted: versions.length };
  },
});
