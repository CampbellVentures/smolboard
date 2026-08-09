import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: { eventId: v.id("Event"), name: v.string(), capacity: v.optional(v.int()), sortOrder: v.int() },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    const name = args.name.trim();
    if (!name) throw ctx.error("INVALID_ARGS", "Room name is required.");
    const id = await ctx.db.unsafe.insert("Room", {
      orgId: event.orgId as string,
      eventId: args.eventId,
      name,
      capacity: args.capacity,
      sortOrder: args.sortOrder,
    });
    return { id };
  },
});
