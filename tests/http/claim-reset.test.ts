import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  callFn,
  createTwoOrgFixture,
  jsonRequest,
  magicSignIn,
} from "../helpers/http-fixtures";
import { startDisposablePylonServer, type DisposablePylonServer } from "../helpers/http-server";

let server: DisposablePylonServer;

beforeAll(async () => {
  server = await startDisposablePylonServer();
}, 30_000);

afterAll(async () => {
  await server?.stop();
}, 10_000);

// A claim reset must hold. The portal auto-claims any unclaimed profile it
// can, so without a server-side gate the reset reverted on the speaker's
// next visit. And once a person has verified the address, correcting the
// email would rename their live account — refuse it.
test("resetSpeakerClaim survives re-claim attempts and blocks unsafe email moves", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "claim-reset");
  const email = "reset.target@example.test";

  const added = await callFn<{ id: string; userId: string }>(fixture.a.owner, "saveSpeakerProfile", {
    eventId: fixture.a.eventId,
    name: "Reset Target",
    email,
    status: "invited",
  });

  const speaker = await magicSignIn(server.baseUrl, email);
  await callFn(speaker, "claimSpeakerProfile", {
    profileId: added.id,
    expectedProvisionalUserId: added.userId,
  });

  const reset = await callFn<{ reset: true; previousEmail: string }>(fixture.a.owner, "resetSpeakerClaim", {
    eventId: fixture.a.eventId,
    profileId: added.id,
  });
  expect(reset.reset).toBe(true);

  // The portal's automatic re-claim call must now refuse.
  const reclaim = await jsonRequest(speaker, "/api/fn/claimSpeakerProfile", "POST", {
    profileId: added.id,
    expectedProvisionalUserId: added.userId,
  });
  expect(reclaim.response.ok).toBe(false);

  // The account verified its inbox via the magic code, so moving its email
  // would hand the new address's sign-in to this account's sessions.
  const move = await jsonRequest(fixture.a.owner, "/api/fn/correctSpeakerEmail", "POST", {
    eventId: fixture.a.eventId,
    profileId: added.id,
    email: "someone.else@example.test",
  });
  expect(move.response.ok).toBe(false);

  // Correcting to the same address is the organizer's undo: it clears the
  // reset and the speaker can claim again.
  const undo = await callFn<{ changed: boolean }>(fixture.a.owner, "correctSpeakerEmail", {
    eventId: fixture.a.eventId,
    profileId: added.id,
    email,
  });
  expect(undo.changed).toBe(false);
  const reclaimed = await callFn<{ claimedAt: string }>(speaker, "claimSpeakerProfile", {
    profileId: added.id,
    expectedProvisionalUserId: added.userId,
  });
  expect(Number.isFinite(Date.parse(reclaimed.claimedAt))).toBe(true);
});

test("correctSpeakerEmail still repairs a never-signed-in shell account", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "shell-repair");

  const added = await callFn<{ id: string; userId: string }>(fixture.a.owner, "saveSpeakerProfile", {
    eventId: fixture.a.eventId,
    name: "Typo Shell",
    email: "typo@exmaple.test",
    status: "invited",
  });

  const fixed = await callFn<{ changed: boolean; email: string }>(fixture.a.owner, "correctSpeakerEmail", {
    eventId: fixture.a.eventId,
    profileId: added.id,
    email: "typo@example.test",
  });
  expect(fixed.changed).toBe(true);
  expect(fixed.email).toBe("typo@example.test");
});
