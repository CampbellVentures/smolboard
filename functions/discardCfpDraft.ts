import { mutation, v } from "@pylonsync/functions";

// A speaker abandoning a proposal they started. There was no way to do this:
// SubmissionDraft denies client deletes and no function offered one, so a draft
// begun by accident sat in the portal for good, and any co-presenter invited to
// it stayed pending forever.
//
// Only the owner, and only before finalization. A finalized draft is the
// paper trail behind a real submission; withdrawing that is setSubmissionStatus.
export default mutation<{ draftId: string }, { discarded: true; invitesRemoved: number }>({
  args: { draftId: v.id("SubmissionDraft") },
  async handler(ctx, args) {
    const draft = await ctx.db.unsafe.get("SubmissionDraft", args.draftId);
    if (!draft || draft.ownerUserId !== ctx.auth.userId) {
      throw ctx.error("NOT_FOUND", "Draft not found.");
    }
    if (draft.lifecycle !== "draft") {
      throw ctx.error("CONFLICT", "This proposal has already been submitted.");
    }
    const invites = (await ctx.db.unsafe.query("SubmissionParticipantInvite", { draftId: args.draftId }))
      .filter((invite) => invite.ownerUserId === draft.ownerUserId);
    for (const invite of invites) {
      await ctx.db.unsafe.delete("SubmissionParticipantInvite", invite.id as string);
    }
    await ctx.db.unsafe.delete("SubmissionDraft", args.draftId);
    return { discarded: true, invitesRemoved: invites.length };
  },
});
