import { afterEach, expect, mock, test } from "bun:test";
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DeliverableProgressFilter } from "../lib/deliverables";

mock.module("@pylonsync/react", () => ({
  callFn: async () => ({}),
  db: { useQuery: () => ({ data: [], loading: false }) },
}));
mock.module("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

const { DeliverablesLibrary } = await import(
  "../app/dashboard/events/[id]/tasks/tasks-client"
);

afterEach(cleanup);

test("organizer library filters status and presents metadata without a failing download control", () => {
  function Harness() {
    const [filter, setFilter] = useState<DeliverableProgressFilter>("all");
    return (
      <DeliverablesLibrary
        tasks={[{ id: "task", orgId: "org", eventId: "event", taskTemplateId: "template", speakerUserId: "speaker", status: "done" }]}
        templates={[{ id: "template", orgId: "org", eventId: "event", title: "Upload Session Presentation", kind: "upload", dueAt: "2027-05-01T00:00:00.000Z", appliesTo: "all", sortOrder: 0 }]}
        profiles={[{ id: "profile", orgId: "org", eventId: "event", userId: "speaker", name: "Priya Raman", email: "priya@example.test", status: "confirmed", claimStatus: "claimed", createdAt: "2027-01-01" }]}
        sessions={[{ id: "session", orgId: "org", eventId: "event", title: "Taming 40-Minute CI", kind: "talk", contentStatus: "draft" }]}
        slots={[{ id: "slot", orgId: "org", eventId: "event", speakerUserId: "speaker", taskId: "task", sessionId: "session", kind: "slides", title: "Upload Session Presentation", createdAt: "2027-01-01" }]}
        versions={[
          { id: "v1", orgId: "org", eventId: "event", slotId: "slot", speakerUserId: "speaker", uploaderUserId: "speaker", fileId: "f1", filename: "slides.pdf", mimeType: "application/pdf", size: 100, versionNumber: 1, createdAt: "2027-01-01T00:00:00.000Z" },
          { id: "v2", orgId: "org", eventId: "event", slotId: "slot", speakerUserId: "speaker", uploaderUserId: "speaker", fileId: "f2", filename: "slides.pdf", mimeType: "application/pdf", size: 120, versionNumber: 2, createdAt: "2027-01-02T00:00:00.000Z" },
        ]}
        comments={[{ id: "comment", orgId: "org", eventId: "event", slotId: "slot", speakerUserId: "speaker", authorUserId: "speaker", authorName: "Priya Raman", authorRole: "speaker", body: "Draft deck", createdAt: "2027-01-02T01:00:00.000Z" }]}
        filter={filter}
        onFilter={setFilter}
        onRemind={async () => {}}
      />
    );
  }
  render(<Harness />);
  expect(screen.getAllByText("Priya Raman").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText("Taming 40-Minute CI")).toBeDefined();
  expect(screen.getByText(/v2 · slides\.pdf .* latest/)).toBeDefined();
  expect(screen.getByText("Draft deck")).toBeDefined();
  expect(screen.queryByRole("link", { name: /download/i })).toBeNull();
  expect(screen.getByText(/Download unavailable to organizers/)).toBeDefined();
  fireEvent.change(screen.getByLabelText("Filter deliverables"), { target: { value: "pending" } });
  expect(screen.getByText("No deliverables match this filter.")).toBeDefined();
});
