import { expect, test } from "bun:test";
import { canClaimCfpEmail } from "../lib/cfp";

test("anonymous callers cannot attach submissions to an existing account", () => {
  expect(canClaimCfpEmail("speaker-1", undefined)).toBe(false);
});

test("a signed-in speaker can reuse only their own account email", () => {
  expect(canClaimCfpEmail("speaker-1", "speaker-1")).toBe(true);
  expect(canClaimCfpEmail("speaker-1", "attacker-1")).toBe(false);
  expect(canClaimCfpEmail(undefined, "speaker-1")).toBe(false);
});

test("a first-time anonymous speaker can create an account", () => {
  expect(canClaimCfpEmail(undefined, undefined)).toBe(true);
});
