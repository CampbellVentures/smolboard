import { mutation, v } from "@pylonsync/functions";
import { logActivity } from "../lib/activity";
import { isReviewVerdict } from "../lib/content";

// Organizer verdict on a deliverable's current version: approve it or request
// changes with a note the speaker sees in the portal. Role-gated to match the
// deliverable read policies (owner/admin). Slot writes are policy-denied, so
// this is the only path that can set review state.
export default mutation<
  { slotId: string; status: string; note?: string },
  { id: string; status: string }
>({
  args: {
    slotId: v.id("DeliverableSlot"),
    status: v.string(),
    note: v.optional(v.string()),
  },
  async handler(ctx, args) {
    if (!isReviewVerdict(args.status)) {
      throw ctx.error("INVALID_ARGS", 'Status must be "approved" or "changes_requested".');
    }
    const note = args.note?.trim();
    if (args.status === "changes_requested" && !note) {
      throw ctx.error("INVALID_ARGS", "Tell the speaker what to change.");
    }
    if (note && note.length > 2000) {
      throw ctx.error("INVALID_ARGS", "Keep the note under 2000 characters.");
    }
    const slot = await ctx.db.unsafe.get("DeliverableSlot", args.slotId);
    if (!slot) throw ctx.error("NOT_FOUND", "Deliverable not found.");
    await ctx.requireMember(slot.orgId as string, { role: ["owner", "admin"] });
    const versions = await ctx.db.unsafe.query("DeliverableVersion", { slotId: args.slotId });
    if (!versions.some((version) => version.orgId === slot.orgId)) {
      throw ctx.error("INVALID_ARGS", "Nothing has been uploaded to review yet.");
    }

    await ctx.db.unsafe.update("DeliverableSlot", args.slotId, {
      status: args.status,
      // null (not undefined) so approving actually clears a stale note.
      reviewNote: args.status === "approved" ? null : note,
      reviewedAt: new Date().toISOString(),
    });
    await logActivity(ctx, {
      orgId: slot.orgId as string,
      eventId: slot.eventId as string,
      kind: "content.reviewed",
      message: `Speaker file ${args.status === "approved" ? "approved" : "sent back for changes"}`,
      href: `/dashboard/events/${slot.eventId}/content`,
    });
    return { id: args.slotId, status: args.status };
  },
});
