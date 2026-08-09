import { expect, test } from "bun:test";
import { filterDeliverableTasks, latestVersion, versionsForSlot } from "../lib/deliverables";
import { approvedContent } from "../lib/session-content";
import type {
  DeliverableSlotRow,
  DeliverableVersionRow,
  SessionContentRevisionRow,
  SessionRow,
  SpeakerTaskRow,
  TaskTemplateRow,
} from "../lib/types";

const task = (id: string): SpeakerTaskRow => ({
  id,
  orgId: "org",
  eventId: "event",
  taskTemplateId: `template-${id}`,
  speakerUserId: "speaker",
  status: "pending",
});
const template = (id: string, dueAt?: string): TaskTemplateRow => ({
  id: `template-${id}`,
  orgId: "org",
  eventId: "event",
  title: id,
  kind: "upload",
  appliesTo: "all",
  sortOrder: 0,
  dueAt,
});
const slot = (id: string): DeliverableSlotRow => ({
  id: `slot-${id}`,
  orgId: "org",
  eventId: "event",
  speakerUserId: "speaker",
  taskId: id,
  kind: "slides",
  title: id,
  createdAt: "2027-01-01T00:00:00.000Z",
});
const version = (number: number): DeliverableVersionRow => ({
  id: `version-${number}`,
  orgId: "org",
  eventId: "event",
  slotId: "slot-a",
  speakerUserId: "speaker",
  uploaderUserId: "speaker",
  fileId: `file-${number}`,
  filename: "slides.pdf",
  mimeType: "application/pdf",
  size: 20,
  versionNumber: number,
  createdAt: `2027-01-0${number}T00:00:00.000Z`,
});

test("deliverable latest ordering is deterministic and filters use exact slots", () => {
  const tasks = [task("a"), task("b")];
  const templates = [template("a", "2027-01-01T00:00:00.000Z"), template("b")];
  const slots = [slot("a"), slot("b")];
  const versions = [version(1), version(3), version(2)];
  expect(versionsForSlot(versions, "slot-a").map((item) => item.versionNumber)).toEqual([3, 2, 1]);
  expect(latestVersion(versions, "slot-a")?.id).toBe("version-3");
  expect(filterDeliverableTasks(tasks, templates, slots, versions, "uploaded").map((item) => item.id)).toEqual(["a"]);
  expect(filterDeliverableTasks(tasks, templates, slots, versions, "pending").map((item) => item.id)).toEqual(["b"]);
  expect(filterDeliverableTasks(tasks, templates, slots, versions, "overdue", new Date("2027-02-01"))).toEqual([]);
});

test("public content resolves only the explicitly approved immutable revision", () => {
  const revisions = [
    revisionRow("r1", 1, "Approved title"),
    revisionRow("r2", 2, "Later draft"),
  ];
  const session = {
    contentStatus: "approved",
    approvedRevisionId: "r1",
  } as SessionRow;
  expect(approvedContent(session, revisions)?.title).toBe("Approved title");
  expect(approvedContent({ ...session, contentStatus: "draft" }, revisions)).toBeUndefined();
  expect(approvedContent({ ...session, approvedRevisionId: "missing" }, revisions)).toBeUndefined();
});

function revisionRow(id: string, revisionNumber: number, title: string): SessionContentRevisionRow {
  return {
    id,
    orgId: "org",
    eventId: "event",
    sessionId: "session",
    revisionNumber,
    title,
    speakerUserIdsJson: ["speaker"],
    editorUserId: "owner",
    editorName: "Owner",
    createdAt: `2027-01-0${revisionNumber}T00:00:00.000Z`,
  };
}
