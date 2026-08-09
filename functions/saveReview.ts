import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: {
    eventId: v.id("Event"),
    reviewId: v.optional(v.id("Review")),
    submissionId: v.id("Submission"),
    roundId: v.id("ReviewRound"),
    scoresJson: v.optional(v.json()),
    comment: v.optional(v.string()),
    recommendation: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const [event, submission, round] = await Promise.all([
      ctx.db.unsafe.get("Event", args.eventId),
      ctx.db.unsafe.get("Submission", args.submissionId),
      ctx.db.unsafe.get("ReviewRound", args.roundId),
    ]);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string);
    if (
      !submission ||
      !round ||
      submission.eventId !== args.eventId ||
      round.eventId !== args.eventId ||
      submission.orgId !== event.orgId ||
      round.orgId !== event.orgId
    ) {
      throw ctx.error("NOT_FOUND", "Review anchors do not belong to this event.");
    }
    const payload = {
      scoresJson: args.scoresJson,
      comment: args.comment?.trim() || undefined,
      recommendation: args.recommendation?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    if (args.reviewId) {
      const review = await ctx.db.unsafe.get("Review", args.reviewId);
      if (
        !review ||
        review.reviewerUserId !== ctx.auth.userId ||
        review.eventId !== args.eventId ||
        review.submissionId !== args.submissionId ||
        review.roundId !== args.roundId ||
        review.orgId !== event.orgId
      ) {
        throw ctx.error("NOT_FOUND", "Review not found.");
      }
      await ctx.db.unsafe.update("Review", args.reviewId, payload);
      return { id: args.reviewId };
    }
    const id = await ctx.db.unsafe.insert("Review", {
      orgId: event.orgId as string,
      eventId: args.eventId,
      submissionId: args.submissionId,
      roundId: args.roundId,
      reviewerUserId: ctx.auth.userId,
      ...payload,
      createdAt: new Date().toISOString(),
    });
    return { id };
  },
});
