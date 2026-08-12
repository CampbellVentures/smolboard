import { mutation, v } from "@pylonsync/functions";
import { logActivity } from "../lib/activity";

// An organizer's override of the AI first pass. The score and rationale were
// display-only with no way to disagree, so a wrong read sat on the submission
// and anchored every reviewer who opened it afterwards.
//
// Clearing triageAt also puts the submission back in getTriageTargets, so a
// later "AI triage" run can take another pass at it.
export default mutation<{ submissionId: string }, { dismissed: true }>({
  args: { submissionId: v.id("Submission") },
  async handler(ctx, args) {
    const submission = await ctx.db.unsafe.get("Submission", args.submissionId);
    if (!submission) throw ctx.error("NOT_FOUND", "Submission not found.");
    await ctx.requireMember(submission.orgId as string, { role: ["owner", "admin"] });
    if (!submission.triageAt) {
      throw ctx.error("CONFLICT", "This submission has no AI first pass to dismiss.");
    }
    // null, not undefined: an update ignores undefined, which would leave the
    // score on screen and report success.
    await ctx.db.unsafe.update("Submission", args.submissionId, {
      triageScore: null,
      triageSummary: null,
      triageAt: null,
    });
    await logActivity(ctx, {
      orgId: submission.orgId as string,
      eventId: submission.eventId as string,
      kind: "submission.triage",
      message: `AI first pass dismissed on "${submission.title}"`,
      href: `/dashboard/events/${submission.eventId}/abstracts`,
    });
    return { dismissed: true };
  },
});
