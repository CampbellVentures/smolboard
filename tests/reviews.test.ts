import { expect, test } from "bun:test";
import {
  aggregateSubmissionScore,
  assignmentProgress,
  csvCell,
  normalizeCriteria,
  reminderReviewerIds,
  reviewRoundForNumber,
  validateReviewValues,
} from "../lib/reviews";

test("review scoring never falls back to a different round", () => {
  const rounds = [
    { id: "r1", roundNumber: 1 },
    { id: "r3", roundNumber: 3 },
  ];
  expect(reviewRoundForNumber(rounds, 3)?.id).toBe("r3");
  expect(reviewRoundForNumber(rounds, 2)).toBeUndefined();
});

test("legacy numeric criteria normalize without changing their meaning", () => {
  expect(normalizeCriteria([{ key: "quality", label: "Quality", max: 5 }])).toEqual([
    {
      key: "quality",
      label: "Quality",
      type: "numeric",
      min: 1,
      max: 5,
      weight: 1,
      required: false,
    },
  ]);
});

test("numeric, select, and text criteria validate types, ranges, and required values", () => {
  const criteria = [
    { key: "quality", label: "Quality", type: "numeric", min: 0, max: 10, weight: 2, required: true },
    { key: "format", label: "Format", type: "select", options: ["talk", "workshop"], required: true },
    { key: "notes", label: "Notes", type: "text", required: true },
  ];
  expect(validateReviewValues(criteria, { quality: 8, format: "talk", notes: "  useful  " })).toEqual({
    values: { quality: 8, format: "talk", notes: "useful" },
    errors: [],
  });
  expect(validateReviewValues(criteria, { quality: 11, format: "panel", extra: 1 }).errors).toEqual([
    "Unknown criterion: extra.",
    "Quality must be between 0 and 10.",
    "Format must use one of its configured options.",
    "Notes is required.",
  ]);
  expect(validateReviewValues(criteria, { quality: 8, format: "talk", notes: "   " }).errors).toEqual([
    "Notes is required.",
  ]);
});

test("weighted numeric aggregates are deterministic and ignore nonnumeric criteria", () => {
  const criteria = [
    { key: "quality", label: "Quality", type: "numeric", min: 1, max: 5, weight: 3 },
    { key: "novelty", label: "Novelty", type: "numeric", min: 0, max: 10, weight: 1 },
    { key: "notes", label: "Notes", type: "text" },
  ];
  const score = aggregateSubmissionScore(criteria, [
    { scoresJson: { quality: 5, novelty: 0, notes: "strong" } },
    { scoresJson: { quality: 1, novelty: 10, notes: "mixed" } },
  ]);
  expect(score).toBe(0.5);
});

test("progress uses assignments and excludes recused work from the denominator", () => {
  expect(assignmentProgress([{ status: "assigned" }, { status: "assigned" }])).toEqual({
    complete: 0,
    total: 2,
    percent: 0,
  });
  expect(assignmentProgress([
    { status: "complete" },
    { status: "complete" },
    { status: "recused" },
  ])).toEqual({ complete: 2, total: 2, percent: 100 });
});

test("reminders target pending reviewers once and CSV cells are escaped", () => {
  expect(reminderReviewerIds([
    { reviewerUserId: "b", status: "assigned" },
    { reviewerUserId: "a", status: "assigned" },
    { reviewerUserId: "a", status: "assigned" },
    { reviewerUserId: "c", status: "complete" },
  ])).toEqual(["a", "b"]);
  expect(csvCell('A, "quoted" title')).toBe('"A, ""quoted"" title"');
});
