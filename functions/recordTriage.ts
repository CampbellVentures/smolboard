import { mutation, v } from "@pylonsync/functions";

// Internal: store a triage result. Separate from Review rows on purpose — an
// AI opinion must never be counted as a committee member's score.
export default mutation({
  internal: true,
  args: { submissionId: v.id("Submission"), score: v.float(), summary: v.string() },
  async handler(ctx, args) {
    await ctx.db.unsafe.update("Submission", args.submissionId, {
      triageScore: args.score,
      triageSummary: args.summary,
      triageAt: new Date().toISOString(),
    });
    return { ok: true };
  },
});
