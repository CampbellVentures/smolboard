import { expect, test } from "bun:test";
import { matchesEventAnchor } from "../lib/tenantAnchors";

test("cross-entity anchors require both the event and organization to match", () => {
  expect(matchesEventAnchor({ eventId: "event-a", orgId: "org-a" }, "event-a", "org-a")).toBe(true);
  expect(matchesEventAnchor({ eventId: "event-b", orgId: "org-a" }, "event-a", "org-a")).toBe(false);
  expect(matchesEventAnchor({ eventId: "event-a", orgId: "org-b" }, "event-a", "org-a")).toBe(false);
  expect(matchesEventAnchor(undefined, "event-a", "org-a")).toBe(false);
});

test("legacy foreign rows are excluded from same-tenant derived state", () => {
  const rows = [
    { eventId: "event-a", orgId: "org-a", value: "valid" },
    { eventId: "event-a", orgId: "org-b", value: "foreign-org" },
    { eventId: "event-b", orgId: "org-a", value: "foreign-event" },
  ];

  const anchored = rows.filter((row) => matchesEventAnchor(row, "event-a", "org-a"));
  expect(anchored.map((row) => row.value)).toEqual(["valid"]);
});
