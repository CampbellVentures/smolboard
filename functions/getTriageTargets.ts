import { query, v } from "@pylonsync/functions";
import { normalizeCriteria } from "../lib/reviews";
import { reviewRoundForNumber } from "../lib/reviews";

// Internal: submissions awaiting a decision that haven't been triaged yet.
export default query({
  internal: true,
  args: { eventId: v.id("Event"), limit: v.int() },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) return [];
    const rounds = (await ctx.db.unsafe.query("ReviewRound", { eventId: args.eventId })).filter(
      (row) => row.orgId === event.orgId,
    );
    return (await ctx.db.unsafe.query("Submission", { eventId: args.eventId }))
      .filter(
        (row) =>
          row.orgId === event.orgId &&
          !row.triageAt &&
          ["submitted", "in_review"].includes(row.status as string),
      )
      .slice(0, args.limit)
      .map((row) => {
        const round = reviewRoundForNumber(
          rounds as unknown as { roundNumber: number; criteriaJson?: unknown }[],
          row.currentRound as number,
        );
        return {
          id: row.id as string,
          title: row.title as string,
          abstract: (row.abstract as string) ?? "",
          category: (row.category as string) ?? "",
          criteria: normalizeCriteria(round?.criteriaJson).map((c) => ({
            key: c.key,
            label: c.label,
          })),
        };
      });
  },
});
