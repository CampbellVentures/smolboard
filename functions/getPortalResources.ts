import { query, v } from "@pylonsync/functions";

// Published reference pages for the events a speaker is actually on.
//
// Speakers can't read PortalResource directly (the policy scopes reads to
// organizers), so this is the only way in — and it filters to published pages
// for events where the caller has a speaker profile. A speaker never sees
// another event's material, or an organizer's draft.
export default query({
  args: { eventId: v.optional(v.id("Event")) },
  async handler(ctx, args) {
    if (!ctx.auth.userId) return { resources: [] };
    const profiles = (await ctx.db.unsafe.query("SpeakerProfile", { userId: ctx.auth.userId }))
      .filter((p) => p.userId === ctx.auth.userId);
    const eventIds = new Set(profiles.map((p) => p.eventId as string));
    if (args.eventId && !eventIds.has(args.eventId)) return { resources: [] };
    const wanted = args.eventId ? [args.eventId] : [...eventIds];

    const out: Record<string, unknown>[] = [];
    for (const eventId of wanted) {
      const rows = (await ctx.db.unsafe.query("PortalResource", { eventId }))
        .filter((r) => r.eventId === eventId && r.published === true);
      const event = await ctx.db.unsafe.get("Event", eventId);
      for (const r of rows) {
        out.push({
          id: r.id,
          eventId,
          eventName: event?.name ?? "",
          title: r.title,
          body: r.body ?? null,
          embedUrl: r.embedUrl ?? null,
          sortOrder: r.sortOrder ?? 0,
        });
      }
    }
    out.sort((a, b) =>
      (a.sortOrder as number) - (b.sortOrder as number) ||
      String(a.title).localeCompare(String(b.title)),
    );
    return { resources: out };
  },
});
