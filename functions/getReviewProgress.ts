import { query, v } from "@pylonsync/functions";
import { assignmentProgress } from "../lib/reviews";
import { requireOrganizerForEvent } from "./_reviewAccess";

export default query({
  args: { eventId: v.id("Event"), roundId: v.id("ReviewRound") },
  async handler(ctx, args) {
    const event = await requireOrganizerForEvent(ctx, args.eventId);
    const round = await ctx.db.unsafe.get("ReviewRound", args.roundId);
    if (!round || round.eventId !== args.eventId || round.orgId !== event.orgId) {
      throw ctx.error("NOT_FOUND", "Review round not found.");
    }
    const assignments = (await ctx.db.unsafe.query("ReviewAssignment", { roundId: args.roundId }))
      .filter((assignment) =>
        assignment.orgId === event.orgId &&
        assignment.eventId === args.eventId &&
        assignment.roundId === args.roundId
      );
    const reviewerIds = [...new Set(assignments.map((assignment) => assignment.reviewerUserId as string))].sort();
    const reviewers = [];
    for (const userId of reviewerIds) {
      const user = await ctx.db.unsafe.get("User", userId);
      const mine = assignments.filter((assignment) => assignment.reviewerUserId === userId);
      reviewers.push({
        userId,
        name: user?.displayName,
        email: user?.email,
        ...assignmentProgress(mine as never),
        recused: mine.filter((assignment) => assignment.status === "recused").length,
      });
    }
    return { roundId: args.roundId, ...assignmentProgress(assignments as never), reviewers };
  },
});
