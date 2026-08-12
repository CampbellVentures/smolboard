import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  anonymousClient,
  callFn,
  createTwoOrgFixture,
  jsonRequest,
  type TestIdentity,
} from "../helpers/http-fixtures";
import { startDisposablePylonServer, type DisposablePylonServer } from "../helpers/http-server";

// Regressions for two authorization gaps found in a security audit. Both were
// reachable by any signed-in user, so both get a test that fails loudly if the
// gate is ever removed.

let server: DisposablePylonServer;

beforeAll(async () => {
  server = await startDisposablePylonServer();
}, 30_000);

afterAll(async () => {
  await server?.stop();
}, 10_000);

async function attempt(actor: TestIdentity, name: string, args: Record<string, unknown>) {
  const { response, body } = await jsonRequest<{ error?: { code?: string; message?: string } }>(
    actor,
    `/api/fn/${name}`,
    "POST",
    args,
  );
  return { ok: response.ok, status: response.status, code: body?.error?.code, message: body?.error?.message };
}

test("AI triage refuses an event the caller is not an organizer of", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "triage-authz");

  // Org B's owner aiming at org A's event. Event ids are discoverable: the
  // Event policy exposes every non-draft event to any signed-in user, which is
  // what made this reachable in the first place.
  const cross = await attempt(fixture.b.owner, "triageSubmissions", {
    eventId: fixture.a.eventId,
    limit: 5,
  });
  expect(cross.ok).toBe(false);
  expect(cross.code).toBe("FORBIDDEN");

  // A speaker in the same org is not an organizer either.
  const speaker = await attempt(fixture.a.speakers[0], "triageSubmissions", {
    eventId: fixture.a.eventId,
    limit: 5,
  });
  expect(speaker.ok).toBe(false);
  expect(speaker.code).toBe("FORBIDDEN");

  // The gate must sit BEFORE the model call, so nothing was written and no
  // tokens were spent. A submission that was never triaged still has no stamp.
  const submissions = await callFn<{ submissions: Array<{ triageAt?: string }> }>(
    fixture.a.owner,
    "agentListSubmissions",
    { eventId: fixture.a.eventId },
  ).catch(() => ({ submissions: [] }));
  expect(submissions.submissions.every((s) => !s.triageAt)).toBe(true);

  // recordTriage is internal, so it is not reachable directly either.
  const direct = await attempt(fixture.b.owner, "recordTriage", {
    submissionId: fixture.a.submissionIds[0],
    score: 5,
    summary: "injected",
  });
  expect(direct.ok).toBe(false);
});

test("an organizer cannot verify an account that set its own password", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "self-verify");
  const { owner, eventId } = fixture.a;

  // Someone who signed up themselves and has NOT proven inbox control.
  const email = `self-registered-${Date.now().toString(36)}@example.test`;
  const registered = await jsonRequest<{ user_id: string }>(
    anonymousClient(server.baseUrl),
    "/api/auth/password/register",
    "POST",
    { email, password: "not-a-real-password-123", displayName: "Self Registered" },
  );
  expect(registered.response.ok).toBe(true);
  const selfUserId = registered.body.user_id;

  // An organizer adds them as a speaker, which links the profile to that user.
  await callFn(owner, "saveSpeakerProfile", {
    eventId,
    name: "Self Registered",
    email,
    status: "invited",
  });

  // Vouching must NOT verify them: the org never controlled that address.
  // Without this gate, anyone could provision their own workspace, add
  // themselves as a speaker, and hand themselves emailVerified — the gate on
  // completeTask, updateMySpeakerProfile, and recordDeliverableVersion.
  const vouch = await attempt(owner, "inviteSpeakerAccess", {
    eventId,
    speakerUserId: selfUserId,
  });
  expect(vouch.ok).toBe(false);
  expect(vouch.code).toBe("FORBIDDEN");
  expect(vouch.message ?? "").toMatch(/their own sign-in|code we send/i);
});

test("vouching still works for a shell account the organizer created", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "shell-verify");
  const { owner, eventId } = fixture.a;

  // No account exists for this address; saveSpeakerProfile creates the shell.
  // Verifying it grants the caller nothing — they hold no session for it, and
  // the emailed code still goes to the real inbox — so the convenience stands.
  const email = `never-registered-${Date.now().toString(36)}@example.test`;
  const profile = await callFn<{ id: string; userId?: string }>(owner, "saveSpeakerProfile", {
    eventId,
    name: "Invited Person",
    email,
    status: "invited",
  });

  const userId = profile.userId;
  if (!userId) {
    // If the shell user id is not returned, the legitimate path can't be
    // exercised here; fail loudly rather than passing on a skipped assertion.
    throw new Error("saveSpeakerProfile did not return the created speaker's userId");
  }

  const vouch = await callFn<{ verified: boolean; email: string }>(owner, "inviteSpeakerAccess", {
    eventId,
    speakerUserId: userId,
  });
  expect(vouch.verified).toBe(true);
  expect(vouch.email).toBe(email.toLowerCase());
});
