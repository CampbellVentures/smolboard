import { mutation, v } from "@pylonsync/functions";
import { logActivity } from "../lib/activity";
import { matchesEventAnchor } from "../lib/tenantAnchors";

// Revoke a speaker's portal claim and hand the profile back to the organizer.
//
// Claiming is one-way today: once someone verifies the address on a profile it
// is their login forever, and correctSpeakerEmail refuses to touch it. That is
// the right default, but it leaves no way out of the cases that actually
// happen. Someone claims a profile with a typo'd address, or the wrong person
// claims it, or a placeholder identity was used to set an event up. Deleting
// the speaker to escape that takes their sessions, submissions, tasks, and
// deliverables with it, and on a published schedule it takes them off the
// public page too.
//
// This unclaims the profile and leaves everything else exactly where it is.
// The speaker loses portal access until they claim again, which is the point:
// the account holding that address can no longer act as this speaker.
export default mutation<
  { eventId: string; profileId: string },
  { reset: true; previousEmail: string }
>({
  args: {
    eventId: v.id("Event"),
    profileId: v.id("SpeakerProfile"),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    const profile = await ctx.db.unsafe.get("SpeakerProfile", args.profileId);
    if (!matchesEventAnchor(profile, args.eventId, event.orgId as string)) {
      throw ctx.error("NOT_FOUND", "Speaker profile not found.");
    }
    if (profile!.claimStatus !== "claimed") {
      throw ctx.error("CONFLICT", "This profile has not been claimed.");
    }
    // An organizer who is also a speaker keeps their own account: unclaiming
    // there would strip a real workspace member of their portal for no reason.
    // Scoped to THIS workspace — a speaker who happens to own an unrelated
    // workspace elsewhere is still resettable here.
    const memberships = await ctx.db.unsafe.query("OrgMember", {
      orgId: event.orgId as string,
      userId: profile!.userId as string,
    });
    if (memberships.length > 0) {
      throw ctx.error("CONFLICT", "This speaker is a workspace member. Remove them from the team instead.");
    }

    await ctx.db.unsafe.update("SpeakerProfile", args.profileId, {
      claimStatus: "unclaimed",
      claimedAt: null,
      // Blocks the portal's automatic re-claim: without this stamp the same
      // account claims the profile back on its next /portal visit and the
      // reset silently reverts. correctSpeakerEmail clears it.
      claimResetAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await logActivity(ctx, {
      orgId: event.orgId as string,
      eventId: args.eventId,
      kind: "speaker.updated",
      message: `Portal access reset for ${profile!.name as string}`,
      href: `/dashboard/events/${args.eventId}/speakers?speaker=${args.profileId}`,
    });
    return { reset: true, previousEmail: profile!.email as string };
  },
});
