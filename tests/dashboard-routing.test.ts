import { expect, test } from "bun:test";
import {
  dashboardDestination,
  lastEventStorageKey,
} from "../lib/dashboard-routing";
import { submissionCountsByEvent } from "../lib/dashboard-events";

test("dashboard opens the only event in a workspace", () => {
  expect(dashboardDestination(["event-1"])).toBe("/dashboard/events/event-1/abstracts");
});

test("dashboard restores a valid recent event", () => {
  expect(dashboardDestination(["event-1", "event-2"], "event-2")).toBe(
    "/dashboard/events/event-2/abstracts",
  );
});

test("dashboard falls back to the event library", () => {
  expect(dashboardDestination([], null)).toBe("/dashboard/events");
  expect(dashboardDestination(["event-1", "event-2"], "deleted-event")).toBe(
    "/dashboard/events",
  );
});

test("recent-event storage is isolated by workspace", () => {
  expect(lastEventStorageKey("org-1")).toBe("sb.workspace.org-1.last-event");
});

test("event submission counts are derived once for the workspace library", () => {
  expect(
    submissionCountsByEvent([
      { eventId: "event-1" },
      { eventId: "event-2" },
      { eventId: "event-1" },
    ]),
  ).toEqual({ "event-1": 2, "event-2": 1 });
});
