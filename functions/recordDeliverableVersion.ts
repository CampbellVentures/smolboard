import { mutation, v } from "@pylonsync/functions";
import { MAX_DELIVERABLE_BYTES } from "../lib/deliverables";

export default mutation({
  args: {
    slotId: v.id("DeliverableSlot"),
    fileId: v.string(),
    fileUrl: v.string(),
    filename: v.string(),
    mimeType: v.string(),
    size: v.int(),
  },
  async handler(ctx, args) {
    const slot = await ctx.db.unsafe.get("DeliverableSlot", args.slotId);
    if (!slot || slot.speakerUserId !== ctx.auth.userId) throw ctx.error("NOT_FOUND", "Deliverable not found.");
    const event = await ctx.db.unsafe.get("Event", slot.eventId as string);
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", {
      eventId: slot.eventId as string,
      userId: ctx.auth.userId,
    });
    if (!event || event.orgId !== slot.orgId || !profiles.some((profile) => profile.orgId === slot.orgId)) {
      throw ctx.error("NOT_FOUND", "Deliverable not found.");
    }
    const fileId = bounded(ctx, args.fileId, "File id", 200);
    const fileUrl = bounded(ctx, args.fileUrl, "File URL", 2048);
    const filename = bounded(ctx, args.filename, "Filename", 200);
    const mimeType = bounded(ctx, args.mimeType || "application/octet-stream", "File type", 200);
    if (args.size <= 0 || args.size > MAX_DELIVERABLE_BYTES) {
      throw ctx.error("INVALID_ARGS", "Files must be non-empty and 25 MB or smaller.");
    }
    const versions = (await ctx.db.unsafe.query("DeliverableVersion", { slotId: args.slotId })).filter(
      (version) => version.orgId === slot.orgId && version.eventId === slot.eventId && version.speakerUserId === slot.speakerUserId,
    );
    const duplicate = versions.find((version) => version.fileId === fileId);
    if (duplicate) return { id: duplicate.id as string, versionNumber: duplicate.versionNumber as number };
    const versionNumber = versions.reduce(
      (highest, version) => Math.max(highest, Number(version.versionNumber) || 0),
      0,
    ) + 1;
    // The client calls this only after /api/files/confirm. Phase A intentionally
    // records confirmation metadata without claiming server-side verification.
    const id = await ctx.db.unsafe.insert("DeliverableVersion", {
      orgId: slot.orgId as string,
      eventId: slot.eventId as string,
      slotId: args.slotId,
      speakerUserId: slot.speakerUserId as string,
      uploaderUserId: ctx.auth.userId,
      fileId,
      fileUrl,
      filename,
      mimeType,
      size: args.size,
      versionNumber,
    });
    // A fresh upload supersedes any earlier verdict — back to the review queue.
    await ctx.db.unsafe.update("DeliverableSlot", args.slotId, {
      status: "pending",
      reviewNote: null,
      reviewedAt: null,
    });
    return { id, versionNumber };
  },
});

function bounded(ctx: { error(code: string, message: string): Error }, value: string, label: string, max: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw ctx.error("INVALID_ARGS", `${label} is invalid.`);
  return normalized;
}
