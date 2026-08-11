import { mutation, v } from "@pylonsync/functions";
import {
  PROFILE_LIMITS,
  boundedSpeakerText,
  isValidSpeakerEmail,
  normalizeSpeakerEmail,
  parseSpeakerStatus,
  sanitizeSpeakerCustom,
  sanitizeSpeakerLinks,
  validatePublicHeadshotUrl,
} from "../lib/speakers";
import { matchesEventAnchor } from "../lib/tenantAnchors";

export default mutation({
  args: {
    eventId: v.id("Event"),
    profileId: v.optional(v.id("SpeakerProfile")),
    name: v.string(),
    email: v.string(),
    jobTitle: v.optional(v.string()),
    company: v.optional(v.string()),
    bio: v.optional(v.string()),
    tagline: v.optional(v.string()),
    status: v.string(),
    headshotUrl: v.optional(v.string()),
    logistics: v.optional(v.string()),
    linksJson: v.optional(v.json()),
    tagsJson: v.optional(v.json()),
    customJson: v.optional(v.json()),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    let name: string;
    let email: string;
    let status;
    let linksJson;
    let customJson;
    let jobTitle;
    let company;
    let bio;
    let tagline;
    let logistics;
    try {
      name = boundedSpeakerText(args.name, "Speaker name", PROFILE_LIMITS.name) ?? "";
      email = normalizeSpeakerEmail(boundedSpeakerText(args.email, "Speaker email", PROFILE_LIMITS.email) ?? "");
      status = parseSpeakerStatus(args.status);
      linksJson = sanitizeSpeakerLinks(args.linksJson);
      customJson = sanitizeSpeakerCustom(args.customJson);
      jobTitle = boundedSpeakerText(args.jobTitle, "Job title", PROFILE_LIMITS.shortText);
      company = boundedSpeakerText(args.company, "Company", PROFILE_LIMITS.shortText);
      bio = boundedSpeakerText(args.bio, "Bio", PROFILE_LIMITS.bio);
      tagline = boundedSpeakerText(args.tagline, "Tagline", PROFILE_LIMITS.shortText);
      logistics = boundedSpeakerText(args.logistics, "Logistics", PROFILE_LIMITS.logistics);
    } catch (error) {
      throw ctx.error("INVALID_ARGS", error instanceof Error ? error.message : "Invalid speaker profile.");
    }
    if (!name) throw ctx.error("INVALID_ARGS", "Speaker name is required.");
    if (!isValidSpeakerEmail(email)) throw ctx.error("INVALID_ARGS", "Enter a valid speaker email.");
    let headshotUrl: string | undefined;
    try {
      headshotUrl = validatePublicHeadshotUrl(args.headshotUrl);
    } catch (error) {
      throw ctx.error("INVALID_ARGS", error instanceof Error ? error.message : "Invalid headshot URL.");
    }
    const now = new Date().toISOString();
    const payload = {
      name,
      jobTitle,
      company,
      bio,
      tagline,
      status,
      headshotUrl,
      logistics,
      linksJson,
      tagsJson: cleanTags(args.tagsJson),
      customJson,
      updatedAt: now,
    };

    if (args.profileId) {
      const profile = await ctx.db.unsafe.get("SpeakerProfile", args.profileId);
      if (!matchesEventAnchor(profile, args.eventId, event.orgId as string)) {
        throw ctx.error("NOT_FOUND", "Speaker profile not found.");
      }
      const user = await ctx.db.unsafe.get("User", profile!.userId as string);
      if (
        !user ||
        normalizeSpeakerEmail(profile!.email as string) !== email ||
        normalizeSpeakerEmail(user.email as string) !== email
      ) {
        throw ctx.error("CONFLICT", "Changing a speaker's identity email requires a new speaker record.");
      }
      await ctx.db.unsafe.update("SpeakerProfile", args.profileId, payload);
      return { id: args.profileId, userId: profile!.userId as string, created: false };
    }

    const eventProfiles = (await ctx.db.unsafe.query("SpeakerProfile", { eventId: args.eventId })).filter(
      (profile) => matchesEventAnchor(profile, args.eventId, event.orgId as string),
    );
    if (eventProfiles.some((profile) => normalizeSpeakerEmail(profile.email as string) === email)) {
      throw ctx.error("CONFLICT", "A speaker with this email already exists for the event.");
    }
    const users = await ctx.db.unsafe.list("User");
    const matches = users.filter((user) => normalizeSpeakerEmail(user.email as string) === email);
    if (matches.length > 1) {
      throw ctx.error("CONFLICT", "Multiple legacy accounts match this normalized email.");
    }
    // An organizer typing this address is vouching for it, so the invited
    // speaker can sign in and use their portal. Self-registered accounts still
    // have to prove inbox control before they can submit.
    const userId = matches[0]
      ? (matches[0].id as string)
      : ((await ctx.db.unsafe.insert("User", {
          email,
          displayName: name,
          emailVerified: new Date().toISOString(),
        })) as string);
    const id = await ctx.db.unsafe.insert("SpeakerProfile", {
      orgId: event.orgId as string,
      eventId: args.eventId,
      userId,
      email,
      claimStatus: "unclaimed",
      ...payload,
    });
    return { id, userId, created: true };
  },
});

function cleanTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = [...new Set(value.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))]
    .slice(0, 20)
    .map((tag) => tag.slice(0, 80));
  return tags.length > 0 ? tags : undefined;
}
