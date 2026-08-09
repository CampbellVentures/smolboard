import { expect, test } from "bun:test";
import { isReviewVerdict, reviewStatusLabel } from "../lib/content";

test("isReviewVerdict only allows organizer verdicts, never pending", () => {
  expect(isReviewVerdict("approved")).toBe(true);
  expect(isReviewVerdict("changes_requested")).toBe(true);
  expect(isReviewVerdict("pending")).toBe(false);
  expect(isReviewVerdict("")).toBe(false);
});

test("reviewStatusLabel maps unknown/missing to pending", () => {
  expect(reviewStatusLabel("approved")).toBe("Approved");
  expect(reviewStatusLabel("changes_requested")).toBe("Changes requested");
  expect(reviewStatusLabel(undefined)).toBe("Pending review");
  expect(reviewStatusLabel("bogus")).toBe("Pending review");
});
