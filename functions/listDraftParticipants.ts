import { query, v } from "@pylonsync/functions";

export default query({
  args: { draftId: v.id("SubmissionDraft") },
  async handler(ctx, args) {
    const draft = await ctx.db.unsafe.get("SubmissionDraft", args.draftId);
    if (!draft || draft.ownerUserId !== ctx.auth.userId) return [];
    return (await ctx.db.unsafe.query("SubmissionParticipantInvite", { draftId: args.draftId }))
      .filter((invite) => invite.ownerUserId === ctx.auth.userId)
      .map((invite) => ({
        id: invite.id,
        name: invite.name,
        email: invite.email,
        roleLabel: invite.roleLabel,
        status: invite.status,
        expiresAt: invite.expiresAt,
      }));
  },
});
