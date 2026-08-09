import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  anonymousClient,
  callFn,
  createTwoOrgFixture,
  entityList,
  entityUpdate,
  jsonRequest,
  magicSignIn,
} from "../helpers/http-fixtures";
import { startDisposablePylonServer, type DisposablePylonServer } from "../helpers/http-server";
import { loopbackRequest } from "../helpers/http-request";
import type { SubmissionParticipantSnapshot } from "../../lib/submission-participants";

let server: DisposablePylonServer;

beforeAll(async () => {
  server = await startDisposablePylonServer();
  expect((await loopbackRequest(`${server.baseUrl}/health`)).status).toBe(200);
}, 30_000);

afterAll(async () => {
  await server?.stop();
}, 10_000);

test("verified drafts, participant claims, reviewer projection, and canonical agenda handoff stay lossless", async () => {
  const { a } = await createTwoOrgFixture(server.baseUrl, "cfp-lifecycle");
  const primary = a.speakers[0];
  const otherSpeaker = a.speakers[1];
  const opensAt = "2026-01-01T00:00:00.000Z";
  const closesAt = "2028-01-01T00:00:00.000Z";
  const fields = [
    { key: "format", type: "select", label: "Format", options: ["Hands-on workshop"], required: true },
    { key: "track", type: "select", label: "Track", options: ["Platform"], required: true },
    { key: "legacy", type: "short_text", label: "Legacy detail" },
  ];
  const currentFields = fields.filter((field) => field.key !== "legacy");
  await callFn(a.owner, "saveSubmissionForm", {
    eventId: a.eventId,
    formId: a.formId,
    name: "Test CFP",
    slug: "test-cfp",
    status: "open",
    opensAt,
    closesAt,
    fieldsJson: fields,
    handoffMappingsJson: {
      formatFieldKey: "format",
      formatValues: {},
      trackFieldKey: "track",
      trackValues: {},
    },
  });

  const anonymousDraft = await jsonRequest(anonymousClient(server.baseUrl), "/api/fn/saveCfpDraft", "POST", {
    formId: a.formId,
    name: "Anonymous",
    title: "Must not persist",
    answers: {},
  });
  expect(anonymousDraft.response.status).toBe(401);

  const draft = await callFn<{ id: string; created: boolean }>(primary, "saveCfpDraft", {
    formId: a.formId,
    name: "Primary Presenter",
    title: "Canonical Lifecycle Talk",
    abstract: "A complete abstract that must reach the agenda.",
    answers: { format: "Hands-on workshop", track: "Platform", legacy: "retain exactly" },
  });
  expect(draft.created).toBe(true);
  const resumed = await callFn<{ id: string; lifecycle: string; answersJson: Record<string, string> }[]>(
    primary,
    "listMyCfpDrafts",
    { formId: a.formId },
  );
  expect(resumed.find((row) => row.id === draft.id)).toEqual(expect.objectContaining({
    id: draft.id,
    lifecycle: "draft",
    answersJson: expect.objectContaining({ legacy: "retain exactly" }),
  }));

  const stolenDraft = await jsonRequest(otherSpeaker, "/api/fn/saveCfpDraft", "POST", {
    formId: a.formId,
    draftId: draft.id,
    name: "Other",
    title: "Stolen",
    answers: { format: "Hands-on workshop", track: "Platform" },
  });
  expect([400, 404]).toContain(stolenDraft.response.status);

  const participantEmail = "cfp-lifecycle-copresenter@example.test";
  const invitation = await callFn<{
    id: string;
    provisionalUserId: string;
    token: string;
  }>(primary, "inviteSubmissionParticipant", {
    draftId: draft.id,
    name: "Co Presenter",
    email: participantEmail,
    roleLabel: "Workshop facilitator",
  });
  const wrongClaim = await jsonRequest(otherSpeaker, "/api/fn/claimSubmissionParticipant", "POST", {
    inviteId: invitation.id,
    token: invitation.token,
    expectedProvisionalUserId: invitation.provisionalUserId,
  });
  expect([400, 404]).toContain(wrongClaim.response.status);

  const coPresenter = await magicSignIn(server.baseUrl, participantEmail);
  expect(coPresenter.userId).toBe(invitation.provisionalUserId);
  const claimed = await callFn<{ status: string }>(coPresenter, "claimSubmissionParticipant", {
    inviteId: invitation.id,
    token: invitation.token,
    expectedProvisionalUserId: invitation.provisionalUserId,
  });
  expect(claimed.status).toBe("claimed");
  const reusedClaim = await jsonRequest(coPresenter, "/api/fn/claimSubmissionParticipant", "POST", {
    inviteId: invitation.id,
    token: invitation.token,
    expectedProvisionalUserId: invitation.provisionalUserId,
  });
  expect([400, 409]).toContain(reusedClaim.response.status);
  expect(await callFn<Array<{ id: string; status: string; roleLabel: string }>>(
    primary,
    "listDraftParticipants",
    { draftId: draft.id },
  )).toEqual([expect.objectContaining({ id: invitation.id, status: "claimed", roleLabel: "Workshop facilitator" })]);

  const finalized = await callFn<{ submissionId: string; alreadyFinalized: boolean }>(
    primary,
    "finalizeCfpDraft",
    { draftId: draft.id },
  );
  expect(finalized.alreadyFinalized).toBe(false);
  expect((await callFn<{ submissionId: string; alreadyFinalized: boolean }>(
    primary,
    "finalizeCfpDraft",
    { draftId: draft.id },
  ))).toMatchObject({ submissionId: finalized.submissionId, alreadyFinalized: true });

  const finalizedEdit = await jsonRequest(primary, "/api/fn/saveCfpDraft", "POST", {
    formId: a.formId,
    draftId: draft.id,
    name: "Primary Presenter",
    title: "Changed after finalization",
    answers: { format: "Hands-on workshop", track: "Platform" },
  });
  expect([400, 409]).toContain(finalizedEdit.response.status);

  type Submission = {
    id: string;
    title: string;
    abstract?: string;
    answersJson: Record<string, string>;
    participantSnapshotJson: SubmissionParticipantSnapshot[];
  };
  const beforeHandoff = (await entityList<Submission>(a.owner, "Submission"))
    .find((submission) => submission.id === finalized.submissionId)!;
  expect(beforeHandoff.answersJson).toMatchObject({ legacy: "retain exactly" });
  expect(beforeHandoff.participantSnapshotJson).toEqual([
    expect.objectContaining({ userId: primary.userId, roleLabel: "Primary presenter" }),
    expect.objectContaining({ userId: coPresenter.userId, roleLabel: "Workshop facilitator" }),
  ]);
  const snapshotRewrite = await entityUpdate(primary, "Submission", finalized.submissionId, {
    participantSnapshotJson: [],
  });
  expect(snapshotRewrite.ok).toBe(false);
  await callFn(a.owner, "saveSubmissionForm", {
    eventId: a.eventId,
    formId: a.formId,
    name: "Test CFP",
    slug: "test-cfp",
    status: "open",
    opensAt,
    closesAt,
    fieldsJson: currentFields,
    handoffMappingsJson: {
      formatFieldKey: "format",
      formatValues: {},
      trackFieldKey: "track",
      trackValues: {},
    },
  });
  await callFn(primary, "updateMySubmission", {
    submissionId: finalized.submissionId,
    title: beforeHandoff.title,
    abstract: beforeHandoff.abstract,
    answers: { format: "Hands-on workshop", track: "Platform" },
  });
  expect((await entityList<Submission>(a.owner, "Submission"))
    .find((submission) => submission.id === finalized.submissionId)!.answersJson)
    .toMatchObject({ legacy: "retain exactly" });

  await callFn(a.owner, "setSubmissionStatus", {
    submissionId: finalized.submissionId,
    status: "accepted",
    notify: false,
  });
  const unresolved = await callFn<{
    materialized: boolean;
    unresolved: Array<{ dimension: string; value?: string }>;
  }>(a.owner, "materializeSubmissionSession", {
    eventId: a.eventId,
    submissionId: finalized.submissionId,
  });
  expect(unresolved.materialized).toBe(false);
  expect(unresolved.unresolved).toEqual(expect.arrayContaining([
    expect.objectContaining({ dimension: "format", value: "Hands-on workshop" }),
    expect.objectContaining({ dimension: "track", value: "Platform" }),
  ]));

  const track = (await entityList<{ id: string; name: string }>(a.owner, "Track"))
    .find((row) => row.name === "Platform")!;
  const room = (await entityList<{ id: string; name: string }>(a.owner, "Room"))
    .find((row) => row.name === "Main Room")!;
  await callFn(a.owner, "saveSubmissionForm", {
    eventId: a.eventId,
    formId: a.formId,
    name: "Test CFP",
    slug: "test-cfp",
    status: "open",
    opensAt,
    closesAt,
    fieldsJson: currentFields,
    handoffMappingsJson: {
      formatFieldKey: "format",
      formatValues: { "Hands-on workshop": "workshop" },
      trackFieldKey: "track",
      trackValues: { Platform: track.id },
    },
  });
  const materialized = await callFn<{ materialized: boolean; sessionId: string }>(
    a.owner,
    "materializeSubmissionSession",
    { eventId: a.eventId, submissionId: finalized.submissionId },
  );
  expect(materialized.materialized).toBe(true);
  const canonical = (await entityList<{
    id: string;
    title: string;
    description?: string;
    kind: string;
    trackId?: string;
    speakerUserIdsJson: string[];
  }>(a.owner, "Session")).find((session) => session.id === materialized.sessionId)!;
  expect(canonical).toMatchObject({
    title: beforeHandoff.title,
    description: beforeHandoff.abstract,
    kind: "workshop",
    trackId: track.id,
    speakerUserIdsJson: [primary.userId, coPresenter.userId],
  });

  const agent = await callFn<{ scheduled: boolean; sessionId: string }>(a.owner, "agentScheduleSession", {
    eventId: a.eventId,
    submissionId: finalized.submissionId,
    roomName: room.name,
    startTime: "2027-05-13T18:00:00.000Z",
    durationMinutes: 45,
  });
  expect(agent).toMatchObject({ scheduled: true, sessionId: materialized.sessionId });
  const afterAgent = (await entityList<typeof canonical>(a.owner, "Session"))
    .find((session) => session.id === materialized.sessionId)!;
  expect(afterAgent).toMatchObject({
    title: canonical.title,
    description: canonical.description,
    kind: canonical.kind,
    trackId: canonical.trackId,
    speakerUserIdsJson: canonical.speakerUserIdsJson,
  });

  await callFn(a.owner, "setReviewerMembership", {
    orgId: a.id,
    userId: a.reviewer.userId,
    active: true,
  });
  await callFn(a.owner, "saveReviewRound", {
    eventId: a.eventId,
    roundId: a.roundId,
    roundNumber: 1,
    name: "Participant projection",
    status: "open",
    anonymized: true,
  });
  await callFn(a.owner, "setReviewRoundReviewer", {
    eventId: a.eventId,
    roundId: a.roundId,
    reviewerUserId: a.reviewer.userId,
    active: true,
  });
  await callFn(a.owner, "assignReview", {
    eventId: a.eventId,
    roundId: a.roundId,
    submissionId: finalized.submissionId,
    reviewerUserId: a.reviewer.userId,
  });
  type Queue = { items: Array<{ submission: { id: string; participants: Array<Record<string, string>> } }> };
  const blind = await callFn<Queue>(a.reviewer, "getReviewerQueue", { orgId: a.id, eventId: a.eventId });
  const blindParticipants = blind.items.find((item) => item.submission.id === finalized.submissionId)!.submission.participants;
  expect(blindParticipants).toEqual([
    { roleLabel: "Primary presenter" },
    { roleLabel: "Workshop facilitator" },
  ]);
  await callFn(a.owner, "saveReviewRound", {
    eventId: a.eventId,
    roundId: a.roundId,
    roundNumber: 1,
    name: "Participant projection",
    status: "open",
    anonymized: false,
  });
  const unblind = await callFn<Queue>(a.reviewer, "getReviewerQueue", { orgId: a.id, eventId: a.eventId });
  const visibleParticipants = unblind.items.find((item) => item.submission.id === finalized.submissionId)!.submission.participants;
  expect(visibleParticipants).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Primary Presenter", userId: primary.userId }),
    expect.objectContaining({ name: "Co Presenter", userId: coPresenter.userId }),
  ]));

  const lateDraft = await callFn<{ id: string }>(otherSpeaker, "saveCfpDraft", {
    formId: a.formId,
    name: "Late Presenter",
    title: "Saved before the deadline",
    answers: { format: "Hands-on workshop", track: "Platform" },
  });

  await callFn(a.owner, "saveSubmissionForm", {
    eventId: a.eventId,
    formId: a.formId,
    name: "Test CFP",
    slug: "test-cfp",
    status: "open",
    opensAt,
    closesAt: "2026-01-02T00:00:00.000Z",
    fieldsJson: currentFields,
    handoffMappingsJson: {
      formatFieldKey: "format",
      formatValues: { "Hands-on workshop": "workshop" },
      trackFieldKey: "track",
      trackValues: { Platform: track.id },
    },
  });
  const closedEdit = await jsonRequest(primary, "/api/fn/updateMySubmission", "POST", {
    submissionId: finalized.submissionId,
    title: "Too late",
    answers: { format: "Hands-on workshop", track: "Platform" },
  });
  expect([400, 403]).toContain(closedEdit.response.status);
  const closedFinalize = await jsonRequest(otherSpeaker, "/api/fn/finalizeCfpDraft", "POST", {
    draftId: lateDraft.id,
  });
  expect([400, 403]).toContain(closedFinalize.response.status);
  const afterClose = (await entityList<Submission>(a.owner, "Submission"))
    .find((submission) => submission.id === finalized.submissionId)!;
  expect(afterClose.answersJson).toMatchObject({ legacy: "retain exactly" });
  expect(afterClose.participantSnapshotJson).toEqual(beforeHandoff.participantSnapshotJson);
}, 30_000);
