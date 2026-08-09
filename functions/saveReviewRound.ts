import { mutation, v } from "@pylonsync/functions";
import { normalizeCriteria } from "../lib/reviews";
import { requireOrganizerForEvent } from "./_reviewAccess";

export default mutation({
  args: {
    eventId: v.id("Event"),
    roundId: v.optional(v.id("ReviewRound")),
    roundNumber: v.int(),
    name: v.string(),
    criteriaJson: v.optional(v.json()),
    status: v.string(),
    opensAt: v.optional(v.datetime()),
    closesAt: v.optional(v.datetime()),
    anonymized: v.optional(v.bool()),
    revealPeerReviews: v.optional(v.bool()),
  },
  async handler(ctx, args) {
    const event = await requireOrganizerForEvent(ctx, args.eventId);
    if (args.roundNumber < 1) throw ctx.error("INVALID_ARGS", "Round number must be positive.");
    if (args.status !== "open" && args.status !== "closed") {
      throw ctx.error("INVALID_ARGS", "Invalid review round status.");
    }
    if (args.opensAt && args.closesAt && args.opensAt >= args.closesAt) {
      throw ctx.error("INVALID_ARGS", "Review round must close after it opens.");
    }
    const criteria = normalizeCriteria(args.criteriaJson);
    if (args.criteriaJson !== undefined && criteria.length === 0) {
      throw ctx.error("INVALID_ARGS", "Configure at least one valid review criterion.");
    }
    const payload = {
      roundNumber: args.roundNumber,
      name: args.name.trim() || `Round ${args.roundNumber}`,
      criteriaJson: criteria.length > 0 ? criteria : undefined,
      status: args.status,
      opensAt: args.opensAt,
      closesAt: args.closesAt,
      anonymized: args.anonymized ?? true,
      revealPeerReviews: args.revealPeerReviews ?? false,
    };
    if (args.roundId) {
      const round = await ctx.db.unsafe.get("ReviewRound", args.roundId);
      if (!round || round.eventId !== args.eventId || round.orgId !== event.orgId) {
        throw ctx.error("NOT_FOUND", "Review round not found.");
      }
      await ctx.db.unsafe.update("ReviewRound", args.roundId, payload);
      return { id: args.roundId };
    }
    const id = await ctx.db.unsafe.insert("ReviewRound", {
      orgId: event.orgId as string,
      eventId: args.eventId,
      ...payload,
    });
    return { id };
  },
});
