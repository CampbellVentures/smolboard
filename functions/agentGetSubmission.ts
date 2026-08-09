import { query, v } from "@pylonsync/functions";

// Agent tool: everything about one submission.
export default query({
  args: { submissionId: v.id("Submission") },
  async handler(ctx, args) {
    const sub = await ctx.db.unsafe.get("Submission", args.submissionId);
    if (!sub) throw ctx.error("NOT_FOUND", "Submission not found.");
    await ctx.requireMember(sub.orgId as string, { role: ["owner", "admin"] });

    // ctx.db.unsafe: membership verified above.
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", {
      eventId: sub.eventId as string,
      userId: sub.speakerUserId as string,
    });
    const reviews = await ctx.db.unsafe.query("Review", { submissionId: args.submissionId });
    const rounds = await ctx.db.unsafe.query("ReviewRound", { eventId: sub.eventId as string });
    const p = profiles[0];
    return {
      submissionId: sub.id,
      title: sub.title,
      abstract: sub.abstract ?? null,
      answers: sub.answersJson ?? {},
      category: sub.category ?? null,
      status: sub.status,
      round: sub.currentRound,
      speaker: p
        ? { name: p.name, email: p.email, company: p.company ?? null, bio: p.bio ?? null }
        : null,
      reviews: reviews.map((r) => ({
        round: rounds.find((x) => x.id === r.roundId)?.roundNumber ?? null,
        scores: r.scoresJson ?? {},
        recommendation: r.recommendation ?? null,
        comment: r.comment ?? null,
      })),
    };
  },
});
