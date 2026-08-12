import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  callFn,
  createTwoOrgFixture,
  entityList,
  entityUpdate,
  jsonRequest,
} from "../helpers/http-fixtures";
import { startDisposablePylonServer, type DisposablePylonServer } from "../helpers/http-server";
import { loopbackRequest } from "../helpers/http-request";

let server: DisposablePylonServer;

beforeAll(async () => {
  server = await startDisposablePylonServer();
  expect((await loopbackRequest(`${server.baseUrl}/health`)).status).toBe(200);
}, 30_000);

afterAll(async () => {
  await server?.stop();
}, 10_000);

test("review assignments enforce designation, blind projections, validation, progress, recusal, reminders, and export", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "review-workflow");
  const { a, b } = fixture;

  const undesignated = await jsonRequest(a.reviewer, "/api/fn/getReviewerQueue", "POST", {
    orgId: a.id,
  });
  expect([400, 403]).toContain(undesignated.response.status);
  const unauthorizedDesignation = await jsonRequest(a.reviewer, "/api/fn/setReviewerMembership", "POST", {
    orgId: a.id,
    userId: a.reviewer.userId,
    active: true,
  });
  expect([400, 403]).toContain(unauthorizedDesignation.response.status);
  const foreignDesignation = await jsonRequest(a.owner, "/api/fn/setReviewerMembership", "POST", {
    orgId: b.id,
    userId: b.reviewer.userId,
    active: true,
  });
  expect([400, 403]).toContain(foreignDesignation.response.status);

  await callFn(a.owner, "setReviewerMembership", {
    orgId: a.id,
    userId: a.reviewer.userId,
    active: true,
  });
  const deniedOrganizerCalls: Array<[string, Record<string, unknown>]> = [
    ["agentGetSubmission", { submissionId: a.submissionIds[0] }],
    ["agentListSubmissions", { eventId: a.eventId }],
    ["saveSession", { eventId: a.eventId, data: { title: "Reviewer-created session" } }],
    ["saveSubmissionForm", {
      eventId: a.eventId,
      name: "Reviewer-created form",
      slug: "reviewer-created-form",
      status: "draft",
      fieldsJson: [],
    }],
    ["saveTaskTemplate", {
      eventId: a.eventId,
      title: "Reviewer-created task",
      kind: "confirm",
      appliesTo: "all",
    }],
    ["setSubmissionStatus", { submissionId: a.submissionIds[0], status: "in_review" }],
  ];
  for (const [name, args] of deniedOrganizerCalls) {
    const denied = await jsonRequest(a.reviewer, `/api/fn/${name}`, "POST", args);
    expect([400, 403]).toContain(denied.response.status);
  }
  const ownerDetail = await callFn<{ submissionId: string }>(a.owner, "agentGetSubmission", {
    submissionId: a.submissionIds[0],
  });
  expect(ownerDetail.submissionId).toBe(a.submissionIds[0]);
  const ownerList = await callFn<{ count: number }>(a.owner, "agentListSubmissions", {
    eventId: a.eventId,
  });
  expect(ownerList.count).toBe(2);
  expect((await callFn<{ status: string }>(a.owner, "setSubmissionStatus", {
    submissionId: a.submissionIds[0],
    status: "in_review",
    notify: false,
  })).status).toBe("in_review");
  await callFn(a.owner, "setSubmissionStatus", {
    submissionId: a.submissionIds[0],
    status: "submitted",
    notify: false,
  });
  await callFn(a.owner, "saveReviewRound", {
    eventId: a.eventId,
    roundId: a.roundId,
    roundNumber: 1,
    name: "Typed review",
    criteriaJson: [
      { key: "quality", label: "Quality", type: "numeric", min: 0, max: 10, weight: 2, required: true },
      { key: "format", label: "Format", type: "select", options: ["talk", "workshop"], required: true },
      { key: "notes", label: "Notes", type: "text", required: true },
    ],
    status: "open",
    anonymized: true,
    revealPeerReviews: false,
  });
  await callFn(a.owner, "setReviewRoundReviewer", {
    eventId: a.eventId,
    roundId: a.roundId,
    reviewerUserId: a.reviewer.userId,
    active: true,
  });
  const first = await callFn<{ id: string }>(a.owner, "assignReview", {
    eventId: a.eventId,
    roundId: a.roundId,
    submissionId: a.submissionIds[0],
    reviewerUserId: a.reviewer.userId,
  });
  const second = await callFn<{ id: string }>(a.owner, "assignReview", {
    eventId: a.eventId,
    roundId: a.roundId,
    submissionId: a.submissionIds[1],
    reviewerUserId: a.reviewer.userId,
  });

  const progressBefore = await callFn<{ complete: number; total: number }>(a.owner, "getReviewProgress", {
    eventId: a.eventId,
    roundId: a.roundId,
  });
  expect(progressBefore).toMatchObject({ complete: 0, total: 2 });

  const peer = await callFn<{ id: string }>(a.owner, "saveReview", {
    eventId: a.eventId,
    submissionId: a.submissionIds[0],
    roundId: a.roundId,
    scoresJson: { quality: 6 },
    comment: "Organizer-only peer review",
    recommendation: "neutral",
  });
  expect(peer.id).toBeTruthy();

  const blindQueue = await callFn<{
    items: Array<{
      assignmentId: string;
      submission: { id: string; answers?: unknown };
      author?: unknown;
      peerReviews?: unknown[];
      round: { criteria: Array<{ type: string; weight: number }> };
    }>;
  }>(a.reviewer, "getReviewerQueue", { orgId: a.id, eventId: a.eventId });
  expect(blindQueue.items.map((item) => item.submission.id).sort()).toEqual([...a.submissionIds].sort());
  expect(blindQueue.items.every((item) => item.author === undefined && item.submission.answers === undefined)).toBe(true);
  expect(blindQueue.items.every((item) => item.peerReviews === undefined)).toBe(true);
  expect(blindQueue.items[0].round.criteria).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "numeric", weight: 2 }),
    expect.objectContaining({ type: "select", weight: 1 }),
    expect.objectContaining({ type: "text", weight: 1 }),
  ]));

  const invalid = await jsonRequest(a.reviewer, "/api/fn/submitReview", "POST", {
    assignmentId: first.id,
    scoresJson: { quality: 11, format: "panel" },
  });
  expect(invalid.response.status).toBe(400);

  const reminders = await callFn<{ queued: number }>(a.owner, "sendReviewReminders", {
    eventId: a.eventId,
    roundId: a.roundId,
  });
  expect(reminders.queued).toBe(1);

  for (const assignmentId of [first.id, second.id]) {
    await callFn(a.reviewer, "submitReview", {
      assignmentId,
      scoresJson: { quality: 8, format: "talk", notes: "Actionable notes" },
      comment: "Private notes",
      recommendation: "accept",
    });
  }
  const progressAfter = await callFn<{ complete: number; total: number; percent: number }>(
    a.owner,
    "getReviewProgress",
    { eventId: a.eventId, roundId: a.roundId },
  );
  expect(progressAfter).toMatchObject({ complete: 2, total: 2, percent: 100 });

  await callFn(a.owner, "saveReviewRound", {
    eventId: a.eventId,
    roundId: a.roundId,
    roundNumber: 1,
    name: "Typed review",
    criteriaJson: [
      { key: "quality", label: "Quality", type: "numeric", min: 0, max: 10, weight: 2, required: true },
      { key: "format", label: "Format", type: "select", options: ["talk", "workshop"], required: true },
      { key: "notes", label: "Notes", type: "text", required: true },
    ],
    status: "open",
    anonymized: false,
    revealPeerReviews: true,
  });
  const revealed = await callFn<{
    items: Array<{ submission: { id: string; answers?: unknown }; author?: { email: string }; peerReviews?: unknown[] }>;
  }>(a.reviewer, "getReviewerQueue", { orgId: a.id, eventId: a.eventId });
  const revealedFirst = revealed.items.find((item) => item.submission.id === a.submissionIds[0]);
  expect(revealedFirst?.author?.email).toBe(a.speakers[0].email);
  expect(revealedFirst?.submission.answers).toBeDefined();
  expect(revealedFirst?.peerReviews?.length).toBe(1);

  const csv = await callFn<{ filename: string; csv: string }>(a.owner, "exportReviewCsv", {
    eventId: a.eventId,
    roundId: a.roundId,
  });
  expect(csv.filename.endsWith(".csv")).toBe(true);
  expect(csv.csv).toContain("submission_id,submission_title");
  expect(csv.csv).toContain(a.reviewer.email);

  const recusalRound = await callFn<{ id: string }>(a.owner, "saveReviewRound", {
    eventId: a.eventId,
    roundNumber: 2,
    name: "Recusal round",
    criteriaJson: [{ key: "quality", label: "Quality", max: 5 }],
    status: "open",
  });
  await callFn(a.owner, "setReviewerMembership", {
    orgId: a.id,
    userId: a.owner.userId,
    active: true,
  });
  for (const submissionId of a.submissionIds) {
    expect((await entityUpdate(a.owner, "Submission", submissionId, { currentRound: 2 })).status).toBe(200);
  }
  const balanced = await callFn<{ created: number; submissions: number; reviewers: number }>(
    a.owner,
    "bulkAssignReviews",
    {
    eventId: a.eventId,
    roundId: recusalRound.id,
      reviewerUserIds: [a.owner.userId, a.reviewer.userId],
      assignmentsPerSubmission: 1,
    },
  );
  expect(balanced).toEqual({ created: 2, submissions: 2, reviewers: 2 });
  const balancedAssignments = (await entityList<{
    id: string;
    roundId: string;
    reviewerUserId: string;
  }>(a.owner, "ReviewAssignment")).filter((assignment) => assignment.roundId === recusalRound.id);
  expect(new Set(balancedAssignments.map((assignment) => assignment.reviewerUserId)).size).toBe(2);
  const recusalAssignment = balancedAssignments.find(
    (assignment) => assignment.reviewerUserId === a.reviewer.userId,
  );
  expect(recusalAssignment).toBeDefined();
  await callFn(a.reviewer, "recuseReview", {
    assignmentId: recusalAssignment!.id,
    reason: "Conflict of interest",
  });
  const recusalProgress = await callFn<{
    complete: number;
    total: number;
    reviewers: Array<{ userId: string; recused: number }>;
  }>(
    a.owner,
    "getReviewProgress",
    { eventId: a.eventId, roundId: recusalRound.id },
  );
  expect(recusalProgress).toMatchObject({ complete: 0, total: 1 });
  expect(
    recusalProgress.reviewers.find((reviewer) => reviewer.userId === a.reviewer.userId)?.recused,
  ).toBe(1);

  const disposableRound = await callFn<{ id: string }>(a.owner, "saveReviewRound", {
    eventId: a.eventId,
    roundNumber: 3,
    name: "Disposable round",
    criteriaJson: [{ key: "quality", label: "Quality", max: 5 }],
    status: "closed",
  });
  expect(await callFn(a.owner, "deleteReviewRound", {
    eventId: a.eventId,
    roundId: disposableRound.id,
  })).toEqual({ id: disposableRound.id, deleted: true });

  expect(await entityList(a.reviewer, "Submission")).toEqual([]);
  expect(await entityList(a.reviewer, "Review")).toEqual([]);
  const foreignQueue = await jsonRequest(a.reviewer, "/api/fn/getReviewerQueue", "POST", { orgId: b.id });
  expect([400, 403]).toContain(foreignQueue.response.status);
}, 30_000);

test("an organizer can dismiss the AI first pass, and only an organizer can", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "triage-dismiss");
  const submissionId = fixture.a.submissionIds[0];

  // Nothing to dismiss until a triage result exists.
  const empty = await jsonRequest(fixture.a.owner, "/api/fn/dismissTriage", "POST", { submissionId });
  expect(empty.response.ok).toBe(false);

  // recordTriage is internal, so seed the row the way the entity API would.
  // The Submission policy lets an owner write these columns directly.
  expect(
    (await entityUpdate(fixture.a.owner, "Submission", submissionId, {
      triageScore: 4.2,
      triageSummary: "Strong premise, thin on evidence.",
      triageAt: "2026-08-12T12:00:00.000Z",
    })).status,
  ).toBe(200);
  const scored = (await entityList<{ id: string; triageScore?: number; triageAt?: string }>(
    fixture.a.owner,
    "Submission",
  )).find((row) => row.id === submissionId)!;
  expect(scored.triageScore).toBeCloseTo(4.2);

  const foreign = await jsonRequest(fixture.b.owner, "/api/fn/dismissTriage", "POST", { submissionId });
  expect(foreign.response.ok).toBe(false);

  await callFn(fixture.a.owner, "dismissTriage", { submissionId });
  const cleared = (await entityList<{ id: string; triageScore?: number; triageSummary?: string; triageAt?: string }>(
    fixture.a.owner,
    "Submission",
  )).find((row) => row.id === submissionId)!;
  // null, not undefined: an update ignores undefined and would leave the score
  // on screen while reporting success.
  expect(cleared.triageScore ?? null).toBeNull();
  expect(cleared.triageSummary ?? null).toBeNull();
  expect(cleared.triageAt ?? null).toBeNull();
}, 30_000);
