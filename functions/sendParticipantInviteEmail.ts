import { action, v } from "@pylonsync/functions";

export default action({
  internal: true,
  args: {
    toEmail: v.string(),
    participantName: v.string(),
    inviteId: v.id("SubmissionParticipantInvite"),
    token: v.string(),
  },
  async handler(ctx, args) {
    const base = ctx.env.PYLON_PUBLIC_URL || "";
    const url = `${base}/portal?participantInvite=${encodeURIComponent(args.inviteId)}&token=${encodeURIComponent(args.token)}`;
    await ctx.email.send({
      to: args.toEmail,
      subject: "You are invited to co-present a session",
      text: `Hi ${args.participantName},\n\nSign in with this invited email, then claim your participant role: ${url}`,
    });
    return { sent: true };
  },
});
