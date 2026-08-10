import { mutation, v } from "@pylonsync/functions";

// Agent tool: send a one-off email to specific speakers, keyed by userId so
// it composes with pending_tasks / content_status output. Same delivery
// pipeline and guardrails as the organizer's compose flow (sendSpeakerEmail
// per recipient, one delivery-log row each); the copilot's conversational
// confirmation stands in for the UI's confirm step.
export default mutation<
  { eventId: string; speakerUserIds: string[]; subject: string; body: string },
  { queued: number }
>({
  args: {
    eventId: v.id("Event"),
    speakerUserIds: v.array(v.id("User")),
    subject: v.string(),
    body: v.string(),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    const ids = [...new Set(args.speakerUserIds)];
    if (ids.length === 0 || ids.length > 100) {
      throw ctx.error("INVALID_ARGS", "Select between 1 and 100 speakers.");
    }
    const subject = args.subject.trim();
    const body = args.body.trim();
    if (!subject || subject.length > 200 || !body || body.length > 20_000) {
      throw ctx.error("INVALID_ARGS", "Add a subject and body within the allowed length.");
    }
    const profiles = (await ctx.db.unsafe.query("SpeakerProfile", { eventId: args.eventId })).filter(
      (profile) => profile.orgId === event.orgId && ids.includes(profile.userId as string),
    );
    if (profiles.length !== ids.length) {
      throw ctx.error("NOT_FOUND", "A selected speaker does not belong to this event.");
    }
    await ctx.auth.elevate({ admin: true, reason: "queue copilot-confirmed speaker email" });
    const portal = `${ctx.env.PYLON_PUBLIC_URL || ""}/portal`;
    for (const profile of profiles) {
      await ctx.scheduler.runAfter(0, "sendSpeakerEmail", {
        eventId: args.eventId,
        toEmail: profile.email as string,
        subject,
        body,
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
