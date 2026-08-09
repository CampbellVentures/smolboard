import { query, v } from "@pylonsync/functions";
import { csvCell, weightedReviewScore } from "../lib/reviews";
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
    const rows = [[
      "submission_id",
      "submission_title",
      "category",
      "reviewer_email",
      "assignment_status",
      "weighted_score",
      "recommendation",
      "comment",
    ]];
    for (const assignment of assignments) {
      const [submission, reviewer] = await Promise.all([
        ctx.db.unsafe.get("Submission", assignment.submissionId as string),
        ctx.db.unsafe.get("User", assignment.reviewerUserId as string),
      ]);
      if (!submission || submission.eventId !== args.eventId) continue;
      const reviews = (await ctx.db.unsafe.query("Review", {
        roundId: args.roundId,
        submissionId: assignment.submissionId,
        reviewerUserId: assignment.reviewerUserId,
      })).filter((review) =>
        review.orgId === event.orgId &&
        review.eventId === args.eventId &&
        review.roundId === args.roundId &&
        review.submissionId === assignment.submissionId &&
        review.reviewerUserId === assignment.reviewerUserId
      );
      const review = reviews[0];
      const score = review ? weightedReviewScore(round.criteriaJson, review.scoresJson) : undefined;
      rows.push([
        String(submission.id),
        String(submission.title ?? ""),
        String(submission.category ?? ""),
        String(reviewer?.email ?? ""),
        String(assignment.status),
        score === undefined ? "" : score.toFixed(4),
        String(review?.recommendation ?? ""),
        String(review?.comment ?? ""),
      ]);
    }
    return {
      filename: `${String(event.slug || "event")}-${String(round.name || "reviews").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`,
      csv: rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n",
    };
  },
});
