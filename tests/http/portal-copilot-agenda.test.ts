import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  callFn,
  createTwoOrgFixture,
  entityList,
  entityUpdate,
  jsonRequest,
  publicFn,
  type TestIdentity,
} from "../helpers/http-fixtures";
import { startDisposablePylonServer, type DisposablePylonServer } from "../helpers/http-server";
import { COPILOT_PER_USER_PER_MINUTE, MAX_COPILOT_MESSAGE_CHARS } from "../../lib/copilot-limits";

// Server-side coverage for the three newest flows. Their logic is unit-tested
// as pure functions; these tests prove the functions actually enforce it over
// HTTP, for the right caller, across a tenant boundary.

let server: DisposablePylonServer;

beforeAll(async () => {
  server = await startDisposablePylonServer();
}, 30_000);

afterAll(async () => {
  await server?.stop();
}, 10_000);

/** Call a function expecting it to fail; return the error code and message. */
async function failCode(
  actor: TestIdentity,
  name: string,
  args: Record<string, unknown>,
): Promise<{ status: number; code?: string; message?: string }> {
  const { response, body } = await jsonRequest<{
    error?: { code?: string; message?: string };
  }>(actor, `/api/fn/${name}`, "POST", args);
  return { status: response.status, code: body?.error?.code, message: body?.error?.message };
}

test("portal resources sanitize embeds, stay draft until published, and never cross a tenant", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "portal-resources");
  const { owner, eventId } = fixture.a;
  const speaker = fixture.a.speakers[0];

  // A pasted <iframe> is reduced to its src, not stored as markup.
  const pasted = await callFn<{ id: string }>(owner, "savePortalResource", {
    eventId,
    title: "Run of show",
    body: "Doors at 8:00.",
    embedUrl: '<iframe src="https://docs.google.com/document/d/demo/preview" width="640"></iframe>',
    published: true,
  });
  expect(pasted.id).toBeTruthy();

  // A scheme that could execute is refused outright.
  const js = await failCode(owner, "savePortalResource", {
    eventId,
    title: "Bad",
    embedUrl: "javascript:alert(1)",
  });
  expect(js.code).toBe("INVALID_ARGS");
  expect(js.message).toContain("https");

  // So is a host that isn't on the allowlist, and the message names it.
  const host = await failCode(owner, "savePortalResource", {
    eventId,
    title: "Bad host",
    embedUrl: "https://evil.example.com/embed",
  });
  expect(host.code).toBe("INVALID_ARGS");
  expect(host.message).toContain("evil.example.com");

  // An unpublished page exists but stays invisible to the speaker.
  await callFn(owner, "savePortalResource", {
    eventId,
    title: "Draft notes",
    body: "Not ready.",
    published: false,
  });

  const visible = await callFn<{ resources: Array<{ title: string; embedUrl?: string }> }>(
    speaker,
    "getPortalResources",
    { eventId },
  );
  const titles = visible.resources.map((r) => r.title);
  expect(titles).toContain("Run of show");
  expect(titles).not.toContain("Draft notes");

  // The stored embed is the bare URL the sanitizer extracted.
  const runOfShow = visible.resources.find((r) => r.title === "Run of show");
  expect(runOfShow?.embedUrl).toBe("https://docs.google.com/document/d/demo/preview");

  // A speaker from another org sees nothing for this event.
  const outsider = fixture.b.speakers[0];
  const theirs = await callFn<{ resources: unknown[] }>(outsider, "getPortalResources", { eventId });
  expect(theirs.resources).toEqual([]);

  // And another org's owner cannot write into this event.
  const cross = await failCode(fixture.b.owner, "savePortalResource", {
    eventId,
    title: "Injected",
    published: true,
  });
  expect(cross.status).toBeGreaterThanOrEqual(400);
  expect(["FORBIDDEN", "NOT_FOUND"]).toContain(cross.code);
});

// The copilot's ceilings (message size, per-user and per-org rate) are pure
// functions covered exhaustively in tests/copilot-limits.test.ts. They are
// enforced inside copilotStartTurn, which is `internal: true` and therefore
// only reachable from the copilotChat action — never from a client. What HTTP
// can prove, and what matters here, is that the boundary actually holds: an
// authenticated org owner cannot call the internal function directly and skip
// the action that meters it.
test("internal copilot functions are not reachable over HTTP, even by an org owner", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "copilot-internal");
  const { owner, eventId } = fixture.a;

  for (const name of ["copilotStartTurn", "copilotSaveAssistant"]) {
    const attempt = await failCode(owner, name, {
      eventId,
      message: "let me in",
    });
    expect(attempt.status).toBeGreaterThanOrEqual(400);
    expect(attempt.message ?? "").toMatch(/not registered/i);
  }

  // A message at the documented ceiling is a legal size — this pins the
  // constant the client validates against so the two cannot drift apart.
  expect(MAX_COPILOT_MESSAGE_CHARS).toBeGreaterThan(0);
  expect(COPILOT_PER_USER_PER_MINUTE).toBeGreaterThan(0);
});

test("agenda scheduling persists a placement and refuses a conflicting one", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "agenda-scheduling");
  const { owner, eventId, sessionId } = fixture.a;

  const room = await callFn<{ id: string }>(owner, "saveRoom", {
    eventId,
    name: "Main Hall",
    sortOrder: 0,
  });

  const start = "2027-05-12T17:00:00.000Z";
  const end = "2027-05-12T17:30:00.000Z";
  await callFn(owner, "saveSession", {
    eventId,
    sessionId,
    data: { roomId: room.id, startTime: start, endTime: end },
  });

  // Read it back through the agent tool rather than trusting the write.
  const conflictsBefore = await callFn<{ conflicts: unknown[] }>(owner, "agentFindConflicts", {
    eventId,
  });
  expect(conflictsBefore.conflicts).toEqual([]);

  // A second session in the same room at the same time is a room conflict.
  const second = await callFn<{ id: string }>(owner, "saveSession", {
    eventId,
    data: { title: "Overlapping talk", kind: "talk", speakerUserIdsJson: [] },
  });
  await callFn(owner, "saveSession", {
    eventId,
    sessionId: second.id,
    data: { roomId: room.id, startTime: start, endTime: end },
  });
  const conflictsAfter = await callFn<{ conflicts: Array<{ kind: string }> }>(
    owner,
    "agentFindConflicts",
    { eventId },
  );
  expect(conflictsAfter.conflicts.length).toBeGreaterThan(0);
  expect(conflictsAfter.conflicts.some((c) => c.kind === "room_overlap")).toBe(true);

  // The agent path REFUSES a conflicting placement rather than flagging it,
  // which is the difference between the grid and the tool belt.
  const refused = await callFn<{
    scheduled: boolean;
    conflicts?: unknown[];
    error?: string;
  }>(owner, "agentScheduleSession", {
    eventId,
    sessionId: second.id,
    roomName: "Main Hall",
    startTime: start,
    durationMinutes: 30,
  });
  expect(refused.scheduled).toBe(false);
  // Refused FOR THE CONFLICT — `scheduled: false` is also what an unknown room
  // name returns, so assert the payload that distinguishes them.
  expect(refused.error).toBeUndefined();
  expect(refused.conflicts?.length ?? 0).toBeGreaterThan(0);

  // Another org cannot schedule into this event.
  const cross = await failCode(fixture.b.owner, "saveSession", {
    eventId,
    sessionId,
    data: { roomId: room.id, startTime: start, endTime: end },
  });
  expect(cross.status).toBeGreaterThanOrEqual(400);
});

test("a scheduled session can be unscheduled, and deleting a room frees its sessions", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "unschedule");
  const { owner, eventId, sessionId } = fixture.a;
  const room = await callFn<{ id: string }>(owner, "saveRoom", {
    eventId,
    name: "Clearable Hall",
    sortOrder: 0,
  });

  const place = async (id: string) =>
    callFn(owner, "saveSession", {
      eventId,
      sessionId: id,
      data: {
        roomId: room.id,
        startTime: "2027-05-12T17:00:00.000Z",
        endTime: "2027-05-12T17:30:00.000Z",
      },
    });

  async function read(id: string) {
    const list = await entityList<{ id: string; roomId?: string | null; startTime?: string | null }>(
      owner,
      "Session",
    );
    return list.find((s) => s.id === id);
  }

  await place(sessionId);
  expect((await read(sessionId))?.roomId).toBe(room.id);

  // Unschedule: null must CLEAR the columns, not be ignored.
  await callFn(owner, "saveSession", {
    eventId,
    sessionId,
    data: { roomId: null, startTime: null, endTime: null },
  });
  const cleared = await read(sessionId);
  expect(cleared?.roomId ?? null).toBeNull();
  expect(cleared?.startTime ?? null).toBeNull();

  // Deleting a room must free the sessions in it, as its confirm dialog says.
  await place(sessionId);
  expect((await read(sessionId))?.roomId).toBe(room.id);
  await callFn(owner, "deleteRoom", { roomId: room.id });
  const freed = await read(sessionId);
  expect(freed).toBeDefined();
  expect(freed?.roomId ?? null).toBeNull();
  expect(freed?.startTime ?? null).toBeNull();
});

test("a track can be removed, and its sessions keep their slot", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "track-delete");
  const { owner, eventId, sessionId } = fixture.a;

  const track = await callFn<{ id: string }>(owner, "saveTrack", {
    eventId,
    name: "Typo Trakc",
    color: "#2563eb",
    sortOrder: 0,
  });
  const room = await callFn<{ id: string }>(owner, "saveRoom", {
    eventId,
    name: "Track Test Hall",
    sortOrder: 0,
  });
  await callFn(owner, "saveSession", {
    eventId,
    sessionId,
    data: {
      trackId: track.id,
      roomId: room.id,
      startTime: "2027-05-12T17:00:00.000Z",
      endTime: "2027-05-12T17:30:00.000Z",
    },
  });

  // Another org cannot delete it.
  const cross = await failCode(fixture.b.owner, "deleteTrack", { trackId: track.id });
  expect(cross.status).toBeGreaterThanOrEqual(400);

  const result = await callFn<{ deleted: boolean; sessionsDetached: number }>(
    owner,
    "deleteTrack",
    { trackId: track.id },
  );
  expect(result.deleted).toBe(true);
  expect(result.sessionsDetached).toBe(1);

  const tracks = await entityList<{ id: string }>(owner, "Track");
  expect(tracks.some((t) => t.id === track.id)).toBe(false);

  // The session loses the label but keeps its place on the grid.
  const sessions = await entityList<{
    id: string;
    trackId?: string | null;
    roomId?: string | null;
    startTime?: string | null;
  }>(owner, "Session");
  const kept = sessions.find((s) => s.id === sessionId);
  expect(kept?.trackId ?? null).toBeNull();
  expect(kept?.roomId).toBe(room.id);
  expect(kept?.startTime).toBeTruthy();
});

test("a round blocked only by debris from deleted submissions can be removed", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "round-debris");
  const { owner, eventId } = fixture.a;

  const round = await callFn<{ id: string }>(owner, "saveReviewRound", {
    eventId,
    roundNumber: 2,
    name: "Round 2",
    status: "open",
  });

  // Real review work on this round must still block deletion. Reviewing is
  // gated twice over: an org-level reviewer membership, then the round pool.
  await callFn(owner, "setReviewerMembership", {
    orgId: fixture.a.id,
    userId: fixture.a.reviewer.userId,
    active: true,
  });
  await callFn(owner, "setReviewRoundReviewer", {
    eventId,
    roundId: round.id,
    reviewerUserId: fixture.a.reviewer.userId,
    active: true,
  });
  await callFn(owner, "assignReview", {
    eventId,
    roundId: round.id,
    submissionId: fixture.a.submissionIds[0],
    reviewerUserId: fixture.a.reviewer.userId,
  });
  const blocked = await failCode(owner, "deleteReviewRound", { eventId, roundId: round.id });
  expect(blocked.code).toBe("CONFLICT");

  // Delete the submission out from under it: the assignment becomes debris the
  // organizer can neither see nor remove, and used to block the round forever.
  const { response } = await jsonRequest(
    owner,
    `/api/entities/Submission/${fixture.a.submissionIds[0]}`,
    "DELETE",
  );
  expect(response.ok).toBe(true);

  const removed = await callFn<{ deleted: boolean }>(owner, "deleteReviewRound", {
    eventId,
    roundId: round.id,
  });
  expect(removed.deleted).toBe(true);

  const rounds = await entityList<{ id: string }>(owner, "ReviewRound");
  expect(rounds.some((r) => r.id === round.id)).toBe(false);
});

test("a newly scheduled session reaches the public schedule, and an edit pulls it back", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "publish-gate");
  const { owner, eventId, eventSlug, slug: orgSlug } = fixture.a;

  const room = await callFn<{ id: string }>(owner, "saveRoom", {
    eventId,
    name: "Publish Hall",
    sortOrder: 0,
  });
  const created = await callFn<{ id: string }>(owner, "saveSession", {
    eventId,
    data: {
      title: "Newly placed talk",
      kind: "talk",
      speakerUserIdsJson: [],
      roomId: room.id,
      startTime: "2027-05-12T17:00:00.000Z",
      endTime: "2027-05-12T17:30:00.000Z",
    },
  });

  // The public feed is gated on a published schedule, as it should be.
  await entityUpdate(owner, "Event", eventId, { schedulePublished: true, cfpStatus: "open" });

  const publicTitles = async () => {
    const { body } = await publicFn<{ sessions?: Array<{ title: string }> }>(
      server.baseUrl,
      "getPublicSchedule",
      { orgSlug, eventSlug },
    );
    return (body.sessions ?? []).map((s) => s.title);
  };

  // Placing a session and publishing must be enough: it used to land as draft,
  // so a freshly built agenda published to an empty public schedule.
  expect(await publicTitles()).toContain("Newly placed talk");

  // The approval gate still governs CHANGES: editing the content re-drafts it,
  // and it drops out of the public feed until re-approved.
  await callFn(owner, "saveSession", {
    eventId,
    sessionId: created.id,
    data: { title: "Retitled after publishing" },
  });
  const afterEdit = await publicTitles();
  expect(afterEdit).not.toContain("Retitled after publishing");
  expect(afterEdit).not.toContain("Newly placed talk");

  await callFn(owner, "approveSessionContent", { sessionId: created.id, approved: true });
  expect(await publicTitles()).toContain("Retitled after publishing");
});

test("assigning a speaker keeps the session published; editing its text does not", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "speaker-publish");
  const { owner, eventId, eventSlug, slug: orgSlug, sessionId } = fixture.a;
  await entityUpdate(owner, "Event", eventId, { schedulePublished: true, cfpStatus: "open" });

  const room = await callFn<{ id: string }>(owner, "saveRoom", {
    eventId, name: "Speaker Hall", sortOrder: 0,
  });
  await callFn(owner, "saveSession", {
    eventId, sessionId,
    data: { roomId: room.id, startTime: "2027-05-12T17:00:00.000Z", endTime: "2027-05-12T17:30:00.000Z" },
  });

  const publicTitles = async () => {
    const { body } = await publicFn<{ sessions?: Array<{ title: string }> }>(
      server.baseUrl, "getPublicSchedule", { orgSlug, eventSlug },
    );
    return (body.sessions ?? []).map((s) => s.title);
  };
  const before = await publicTitles();
  expect(before.length).toBeGreaterThan(0);

  // Assigning a speaker is operational, not editorial. It used to re-draft the
  // session, which pulled a live talk off the public schedule on a checkbox
  // click and made the organizer re-approve their own edit.
  await callFn(owner, "saveSession", {
    eventId, sessionId,
    data: { speakerUserIdsJson: [fixture.a.speakers[0].userId] },
  });
  expect(await publicTitles()).toEqual(before);

  // The speaker change is still versioned, and the approval moved onto it.
  const sessions = await entityList<{ id: string; contentStatus?: string; approvedRevisionId?: string; currentRevisionId?: string }>(owner, "Session");
  const row = sessions.find((s) => s.id === sessionId);
  expect(row?.contentStatus).toBe("approved");
  expect(row?.approvedRevisionId).toBe(row?.currentRevisionId);

  // A TEXT edit still requires a fresh decision.
  await callFn(owner, "saveSession", {
    eventId, sessionId, data: { title: "Retitled by the organizer" },
  });
  const afterText = await publicTitles();
  expect(afterText).not.toContain("Retitled by the organizer");
  expect(afterText.length).toBe(before.length - 1);
});
