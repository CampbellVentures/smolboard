import { mutation, v } from "@pylonsync/functions";
import {
  finalizeDraft,
  requireOpenCfp,
  requireVerifiedCfpUser,
  validatedDraftContent,
} from "./_cfpLifecycle";
import { normalizeSpeakerEmail } from "../lib/speakers";

// Compatibility RPC for signed-in clients. New UI saves a durable draft first;
// this path creates that same owner-scoped draft and finalizes it atomically.
export default mutation({
  args: {
    formId: v.id("SubmissionForm"),
    name: v.string(),
    email: v.string(),
    title: v.string(),
    abstract: v.optional(v.string()),
    answers: v.optional(v.json()),
  },
  async handler(ctx, args) {
    const user = await requireVerifiedCfpUser(ctx);
    if (normalizeSpeakerEmail(user.email as string) !== normalizeSpeakerEmail(args.email)) {
      throw ctx.error("FORBIDDEN", "Use the verified email for your signed-in account.");
    }
    const { form, event } = await requireOpenCfp(ctx, args.formId);
    const content = validatedDraftContent(ctx, form, args, false);
    const draftContent = {
      name: content.name,
      title: content.title,
      abstract: content.abstract,
      answersJson: content.answersJson,
    };
    const id = await ctx.db.unsafe.insert("SubmissionDraft", {
      orgId: event.orgId as string,
      eventId: event.id as string,
      formId: form.id as string,
      ownerUserId: ctx.auth.userId,
      ...draftContent,
      lifecycle: "draft",
      updatedAt: new Date().toISOString(),
    });
    const draft = await ctx.db.unsafe.get("SubmissionDraft", id);
    return finalizeDraft(ctx, draft!);
  },
});
