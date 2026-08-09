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
    if (assignments.length > 0 || reviews.length > 0) {
      throw ctx.error("CONFLICT", "Rounds with assignments or reviews cannot be deleted.");
    }
    const reviewers = await ctx.db.unsafe.query("ReviewRoundReviewer", { roundId: args.roundId });
    for (const reviewer of reviewers) {
      await ctx.db.unsafe.delete("ReviewRoundReviewer", reviewer.id as string);
    }
    await ctx.db.unsafe.delete("ReviewRound", args.roundId);
    return { id: args.roundId, deleted: true };
  },
});
