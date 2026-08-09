import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: {
    eventId: v.id("Event"),
    roundId: v.optional(v.id("ReviewRound")),
    roundNumber: v.int(),
    name: v.string(),
    criteriaJson: v.optional(v.json()),
    status: v.string(),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string);
    if (args.roundNumber < 1) throw ctx.error("INVALID_ARGS", "Round number must be positive.");
    if (args.status !== "open" && args.status !== "closed") {
      throw ctx.error("INVALID_ARGS", "Invalid review round status.");
    }
    const payload = {
      roundNumber: args.roundNumber,
      name: args.name.trim() || `Round ${args.roundNumber}`,
      criteriaJson: args.criteriaJson,
      status: args.status,
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
