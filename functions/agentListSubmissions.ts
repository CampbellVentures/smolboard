import { query, v } from "@pylonsync/functions";
import { aggregateSubmissionScore, reviewRoundForNumber } from "../lib/reviews";

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
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    // ctx.db.unsafe: membership verified above; these are the org's own rows.
    let subs = await ctx.db.unsafe.query("Submission", { eventId: args.eventId });
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", { eventId: args.eventId });
    const reviews = await ctx.db.unsafe.query("Review", { eventId: args.eventId });
    const rounds = await ctx.db.unsafe.query("ReviewRound", { eventId: args.eventId });

    if (args.status) subs = subs.filter((s) => s.status === args.status);
    if (args.category) subs = subs.filter((s) => s.category === args.category);

    // Score exactly as the Submissions table does: the CURRENT round only,
    // through the weighted aggregate in lib/reviews.ts, on the same 0-5 scale.
    // This used to be a raw unweighted mean across every round, so the copilot
    // reported different numbers — and a different ranking — than the organizer
    // was looking at on screen.
    const scoreBy: Record<string, { avg: number; n: number }> = {};
    for (const submission of subs) {
      const round = reviewRoundForNumber(
        rounds as unknown as { roundNumber: number; criteriaJson?: unknown }[],
        submission.currentRound as number,
      );
      if (!round) continue;
      const current = reviews.filter(
        (r) => r.submissionId === submission.id && r.roundId === (round as { id?: string }).id,
      );
      const score = aggregateSubmissionScore(round.criteriaJson, current as never);
      if (score !== undefined) {
        scoreBy[submission.id as string] = { avg: score * 5, n: current.length };
      }
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
        avgScore: sc ? Number(sc.avg.toFixed(2)) : null,
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
