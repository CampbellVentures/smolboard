import { afterEach, expect, mock, test } from "bun:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

mock.module("@pylonsync/react", () => ({
  callFn: async () => ({}),
  db: { useQuery: () => ({ data: [], loading: false }) },
}));
mock.module("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

const { SpeakersTable } = await import(
  "../app/dashboard/events/[id]/speakers/speakers-client"
);

afterEach(cleanup);

test("empty roster keeps manual add and bounded CSV import reachable", () => {
  render(
    <SpeakersTable
      event={{
        id: "event-1",
        orgId: "org-1",
        name: "DevFlow Conf 2027",
        slug: "devflow-conf-2027",
        timezone: "America/Los_Angeles",
        cfpStatus: "open",
        schedulePublished: false,
        createdAt: "2026-08-09T00:00:00.000Z",
      }}
      initialProfiles={[]}
      initialSubmissions={[]}
      initialSessions={[]}
      initialTasks={[]}
      initialTemplates={[]}
      initialFiles={[]}
    />,
  );

  expect(screen.getByRole("button", { name: "Import CSV" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Add speaker" }));
  expect(screen.getByRole("heading", { name: "Add speaker" })).toBeDefined();
  expect(screen.getByLabelText("Name")).toBeDefined();
  expect(screen.getByLabelText("Email")).toBeDefined();
  expect(screen.getByLabelText("Travel and logistics")).toBeDefined();
});
