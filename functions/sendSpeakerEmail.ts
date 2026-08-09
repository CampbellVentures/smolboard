import { action, v } from "@pylonsync/functions";
import { renderEmailHtml, renderTemplate } from "../lib/email";

export default action({
  internal: true,
  args: {
    eventId: v.id("Event"),
    toEmail: v.string(),
    subject: v.string(),
    body: v.string(),
    bodyHtml: v.optional(v.string()),
    vars: v.json(),
  },
  async handler(ctx, args) {
    const context = await ctx.runQuery<{ event: { id: string; orgId: string; name: string } | null }>(
      "getEmailContext",
      { eventId: args.eventId, templateKey: "general" },
    );
    if (!context.event) return { sent: false };
    const vars = args.vars as Record<string, string>;
    const subject = renderTemplate(args.subject, vars);
    const text = renderTemplate(args.body, vars);
    const html = renderEmailHtml(args.body, args.bodyHtml, vars);
    let status = "sent";
    let error: string | undefined;
    try {
      await ctx.email.send({ to: args.toEmail, subject, text, html });
    } catch (caught) {
      status = "failed";
      error = caught instanceof Error ? caught.message : String(caught);
    }
    await ctx.runMutation("logEmail", {
      orgId: context.event.orgId,
      eventId: args.eventId,
      toEmail: args.toEmail,
      templateKey: "general",
      subject,
      status,
      error,
    });
    return { sent: status === "sent" };
  },
});
