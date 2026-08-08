import { query, v } from "@pylonsync/functions";

// Agent tool: compact submission list with speaker + score context. Runs as
// the calling organizer (copilot action / MCP request) — requireMember gates.
export default query({
  args: {
    eventId: v.id("Event"),
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string);

    // ctx.db.unsafe: membership verified above; these are the org's own rows.
    let subs = await ctx.db.unsafe.query("Submission", { eventId: args.eventId });
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", { eventId: args.eventId });
    const reviews = await ctx.db.unsafe.query("Review", { eventId: args.eventId });

    if (args.status) subs = subs.filter((s) => s.status === args.status);
    if (args.category) subs = subs.filter((s) => s.category === args.category);

    const scoreBy: Record<string, { total: number; n: number }> = {};
    for (const r of reviews) {
      const scores = (r.scoresJson ?? {}) as Record<string, number>;
      const vals = Object.values(scores).filter((x) => typeof x === "number");
      if (vals.length === 0) continue;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const key = r.submissionId as string;
      scoreBy[key] ??= { total: 0, n: 0 };
      scoreBy[key].total += mean;
      scoreBy[key].n += 1;
    }

    let rows = subs.map((s) => {
      const p = profiles.find((x) => x.userId === s.speakerUserId);
      const sc = scoreBy[s.id as string];
      return {
        submissionId: s.id,
        title: s.title,
        speaker: p?.name ?? null,
        company: p?.company ?? null,
        category: s.category ?? null,
        status: s.status,
        round: s.currentRound,
        avgScore: sc ? Number((sc.total / sc.n).toFixed(2)) : null,
        reviewCount: sc?.n ?? 0,
      };
    });
    if (args.search) {
      const needle = args.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          String(r.title).toLowerCase().includes(needle) ||
          String(r.speaker ?? "").toLowerCase().includes(needle),
      );
    }
    rows.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1));
    return { count: rows.length, submissions: rows.slice(0, 100) };
  },
});
