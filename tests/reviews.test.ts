import { expect, test } from "bun:test";
import { reviewRoundForNumber } from "../lib/reviews";

test("review scoring never falls back to a different round", () => {
  const rounds = [
    { id: "r1", roundNumber: 1 },
    { id: "r3", roundNumber: 3 },
  ];
  expect(reviewRoundForNumber(rounds, 3)?.id).toBe("r3");
  expect(reviewRoundForNumber(rounds, 2)).toBeUndefined();
});
