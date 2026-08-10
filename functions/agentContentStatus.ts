import { query, v } from "@pylonsync/functions";
import { parseJson } from "../lib/types";

// Agent tool: deliverable review state per speaker — what's uploaded, what's
// approved, what's pending or sent back, so the copilot can answer "who still
// owes slides?" and "is everything approved for the keynote?".
export default query({
  args: { eventId: v.id("Event") },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    const [slots, versions, profiles] = [
      await ctx.db.unsafe.query("DeliverableSlot", { eventId: args.eventId }),
      await ctx.db.unsafe.query("DeliverableVersion", { eventId: args.eventId }),
      await ctx.db.unsafe.query("SpeakerProfile", { eventId: args.eventId }),
    ];
    const nameOf = (userId: unknown) =>
      (profiles.find((profile) => profile.userId === userId)?.name as string) ?? "Unknown";

    return {
      deliverables: slots
        .filter((slot) => slot.orgId === event.orgId)
        .map((slot) => {
          const slotVersions = versions
            .filter((version) => version.slotId === slot.id)
            .sort((a, b) => (b.versionNumber as number) - (a.versionNumber as number));
          const latest = slotVersions[0];
          return {
            slotId: slot.id,
            speakerUserId: slot.speakerUserId,
            speaker: nameOf(slot.speakerUserId),
            title: slot.title,
            kind: slot.kind,
            status: latest ? ((slot.status as string) ?? "pending") : "awaiting_upload",
            reviewNote: (slot.reviewNote as string) ?? null,
            latestFile: latest ? { filename: latest.filename, version: latest.versionNumber } : null,
            versions: slotVersions.length,
          };
        }),
    };
  },
});
