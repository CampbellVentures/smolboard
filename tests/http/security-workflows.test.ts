import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  anonymousClient,
  callFn,
  createTwoOrgFixture,
  entityList,
  entityUpdate,
  jsonRequest,
  publicFn,
} from "../helpers/http-fixtures";
import { startDisposablePylonServer, type DisposablePylonServer } from "../helpers/http-server";
import { loopbackRequest } from "../helpers/http-request";

let server: DisposablePylonServer;

beforeAll(async () => {
  server = await startDisposablePylonServer();
  const health = await loopbackRequest(`${server.baseUrl}/health`);
  expect(health.status).toBe(200);
}, 30_000);

afterAll(async () => {
  await server?.stop();
}, 10_000);

test("anonymous CFP submission is rejected while closed and accepted while open", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "cfp-gate");
  expect(fixture.a.id).not.toBe(fixture.b.id);
  expect(fixture.a.speakers[0].userId).not.toBe(fixture.b.speakers[0].userId);

  await callFn(fixture.a.owner, "saveSubmissionForm", {
    eventId: fixture.a.eventId,
    formId: fixture.a.formId,
    name: "Test CFP",
    slug: "test-cfp",
    status: "closed",
    fieldsJson: [],
  });
  const anon = anonymousClient(server.baseUrl);
  const closed = await jsonRequest(anon, "/api/fn/submitCfp", "POST", {
    formId: fixture.a.formId,
    name: "Anonymous Speaker",
    email: "cfp-gate-anonymous@example.test",
    title: "Closed Gate Talk",
    answers: {},
  });
  expect(closed.response.ok).toBe(false);

  await callFn(fixture.a.owner, "saveSubmissionForm", {
    eventId: fixture.a.eventId,
    formId: fixture.a.formId,
    name: "Test CFP",
    slug: "test-cfp",
    status: "open",
    fieldsJson: [],
  });
  const opened = await jsonRequest<{ submissionId: string }>(anon, "/api/fn/submitCfp", "POST", {
    formId: fixture.a.formId,
    name: "Anonymous Speaker",
    email: "cfp-gate-anonymous@example.test",
    title: "Open Gate Talk",
    answers: {},
  });
  expect(opened.response.status).toBe(200);
  expect(opened.body.submissionId).toBeTruthy();
}, 30_000);

test("speakers see their own submissions and tasks but not another speaker's rows", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "speaker-scope");
  const [speakerOne] = fixture.a.speakers;
  const submissions = await entityList<{ id: string }>(speakerOne, "Submission");
  const tasks = await entityList<{ id: string }>(speakerOne, "SpeakerTask");

  expect(submissions.map((row) => row.id)).toEqual([fixture.a.submissionIds[0]]);
  expect(tasks.map((row) => row.id)).toEqual([fixture.a.taskIds[0]]);

  const otherSubmission = await speakerOne.request(`/api/entities/Submission/${fixture.a.submissionIds[1]}`);
  const otherTask = await speakerOne.request(`/api/entities/SpeakerTask/${fixture.a.taskIds[1]}`);
  expect([403, 404]).toContain(otherSubmission.status);
  expect([403, 404]).toContain(otherTask.status);
}, 30_000);

test("generic members lose raw review access and designated reviewers see only assigned projections", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "member-scope");
  const ownRounds = await entityList<{ id: string }>(fixture.a.reviewer, "ReviewRound");
  expect(ownRounds).toEqual([]);

  const ownWrite = await jsonRequest(fixture.a.reviewer, "/api/fn/saveReviewRound", "POST", {
    eventId: fixture.a.eventId,
    roundId: fixture.a.roundId,
    roundNumber: 1,
    name: "Reviewer-mutated round",
    criteriaJson: [{ key: "quality", label: "Quality", max: 5 }],
    status: "open",
  });
  expect([400, 403]).toContain(ownWrite.response.status);

  const foreignWrite = await entityUpdate(fixture.a.reviewer, "ReviewRound", fixture.b.roundId, {
    name: "Foreign mutation",
  });
  expect([403, 404]).toContain(foreignWrite.status);

  const peerReview = await jsonRequest<{ id: string }>(fixture.a.owner, "/api/fn/saveReview", "POST", {
    eventId: fixture.a.eventId,
    submissionId: fixture.a.submissionIds[0],
    roundId: fixture.a.roundId,
    scoresJson: { quality: 4 },
    comment: "Visible peer comment",
    recommendation: "accept",
  });
  expect(peerReview.response.status).toBe(200);

  const visibleSubmissions = await entityList<{ id: string }>(fixture.a.reviewer, "Submission");
  const visibleProfiles = await entityList<{ id: string; email: string }>(fixture.a.reviewer, "SpeakerProfile");
  const visibleReviews = await entityList<{ id: string; comment?: string }>(fixture.a.reviewer, "Review");
  expect(visibleSubmissions).toEqual([]);
  expect(visibleProfiles).toEqual([]);
  expect(visibleReviews).toEqual([]);

  await callFn(fixture.a.owner, "setReviewerMembership", {
    orgId: fixture.a.id,
    userId: fixture.a.reviewer.userId,
    active: true,
  });
  await callFn(fixture.a.owner, "setReviewRoundReviewer", {
    eventId: fixture.a.eventId,
    roundId: fixture.a.roundId,
    reviewerUserId: fixture.a.reviewer.userId,
    active: true,
  });
  await callFn(fixture.a.owner, "assignReview", {
    eventId: fixture.a.eventId,
    roundId: fixture.a.roundId,
    submissionId: fixture.a.submissionIds[0],
    reviewerUserId: fixture.a.reviewer.userId,
  });
  const queue = await callFn<{ items: Array<{ submission: { id: string }; author?: unknown; peerReviews?: unknown[] }> }>(
    fixture.a.reviewer,
    "getReviewerQueue",
    { orgId: fixture.a.id },
  );
  expect(queue.items.map((item) => item.submission.id)).toEqual([fixture.a.submissionIds[0]]);
  expect(queue.items[0].author).toBeUndefined();
  expect(queue.items[0].peerReviews).toBeUndefined();
}, 30_000);

test("cross-tenant child anchors are denied while derived same-tenant writes pass", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "anchor-scope");

  const forgedForm = await jsonRequest(fixture.a.owner, "/api/fn/saveSubmissionForm", "POST", {
    eventId: fixture.b.eventId,
    name: "Forged form",
    slug: "forged-form",
    status: "draft",
    fieldsJson: [],
  });
  expect(forgedForm.response.ok).toBe(false);

  const forgedFile = await jsonRequest(fixture.a.speakers[0], "/api/fn/attachSpeakerFile", "POST", {
    profileId: fixture.b.profileIds[0],
    kind: "slides",
    fileId: "forged-file-id",
    label: "forged.pdf",
  });
  expect(forgedFile.response.ok).toBe(false);

  const forgedReview = await jsonRequest(fixture.a.owner, "/api/fn/saveReview", "POST", {
    eventId: fixture.a.eventId,
    submissionId: fixture.b.submissionIds[0],
    roundId: fixture.a.roundId,
    scoresJson: { quality: 1 },
  });
  expect(forgedReview.response.ok).toBe(false);

  const [foreignRoom] = await entityList<{ id: string }>(fixture.b.owner, "Room");
  const forgedSession = await jsonRequest(fixture.a.owner, "/api/fn/saveSession", "POST", {
    eventId: fixture.a.eventId,
    data: {
      title: "Forged session",
      submissionId: fixture.a.submissionIds[0],
      roomId: foreignRoom.id,
      speakerUserIdsJson: [fixture.a.speakers[0].userId],
      kind: "talk",
    },
  });
  expect(forgedSession.response.ok).toBe(false);

  const forgedTemplate = await jsonRequest(fixture.a.owner, "/api/fn/saveTaskTemplate", "POST", {
    eventId: fixture.b.eventId,
    title: "Forged task",
    kind: "confirm",
    appliesTo: "all",
  });
  expect(forgedTemplate.response.ok).toBe(false);

  const [foreignTemplate] = await entityList<{ id: string }>(fixture.b.owner, "TaskTemplate");
  const forgedTask = await jsonRequest(fixture.a.owner, "/api/entities/SpeakerTask", "POST", {
    orgId: fixture.a.id,
    eventId: fixture.a.eventId,
    taskTemplateId: foreignTemplate.id,
    speakerUserId: fixture.a.speakers[0].userId,
    status: "pending",
  });
  expect(forgedTask.response.status).toBe(403);

  const directForm = await jsonRequest(fixture.a.owner, "/api/entities/SubmissionForm", "POST", {
    orgId: fixture.a.id,
    eventId: fixture.a.eventId,
    name: "Direct form",
    slug: "direct-form",
    status: "draft",
  });
  expect(directForm.response.status).toBe(403);

  const validForm = await callFn<{ id: string }>(fixture.a.owner, "saveSubmissionForm", {
    eventId: fixture.a.eventId,
    name: "Derived form",
    slug: "derived-form",
    status: "draft",
    fieldsJson: [],
  });
  expect(validForm.id).toBeTruthy();

  const validFile = await callFn<{ id: string }>(fixture.a.speakers[0], "attachSpeakerFile", {
    profileId: fixture.a.profileIds[0],
    kind: "slides",
    fileId: "valid-file-id",
    label: "valid.pdf",
  });
  expect(validFile.id).toBeTruthy();
}, 30_000);

test("public schedule hides rows until publication and exposes them after publication", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "schedule-gate");
  const args = { orgSlug: fixture.a.slug, eventSlug: fixture.a.eventSlug };
  const hidden = await publicFn<{ published: boolean; sessions: unknown[] }>(
    server.baseUrl,
    "getPublicSchedule",
    args,
  );
  expect(hidden.response.status).toBe(200);
  expect(hidden.body.published).toBe(false);
  expect(hidden.body.sessions).toEqual([]);

  expect((await entityUpdate(fixture.a.owner, "Event", fixture.a.eventId, { schedulePublished: true })).status).toBe(200);
  const published = await publicFn<{ published: boolean; sessions: { id: string; title: string }[] }>(
    server.baseUrl,
    "getPublicSchedule",
    args,
  );
  expect(published.response.status).toBe(200);
  expect(published.body.published).toBe(true);
  expect(published.body.sessions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: fixture.a.sessionId, title: "A Published Session" }),
    ]),
  );
}, 30_000);
