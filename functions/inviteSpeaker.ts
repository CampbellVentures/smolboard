import { mutation, v } from "@pylonsync/functions";
import { matchesEventAnchor } from "../lib/tenantAnchors";

export default mutation({
  args: { profileId: v.id("SpeakerProfile") },
  async handler(ctx, args) {
    const profile = await ctx.db.unsafe.get("SpeakerProfile", args.profileId);
    if (!profile) throw ctx.error("NOT_FOUND", "Speaker profile not found.");
    const event = await ctx.db.unsafe.get("Event", profile.eventId as string);
    if (!event || !matchesEventAnchor(profile, event.id as string, event.orgId as string)) {
      throw ctx.error("NOT_FOUND", "Speaker profile not found.");
    }
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    await ctx.auth.elevate({ admin: true, reason: "queue organizer-approved speaker portal invitation" });
    await ctx.scheduler.runAfter(0, "sendTemplatedEmail", {
      eventId: event.id as string,
      templateKey: "portal_invite",
      toEmail: profile.email as string,
      vars: { speaker_name: profile.name as string },
    });
    const invitedAt = new Date().toISOString();
    await ctx.db.unsafe.update("SpeakerProfile", args.profileId, { invitedAt, updatedAt: invitedAt });
    return { queued: true, invitedAt };
  },
});
