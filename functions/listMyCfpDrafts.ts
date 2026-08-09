import { query, v } from "@pylonsync/functions";

export default query({
  args: { formId: v.optional(v.id("SubmissionForm")) },
  async handler(ctx, args) {
    const rows = await ctx.db.unsafe.query("SubmissionDraft", { ownerUserId: ctx.auth.userId });
    return rows
      .filter((draft) => !args.formId || draft.formId === args.formId)
      .map((draft) => ({
        id: draft.id,
        eventId: draft.eventId,
        formId: draft.formId,
        name: draft.name,
        title: draft.title,
        abstract: draft.abstract,
        answersJson: draft.answersJson,
        lifecycle: draft.lifecycle,
        finalizedSubmissionId: draft.finalizedSubmissionId,
        updatedAt: draft.updatedAt,
      }));
  },
});
