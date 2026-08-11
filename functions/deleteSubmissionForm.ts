import { mutation, v } from "@pylonsync/functions";

// Deleting a form is only safe when nothing depends on it: a form with
// submissions is the provenance for those rows (and their drafts), so we
// refuse rather than orphan them — close it instead.
export default mutation<{ formId: string }, { deleted: boolean }>({
  args: { formId: v.id("SubmissionForm") },
  async handler(ctx, args) {
    const form = await ctx.db.unsafe.get("SubmissionForm", args.formId);
    if (!form) throw ctx.error("NOT_FOUND", "Submission form not found.");
    await ctx.requireMember(form.orgId as string, { role: ["owner", "admin"] });

    const submissions = (await ctx.db.unsafe.query("Submission", { formId: args.formId })).filter(
      (row) => row.orgId === form.orgId,
    );
    if (submissions.length > 0) {
      throw ctx.error(
        "CONFLICT",
        `This form has ${submissions.length} submission${submissions.length === 1 ? "" : "s"}. Close it instead of deleting so the proposals keep their history.`,
      );
    }
    // Unfinalized drafts point at the form and would dangle — drop them.
    const drafts = (await ctx.db.unsafe.query("SubmissionDraft", { formId: args.formId })).filter(
      (row) => row.orgId === form.orgId && row.lifecycle !== "finalized",
    );
    for (const draft of drafts) {
      await ctx.db.unsafe.delete("SubmissionDraft", draft.id as string);
    }
    await ctx.db.unsafe.delete("SubmissionForm", args.formId);
    return { deleted: true };
  },
});
