import { mutation, v } from "@pylonsync/functions";
import { matchesEventAnchor } from "../lib/tenantAnchors";

export default mutation({
  args: {
    eventId: v.id("Event"),
    profileIds: v.array(v.id("SpeakerProfile")),
    subject: v.string(),
    body: v.string(),
    // Optional rich export from the composer; the plain body remains the
    // text alternative and the fallback when absent.
    bodyHtml: v.optional(v.string()),
    confirmed: v.bool(),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    if (!args.confirmed) throw ctx.error("INVALID_ARGS", "Confirm the recipient list before sending.");
    const ids = [...new Set(args.profileIds)];
    if (ids.length === 0 || ids.length > 250) {
      throw ctx.error("INVALID_ARGS", "Select between 1 and 250 speakers.");
    }
    const subject = args.subject.trim();
    const body = args.body.trim();
    if (!subject || subject.length > 200 || !body || body.length > 20_000) {
      throw ctx.error("INVALID_ARGS", "Add a subject and body within the allowed length.");
    }
    const bodyHtml = args.bodyHtml?.trim() || undefined;
    if (bodyHtml && bodyHtml.length > 200_000) {
      throw ctx.error("INVALID_ARGS", "The email body is too large.");
    }
    const profiles = [];
    for (const id of ids) {
      const profile = await ctx.db.unsafe.get("SpeakerProfile", id);
      if (!matchesEventAnchor(profile, args.eventId, event.orgId as string)) {
        throw ctx.error("NOT_FOUND", "A selected speaker does not belong to this event.");
      }
      profiles.push(profile!);
    }
    await ctx.auth.elevate({ admin: true, reason: "queue confirmed organizer speaker campaign" });
    const portal = `${ctx.env.PYLON_PUBLIC_URL || ""}/portal`;
    for (const profile of profiles) {
      await ctx.scheduler.runAfter(0, "sendSpeakerEmail", {
        eventId: args.eventId,
        toEmail: profile.email as string,
        subject,
        body,
        bodyHtml,
        vars: {
          speaker_name: profile.name as string,
          event_name: event.name as string,
          portal_link: portal,
        },
      });
    }
    return { queued: profiles.length };
  },
});
