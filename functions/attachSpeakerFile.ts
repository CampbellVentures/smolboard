import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: {
    profileId: v.id("SpeakerProfile"),
    kind: v.string(),
    fileId: v.string(),
    label: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const profile = await ctx.db.unsafe.get("SpeakerProfile", args.profileId);
    if (!profile || profile.userId !== ctx.auth.userId) {
      throw ctx.error("NOT_FOUND", "Speaker profile not found.");
    }
    const event = await ctx.db.unsafe.get("Event", profile.eventId as string);
    if (!event || event.orgId !== profile.orgId) {
      throw ctx.error("NOT_FOUND", "Speaker profile event not found.");
    }
    const kind = args.kind.trim();
    const fileId = args.fileId.trim();
    if (!kind || !fileId) throw ctx.error("INVALID_ARGS", "File kind and id are required.");
    const id = await ctx.db.unsafe.insert("SpeakerFile", {
      orgId: event.orgId as string,
      eventId: event.id as string,
      userId: ctx.auth.userId,
      kind,
      fileId,
      label: args.label?.trim() || undefined,
    });
    if (kind === "headshot") {
      await ctx.db.unsafe.update("SpeakerProfile", args.profileId, { headshotFileId: fileId });
    }
    return { id };
  },
});
