import { mutation, v } from "@pylonsync/functions";
import { finalizeDraft } from "./_cfpLifecycle";

export default mutation({
  args: { draftId: v.id("SubmissionDraft") },
  async handler(ctx, args) {
    const draft = await ctx.db.unsafe.get("SubmissionDraft", args.draftId);
    if (!draft) throw ctx.error("NOT_FOUND", "CFP draft not found.");
    return finalizeDraft(ctx, draft);
  },
});
