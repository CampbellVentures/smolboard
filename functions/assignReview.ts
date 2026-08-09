import { mutation, v } from "@pylonsync/functions";
import { requireOrganizerForEvent } from "./_reviewAccess";

export default mutation({
  args: {
    eventId: v.id("Event"),
    roundId: v.id("ReviewRound"),
    submissionId: v.id("Submission"),
    reviewerUserId: v.id("User"),
  },
  async handler(ctx, args) {
    const event = await requireOrganizerForEvent(ctx, args.eventId);
    const [round, submission] = await Promise.all([
      ctx.db.unsafe.get("ReviewRound", args.roundId),
      ctx.db.unsafe.get("Submission", args.submissionId),
    ]);
    if (
      !round || !submission || round.eventId !== args.eventId || submission.eventId !== args.eventId ||
      round.orgId !== event.orgId || submission.orgId !== event.orgId
    ) throw ctx.error("NOT_FOUND", "Assignment anchors do not belong to this event.");
    const pool = await ctx.db.unsafe.query("ReviewRoundReviewer", {
      roundId: args.roundId,
      reviewerUserId: args.reviewerUserId,
      status: "active",
    });
    if (pool.length === 0) throw ctx.error("INVALID_ARGS", "Reviewer is not active in this round pool.");
    const existing = await ctx.db.unsafe.query("ReviewAssignment", {
      roundId: args.roundId,
      submissionId: args.submissionId,
      reviewerUserId: args.reviewerUserId,
    });
    if (existing[0]) return { id: existing[0].id as string, created: false };
    const id = await ctx.db.unsafe.insert("ReviewAssignment", {
      orgId: event.orgId,
      eventId: args.eventId,
      roundId: args.roundId,
      submissionId: args.submissionId,
      reviewerUserId: args.reviewerUserId,
      status: "assigned",
    });
    return { id, created: true };
  },
});
