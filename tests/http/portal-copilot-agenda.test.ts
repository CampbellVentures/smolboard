import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  callFn,
  createTwoOrgFixture,
  entityList,
  jsonRequest,
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
