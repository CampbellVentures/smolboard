import { query, v } from "@pylonsync/functions";

// Internal helper for sendTemplatedEmail (actions have no ctx.db): resolves
// the event + the event's custom template for a key, if any.
export default query<
  { eventId: string; templateKey: string },
  {
    event: { id: string; orgId: string; name: string } | null;
    template: {
      subject: string;
      body: string;
      bodyHtml?: string;
      bodyJson?: string;
      enabled: boolean;
    } | null;
  }
>({
  internal: true,
  args: {
    eventId: v.id("Event"),
    templateKey: v.string(),
  },
  async handler(ctx, args) {
    // ctx.db.unsafe: internal-only query invoked from the email action, which
    // runs with anonymous auth (scheduler) — rows are org-owned.
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) return { event: null, template: null };
    const custom = await ctx.db.unsafe.query("EmailTemplate", {
      eventId: args.eventId,
      key: args.templateKey,
    });
    const t = custom[0];
    return {
      event: {
        id: event.id as string,
        orgId: event.orgId as string,
        name: event.name as string,
      },
      template: t
        ? {
            subject: (t.subject as string) ?? "",
            body: (t.body as string) ?? "",
            bodyHtml: (t.bodyHtml as string | undefined) || undefined,
            bodyJson: (t.bodyJson as string | undefined) || undefined,
            enabled: t.enabled !== false,
          }
        : null,
    };
  },
});
