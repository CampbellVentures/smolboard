import { action, v } from "@pylonsync/functions";
import { renderBrandedEmail } from "../lib/email-branded";
import { applyMergeTags } from "../lib/contacts-email";

// Bulk email from the directory with merge tags, so an outreach note can greet
// each contact by name. Sends one message per recipient rather than a shared
// thread, and reports how many left.
export default action<
  { orgId: string; contactIds: string[]; subject: string; body: string },
  { sent: number; failed: number }
>({
  args: {
    orgId: v.id("Org"),
    contactIds: v.array(v.id("Contact")),
    subject: v.string(),
    body: v.string(),
  },
  async handler(ctx, args) {
    await ctx.requireMember(args.orgId, { role: ["owner", "admin"] });
    if (!args.subject.trim() || !args.body.trim()) {
      throw ctx.error("INVALID_ARGS", "Subject and message are required.");
    }
    const contacts = await ctx.runQuery<
      { id: string; name: string; email: string; company?: string; jobTitle?: string }[]
    >("getContactsForEmail", { orgId: args.orgId, contactIds: args.contactIds });

    let sent = 0;
    let failed = 0;
    for (const contact of contacts) {
      const vars = {
        name: contact.name,
        first_name: contact.name.split(/\s+/)[0] ?? contact.name,
        company: contact.company ?? "",
        job_title: contact.jobTitle ?? "",
        email: contact.email,
      };
      const { html, text } = renderBrandedEmail({
        siteName: "smolboard",
        heading: applyMergeTags(args.subject, vars),
        intro: applyMergeTags(args.body, vars),
        footerNote: "You're receiving this because an organizer added you to their speaker list.",
      });
      try {
        await ctx.email.send({
          to: contact.email,
          subject: applyMergeTags(args.subject, vars),
          text,
          html,
        });
        sent++;
      } catch {
        failed++;
      }
    }
    return { sent, failed };
  },
});
