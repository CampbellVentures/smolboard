import { mutation, v } from "@pylonsync/functions";

// Internal: store a triage result. Separate from Review rows on purpose — an
// AI opinion must never be counted as a committee member's score.
export default mutation({
  internal: true,
  args: { submissionId: v.id("Submission"), score: v.float(), summary: v.string() },
  async handler(ctx, args) {
    // Gated independently of getTriageTargets. Both run under the caller's
    // identity, so each has to prove membership on the row it touches rather
    // than trusting that an earlier step in the chain did.
    const submission = await ctx.db.unsafe.get("Submission", args.submissionId);
    if (!submission) throw ctx.error("NOT_FOUND", "Submission not found.");
    await ctx.requireMember(submission.orgId as string, { role: ["owner", "admin"] });

    await ctx.db.unsafe.update("Submission", args.submissionId, {
      triageScore: args.score,
      triageSummary: args.summary,
      triageAt: new Date().toISOString(),
    });
    return { ok: true };
  },
});
