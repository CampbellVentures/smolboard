import { mutation, v } from "@pylonsync/functions";
import { activeReviewerUserIds, requireOrganizerForEvent } from "./_reviewAccess";

export default mutation({
  args: {
    eventId: v.id("Event"),
    roundId: v.id("ReviewRound"),
    reviewerUserIds: v.optional(v.array(v.id("User"))),
    category: v.optional(v.string()),
    assignmentsPerSubmission: v.optional(v.int()),
  },
  async handler(ctx, args) {
    const event = await requireOrganizerForEvent(ctx, args.eventId);
    const round = await ctx.db.unsafe.get("ReviewRound", args.roundId);
    if (!round || round.eventId !== args.eventId || round.orgId !== event.orgId) {
      throw ctx.error("NOT_FOUND", "Review round not found.");
    }
    const requested = args.reviewerUserIds?.length
      ? [...new Set(args.reviewerUserIds)].sort()
      : await activeReviewerUserIds(ctx, event.orgId as string);
    if (requested.length === 0) throw ctx.error("INVALID_ARGS", "Select at least one active reviewer.");
    const active = await ctx.db.unsafe.query("ReviewerMembership", {
      orgId: event.orgId,
      status: "active",
    });
    const activeIds = new Set(active.map((row) => row.userId as string));
    if (requested.some((userId) => !activeIds.has(userId))) {
      throw ctx.error("INVALID_ARGS", "Every selected reviewer needs an active reviewer designation.");
    }
    const orgMembers = await ctx.db.unsafe.query("OrgMember", { orgId: event.orgId });
    const memberIds = new Set(orgMembers.map((row) => row.userId as string));
    if (requested.some((userId) => !memberIds.has(userId))) {
      throw ctx.error("INVALID_ARGS", "Every selected reviewer must still be an organization member.");
    }

    for (const reviewerUserId of requested) {
      const pool = await ctx.db.unsafe.query("ReviewRoundReviewer", {
        roundId: args.roundId,
        reviewerUserId,
      });
      if (pool[0]) {
        await ctx.db.unsafe.update("ReviewRoundReviewer", pool[0].id as string, { status: "active" });
      } else {
        await ctx.db.unsafe.insert("ReviewRoundReviewer", {
          orgId: event.orgId,
          eventId: args.eventId,
          roundId: args.roundId,
          reviewerUserId,
          status: "active",
        });
      }
    }

    const allSubmissions = await ctx.db.unsafe.query("Submission", { eventId: args.eventId });
    const submissions = allSubmissions
      .filter((submission) =>
        submission.orgId === event.orgId &&
        Number(submission.currentRound ?? 1) >= Number(round.roundNumber) &&
        (!args.category || submission.category === args.category),
      )
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const existing = (await ctx.db.unsafe.query("ReviewAssignment", { roundId: args.roundId }))
      .filter((assignment) =>
        assignment.orgId === event.orgId &&
        assignment.eventId === args.eventId &&
        assignment.roundId === args.roundId
      );
    const loads = new Map(requested.map((userId) => [userId, 0]));
    for (const assignment of existing) {
      if (loads.has(assignment.reviewerUserId as string) && assignment.status !== "recused") {
        loads.set(assignment.reviewerUserId as string, (loads.get(assignment.reviewerUserId as string) ?? 0) + 1);
      }
    }
    const perSubmission = Math.max(1, Math.min(args.assignmentsPerSubmission ?? 1, requested.length));
    let created = 0;
    for (const submission of submissions) {
      const already = new Set(
        existing
          .filter((assignment) => assignment.submissionId === submission.id)
          .map((assignment) => assignment.reviewerUserId as string),
      );
      const candidates = requested
        .filter((userId) => !already.has(userId))
        .sort((a, b) => (loads.get(a) ?? 0) - (loads.get(b) ?? 0) || a.localeCompare(b));
      const needed = Math.max(0, perSubmission - already.size);
      for (const reviewerUserId of candidates.slice(0, needed)) {
        await ctx.db.unsafe.insert("ReviewAssignment", {
          orgId: event.orgId,
          eventId: args.eventId,
          roundId: args.roundId,
          submissionId: submission.id,
          reviewerUserId,
          status: "assigned",
        });
        loads.set(reviewerUserId, (loads.get(reviewerUserId) ?? 0) + 1);
        created++;
      }
    }
    return { created, submissions: submissions.length, reviewers: requested.length };
  },
});
