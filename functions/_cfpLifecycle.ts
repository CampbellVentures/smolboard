import type { MutationCtx } from "@pylonsync/functions";
import { cfpWindowState } from "../lib/cfp-window";
import {
  parseFields,
  parseRouting,
  mergeLegacyAnswers,
  pruneAnswers,
  routeSubmission,
  validateAnswers,
  type Answers,
} from "../lib/forms";
import { normalizeSpeakerEmail } from "../lib/speakers";
import { logActivity } from "../lib/activity";
import type { SubmissionParticipantSnapshot } from "../lib/submission-participants";

type Row = Record<string, unknown>;
type Ctx = MutationCtx<"required">;

export async function requireVerifiedCfpUser(ctx: Ctx) {
  const user = await ctx.db.unsafe.get("User", ctx.auth.userId);
  if (!user?.emailVerified || typeof user.email !== "string") {
    throw ctx.error("FORBIDDEN", "Verify your email with a magic code before saving a CFP draft.");
  }
  return user;
}

export async function requireOpenCfp(ctx: Ctx, formId: string, now = new Date().toISOString()) {
  const form = await ctx.db.unsafe.get("SubmissionForm", formId);
  if (!form) throw ctx.error("NOT_FOUND", "Submission form not found.");
  const event = await ctx.db.unsafe.get("Event", form.eventId as string);
  if (!event || event.orgId !== form.orgId) throw ctx.error("NOT_FOUND", "Submission form not found.");
  const state = cfpWindowState({
    eventStatus: String(event.cfpStatus),
    formStatus: String(form.status),
    opensAt: form.opensAt as string | undefined,
    closesAt: form.closesAt as string | undefined,
  }, now);
  if (state !== "open") throw ctx.error("FORBIDDEN", state === "upcoming" ? "This CFP has not opened yet." : "This CFP is closed.");
  return { form, event };
}

export function validatedDraftContent(
  ctx: Ctx,
  form: Row,
  input: { name: string; title: string; abstract?: string; answers?: unknown },
  final: boolean,
  previousAnswers?: unknown,
) {
  const name = input.name.trim();
  const title = input.title.trim();
  if (!name) throw ctx.error("INVALID_ARGS", "Your name is required.");
  if (!title) throw ctx.error("INVALID_ARGS", "A talk title is required.");
  if (title.length > 200) throw ctx.error("INVALID_ARGS", "Keep the title under 200 characters.");
  const fields = parseFields(safeParse(form.fieldsJson));
  const answers = mergeLegacyAnswers(
    fields,
    previousAnswers,
    pruneAnswers(fields, (input.answers ?? {}) as Answers),
  );
  if (final) {
    const errors = validateAnswers(fields, answers);
    if (errors.length > 0) throw ctx.error("INVALID_ARGS", errors.map((error) => error.message).join(" "));
  }
  return {
    name,
    title,
    abstract: input.abstract?.trim() || undefined,
    answersJson: answers,
    category: routeSubmission(parseRouting(safeParse(form.routingJson)), answers),
  };
}

export async function finalizeDraft(ctx: Ctx, draft: Row) {
  if (draft.ownerUserId !== ctx.auth.userId) throw ctx.error("NOT_FOUND", "CFP draft not found.");
  if (draft.lifecycle === "finalized" && draft.finalizedSubmissionId) {
    return { submissionId: draft.finalizedSubmissionId as string, portalPath: "/portal", alreadyFinalized: true };
  }
  const user = await requireVerifiedCfpUser(ctx);
  const { form, event } = await requireOpenCfp(ctx, draft.formId as string);
  if (
    draft.formId !== form.id || draft.eventId !== event.id || draft.orgId !== event.orgId
  ) throw ctx.error("NOT_FOUND", "CFP draft not found.");
  const content = validatedDraftContent(ctx, form, {
    name: String(draft.name ?? ""),
    title: String(draft.title ?? ""),
    abstract: draft.abstract as string | undefined,
    answers: draft.answersJson,
  }, true, draft.answersJson);
  const email = normalizeSpeakerEmail(user.email as string);
  const orgId = event.orgId as string;
  const eventId = event.id as string;
  const profiles = (await ctx.db.unsafe.query("SpeakerProfile", { eventId, userId: ctx.auth.userId }))
    .filter((profile) => profile.orgId === orgId && normalizeSpeakerEmail(profile.email as string) === email);
  let profile = profiles[0];
  if (!profile) {
    const id = await ctx.db.unsafe.insert("SpeakerProfile", {
      orgId,
      eventId,
      userId: ctx.auth.userId,
      name: content.name,
      email,
      status: "invited",
      claimStatus: "claimed",
      claimedAt: new Date().toISOString(),
    });
    profile = { id, userId: ctx.auth.userId, name: content.name, email };
  }
  const invites = (await ctx.db.unsafe.query("SubmissionParticipantInvite", { draftId: draft.id }))
    .filter((invite) => invite.orgId === orgId && invite.eventId === eventId && invite.ownerUserId === ctx.auth.userId);
  const pending = invites.filter((invite) => invite.status !== "claimed" || !invite.consumedAt);
  if (pending.length > 0) {
    throw ctx.error("CONFLICT", "Every co-presenter must verify and claim their invitation before finalization.");
  }
  const participants: SubmissionParticipantSnapshot[] = [{
    userId: ctx.auth.userId,
    name: content.name,
    email,
    roleLabel: "Primary presenter",
  }];
  for (const invite of invites) {
    const participant = await ctx.db.unsafe.get("User", invite.provisionalUserId as string);
    if (
      !participant?.emailVerified ||
      normalizeSpeakerEmail(participant.email as string) !== normalizeSpeakerEmail(invite.email as string)
    ) throw ctx.error("CONFLICT", "A co-presenter invitation is no longer verified.");
    participants.push({
      userId: invite.provisionalUserId as string,
      name: String(invite.name),
      email: normalizeSpeakerEmail(invite.email as string),
      roleLabel: String(invite.roleLabel),
    });
  }
  const now = new Date().toISOString();
  const submissionId = await ctx.db.unsafe.insert("Submission", {
    orgId,
    eventId,
    formId: form.id,
    speakerUserId: ctx.auth.userId,
    title: content.title,
    abstract: content.abstract,
    answersJson: content.answersJson,
    participantSnapshotJson: participants,
    category: content.category,
    status: "submitted",
    currentRound: 1,
    submittedAt: now,
    finalizedAt: now,
  });
  await ctx.db.unsafe.update("SubmissionDraft", draft.id as string, {
    lifecycle: "finalized",
    finalizedSubmissionId: submissionId,
    finalizedAt: now,
    updatedAt: now,
  });
  await ctx.auth.elevate({ admin: true, reason: "queue confirmation after authenticated CFP finalization" });
  await ctx.scheduler.runAfter(0, "sendTemplatedEmail", {
    eventId,
    templateKey: "submission_received",
    toEmail: email,
    vars: { speaker_name: content.name, talk_title: content.title },
  });
  await logActivity(ctx, {
    orgId,
    eventId,
    actorName: content.name,
    kind: "submission.created",
    message: `New submission: “${content.title}” by ${content.name}`,
    href: `/dashboard/events/${eventId}/abstracts`,
  });
  return { submissionId, portalPath: "/portal", alreadyFinalized: false };
}

export function safeParse(raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return undefined; }
}
