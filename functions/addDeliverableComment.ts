import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: {
    slotId: v.id("DeliverableSlot"),
    versionId: v.optional(v.id("DeliverableVersion")),
    body: v.string(),
  },
  async handler(ctx, args) {
    const slot = await ctx.db.unsafe.get("DeliverableSlot", args.slotId);
    if (!slot) throw ctx.error("NOT_FOUND", "Deliverable not found.");
    const event = await ctx.db.unsafe.get("Event", slot.eventId as string);
    if (!event || event.orgId !== slot.orgId) throw ctx.error("NOT_FOUND", "Deliverable not found.");
    const isSpeaker = slot.speakerUserId === ctx.auth.userId;
    if (!isSpeaker) await ctx.requireMember(slot.orgId as string, { role: ["owner", "admin"] });
    if (args.versionId) {
      const version = await ctx.db.unsafe.get("DeliverableVersion", args.versionId);
      if (!version || version.slotId !== args.slotId || version.orgId !== slot.orgId || version.eventId !== slot.eventId) {
        throw ctx.error("NOT_FOUND", "Deliverable version not found.");
      }
    }
    const body = args.body.trim();
    if (!body || body.length > 2000) throw ctx.error("INVALID_ARGS", "Comment must be 1–2000 characters.");
    const user = await ctx.db.unsafe.get("User", ctx.auth.userId);
    const profiles = isSpeaker
      ? await ctx.db.unsafe.query("SpeakerProfile", { eventId: slot.eventId as string, userId: ctx.auth.userId })
      : [];
    const authorName = isSpeaker
      ? String(profiles.find((profile) => profile.orgId === slot.orgId)?.name || user?.displayName || user?.email || "Speaker")
      : String(user?.displayName || user?.email || "Organizer");
    const id = await ctx.db.unsafe.insert("DeliverableComment", {
      orgId: slot.orgId as string,
      eventId: slot.eventId as string,
      slotId: args.slotId,
      versionId: args.versionId,
      speakerUserId: slot.speakerUserId as string,
      authorUserId: ctx.auth.userId,
      authorName: authorName.slice(0, 200),
      authorRole: isSpeaker ? "speaker" : "organizer",
      body,
    });
    return { id };
  },
});
