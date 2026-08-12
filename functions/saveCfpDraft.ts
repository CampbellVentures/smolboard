import { mutation, v } from "@pylonsync/functions";
import { requireOpenCfp, requireCfpUser, validatedDraftContent } from "./_cfpLifecycle";

export default mutation({
  args: {
    formId: v.id("SubmissionForm"),
    draftId: v.optional(v.id("SubmissionDraft")),
    name: v.string(),
    title: v.string(),
    abstract: v.optional(v.string()),
    answers: v.optional(v.json()),
  },
  async handler(ctx, args) {
    await requireCfpUser(ctx);
    const { form, event } = await requireOpenCfp(ctx, args.formId);
    const draftContent = (previousAnswers?: unknown) => {
      const content = validatedDraftContent(ctx, form, args, false, previousAnswers);
      return {
        name: content.name,
        title: content.title,
        abstract: content.abstract,
        answersJson: content.answersJson,
      };
    };
    const now = new Date().toISOString();
    if (args.draftId) {
      const draft = await ctx.db.unsafe.get("SubmissionDraft", args.draftId);
      if (!draft || draft.ownerUserId !== ctx.auth.userId || draft.formId !== args.formId) {
        throw ctx.error("NOT_FOUND", "CFP draft not found.");
      }
      if (draft.lifecycle !== "draft") throw ctx.error("CONFLICT", "Finalized drafts are immutable.");
      await ctx.db.unsafe.update("SubmissionDraft", args.draftId, {
        ...draftContent(draft.answersJson),
        updatedAt: now,
      });
      return { id: args.draftId, created: false };
    }
    const existing = (await ctx.db.unsafe.query("SubmissionDraft", {
      ownerUserId: ctx.auth.userId,
      formId: args.formId,
    })).find((draft) => draft.lifecycle === "draft" && draft.orgId === event.orgId && draft.eventId === event.id);
    if (existing) {
      await ctx.db.unsafe.update("SubmissionDraft", existing.id as string, {
        ...draftContent(existing.answersJson),
        updatedAt: now,
      });
      return { id: existing.id as string, created: false };
    }
    const id = await ctx.db.unsafe.insert("SubmissionDraft", {
      orgId: event.orgId as string,
      eventId: event.id as string,
      formId: form.id as string,
      ownerUserId: ctx.auth.userId,
      ...draftContent(),
      lifecycle: "draft",
      updatedAt: now,
    });
    return { id, created: true };
  },
});
