import { query, v } from "@pylonsync/functions";
import { normalizeCriteria } from "../lib/reviews";
import { parseParticipantSnapshot } from "../lib/submission-participants";
import { requireActiveReviewer } from "./_reviewAccess";

export default query({
  args: { orgId: v.id("Org"), eventId: v.optional(v.id("Event")) },
  async handler(ctx, args) {
    await requireActiveReviewer(ctx, args.orgId);
    const assignments = await ctx.db.unsafe.query("ReviewAssignment", {
      orgId: args.orgId,
      reviewerUserId: ctx.auth.userId,
    });
    const items = [];
    for (const assignment of assignments) {
      if (assignment.orgId !== args.orgId || assignment.reviewerUserId !== ctx.auth.userId) continue;
      if (args.eventId && assignment.eventId !== args.eventId) continue;
      const [round, submission, event] = await Promise.all([
        ctx.db.unsafe.get("ReviewRound", assignment.roundId as string),
        ctx.db.unsafe.get("Submission", assignment.submissionId as string),
        ctx.db.unsafe.get("Event", assignment.eventId as string),
      ]);
      if (
        !round || !submission || !event ||
        round.orgId !== args.orgId || submission.orgId !== args.orgId || event.orgId !== args.orgId ||
        round.eventId !== event.id || submission.eventId !== event.id ||
        assignment.roundId !== round.id || assignment.submissionId !== submission.id ||
        assignment.eventId !== event.id
      ) continue;
      const ownReviews = (await ctx.db.unsafe.query("Review", {
        roundId: round.id,
        submissionId: submission.id,
        reviewerUserId: ctx.auth.userId,
      })).filter((review) =>
        review.orgId === args.orgId &&
        review.eventId === event.id &&
        review.roundId === round.id &&
        review.submissionId === submission.id &&
        review.reviewerUserId === ctx.auth.userId
      );
      const item: Record<string, unknown> = {
        assignmentId: assignment.id,
        assignmentStatus: assignment.status,
        recusalReason: assignment.recusalReason,
        event: { id: event.id, name: event.name },
        round: {
          id: round.id,
          name: round.name,
          status: round.status,
          opensAt: round.opensAt,
          closesAt: round.closesAt,
          anonymized: round.anonymized !== false,
          criteria: normalizeCriteria(round.criteriaJson),
        },
        submission: {
          id: submission.id,
          title: submission.title,
          abstract: submission.abstract,
          category: submission.category,
          ...(round.anonymized === false ? { answers: submission.answersJson } : {}),
          participants: parseParticipantSnapshot(submission.participantSnapshotJson).map((participant) =>
            round.anonymized === false
              ? participant
              : { roleLabel: participant.roleLabel }
          ),
        },
        review: ownReviews[0]
          ? {
              id: ownReviews[0].id,
              scoresJson: ownReviews[0].scoresJson,
              comment: ownReviews[0].comment,
              recommendation: ownReviews[0].recommendation,
            }
          : undefined,
      };
      if (round.anonymized === false) {
        const profiles = (await ctx.db.unsafe.query("SpeakerProfile", {
          eventId: event.id,
          userId: submission.speakerUserId,
        })).filter((profile) =>
          profile.orgId === args.orgId &&
          profile.eventId === event.id &&
          profile.userId === submission.speakerUserId
        );
        const profile = profiles[0];
        if (profile) {
          item.author = {
            name: profile.name,
            email: profile.email,
            company: profile.company,
            jobTitle: profile.jobTitle,
          };
        }
      }
      if (round.revealPeerReviews === true) {
        const peerReviews = (await ctx.db.unsafe.query("Review", {
          roundId: round.id,
          submissionId: submission.id,
        })).filter((review) =>
          review.orgId === args.orgId &&
          review.eventId === event.id &&
          review.roundId === round.id &&
          review.submissionId === submission.id
        );
        item.peerReviews = peerReviews
          .filter((review) => review.reviewerUserId !== ctx.auth.userId)
          .map((review) => ({ scoresJson: review.scoresJson, recommendation: review.recommendation }));
      }
      items.push(item);
    }
    items.sort((a, b) => {
      const eventA = ((a.event as Record<string, unknown>).name as string) ?? "";
      const eventB = ((b.event as Record<string, unknown>).name as string) ?? "";
      return eventA.localeCompare(eventB) ||
        String((a.submission as Record<string, unknown>).title).localeCompare(String((b.submission as Record<string, unknown>).title));
    });
    return { items };
  },
});
