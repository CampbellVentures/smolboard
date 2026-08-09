import { mutation, v } from "@pylonsync/functions";
import {
  parseFields,
  parseRouting,
  mergeLegacyAnswers,
  pruneAnswers,
  routeSubmission,
  validateAnswers,
  type Answers,
} from "../lib/forms";
import { cfpWindowState } from "../lib/cfp-window";

export default mutation({
  args: {
    submissionId: v.id("Submission"),
    title: v.string(),
    abstract: v.optional(v.string()),
    answers: v.optional(v.json()),
  },
  async handler(ctx, args) {
    const submission = await ctx.db.unsafe.get("Submission", args.submissionId);
    if (!submission || submission.speakerUserId !== ctx.auth.userId) {
      throw ctx.error("NOT_FOUND", "Submission not found.");
    }
    const [form, event] = await Promise.all([
      ctx.db.unsafe.get("SubmissionForm", submission.formId as string),
      ctx.db.unsafe.get("Event", submission.eventId as string),
    ]);
    if (
      !form || !event || form.eventId !== event.id || form.orgId !== event.orgId ||
      cfpWindowState({
        eventStatus: String(event.cfpStatus),
        formStatus: String(form.status),
        opensAt: form.opensAt as string | undefined,
        closesAt: form.closesAt as string | undefined,
      }) !== "open"
    ) {
      throw ctx.error("FORBIDDEN", "This submission can no longer be edited.");
    }

    const title = args.title.trim();
    if (!title) throw ctx.error("INVALID_ARGS", "A talk title is required.");
    if (title.length > 200) {
      throw ctx.error("INVALID_ARGS", "Keep the title under 200 characters.");
    }
    const fields = parseFields(safeParse(form.fieldsJson));
    const answers = mergeLegacyAnswers(
      fields,
      submission.answersJson,
      pruneAnswers(fields, (args.answers ?? {}) as Answers),
    );
    const errors = validateAnswers(fields, answers);
    if (errors.length > 0) {
      throw ctx.error("INVALID_ARGS", errors.map((error) => error.message).join(" "));
    }

    await ctx.db.unsafe.update("Submission", args.submissionId, {
      title,
      abstract: args.abstract?.trim() || undefined,
      answersJson: answers,
      category: routeSubmission(parseRouting(safeParse(form.routingJson)), answers),
      updatedAt: new Date().toISOString(),
    });
    return { id: args.submissionId };
  },
});

function safeParse(raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
