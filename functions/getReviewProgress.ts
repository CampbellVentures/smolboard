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
    // The round's roster, so an organizer can curate WHO reviews this round
    // rather than inheriting the whole org every time. Every active org
    // reviewer is listed; inRound says whether they are on this one.
    const memberships = (await ctx.db.unsafe.query("ReviewerMembership", { orgId: event.orgId }))
      .filter((row) => row.status === "active");
    const poolRows = (await ctx.db.unsafe.query("ReviewRoundReviewer", { roundId: args.roundId }))
      .filter(
        (row) =>
          row.orgId === event.orgId && row.eventId === args.eventId && row.status === "active",
      );
    const inRound = new Set(poolRows.map((row) => row.reviewerUserId as string));
    const pool = [];
    for (const membership of memberships) {
      const userId = membership.userId as string;
      const user = await ctx.db.unsafe.get("User", userId);
      pool.push({
        userId,
        name: user?.displayName,
        email: user?.email,
        inRound: inRound.has(userId),
      });
    }
    pool.sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));

    return { roundId: args.roundId, ...assignmentProgress(assignments as never), reviewers, pool };
  },
});
