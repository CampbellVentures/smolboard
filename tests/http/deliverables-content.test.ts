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
import { loopbackRequest } from "../helpers/http-request";
import { startDisposablePylonServer, type DisposablePylonServer } from "../helpers/http-server";

let server: DisposablePylonServer;

beforeAll(async () => {
  server = await startDisposablePylonServer();
}, 30_000);

afterAll(async () => {
  await server?.stop();
}, 10_000);

test("task slots isolate confirmed versions, retain history, scope comments, and preserve legacy files", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "deliverable-slots");
  const speaker = fixture.a.speakers[0];
  const firstTemplate = await callFn<{ id: string }>(fixture.a.owner, "saveTaskTemplate", {
    eventId: fixture.a.eventId,
    title: "Upload Session Presentation",
    description: "Final slide deck as a PDF, 16:9 aspect ratio.",
    kind: "upload",
    target: "slides",
    dueAt: "2027-05-01T00:00:00.000Z",
    appliesTo: "selected",
    speakerUserIds: [speaker.userId],
  });
  const secondTemplate = await callFn<{ id: string }>(fixture.a.owner, "saveTaskTemplate", {
    eventId: fixture.a.eventId,
    title: "Upload Final Headshot (print quality)",
    kind: "upload",
    target: "headshot",
    dueAt: "2027-04-14T00:00:00.000Z",
    appliesTo: "selected",
    speakerUserIds: [speaker.userId],
  });
  const assignments = await entityList<{ id: string; taskTemplateId: string }>(speaker, "SpeakerTask");
  const firstTask = assignments.find((task) => task.taskTemplateId === firstTemplate.id)!;
  const secondTask = assignments.find((task) => task.taskTemplateId === secondTemplate.id)!;
  const firstSlot = await callFn<{ id: string }>(speaker, "ensureDeliverableSlot", { taskId: firstTask.id });

  const firstUpload = await directUpload(speaker, "slides.pdf", "first version");
  const firstVersion = await callFn<{ id: string; versionNumber: number }>(speaker, "recordDeliverableVersion", {
    slotId: firstSlot.id,
    fileId: firstUpload.id,
    fileUrl: firstUpload.url,
    filename: "slides.pdf",
    mimeType: "application/pdf",
    size: firstUpload.size,
  });
  const secondUpload = await directUpload(speaker, "slides.pdf", "second version");
  const secondVersion = await callFn<{ id: string; versionNumber: number }>(speaker, "recordDeliverableVersion", {
    slotId: firstSlot.id,
    fileId: secondUpload.id,
    fileUrl: secondUpload.url,
    filename: "slides.pdf",
    mimeType: "application/pdf",
    size: secondUpload.size,
  });
  expect([firstVersion.versionNumber, secondVersion.versionNumber]).toEqual([1, 2]);
  expect((await speaker.request(`/api/files/${firstUpload.id}`)).status).toBe(200);
  expect((await speaker.request(`/api/files/${secondUpload.id}`)).status).toBe(200);
  expect([403, 404]).toContain((await fixture.a.owner.request(`/api/files/${firstUpload.id}`)).status);
  const organizerVersions = await entityList<Record<string, unknown>>(fixture.a.owner, "DeliverableVersion");
  expect(organizerVersions.every((version) => version.fileUrl === undefined)).toBe(true);
  expect([400, 403]).toContain(
    (await entityUpdate(speaker, "DeliverableVersion", firstVersion.id, { filename: "rewritten.pdf" })).status,
  );

  await callFn(speaker, "completeTask", { taskId: firstTask.id, completed: true });
  const isolated = await jsonRequest(speaker, "/api/fn/completeTask", "POST", { taskId: secondTask.id, completed: true });
  expect(isolated.response.ok).toBe(false);
  await callFn(speaker, "attachSpeakerFile", {
    profileId: fixture.a.profileIds[0],
    kind: "headshot",
    fileId: "legacy-preserved-file",
    label: "legacy.png",
  });
  const stillIsolated = await jsonRequest(speaker, "/api/fn/completeTask", "POST", { taskId: secondTask.id, completed: true });
  expect(stillIsolated.response.ok).toBe(false);
  expect((await entityList<{ fileId: string }>(speaker, "SpeakerFile")).some((file) => file.fileId === "legacy-preserved-file")).toBe(true);

  await callFn(speaker, "addDeliverableComment", {
    slotId: firstSlot.id,
    versionId: secondVersion.id,
    body: "Draft deck - final version coming Friday.",
  });
  await callFn(fixture.a.owner, "addDeliverableComment", {
    slotId: firstSlot.id,
    versionId: secondVersion.id,
    body: "Thanks - please confirm the final version by Tuesday.",
  });
  const foreignComment = await jsonRequest(fixture.b.owner, "/api/fn/addDeliverableComment", "POST", {
    slotId: firstSlot.id,
    body: "foreign",
  });
  expect(foreignComment.response.ok).toBe(false);
  const crossSpeakerSlot = await jsonRequest(fixture.a.speakers[1], "/api/fn/ensureDeliverableSlot", "POST", {
    taskId: firstTask.id,
  });
  expect(crossSpeakerSlot.response.ok).toBe(false);
  const comments = await entityList<{ slotId: string; body: string; authorName: string; createdAt: string }>(fixture.a.owner, "DeliverableComment");
  expect(comments.filter((comment) => comment.slotId === firstSlot.id)).toHaveLength(2);
  expect(comments.every((comment) => Boolean(comment.authorName) && Number.isFinite(Date.parse(comment.createdAt)))).toBe(true);
}, 30_000);

test("session revisions restore as a new draft and only explicit approval reaches both public feeds", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "content-approval");
  const args = { orgSlug: fixture.a.slug, eventSlug: fixture.a.eventSlug };
  await entityUpdate(fixture.a.owner, "Event", fixture.a.eventId, { schedulePublished: true });

  // A session the organizer created is approved on creation, so it publishes
  // without a second sign-off step. Put it back to draft explicitly, because
  // the invariant under test is "unapproved content never reaches the public
  // feeds" — not whatever the creation default happens to be.
  await callFn(fixture.a.owner, "approveSessionContent", {
    sessionId: fixture.a.sessionId,
    approved: false,
  });
  const hidden = await publicFn<{ sessions: unknown[] }>(server.baseUrl, "getPublicSchedule", args);
  const hiddenSpeakers = await publicFn<{ speakers: unknown[] }>(server.baseUrl, "getPublicSpeakers", args);
  expect(hidden.body.sessions).toEqual([]);
  expect(hiddenSpeakers.body.speakers).toEqual([]);

  await callFn(fixture.a.owner, "saveSession", {
    eventId: fixture.a.eventId,
    sessionId: fixture.a.sessionId,
    data: { title: "UPDATED: A Published Session", description: "This session now includes a live demo of remote build caching." },
  });
  await callFn(fixture.a.owner, "saveSession", {
    eventId: fixture.a.eventId,
    sessionId: fixture.a.sessionId,
    data: { description: "This session now includes a live demo of remote build caching. Attendees should bring a laptop." },
  });
  const history = (await entityList<{ id: string; sessionId: string; revisionNumber: number; description?: string; editorName: string }>(
    fixture.a.owner,
    "SessionContentRevision",
  )).filter((revision) => revision.sessionId === fixture.a.sessionId).sort((a, b) => a.revisionNumber - b.revisionNumber);
  expect(history.length).toBeGreaterThanOrEqual(3);
  expect(history.every((revision) => Boolean(revision.editorName))).toBe(true);
  const beforeSecondEdit = history.at(-2)!;
  await callFn(fixture.a.owner, "restoreSessionContent", {
    sessionId: fixture.a.sessionId,
    revisionId: beforeSecondEdit.id,
  });
  const [restored] = (await entityList<{ id: string; description?: string; contentStatus: string }>(fixture.a.owner, "Session"))
    .filter((session) => session.id === fixture.a.sessionId);
  expect(restored.description).toContain("live demo");
  expect(restored.description).not.toContain("bring a laptop");
  expect(restored.contentStatus).toBe("draft");

  await callFn(fixture.a.owner, "approveSessionContent", { sessionId: fixture.a.sessionId, approved: true });
  const schedule = await publicFn<{ sessions: { id: string; title: string }[] }>(server.baseUrl, "getPublicSchedule", args);
  const speakers = await publicFn<{ speakers: { talks: string[] }[] }>(server.baseUrl, "getPublicSpeakers", args);
  expect(schedule.body.sessions).toContainEqual(expect.objectContaining({ id: fixture.a.sessionId, title: "UPDATED: A Published Session" }));
  expect(speakers.body.speakers.flatMap((speaker) => speaker.talks)).toContain("UPDATED: A Published Session");

  await callFn(fixture.a.owner, "saveSession", {
    eventId: fixture.a.eventId,
    sessionId: fixture.a.sessionId,
    data: { title: "Unapproved later edit" },
  });
  const gatedAgain = await publicFn<{ sessions: unknown[] }>(server.baseUrl, "getPublicSchedule", args);
  expect(gatedAgain.body.sessions).toEqual([]);
}, 30_000);

test("requesting changes reopens the speaker's task until a new version lands", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "deliverable-reopen");
  const speaker = fixture.a.speakers[0];
  const template = await callFn<{ id: string }>(fixture.a.owner, "saveTaskTemplate", {
    eventId: fixture.a.eventId,
    title: "Upload Session Presentation",
    kind: "upload",
    target: "slides",
    appliesTo: "selected",
    speakerUserIds: [speaker.userId],
  });
  const task = (await entityList<{ id: string; taskTemplateId: string }>(speaker, "SpeakerTask"))
    .find((row) => row.taskTemplateId === template.id)!;
  const slot = await callFn<{ id: string }>(speaker, "ensureDeliverableSlot", { taskId: task.id });

  const taskStatus = async () =>
    (await entityList<{ id: string; status: string }>(speaker, "SpeakerTask")).find((row) => row.id === task.id)!.status;
  const slotStatus = async () =>
    (await entityList<{ id: string; status: string }>(speaker, "DeliverableSlot")).find((row) => row.id === slot.id)!.status;

  const first = await directUpload(speaker, "slides.pdf", "first draft");
  await callFn(speaker, "recordDeliverableVersion", {
    slotId: slot.id,
    fileId: first.id,
    fileUrl: first.url,
    filename: "slides.pdf",
    mimeType: "application/pdf",
    size: first.size,
  });
  await callFn(speaker, "completeTask", { taskId: task.id, completed: true });
  expect(await taskStatus()).toBe("done");

  await callFn(fixture.a.owner, "reviewDeliverable", {
    slotId: slot.id,
    status: "changes_requested",
    note: "Please use the 16:9 template.",
  });
  // The checklist has to say what is left. A task the organizer sent back is
  // not done, and the speaker cannot tick it done to get around that.
  expect(await taskStatus()).toBe("pending");
  const blocked = await jsonRequest(speaker, "/api/fn/completeTask", "POST", { taskId: task.id, completed: true });
  expect(blocked.response.ok).toBe(false);
  expect(await taskStatus()).toBe("pending");

  const second = await directUpload(speaker, "slides.pdf", "revised deck");
  await callFn(speaker, "recordDeliverableVersion", {
    slotId: slot.id,
    fileId: second.id,
    fileUrl: second.url,
    filename: "slides.pdf",
    mimeType: "application/pdf",
    size: second.size,
  });
  expect(await slotStatus()).toBe("pending");
  await callFn(speaker, "completeTask", { taskId: task.id, completed: true });
  expect(await taskStatus()).toBe("done");

  // Approving leaves the task alone; it is already done.
  await callFn(fixture.a.owner, "reviewDeliverable", { slotId: slot.id, status: "approved" });
  expect(await taskStatus()).toBe("done");
}, 30_000);

async function directUpload(actor: TestIdentity, filename: string, contents: string) {
  const bytes = new TextEncoder().encode(contents);
  const initialized = await jsonRequest<{ assetId: string; uploadUrl: string }>(actor, "/api/files/init", "POST", {
    filename,
    mimeType: "application/pdf",
    size: bytes.byteLength,
  });
  expect(initialized.response.status).toBe(200);
  const put = await loopbackRequest(new URL(initialized.body.uploadUrl, server.baseUrl).toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/pdf", Authorization: `Bearer ${actor.token}` },
    body: bytes,
  });
  expect(put.ok).toBe(true);
  const confirmed = await jsonRequest<{ id: string; url: string; size: number }>(actor, "/api/files/confirm", "POST", {
    assetId: initialized.body.assetId,
  });
  expect(confirmed.response.status).toBe(200);
  return confirmed.body;
}
