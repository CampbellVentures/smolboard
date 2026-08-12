import { mutation, v } from "@pylonsync/functions";

// Remove a track and detach it from any session that used it.
//
// Tracks were create-only: no UI control, no function, and the entity policy
// denies client deletes — so a typo, or a track made while trying the product
// out, was permanent AND showed up in the PUBLIC schedule's track filter
// forever. Sessions keep their slot; they just lose the label, which is the
// same thing "No track" already means everywhere in the builder.
export default mutation<{ trackId: string }, { deleted: true; sessionsDetached: number }>({
  args: { trackId: v.id("Track") },
  async handler(ctx, args) {
    const track = await ctx.db.unsafe.get("Track", args.trackId);
    if (!track) throw ctx.error("NOT_FOUND", "Track not found.");
    const event = await ctx.db.unsafe.get("Event", track.eventId as string);
    if (!event || event.orgId !== track.orgId) throw ctx.error("NOT_FOUND", "Track event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    const sessions = (await ctx.db.unsafe.query("Session", { eventId: event.id as string })).filter(
      (row) => row.orgId === event.orgId && row.trackId === args.trackId,
    );
    for (const session of sessions) {
      // null clears the column; undefined would be ignored.
      await ctx.db.unsafe.update("Session", session.id as string, { trackId: null });
    }
    await ctx.db.unsafe.delete("Track", args.trackId);
    return { deleted: true, sessionsDetached: sessions.length };
  },
});
