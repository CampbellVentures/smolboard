import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  callFn,
  createTwoOrgFixture,
  entityList,
  entityUpdate,
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

test("owner-controlled speaker lifecycle is tenant-safe, claimable, idempotent, assignable, and logged", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "speaker-lifecycle");
  const email = "priya.lifecycle@example.test";

  const memberAdd = await jsonRequest(fixture.a.reviewer, "/api/fn/saveSpeakerProfile", "POST", {
    eventId: fixture.a.eventId,
    name: "Denied Speaker",
    email: "denied-speaker@example.test",
    status: "invited",
  });
  expect(memberAdd.response.ok).toBe(false);

  const invalidStatus = await jsonRequest(fixture.a.owner, "/api/fn/saveSpeakerProfile", "POST", {
    eventId: fixture.a.eventId,
    name: "Typo Status",
    email: "typo-status@example.test",
    status: "confimed",
  });
  expect(invalidStatus.response.ok).toBe(false);
  const invalidCustom = await jsonRequest(fixture.a.owner, "/api/fn/saveSpeakerProfile", "POST", {
    eventId: fixture.a.eventId,
    name: "Nested Custom",
    email: "nested-custom@example.test",
    status: "invited",
    customJson: { nested: { not: "allowed" } },
  });
  expect(invalidCustom.response.ok).toBe(false);

  const added = await callFn<{ id: string; userId: string; created: boolean }>(
    fixture.a.owner,
    "saveSpeakerProfile",
    {
      eventId: fixture.a.eventId,
      name: "Priya Lifecycle",
      email,
      jobTitle: "Principal Engineer",
      company: "Latticework Systems",
      bio: "Initial organizer bio",
      status: "invited",
      headshotUrl: "https://cdn.example.test/priya.png",
      logistics: "Vegetarian",
    },
  );
  expect(added.created).toBe(true);

  const priya = await magicSignIn(server.baseUrl, email);
  expect(priya.userId).toBe(added.userId);
  const claimed = await callFn<{ claimedAt: string }>(priya, "claimSpeakerProfile", {
    profileId: added.id,
    expectedProvisionalUserId: added.userId,
  });
  expect(Number.isFinite(Date.parse(claimed.claimedAt))).toBe(true);

  const claimAttack = await jsonRequest(fixture.a.speakers[0], "/api/fn/claimSpeakerProfile", "POST", {
    profileId: added.id,
    expectedProvisionalUserId: fixture.a.speakers[0].userId,
  });
  expect(claimAttack.response.ok).toBe(false);

  await callFn(fixture.a.owner, "saveSpeakerProfile", {
    eventId: fixture.a.eventId,
    profileId: added.id,
    name: "Priya Lifecycle",
    email,
    jobTitle: "Principal Engineer",
    company: "Latticework Systems",
    bio: "Initial organizer bio SBEK-ORG-EDIT-01",
    status: "confirmed",
    headshotUrl: "https://cdn.example.test/priya-v2.png",
    logistics: "Arrival May 11, aisle seat; dietary: Vegetarian",
  });
  const profiles = await entityList<{
    id: string;
    status: string;
    claimStatus: string;
    bio?: string;
    logistics?: string;
  }>(fixture.a.owner, "SpeakerProfile");
  expect(profiles).toContainEqual(
    expect.objectContaining({
      id: added.id,
      status: "confirmed",
      claimStatus: "claimed",
      bio: expect.stringContaining("SBEK-ORG-EDIT-01"),
      logistics: expect.stringContaining("Vegetarian"),
    }),
  );

  expect((await entityUpdate(priya, "SpeakerProfile", added.id, { status: "inactive" })).status).toBe(403);
  const invalidLinks = await jsonRequest(priya, "/api/fn/updateMySpeakerProfile", "POST", {
    profileId: added.id,
    name: "Priya Lifecycle",
    linksJson: { unexpected: "https://example.test" },
  });
  expect(invalidLinks.response.ok).toBe(false);
  await callFn(priya, "updateMySpeakerProfile", {
    profileId: added.id,
    name: "Priya Lifecycle",
    bio: "SBEK-PORTAL-BIO-01",
    company: "Latticework Systems",
    jobTitle: "Principal Engineer",
    headshotUrl: "https://cdn.example.test/priya-portal.png",
    linksJson: { linkedin: "https://linkedin.example.test/priya" },
  });

  // A task that applies to every speaker, created before the import runs.
  const everyoneTask = await callFn<{ id: string }>(fixture.a.owner, "saveTaskTemplate", {
    eventId: fixture.a.eventId,
    title: "Confirm your travel dates",
    kind: "confirm",
    appliesTo: "all",
  });

  const csv = [
    "name,email,title,company,bio,status",
    "Priya Lifecycle,priya.lifecycle@example.test,Principal Engineer,Latticework Systems,Duplicate,confirmed",
    "Dana Kowalski,dana.lifecycle@example.test,Engineering Manager,Northstar Labs,Imported speaker,invited",
  ].join("\r\n");
  const imported = await callFn<{ created: { id: string; email: string }[]; duplicates: unknown[] }>(
    fixture.a.owner,
    "importSpeakers",
    { eventId: fixture.a.eventId, csv },
  );
  expect(imported.created).toHaveLength(1);
  expect(imported.duplicates).toHaveLength(1);

  // An imported speaker used to land with an empty portal while the tasks page
  // said this task applied to all of them.
  const importedProfile = (await entityList<{ id: string; userId: string; email: string }>(
    fixture.a.owner,
    "SpeakerProfile",
  )).find((row) => row.email === "dana.lifecycle@example.test")!;
  const importedTasks = (await entityList<{ taskTemplateId: string; speakerUserId: string }>(
    fixture.a.owner,
    "SpeakerTask",
  )).filter((row) => row.speakerUserId === importedProfile.userId);
  expect(importedTasks.map((row) => row.taskTemplateId)).toContain(everyoneTask.id);
  const repeated = await callFn<{ created: unknown[]; duplicates: unknown[] }>(fixture.a.owner, "importSpeakers", {
    eventId: fixture.a.eventId,
    csv,
  });
  expect(repeated.created).toHaveLength(0);
  expect(repeated.duplicates).toHaveLength(2);

  const selectedTask = await callFn<{ id: string; tasksCreated: number }>(fixture.a.owner, "saveTaskTemplate", {
    eventId: fixture.a.eventId,
    title: "Sign speaker release form",
    kind: "confirm",
    dueAt: "2027-04-15T00:00:00.000Z",
    appliesTo: "selected",
    speakerUserIds: [added.userId, fixture.a.speakers[0].userId],
  });
  expect(selectedTask.tasksCreated).toBe(2);
  const assignments = await entityList<{ taskTemplateId: string; speakerUserId: string }>(
    fixture.a.owner,
    "SpeakerTask",
  );
  expect(
    assignments
      .filter((task) => task.taskTemplateId === selectedTask.id)
      .map((task) => task.speakerUserId)
      .sort(),
  ).toEqual([added.userId, fixture.a.speakers[0].userId].sort());

  const memberInvite = await jsonRequest(fixture.a.reviewer, "/api/fn/inviteSpeaker", "POST", {
    profileId: added.id,
  });
  expect(memberInvite.response.ok).toBe(false);
  expect((await callFn<{ queued: boolean }>(fixture.a.owner, "inviteSpeaker", { profileId: added.id })).queued).toBe(true);

  const unconfirmed = await jsonRequest(fixture.a.owner, "/api/fn/queueSpeakerEmail", "POST", {
    eventId: fixture.a.eventId,
    profileIds: [added.id],
    subject: "Welcome speakers",
    body: "Hi {{speaker_name}}",
    confirmed: false,
  });
  expect(unconfirmed.response.ok).toBe(false);
  const memberCampaign = await jsonRequest(fixture.a.reviewer, "/api/fn/queueSpeakerEmail", "POST", {
    eventId: fixture.a.eventId,
    profileIds: [added.id],
    subject: "Welcome speakers",
    body: "Hi {{speaker_name}}",
    confirmed: true,
  });
  expect(memberCampaign.response.ok).toBe(false);
  const foreignCampaign = await jsonRequest(fixture.a.owner, "/api/fn/queueSpeakerEmail", "POST", {
    eventId: fixture.a.eventId,
    profileIds: [fixture.b.profileIds[0]],
    subject: "Welcome speakers",
    body: "Hi {{speaker_name}}",
    confirmed: true,
  });
  expect(foreignCampaign.response.ok).toBe(false);
  const queued = await callFn<{ queued: number }>(fixture.a.owner, "queueSpeakerEmail", {
    eventId: fixture.a.eventId,
    profileIds: [added.id, fixture.a.profileIds[0]],
    subject: "Welcome to DevFlow Conf 2027 speakers",
    body: "Hi {{speaker_name}}, welcome to {{event_name}}. {{portal_link}}",
    confirmed: true,
  });
  expect(queued.queued).toBe(2);

  const logs = await waitForLogs(fixture.a.owner, fixture.a.eventId);
  expect(logs.filter((log) => log.subject === "Welcome to DevFlow Conf 2027 speakers")).toHaveLength(2);
  expect(logs.some((log) => log.toEmail === email && log.templateKey === "portal_invite")).toBe(true);
}, 30_000);

async function waitForLogs(
  owner: Parameters<typeof entityList>[0],
  eventId: string,
) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const logs = (await entityList<{
      eventId: string;
      toEmail: string;
      templateKey?: string;
      subject: string;
    }>(owner, "EmailLog")).filter((log) => log.eventId === eventId);
    if (
      logs.filter((log) => log.subject === "Welcome to DevFlow Conf 2027 speakers").length >= 2 &&
      logs.some((log) => log.templateKey === "portal_invite")
    ) return logs;
    await Bun.sleep(50);
  }
  return [];
}
