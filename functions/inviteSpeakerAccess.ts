import { mutation, v } from "@pylonsync/functions";
import { normalizeSpeakerEmail } from "../lib/speakers";

// An organizer adding a speaker has vouched for that address: they typed it,
// they're accountable for it, and they already email these people. Marking the
// account verified on that basis lets an invited speaker actually sign in and
// use the portal, which is the whole point of inviting them.
//
// The trust boundary is narrow ON PURPOSE, and it is enforced below rather
// than assumed. This only ever verifies a SHELL account — one an organizer
// created by typing an address, which has no credential of its own and which
// nobody has ever authenticated as. Any account that self-registered has a
// password hash and is refused here; it must prove inbox control through the
// emailed code like everyone else.
//
// That distinction is load-bearing. Provisioning a workspace is self-service,
// so without it anyone could sign up, create an event, add THEMSELVES as a
// speaker, and hand themselves emailVerified — which is the gate on
// completeTask, updateMySpeakerProfile, recordDeliverableVersion, and the
// participant-claim flow. Verifying a shell account grants the caller nothing:
// they hold no session for it, and the emailed code still goes to the real
// inbox.
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
      // Only a shell account the organizer created. A password hash means the
      // person set their own credential, so this org never controlled the
      // address and cannot vouch for it.
      if (user.passwordHash) {
        throw ctx.error(
          "FORBIDDEN",
          "That speaker already has their own sign-in. They verify their email from the code we send them.",
        );
      }
      await ctx.db.unsafe.update("User", args.speakerUserId, {
        emailVerified: new Date().toISOString(),
      });
      return { verified: true, email: normalizeSpeakerEmail(user.email as string) };
    }
    return { verified: true, email: normalizeSpeakerEmail(user.email as string) };
  },
});
