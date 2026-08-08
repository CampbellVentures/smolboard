import { expect, test } from "bun:test";
import {
  buildOnboardingRows,
  taskCompletion,
  taskDueState,
  taskReminderList,
} from "../lib/tasks";
import type {
  SpeakerProfileRow,
  SpeakerTaskRow,
  SubmissionRow,
  TaskTemplateRow,
} from "../lib/types";

const now = new Date("2026-08-08T12:00:00.000Z");

test("task due states distinguish complete, overdue, soon, and pending", () => {
  expect(taskDueState({ status: "done" }, { dueAt: "2020-01-01T00:00:00Z" }, now)).toBe("done");
  expect(taskDueState({ status: "pending" }, { dueAt: "2026-08-08T11:00:00Z" }, now)).toBe("overdue");
  expect(taskDueState({ status: "pending" }, { dueAt: "2026-08-10T12:00:00Z" }, now)).toBe("due_soon");
  expect(taskDueState({ status: "pending" }, {}, now)).toBe("pending");
});

test("task completion returns stable zero and percentage values", () => {
  expect(taskCompletion([])).toEqual({ done: 0, total: 0, percent: 0 });
  expect(taskCompletion([{ status: "done" }, { status: "pending" }, { status: "done" }])).toEqual({
    done: 2,
    total: 3,
    percent: 67,
  });
});

test("task reminder list includes only pending work in due-date order", () => {
  const templates = [
    taskTemplate({ id: "later", title: "Slides", dueAt: "2026-08-10T12:00:00Z" }),
    taskTemplate({ id: "overdue", title: "Headshot", dueAt: "2026-08-07T12:00:00Z" }),
  ];
  const tasks = [
    speakerTask({ id: "1", taskTemplateId: "later", status: "pending" }),
    speakerTask({ id: "2", taskTemplateId: "overdue", status: "pending" }),
    speakerTask({ id: "3", taskTemplateId: "later", status: "done" }),
  ];
  expect(taskReminderList(tasks, templates, now)).toBe(
    "• Headshot (overdue Aug 7)\n• Slides (due Aug 10)",
  );
});

test("onboarding rows prioritize overdue speakers and derive profile readiness", () => {
  const submissions = [
    {
      id: "sub",
      orgId: "org",
      eventId: "event",
      formId: "form",
      speakerUserId: "speaker",
      title: "Talk",
      status: "accepted",
      currentRound: 1,
      submittedAt: "2026-08-01T12:00:00Z",
    } satisfies SubmissionRow,
  ];
  const profiles = [
    {
      id: "profile",
      orgId: "org",
      eventId: "event",
      userId: "speaker",
      name: "Ada",
      email: "ada@example.com",
      bio: "Bio",
      headshotFileId: "file",
      createdAt: "2026-08-01T12:00:00Z",
    } satisfies SpeakerProfileRow,
  ];
  const templates = [taskTemplate({ id: "template", dueAt: "2026-08-07T12:00:00Z" })];
  const tasks = [speakerTask({ taskTemplateId: "template", speakerUserId: "speaker" })];
  const rows = buildOnboardingRows({ submissions, profiles, templates, tasks, files: [], now });
  expect(rows[0]).toMatchObject({
    name: "Ada",
    tasksDone: 0,
    tasksTotal: 1,
    overdue: 1,
    profileComplete: 2,
    profileTotal: 3,
    state: "overdue",
  });
});

function taskTemplate(overrides: Partial<TaskTemplateRow> = {}): TaskTemplateRow {
  return {
    id: "template",
    orgId: "org",
    eventId: "event",
    title: "Task",
    kind: "confirm",
    appliesTo: "accepted",
    sortOrder: 0,
    ...overrides,
  };
}

function speakerTask(overrides: Partial<SpeakerTaskRow> = {}): SpeakerTaskRow {
  return {
    id: "task",
    orgId: "org",
    eventId: "event",
    taskTemplateId: "template",
    speakerUserId: "speaker",
    status: "pending",
    ...overrides,
  };
}
