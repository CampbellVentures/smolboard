import { mutation, v } from "@pylonsync/functions";
import { requireOpenCfp, requireVerifiedCfpUser } from "./_cfpLifecycle";
import { isValidSpeakerEmail, normalizeSpeakerEmail } from "../lib/speakers";

export default mutation({
  args: {
    draftId: v.id("SubmissionDraft"),
    name: v.string(),
    email: v.string(),
    roleLabel: v.string(),
  },
  async handler(ctx, args) {
    const owner = await requireVerifiedCfpUser(ctx);
    const draft = await ctx.db.unsafe.get("SubmissionDraft", args.draftId);
    if (!draft || draft.ownerUserId !== ctx.auth.userId || draft.lifecycle !== "draft") {
      throw ctx.error("NOT_FOUND", "CFP draft not found.");
    }
    await requireOpenCfp(ctx, draft.formId as string);
    const name = args.name.trim();
    const email = normalizeSpeakerEmail(args.email);
    const roleLabel = args.roleLabel.trim();
    if (!name || !isValidSpeakerEmail(email) || !roleLabel) {
      throw ctx.error("INVALID_ARGS", "Participant name, valid email, and role are required.");
    }
    if (normalizeSpeakerEmail(owner.email as string) === email) {
      throw ctx.error("INVALID_ARGS", "The primary presenter is already included.");
    }
    const users = (await ctx.db.unsafe.list("User"))
      .filter((user) => normalizeSpeakerEmail(user.email as string) === email);
    if (users.length > 1) throw ctx.error("CONFLICT", "Multiple legacy users match this participant email.");
    const provisionalUserId = users[0]
      ? users[0].id as string
      : await ctx.db.unsafe.insert("User", { email, displayName: name });
    const token = randomToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
    const existing = (await ctx.db.unsafe.query("SubmissionParticipantInvite", { draftId: args.draftId, email }))[0];
    let id: string;
    if (existing) {
      if (existing.status === "claimed") throw ctx.error("CONFLICT", "This participant already claimed their invitation.");
      id = existing.id as string;
      await ctx.db.unsafe.update("SubmissionParticipantInvite", id, {
        provisionalUserId,
        name,
        roleLabel,
        tokenHash,
        expiresAt,
        status: "pending",
        consumedAt: undefined,
      });
    } else {
      id = await ctx.db.unsafe.insert("SubmissionParticipantInvite", {
        orgId: draft.orgId as string,
        eventId: draft.eventId as string,
        formId: draft.formId as string,
        draftId: args.draftId,
        ownerUserId: ctx.auth.userId,
        provisionalUserId,
        email,
        name,
        roleLabel,
        tokenHash,
        status: "pending",
        expiresAt,
      });
    }
    await ctx.auth.elevate({ admin: true, reason: "queue participant invitation after authenticated draft owner request" });
    await ctx.scheduler.runAfter(0, "sendParticipantInviteEmail", {
      toEmail: email,
      participantName: name,
      inviteId: id,
      token,
    });
    return { id, provisionalUserId, status: "pending", expiresAt, token };
  },
});

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
