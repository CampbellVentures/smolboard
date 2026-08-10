import { action, v } from "@pylonsync/functions";
import { renderBrandedEmail } from "../lib/email-branded";
import type { OrganizerAlertContext } from "./getOrganizerAlertContext";

// Immediate organizer alerts — the things worth an email NOW rather than the
// daily digest: a new submission, a speaker file waiting for review. Enqueued
// via ctx.scheduler from the mutations that record those events; renders the
// branded template (event accent + logo) and sends through the configured
// email provider (stack0).

export default action<
  {
    eventId: string;
    subject: string;
    heading: string;
    intro?: string;
    lines?: { text: string; href?: string }[];
    ctaLabel?: string;
    ctaHref?: string;
  },
  { sent: number }
>({
  internal: true,
  args: {
    eventId: v.id("Event"),
    subject: v.string(),
    heading: v.string(),
    intro: v.optional(v.string()),
    lines: v.optional(v.json()),
    ctaLabel: v.optional(v.string()),
    ctaHref: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const context = await ctx.runQuery<OrganizerAlertContext | null>(
      "getOrganizerAlertContext",
      { eventId: args.eventId },
    );
    if (!context || context.toEmails.length === 0) return { sent: 0 };

    const { html, text } = renderBrandedEmail({
      branding: context.branding,
      siteName: context.eventName,
      heading: args.heading,
      intro: args.intro,
      lines: args.lines,
      ctaLabel: args.ctaLabel,
      ctaHref: args.ctaHref,
    });

    let sent = 0;
    for (const to of context.toEmails) {
      try {
        await ctx.email.send({ to, subject: args.subject, text, html });
        sent++;
      } catch {
        // One bad inbox shouldn't block the rest.
      }
    }
    return { sent };
  },
});
