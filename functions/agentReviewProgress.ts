import { query, v } from "@pylonsync/functions";

// Agent tool: review-round health — per-round assignment completion plus
// score coverage per submission, so the copilot can answer "where are we on
// reviews?" and "which talks still need scores?".
export default query({
  args: { eventId: v.id("Event") },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    const [rounds, assignments, reviews, submissions] = [
      await ctx.db.unsafe.query("ReviewRound", { eventId: args.eventId }),
      await ctx.db.unsafe.query("ReviewAssignment", { eventId: args.eventId }),
      await ctx.db.unsafe.query("Review", { eventId: args.eventId }),
      await ctx.db.unsafe.query("Submission", { eventId: args.eventId }),
    ];

    const roundSummaries = rounds.map((round) => {
      const roundAssignments = assignments.filter((a) => a.roundId === round.id);
      return {
        roundId: round.id,
        name: round.name,
        status: round.status,
        assigned: roundAssignments.length,
        complete: roundAssignments.filter((a) => a.status === "complete").length,
        recused: roundAssignments.filter((a) => a.status === "recused").length,
      };
    });
    const unscored = submissions
      .filter(
        (submission) =>
          !["rejected", "withdrawn"].includes(submission.status as string) &&
          !reviews.some((review) => review.submissionId === submission.id),
      )
      .map((submission) => ({
        submissionId: submission.id,
        title: submission.title,
        status: submission.status,
      }));
    return { rounds: roundSummaries, unscoredSubmissions: unscored };
  },
});
