import { action, v } from "@pylonsync/functions";
import { DEFAULT_TEMPLATES, renderTemplate, type MergeVars } from "../lib/email";

// Central speaker-email sender. Resolves the event's EmailTemplate row (falling
// back to the built-in default for the key), renders merge tags, sends via the
// built-in email subsystem (PYLON_EMAIL_PROVIDER — stack0 for us), and logs to
// EmailLog either way. Called by submitCfp (scheduled), status changes, task
// reminders, and later the copilot's nudge tool.
//
// internal: only server-side code (scheduler, other functions) may call it —
// a browser must never be able to send templated email directly.
//
// This SDK's ctx.email.send is plain-text (to, subject, body) — no HTML or
// attachments yet, so bodies are written to read well as text.
export default action<
  {
    eventId: string;
    templateKey: string;
    toEmail: string;
    vars?: Record<string, string>;
  },
  { sent: boolean }
>({
  internal: true,
  args: {
    eventId: v.id("Event"),
    templateKey: v.string(),
    toEmail: v.string(),
    vars: v.optional(v.any()),
  },
  async handler(ctx, args) {
    const { event, template: custom } = await ctx.runQuery<{
      event: { id: string; orgId: string; name: string } | null;
      template: { subject: string; body: string; enabled: boolean } | null;
    }>("getEmailContext", {
      eventId: args.eventId,
      templateKey: args.templateKey,
    });
    if (!event) return { sent: false };
    if (custom && !custom.enabled) return { sent: false };

    const fallback = DEFAULT_TEMPLATES.find((t) => t.key === args.templateKey);
    const template = custom ?? fallback;
    if (!template) return { sent: false };

    const base = ctx.env.PYLON_PUBLIC_URL || "";
    const vars: MergeVars = {
      event_name: event.name,
      portal_link: `${base}/portal`,
      ...(args.vars ?? {}),
    };
    const subject = renderTemplate(template.subject, vars);
    // Bodies are markdown-ish; strip the ** markers so plain-text email reads
    // cleanly until the runtime grows HTML support.
    const body = renderTemplate(template.body, vars).replace(/\*\*([^*]+)\*\*/g, "$1");

    let status = "sent";
    let error: string | undefined;
    try {
      await ctx.email.send(args.toEmail, subject, body);
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message : String(e);
    }

    await ctx.runMutation("logEmail", {
      orgId: event.orgId,
      eventId: args.eventId,
      toEmail: args.toEmail,
      templateKey: args.templateKey,
      subject,
      status,
      error,
    });
    return { sent: status === "sent" };
  },
});
