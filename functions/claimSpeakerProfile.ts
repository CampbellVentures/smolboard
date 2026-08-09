import { mutation, v } from "@pylonsync/functions";
import { normalizeSpeakerEmail } from "../lib/speakers";

export default mutation({
  args: {
    profileId: v.id("SpeakerProfile"),
    expectedProvisionalUserId: v.id("User"),
  },
  async handler(ctx, args) {
    if (ctx.auth.userId !== args.expectedProvisionalUserId) {
      throw ctx.error("FORBIDDEN", "Speaker identity does not match this invitation.");
    }
    const profile = await ctx.db.unsafe.get("SpeakerProfile", args.profileId);
    if (!profile || profile.userId !== ctx.auth.userId) {
      throw ctx.error("NOT_FOUND", "Speaker profile not found.");
    }
    const event = await ctx.db.unsafe.get("Event", profile.eventId as string);
    const user = await ctx.db.unsafe.get("User", ctx.auth.userId);
    if (!event || event.orgId !== profile.orgId || !user) {
      throw ctx.error("NOT_FOUND", "Speaker profile not found.");
    }
    if (!user.emailVerified) {
      throw ctx.error("FORBIDDEN", "Verify this email with a magic code before claiming the profile.");
    }
    if (normalizeSpeakerEmail(user.email as string) !== normalizeSpeakerEmail(profile.email as string)) {
      throw ctx.error("FORBIDDEN", "Verified email does not match this speaker invitation.");
    }
    const claimedAt = (profile.claimedAt as string | undefined) ?? new Date().toISOString();
    await ctx.db.unsafe.update("SpeakerProfile", args.profileId, {
      claimStatus: "claimed",
      claimedAt,
      updatedAt: new Date().toISOString(),
    });
    return { id: args.profileId, claimedAt };
  },
});
