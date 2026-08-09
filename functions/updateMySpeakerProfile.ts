import { mutation, v } from "@pylonsync/functions";
import {
  PROFILE_LIMITS,
  boundedSpeakerText,
  normalizeSpeakerEmail,
  sanitizeSpeakerLinks,
  validatePublicHeadshotUrl,
} from "../lib/speakers";

export default mutation({
  args: {
    profileId: v.id("SpeakerProfile"),
    name: v.string(),
    tagline: v.optional(v.string()),
    bio: v.optional(v.string()),
    company: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    headshotUrl: v.optional(v.string()),
    linksJson: v.optional(v.json()),
  },
  async handler(ctx, args) {
    const profile = await ctx.db.unsafe.get("SpeakerProfile", args.profileId);
    const user = await ctx.db.unsafe.get("User", ctx.auth.userId);
    if (!profile || profile.userId !== ctx.auth.userId || !user) {
      throw ctx.error("NOT_FOUND", "Speaker profile not found.");
    }
    const event = await ctx.db.unsafe.get("Event", profile.eventId as string);
    if (!event || event.orgId !== profile.orgId) throw ctx.error("NOT_FOUND", "Speaker profile not found.");
    if (!user.emailVerified || normalizeSpeakerEmail(user.email as string) !== normalizeSpeakerEmail(profile.email as string)) {
      throw ctx.error("FORBIDDEN", "Verify the invited email before editing this profile.");
    }
    let name: string;
    let tagline;
    let bio;
    let company;
    let jobTitle;
    let linksJson;
    try {
      name = boundedSpeakerText(args.name, "Speaker name", PROFILE_LIMITS.name) ?? "";
      tagline = boundedSpeakerText(args.tagline, "Tagline", PROFILE_LIMITS.shortText);
      bio = boundedSpeakerText(args.bio, "Bio", PROFILE_LIMITS.bio);
      company = boundedSpeakerText(args.company, "Company", PROFILE_LIMITS.shortText);
      jobTitle = boundedSpeakerText(args.jobTitle, "Job title", PROFILE_LIMITS.shortText);
      linksJson = sanitizeSpeakerLinks(args.linksJson);
    } catch (error) {
      throw ctx.error("INVALID_ARGS", error instanceof Error ? error.message : "Invalid speaker profile.");
    }
    if (!name) throw ctx.error("INVALID_ARGS", "Speaker name is required.");
    let headshotUrl: string | undefined;
    try {
      headshotUrl = validatePublicHeadshotUrl(args.headshotUrl);
    } catch (error) {
      throw ctx.error("INVALID_ARGS", error instanceof Error ? error.message : "Invalid headshot URL.");
    }
    await ctx.db.unsafe.update("SpeakerProfile", args.profileId, {
      name,
      tagline,
      bio,
      company,
      jobTitle,
      headshotUrl,
      linksJson,
      claimStatus: "claimed",
      claimedAt: (profile.claimedAt as string | undefined) ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { id: args.profileId };
  },
});
