import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: { eventId: v.id("Event"), templateKey: v.string() },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string);
    const user = await ctx.db.unsafe.get("User", ctx.auth.userId);
    if (!user?.email) throw ctx.error("INVALID_ARGS", "Your account has no email address.");

    await ctx.auth.elevate({ admin: true, reason: "queue organizer email-template test" });
    await ctx.scheduler.runAfter(0, "sendTemplatedEmail", {
      eventId: args.eventId,
      templateKey: args.templateKey,
      toEmail: user.email as string,
      vars: {
        speaker_name: "Ada Speaker",
        talk_title: "Building delightful realtime software",
        task_list: "• Upload headshot (due Aug 10)\n• Confirm session details",
        session_time: "Tuesday, Aug 11 at 10:00 AM PDT",
        room: "Main stage",
        calendar_links: "Calendar links appear here",
      },
    });
    return { queued: true, toEmail: user.email as string };
  },
});
