import { mutation, v } from "@pylonsync/functions";

// Internal helper for sendTemplatedEmail (actions have no ctx.db): records a
// send attempt in the org's EmailLog.
export default mutation<
  {
    orgId: string;
    eventId: string;
    toEmail: string;
    templateKey: string;
    subject: string;
    status: string;
    error?: string;
  },
  { id: string }
>({
  internal: true,
  args: {
    orgId: v.id("Org"),
    eventId: v.id("Event"),
    toEmail: v.string(),
    templateKey: v.string(),
    subject: v.string(),
    status: v.string(),
    error: v.optional(v.string()),
  },
  async handler(ctx, args) {
    // ctx.db.unsafe: internal-only, called from the trusted email action.
    const id = await ctx.db.unsafe.insert("EmailLog", {
      orgId: args.orgId,
      eventId: args.eventId,
      toEmail: args.toEmail,
      templateKey: args.templateKey,
      subject: args.subject,
      status: args.status,
      error: args.error,
    });
    return { id };
  },
});
