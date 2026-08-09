import { mutation, v } from "@pylonsync/functions";
import { validateReviewValues } from "../lib/reviews";
import { requireActiveReviewer } from "./_reviewAccess";

const RECOMMENDATIONS = new Set(["accept", "neutral", "reject"]);

export default mutation({
  args: {
    assignmentId: v.id("ReviewAssignment"),
    scoresJson: v.optional(v.json()),
    comment: v.optional(v.string()),
    recommendation: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const assignment = await ctx.db.unsafe.get("ReviewAssignment", args.assignmentId);
    if (!assignment || assignment.reviewerUserId !== ctx.auth.userId) {
      throw ctx.error("NOT_FOUND", "Review assignment not found.");
    }
    await requireActiveReviewer(ctx, assignment.orgId as string);
    if (assignment.status === "recused") throw ctx.error("FORBIDDEN", "Recused assignments cannot be reviewed.");
    const round = await ctx.db.unsafe.get("ReviewRound", assignment.roundId as string);
    if (!round || round.orgId !== assignment.orgId || round.eventId !== assignment.eventId) {
      throw ctx.error("NOT_FOUND", "Review round not found.");
    }
    const now = new Date().toISOString();
    if (
      round.status !== "open" ||
      (round.opensAt && now < round.opensAt) ||
      (round.closesAt && now > round.closesAt)
    ) throw ctx.error("FORBIDDEN", "This review round is not accepting reviews.");
    const { values, errors } = validateReviewValues(round.criteriaJson, args.scoresJson);
    if (errors.length > 0) throw ctx.error("INVALID_ARGS", errors.join(" "));
    if (args.recommendation && !RECOMMENDATIONS.has(args.recommendation)) {
      throw ctx.error("INVALID_ARGS", "Invalid review recommendation.");
    }
    const existing = await ctx.db.unsafe.query("Review", {
      roundId: assignment.roundId,
      submissionId: assignment.submissionId,
      reviewerUserId: ctx.auth.userId,
    });
    const payload = {
      scoresJson: values,
      comment: args.comment?.trim() || undefined,
      recommendation: args.recommendation,
      updatedAt: now,
    };
    let id: string;
    if (existing[0]) {
      id = existing[0].id as string;
      await ctx.db.unsafe.update("Review", id, payload);
    } else {
      id = await ctx.db.unsafe.insert("Review", {
        orgId: assignment.orgId,
        eventId: assignment.eventId,
        submissionId: assignment.submissionId,
        roundId: assignment.roundId,
        reviewerUserId: ctx.auth.userId,
        ...payload,
        createdAt: now,
      });
    }
    await ctx.db.unsafe.update("ReviewAssignment", args.assignmentId, {
      status: "complete",
      completedAt: now,
      recusedAt: undefined,
      recusalReason: undefined,
    });
    return { id, assignmentStatus: "complete" };
  },
});
