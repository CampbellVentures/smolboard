import { mutation, v } from "@pylonsync/functions";
import { requireOrganizerForEvent } from "./_reviewAccess";

export default mutation({
  args: { eventId: v.id("Event"), roundId: v.id("ReviewRound") },
  async handler(ctx, args) {
    const event = await requireOrganizerForEvent(ctx, args.eventId);
    const round = await ctx.db.unsafe.get("ReviewRound", args.roundId);
    if (!round || round.eventId !== args.eventId || round.orgId !== event.orgId) {
      throw ctx.error("NOT_FOUND", "Review round not found.");
    }
    const [assignments, reviews] = await Promise.all([
      ctx.db.unsafe.query("ReviewAssignment", { roundId: args.roundId }),
      ctx.db.unsafe.query("Review", { roundId: args.roundId }),
    ]);

    // An assignment or review whose submission no longer exists is not review
    // work — it's debris, left behind when the submission was deleted. Counting
    // it as a blocker made a round permanently undeletable for a reason the
    // organizer cannot see or act on, since these rows are invisible in the UI
    // and the entity policy denies deleting them directly.
    const submissionIds = new Set(
      (await ctx.db.unsafe.query("Submission", { eventId: args.eventId }))
        .filter((row) => row.orgId === event.orgId)
        .map((row) => row.id as string),
    );
    const live = (row: { submissionId?: unknown }) =>
      submissionIds.has(row.submissionId as string);
    const liveAssignments = assignments.filter(live);
    const liveReviews = reviews.filter(live);
    if (liveAssignments.length > 0 || liveReviews.length > 0) {
      throw ctx.error("CONFLICT", "Rounds with assignments or reviews cannot be deleted.");
    }

    // Nothing real is attached, so clear the debris with the round.
    for (const review of reviews) await ctx.db.unsafe.delete("Review", review.id as string);
    for (const assignment of assignments) {
      await ctx.db.unsafe.delete("ReviewAssignment", assignment.id as string);
    }
    const reviewers = await ctx.db.unsafe.query("ReviewRoundReviewer", { roundId: args.roundId });
    for (const reviewer of reviewers) {
      await ctx.db.unsafe.delete("ReviewRoundReviewer", reviewer.id as string);
    }
    await ctx.db.unsafe.delete("ReviewRound", args.roundId);
    return { id: args.roundId, deleted: true };
  },
});
