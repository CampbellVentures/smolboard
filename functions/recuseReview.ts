import { mutation, v } from "@pylonsync/functions";
import { requireActiveReviewer } from "./_reviewAccess";

export default mutation({
  args: { assignmentId: v.id("ReviewAssignment"), reason: v.string() },
  async handler(ctx, args) {
    const assignment = await ctx.db.unsafe.get("ReviewAssignment", args.assignmentId);
    if (!assignment || assignment.reviewerUserId !== ctx.auth.userId) {
      throw ctx.error("NOT_FOUND", "Review assignment not found.");
    }
    await requireActiveReviewer(ctx, assignment.orgId as string);
    if (assignment.status === "complete") throw ctx.error("CONFLICT", "Completed reviews cannot be recused.");
    const reason = args.reason.trim();
    if (!reason) throw ctx.error("INVALID_ARGS", "A recusal reason is required.");
    await ctx.db.unsafe.update("ReviewAssignment", args.assignmentId, {
      status: "recused",
      recusalReason: reason,
      recusedAt: new Date().toISOString(),
      completedAt: undefined,
    });
    return { id: args.assignmentId, assignmentStatus: "recused" };
  },
});
