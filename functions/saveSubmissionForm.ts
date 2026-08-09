import { mutation, v } from "@pylonsync/functions";

const STATUSES = ["draft", "open", "closed"];

export default mutation({
  args: {
    eventId: v.id("Event"),
    formId: v.optional(v.id("SubmissionForm")),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    fieldsJson: v.optional(v.json()),
    routingJson: v.optional(v.json()),
    confirmationMessage: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string);
    if (!STATUSES.includes(args.status)) throw ctx.error("INVALID_ARGS", "Invalid form status.");
    const name = args.name.trim();
    const slug = args.slug.trim();
    if (!name || !slug) throw ctx.error("INVALID_ARGS", "Form name and slug are required.");

    const payload = {
      name,
      slug,
      description: args.description?.trim() || undefined,
      status: args.status,
      fieldsJson: args.fieldsJson,
      routingJson: args.routingJson,
      confirmationMessage: args.confirmationMessage?.trim() || undefined,
    };
    if (args.formId) {
      const form = await ctx.db.unsafe.get("SubmissionForm", args.formId);
      if (
        !form ||
        form.eventId !== args.eventId ||
        form.orgId !== event.orgId
      ) {
        throw ctx.error("NOT_FOUND", "Submission form not found.");
      }
      await ctx.db.unsafe.update("SubmissionForm", args.formId, payload);
      return { id: args.formId };
    }
    const id = await ctx.db.unsafe.insert("SubmissionForm", {
      orgId: event.orgId as string,
      eventId: args.eventId,
      ...payload,
    });
    return { id };
  },
});
