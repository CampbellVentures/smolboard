import { action, v } from "@pylonsync/functions";
import { DEFAULT_TEMPLATES, renderEmailHtml, renderTemplate, type MergeVars } from "../lib/email";

// Central speaker-email sender. Resolves the event's EmailTemplate row (falling
// back to the built-in default for the key), renders merge tags, sends via the
// built-in email subsystem (PYLON_EMAIL_PROVIDER — stack0 for us), and logs to
// EmailLog either way. Called by submitCfp (scheduled), status changes, task
// reminders, calendar invites, and later the copilot's nudge tool.
//
// internal: only server-side code (scheduler, other functions) may call it —
// a browser must never be able to send templated email directly.
//
// SDK ≥0.3.378: multipart send — text + html bodies, plus optional base64
// attachments whose contentType passes through verbatim (calendar invites ride
// as `text/calendar; method=REQUEST`, which Gmail/Outlook render as an
// RSVP-able event).
export default action<
  {
    eventId: string;
    templateKey: string;
    toEmail: string;
    vars?: Record<string, string>;
    attachments?: { filename: string; contentType: string; content: string }[];
  },
  { sent: boolean }
>({
  internal: true,
  args: {
    eventId: v.id("Event"),
    templateKey: v.string(),
    toEmail: v.string(),
    vars: v.optional(v.any()),
    // [{filename, contentType, content: base64}] — callers build these
    // server-side (e.g. sendScheduleInvites builds the ICS).
    attachments: v.optional(v.json()),
  },
  async handler(ctx, args) {
    const { event, template: custom } = await ctx.runQuery<{
      event: { id: string; orgId: string; name: string } | null;
      template: {
        subject: string;
        body: string;
        bodyHtml?: string;
        bodyJson?: string;
        enabled: boolean;
      } | null;
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
    const bodyMd = renderTemplate(template.body, vars);
    const text = bodyMd.replace(/\*\*([^*]+)\*\*/g, "$1");
    // Composer-authored templates carry their own HTML (with merge tags);
    // default templates fall back to the tiny markdown renderer.
    const html = renderEmailHtml(template.body, custom?.bodyHtml, vars);

    const attachments = Array.isArray(args.attachments)
      ? (args.attachments as { filename: string; contentType: string; content: string }[])
      : undefined;

    let status = "sent";
    let error: string | undefined;
    try {
      await ctx.email.send({
        to: args.toEmail,
        subject,
        text,
        html,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      });
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
