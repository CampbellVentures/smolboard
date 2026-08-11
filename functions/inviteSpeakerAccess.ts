import { mutation, v } from "@pylonsync/functions";
import { normalizeSpeakerEmail } from "../lib/speakers";

// An organizer adding a speaker has vouched for that address: they typed it,
// they're accountable for it, and they already email these people. Marking the
// account verified on that basis lets an invited speaker actually sign in and
// use the portal, which is the whole point of inviting them.
//
// The trust boundary still holds where it matters: SELF-registered accounts
// stay unverified until they prove inbox control, so nobody can register
// someone else's address and submit as them. This only covers accounts an
// organizer of the speaker's own event created.
export default mutation<
  { eventId: string; speakerUserId: string },
  { verified: boolean; email: string }
>({
  args: { eventId: v.id("Event"), speakerUserId: v.id("User") },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    const profiles = (await ctx.db.unsafe.query("SpeakerProfile", { eventId: args.eventId })).filter(
      (row) => row.orgId === event.orgId && row.userId === args.speakerUserId,
    );
    if (profiles.length === 0) {
      throw ctx.error("NOT_FOUND", "That person isn't a speaker on this event.");
    }
    const user = await ctx.db.unsafe.get("User", args.speakerUserId);
    if (!user) throw ctx.error("NOT_FOUND", "Speaker account not found.");

    if (!user.emailVerified) {
      await ctx.db.unsafe.update("User", args.speakerUserId, {
        emailVerified: new Date().toISOString(),
      });
    }
    return { verified: true, email: normalizeSpeakerEmail(user.email as string) };
  },
});
