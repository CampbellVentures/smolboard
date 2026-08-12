import { expect, test } from "bun:test";
import {
  COPILOT_PER_ORG_PER_HOUR,
  COPILOT_PER_USER_PER_MINUTE,
  HOUR_MS,
  MINUTE_MS,
  checkCopilotLimits,
  copilotLimitMessage,
} from "../lib/copilot-limits";

// Every copilot turn spends tokens on our key, and smolboard.app runs a public
// demo with a documented login. These limits are checked before the model call,
// so they are the thing standing between a runaway client and the bill.

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const repeat = (n: number, ms: number) => Array.from({ length: n }, () => ago(ms));

test("a normal pace is allowed", () => {
  const v = checkCopilotLimits({
    userTimestamps: repeat(3, 20_000),
    orgTimestamps: repeat(9, 20_000),
    now: NOW,
  });
  expect(v.allowed).toBe(true);
});

test("the per-user minute ceiling blocks and says when to retry", () => {
  const v = checkCopilotLimits({
    userTimestamps: repeat(COPILOT_PER_USER_PER_MINUTE, 30_000),
    orgTimestamps: repeat(COPILOT_PER_USER_PER_MINUTE, 30_000),
    now: NOW,
  });
  expect(v.allowed).toBe(false);
  expect(v.scope).toBe("user");
  // Oldest entry is 30s old, so the window frees up ~30s from now.
  expect(v.retryAfterSeconds).toBe(30);
  expect(copilotLimitMessage(v)).toContain("30 seconds");
});

test("messages that aged out of the window don't count", () => {
  const v = checkCopilotLimits({
    userTimestamps: repeat(COPILOT_PER_USER_PER_MINUTE, MINUTE_MS + 5_000),
    orgTimestamps: repeat(COPILOT_PER_USER_PER_MINUTE, MINUTE_MS + 5_000),
    now: NOW,
  });
  expect(v.allowed).toBe(true);
});

test("the org hourly ceiling catches load spread across people", () => {
  const v = checkCopilotLimits({
    userTimestamps: [],
    orgTimestamps: repeat(COPILOT_PER_ORG_PER_HOUR, 10 * MINUTE_MS),
    now: NOW,
  });
  expect(v.allowed).toBe(false);
  expect(v.scope).toBe("org");
  expect(copilotLimitMessage(v)).toContain("workspace");
});

test("an org an hour past its burst is allowed again", () => {
  const v = checkCopilotLimits({
    userTimestamps: [],
    orgTimestamps: repeat(COPILOT_PER_ORG_PER_HOUR, HOUR_MS + MINUTE_MS),
    now: NOW,
  });
  expect(v.allowed).toBe(true);
});

test("unparseable timestamps are ignored rather than counted", () => {
  const v = checkCopilotLimits({
    userTimestamps: Array.from({ length: 50 }, () => "not-a-date"),
    orgTimestamps: Array.from({ length: 50 }, () => ""),
    now: NOW,
  });
  expect(v.allowed).toBe(true);
});

test("a blocked verdict never tells someone to retry in zero seconds", () => {
  const v = checkCopilotLimits({
    userTimestamps: repeat(COPILOT_PER_USER_PER_MINUTE, MINUTE_MS - 1),
    orgTimestamps: [],
    now: NOW,
  });
  expect(v.allowed).toBe(false);
  expect(v.retryAfterSeconds).toBeGreaterThanOrEqual(1);
});
