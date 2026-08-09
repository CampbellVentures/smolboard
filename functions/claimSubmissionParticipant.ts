import { mutation, v } from "@pylonsync/functions";
import { requireVerifiedCfpUser } from "./_cfpLifecycle";
import { normalizeSpeakerEmail } from "../lib/speakers";

export default mutation({
  args: {
    inviteId: v.id("SubmissionParticipantInvite"),
    token: v.string(),
    expectedProvisionalUserId: v.id("User"),
  },
  async handler(ctx, args) {
    const user = await requireVerifiedCfpUser(ctx);
    const invite = await ctx.db.unsafe.get("SubmissionParticipantInvite", args.inviteId);
    if (
      !invite ||
      invite.provisionalUserId !== args.expectedProvisionalUserId ||
      ctx.auth.userId !== args.expectedProvisionalUserId
    ) throw ctx.error("NOT_FOUND", "Participant invitation not found.");
    if (invite.status !== "pending" || invite.consumedAt) {
      throw ctx.error("CONFLICT", "Participant invitation has already been used.");
    }
    if (Date.now() >= Date.parse(invite.expiresAt as string)) {
      throw ctx.error("FORBIDDEN", "Participant invitation has expired.");
    }
    if (normalizeSpeakerEmail(user.email as string) !== normalizeSpeakerEmail(invite.email as string)) {
      throw ctx.error("FORBIDDEN", "Verified email does not match this participant invitation.");
    }
    if (await hashToken(args.token) !== invite.tokenHash) {
      throw ctx.error("FORBIDDEN", "Participant invitation token is invalid.");
    }
    const draft = await ctx.db.unsafe.get("SubmissionDraft", invite.draftId as string);
    if (!draft || draft.lifecycle !== "draft" || draft.orgId !== invite.orgId || draft.eventId !== invite.eventId) {
      throw ctx.error("NOT_FOUND", "Participant invitation not found.");
    }
    const profiles = (await ctx.db.unsafe.query("SpeakerProfile", {
      eventId: invite.eventId,
      userId: ctx.auth.userId,
    })).filter((profile) => profile.orgId === invite.orgId);
    if (profiles.length === 0) {
      await ctx.db.unsafe.insert("SpeakerProfile", {
        orgId: invite.orgId as string,
        eventId: invite.eventId as string,
        userId: ctx.auth.userId,
        name: invite.name as string,
        email: normalizeSpeakerEmail(invite.email as string),
        status: "invited",
        claimStatus: "claimed",
        claimedAt: new Date().toISOString(),
      });
    }
    const consumedAt = new Date().toISOString();
    await ctx.db.unsafe.update("SubmissionParticipantInvite", args.inviteId, {
      status: "claimed",
      consumedAt,
    });
    return { id: args.inviteId, status: "claimed", consumedAt };
  },
});

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
