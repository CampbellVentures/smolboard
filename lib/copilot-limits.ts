// Limits on the copilot, kept as pure functions so they can be tested without
// a server. Enforced in functions/copilotStartTurn.ts, which runs BEFORE any
// model call, so a rejected turn costs nothing.
//
// This matters more than usual here: smolboard.app hosts a public demo with a
// documented organizer login, and every copilot turn spends tokens on our key.

/** A single message. Long enough for a pasted abstract, short enough that one
 *  turn can't blow the context window or the bill. */
export const MAX_COPILOT_MESSAGE_CHARS = 2000;

/** Per person. A human types a few messages a minute; a runaway client loop
 *  does not. */
export const COPILOT_PER_USER_PER_MINUTE = 12;

/** Per workspace per hour, so one shared demo account can't run up a bill
 *  even spread across several people. */
export const COPILOT_PER_ORG_PER_HOUR = 120;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

export interface CopilotLimitCheck {
  /** ISO timestamps of this user's own recent copilot messages. */
  userTimestamps: string[];
  /** ISO timestamps of every copilot message in the workspace. */
  orgTimestamps: string[];
  now: number;
}

export interface CopilotLimitVerdict {
  allowed: boolean;
  /** Which ceiling was hit, for the message shown to the caller. */
  scope?: "user" | "org";
  /** Whole seconds until the caller may retry. Always at least 1 when blocked. */
  retryAfterSeconds?: number;
}

function within(timestamps: string[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  return timestamps
    .map((t) => Date.parse(t))
    .filter((t) => Number.isFinite(t) && t > cutoff)
    .sort((a, b) => a - b);
}

export function checkCopilotLimits({
  userTimestamps,
  orgTimestamps,
  now,
}: CopilotLimitCheck): CopilotLimitVerdict {
  const perMinute = within(userTimestamps, now, MINUTE_MS);
  if (perMinute.length >= COPILOT_PER_USER_PER_MINUTE) {
    // The window frees up when its oldest entry falls out of it.
    const freesAt = perMinute[0] + MINUTE_MS;
    return {
      allowed: false,
      scope: "user",
      retryAfterSeconds: Math.max(1, Math.ceil((freesAt - now) / 1000)),
    };
  }
  const perHour = within(orgTimestamps, now, HOUR_MS);
  if (perHour.length >= COPILOT_PER_ORG_PER_HOUR) {
    const freesAt = perHour[0] + HOUR_MS;
    return {
      allowed: false,
      scope: "org",
      retryAfterSeconds: Math.max(1, Math.ceil((freesAt - now) / 1000)),
    };
  }
  return { allowed: true };
}

/** Wording shown to whoever hit the ceiling. Plain, and says when to retry. */
export function copilotLimitMessage(verdict: CopilotLimitVerdict): string {
  const seconds = verdict.retryAfterSeconds ?? 60;
  const wait =
    seconds >= 120
      ? `${Math.ceil(seconds / 60)} minutes`
      : seconds === 1
        ? "a second"
        : `${seconds} seconds`;
  if (verdict.scope === "org") {
    return `This workspace has hit its hourly copilot limit. Try again in ${wait}.`;
  }
  return `You're sending messages faster than the copilot can keep up. Try again in ${wait}.`;
}
