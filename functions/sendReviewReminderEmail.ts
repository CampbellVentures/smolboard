import { action, v } from "@pylonsync/functions";

export default action({
  internal: true,
  args: {
    orgId: v.id("Org"),
    eventId: v.id("Event"),
    eventName: v.string(),
    roundName: v.string(),
    toEmail: v.string(),
    reviewerName: v.string(),
  },
  async handler(ctx, args) {
    const subject = `Review reminder: ${args.eventName}`;
    let status = "sent";
    let error: string | undefined;
    try {
      await ctx.email.send({
        to: args.toEmail,
        subject,
        text: `Hi ${args.reviewerName},\n\nYou still have assigned reviews in ${args.roundName} for ${args.eventName}. Sign in to smolboard to complete them.`,
      });
    } catch (cause) {
      status = "failed";
      error = cause instanceof Error ? cause.message : "Email delivery failed";
    }
    await ctx.runMutation("logEmail", {
      orgId: args.orgId,
      eventId: args.eventId,
      toEmail: args.toEmail,
      templateKey: "review_reminder",
      subject,
      status,
      error,
    });
    return { sent: status === "sent" };
  },
});
