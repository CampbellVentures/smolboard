import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: { eventId: v.id("Event"), name: v.string(), color: v.optional(v.string()), sortOrder: v.int() },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string);
    const name = args.name.trim();
    if (!name) throw ctx.error("INVALID_ARGS", "Track name is required.");
    const id = await ctx.db.unsafe.insert("Track", {
      orgId: event.orgId as string,
      eventId: args.eventId,
      name,
      color: args.color?.trim() || undefined,
      sortOrder: args.sortOrder,
    });
    return { id };
  },
});
