import { action, v } from "@pylonsync/functions";

// AI first pass over unreviewed submissions. It scores against the round's own
// criteria and writes a short rationale, so an organizer can triage a large
// pile before humans read. Advisory only: it never sets a status, and the
// score is stored separately from human review scores so it can't skew them.
interface TriageTarget {
  id: string;
  title: string;
  abstract: string;
  category: string;
  criteria: { key: string; label: string }[];
}

export default action<
  { eventId: string; limit?: number },
  { scored: number; skipped: number }
>({
  timeout: 120,
  args: { eventId: v.id("Event"), limit: v.optional(v.int()) },
  async handler(ctx, args) {
    // An action has no ctx.db, so the membership gate lives in getTriageTargets
    // (and again in recordTriage). That call is FIRST on purpose: a caller who
    // is not an owner/admin of this event's org is rejected there, before a
    // single token is spent. Do not reorder or cache past it.
    const targets = await ctx.runQuery<TriageTarget[]>("getTriageTargets", {
      eventId: args.eventId,
      limit: Math.min(Math.max(args.limit ?? 10, 1), 25),
    });
    if (targets.length === 0) return { scored: 0, skipped: 0 };

    let scored = 0;
    let skipped = 0;
    for (const target of targets) {
      const criteria = target.criteria.map((c) => c.label).join(", ") || "relevance and clarity";
      const prompt = [
        "You are triaging a conference talk proposal for a program committee.",
        `Judge it on: ${criteria}.`,
        "",
        `Title: ${target.title}`,
        `Track: ${target.category || "unspecified"}`,
        `Abstract: ${target.abstract || "(none provided)"}`,
        "",
        "Reply with exactly two lines:",
        "SCORE: <number 1-5, one decimal>",
        "WHY: <one sentence, max 30 words, naming the strongest and weakest point>",
      ].join("\n");

      try {
        const res = await ctx.llm.complete({
          messages: [{ role: "user", content: prompt }],
          max_tokens: 200,
        });
        // The response is content blocks; join the text ones.
        const text = (res.content ?? [])
          .map((block) => (block as { type?: string; text?: string }))
          .filter((block) => block.type === "text" && typeof block.text === "string")
          .map((block) => block.text as string)
          .join("\n");
        const score = Number(text.match(/SCORE:\s*([\d.]+)/i)?.[1]);
        const why = text.match(/WHY:\s*(.+)/i)?.[1]?.trim();
        if (!Number.isFinite(score) || !why) {
          skipped++;
          continue;
        }
        await ctx.runMutation("recordTriage", {
          submissionId: target.id,
          score: Math.min(5, Math.max(1, score)),
          summary: why.slice(0, 300),
        });
        scored++;
      } catch {
        skipped++;
      }
    }
    return { scored, skipped };
  },
});
