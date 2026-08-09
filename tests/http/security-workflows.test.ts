import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  anonymousClient,
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

  expect((await entityUpdate(fixture.a.owner, "SubmissionForm", fixture.a.formId, { status: "closed" })).status).toBe(200);
  const anon = anonymousClient(server.baseUrl);
  const closed = await jsonRequest(anon, "/api/fn/submitCfp", "POST", {
    formId: fixture.a.formId,
    name: "Anonymous Speaker",
    email: "cfp-gate-anonymous@example.test",
    title: "Closed Gate Talk",
    answers: {},
  });
  expect(closed.response.ok).toBe(false);

  expect((await entityUpdate(fixture.a.owner, "SubmissionForm", fixture.a.formId, { status: "open" })).status).toBe(200);
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

test("org members are tenant-scoped, while current reviewer permissions allow own-org review administration", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "member-scope");
  const ownRounds = await entityList<{ id: string }>(fixture.a.reviewer, "ReviewRound");
  expect(ownRounds.map((row) => row.id)).toContain(fixture.a.roundId);
  expect(ownRounds.map((row) => row.id)).not.toContain(fixture.b.roundId);

  // Characterization vulnerability for plan 002: a generic reviewer/member can
  // administer review rounds in their workspace. Flip this expectation after
  // organizer/reviewer authorization is separated.
  const ownWrite = await entityUpdate(fixture.a.reviewer, "ReviewRound", fixture.a.roundId, {
    name: "Reviewer-mutated round",
  });
  expect(ownWrite.status).toBe(200);

  const foreignWrite = await entityUpdate(fixture.a.reviewer, "ReviewRound", fixture.b.roundId, {
    name: "Foreign mutation",
  });
  expect([403, 404]).toContain(foreignWrite.status);

  const peerReview = await jsonRequest<{ id: string }>(fixture.a.owner, "/api/entities/Review", "POST", {
    orgId: fixture.a.id,
    eventId: fixture.a.eventId,
    submissionId: fixture.a.submissionIds[0],
    roundId: fixture.a.roundId,
    reviewerUserId: fixture.a.owner.userId,
    scoresJson: { quality: 4 },
    comment: "Visible peer comment",
    recommendation: "accept",
  });
  expect(peerReview.response.status).toBe(201);

  // Characterization vulnerabilities for plan 002: the reviewer currently sees
  // every submission, speaker identity, and peer review in the workspace.
  const visibleSubmissions = await entityList<{ id: string }>(fixture.a.reviewer, "Submission");
  const visibleProfiles = await entityList<{ id: string; email: string }>(fixture.a.reviewer, "SpeakerProfile");
  const visibleReviews = await entityList<{ id: string; comment?: string }>(fixture.a.reviewer, "Review");
  expect(visibleSubmissions.map((row) => row.id)).toEqual(expect.arrayContaining(fixture.a.submissionIds));
  expect(visibleProfiles.map((row) => row.id)).toEqual(expect.arrayContaining(fixture.a.profileIds));
  expect(visibleProfiles.some((row) => row.email === fixture.a.speakers[0].email)).toBe(true);
  expect(visibleReviews.some((row) => row.comment === "Visible peer comment")).toBe(true);
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
