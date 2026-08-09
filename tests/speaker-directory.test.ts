import { expect, test } from "bun:test";
import { aggregateSpeakers } from "../app/dashboard/speakers/directory-client";
import type { SpeakerProfileRow, SubmissionRow } from "../lib/types";

function profile(over: Partial<SpeakerProfileRow>): SpeakerProfileRow {
  return {
    id: "p1",
    orgId: "o1",
    eventId: "e1",
    userId: "u1",
    name: "Ada",
    email: "ada@example.com",
    status: "invited",
    claimStatus: "unclaimed",
    createdAt: "2026-01-01",
    ...over,
  } as SpeakerProfileRow;
}

function submission(over: Partial<SubmissionRow>): SubmissionRow {
  return {
    id: "s1",
    orgId: "o1",
    eventId: "e1",
    formId: "f1",
    speakerUserId: "u1",
    title: "Talk",
    status: "submitted",
    currentRound: 1,
    submittedAt: "2026-01-02",
    ...over,
  } as SubmissionRow;
}

test("merges profiles across events by email, case-insensitive", () => {
  const people = aggregateSpeakers(
    [
      profile({ id: "p1", eventId: "e1", email: "Ada@Example.com", company: "Acme" }),
      profile({ id: "p2", eventId: "e2", email: "ada@example.com", userId: "u9", tagsJson: ["keynote"] }),
      profile({ id: "p3", email: "ben@example.com", name: "Ben" }),
    ],
    [],
  );
  expect(people.length).toBe(2);
  const ada = people.find((person) => person.email === "ada@example.com")!;
  expect(ada.profiles.length).toBe(2);
  expect(ada.company).toBe("Acme");
  expect(ada.tags).toEqual(["keynote"]);
});

test("newest profile wins identity fields; submissions counted across userIds", () => {
  const people = aggregateSpeakers(
    [
      profile({ id: "p1", createdAt: "2026-01-01", name: "A. Lovelace" }),
      profile({ id: "p2", eventId: "e2", userId: "u2", createdAt: "2026-02-01", name: "Ada Lovelace" }),
    ],
    [
      submission({ id: "s1", speakerUserId: "u1", status: "accepted" }),
      submission({ id: "s2", speakerUserId: "u2", eventId: "e2" }),
      submission({ id: "s3", speakerUserId: "other" }),
    ],
  );
  expect(people.length).toBe(1);
  expect(people[0].name).toBe("Ada Lovelace");
  expect(people[0].submissions.length).toBe(2);
  expect(people[0].accepted).toBe(1);
});

test("lastActivity is the max of profile and submission timestamps", () => {
  const people = aggregateSpeakers(
    [profile({ createdAt: "2026-01-01" })],
    [submission({ submittedAt: "2026-03-05" })],
  );
  expect(people[0].lastActivity).toBe("2026-03-05");
});
