import { mutation, v } from "@pylonsync/functions";
import { reminderReviewerIds } from "../lib/reviews";
import { requireOrganizerForEvent } from "./_reviewAccess";

export default mutation({
  args: { eventId: v.id("Event"), roundId: v.id("ReviewRound") },
  async handler(ctx, args) {
    const event = await requireOrganizerForEvent(ctx, args.eventId);
    const round = await ctx.db.unsafe.get("ReviewRound", args.roundId);
    if (!round || round.eventId !== args.eventId || round.orgId !== event.orgId) {
      throw ctx.error("NOT_FOUND", "Review round not found.");
    }
    const assignments = (await ctx.db.unsafe.query("ReviewAssignment", { roundId: args.roundId }))
      .filter((assignment) =>
        assignment.orgId === event.orgId &&
        assignment.eventId === args.eventId &&
        assignment.roundId === args.roundId
      );
    const reviewerIds = reminderReviewerIds(assignments as never);
    const recipients: { email: string; name: string }[] = [];
    for (const userId of reviewerIds) {
      const user = await ctx.db.unsafe.get("User", userId);
      if (typeof user?.email === "string" && user.email) {
        recipients.push({
          email: user.email,
          name: typeof user.displayName === "string" ? user.displayName : user.email,
        });
      }
    }
    await ctx.auth.elevate({ admin: true, reason: "queue organizer-authorized review reminders" });
    for (const recipient of recipients) {
      await ctx.scheduler.runAfter(0, "sendReviewReminderEmail", {
        orgId: event.orgId,
        eventId: args.eventId,
        eventName: event.name,
        roundName: round.name,
        toEmail: recipient.email,
        reviewerName: recipient.name,
      });
    }
    return { queued: recipients.length };
  },
});
