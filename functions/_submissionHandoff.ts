import type { MutationCtx } from "@pylonsync/functions";
import { materializeSubmissionData } from "../lib/submission-handoff";

export async function canonicalSessionForSubmission(
  ctx: MutationCtx<"required">,
  event: Record<string, unknown>,
  submissionId: string,
) {
  const submission = await ctx.db.unsafe.get("Submission", submissionId);
  if (!submission || submission.eventId !== event.id || submission.orgId !== event.orgId) {
    throw ctx.error("NOT_FOUND", "Submission not found.");
  }
  if (submission.status !== "accepted") {
    throw ctx.error("CONFLICT", "Only accepted submissions can become agenda sessions.");
  }
  const form = await ctx.db.unsafe.get("SubmissionForm", submission.formId as string);
  if (!form || form.eventId !== event.id || form.orgId !== event.orgId) {
    throw ctx.error("NOT_FOUND", "Submission form not found.");
  }
  const tracks = (await ctx.db.unsafe.query("Track", { eventId: event.id }))
    .filter((track) => track.orgId === event.orgId);
  const result = materializeSubmissionData({
    submission: {
      id: submission.id as string,
      title: submission.title as string,
      abstract: submission.abstract as string | undefined,
      speakerUserId: submission.speakerUserId as string,
      answersJson: submission.answersJson,
      participantSnapshotJson: submission.participantSnapshotJson,
    },
    configRaw: form.handoffMappingsJson,
    validTrackIds: new Set(tracks.map((track) => track.id as string)),
  });
  return { submission, result };
}
