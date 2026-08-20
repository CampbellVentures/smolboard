// The copilot's tool belt — ONE definition shared by the in-app copilot
// (functions/copilotChat.ts via ctx.llm) and the MCP server (app/mcp/route.ts),
// so "their six AI agents" is our one tool set exposed two ways.
//
// Definitions are Anthropic tool shape (name, description, input_schema).
// Execution is a dispatch table mapping each tool onto a registered function
// (query/mutation) — the SAME functions the UI buttons call, so agent writes
// hit identical validation, authorization, and email side-effects.

export interface AgentToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  // Registered function to invoke + whether it's a read or a write.
  fn: string;
  kind: "query" | "mutation";
  // Copilot UIs render mutations differently (confirm-style cards).
  mutates: boolean;
}

const str = (description: string) => ({ type: "string", description });

const confirmArg = {
  type: "boolean",
  description:
    "Must be true. Set it only after the organizer has asked for THIS action in their own words. Never set it to clear an error or to unblock another tool.",
};

// Tools whose effect leaves the app: a real email to a real person, or a
// status change that triggers one. The model may not take these on its own
// initiative, and the prompt rule alone did not hold — the copilot accepted a
// submission (emailing the speaker) while trying to satisfy schedule_session's
// accepted-only requirement. The gate makes the boundary mechanical: without
// an explicit confirm the call never reaches the function.
export const CONFIRM_REQUIRED = new Set([
  "set_submission_status",
  "email_speakers",
  "nudge_speakers",
  "send_schedule_invites",
]);

/** Refusal message when an outward-facing tool is called unconfirmed, else null. */
export function confirmationGate(
  name: string,
  input: Record<string, unknown> | undefined,
): string | null {
  if (!CONFIRM_REQUIRED.has(name)) return null;
  if (input?.confirm === true) return null;
  return `${name} contacts real people and was called without confirm: true. Do not retry automatically. Tell the organizer exactly what this will do and who it reaches, and call it again only if they ask for it.`;
}

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    name: "list_submissions",
    description:
      "List the event's submissions with speaker name, category, status, round, and average review score. Filter by status or category; search by title/speaker.",
    input_schema: {
      type: "object",
      properties: {
        status: str('Filter: "submitted" | "in_review" | "accepted" | "rejected" | "waitlisted" | "withdrawn"'),
        category: str("Filter by routed category"),
        search: str("Case-insensitive search over title and speaker name"),
      },
    },
    fn: "agentListSubmissions",
    kind: "query",
    mutates: false,
  },
  {
    name: "get_submission",
    description:
      "Full detail for one submission: abstract, custom answers, speaker profile, all review scores and comments.",
    input_schema: {
      type: "object",
      properties: { submissionId: str("Submission id") },
      required: ["submissionId"],
    },
    fn: "agentGetSubmission",
    kind: "query",
    mutates: false,
  },
  {
    name: "set_submission_status",
    description:
      "Accept, reject, or waitlist a submission. Accepting/rejecting emails the speaker (templated) and accepting materializes their onboarding tasks. Use after the organizer's intent is clear, because this notifies a real person.",
    input_schema: {
      type: "object",
      properties: {
        submissionId: str("Submission id"),
        status: str('"accepted" | "rejected" | "waitlisted" | "in_review"'),
        notify: { type: "boolean", description: "Send the templated email (default true)" },
        confirm: confirmArg,
      },
      required: ["submissionId", "status", "confirm"],
    },
    fn: "setSubmissionStatus",
    kind: "mutation",
    mutates: true,
  },
  {
    name: "schedule_session",
    description:
      "Place an accepted submission (or move an existing session) into a room and time slot. Refuses placements that create a room overlap or double-book a speaker, returning the conflicts instead — relay them and propose an alternative.",
    input_schema: {
      type: "object",
      properties: {
        submissionId: str("Accepted submission to schedule (creates its session)"),
        sessionId: str("Existing session to move (alternative to submissionId)"),
        roomName: str("Room name as shown on the agenda"),
        startTime: str("ISO 8601 start"),
        durationMinutes: { type: "number", description: "Length in minutes (default 30)" },
      },
      required: ["roomName", "startTime"],
    },
    fn: "agentScheduleSession",
    kind: "mutation",
    mutates: true,
  },
  {
    name: "find_conflicts",
    description: "List every current agenda conflict (room overlaps, double-booked speakers).",
    input_schema: { type: "object", properties: {} },
    fn: "agentFindConflicts",
    kind: "query",
    mutates: false,
  },
  {
    name: "pending_tasks",
    description:
      "Speakers with outstanding onboarding tasks (what's missing, due dates, overdue flags).",
    input_schema: { type: "object", properties: {} },
    fn: "agentPendingTasks",
    kind: "query",
    mutates: false,
  },
  {
    name: "recent_activity",
    description:
      "The workspace's recent activity feed: new submissions, status decisions, file uploads, content approvals, review scores, schedule runs. Use for questions like \"what happened today?\" or \"anything new since yesterday?\".",
    input_schema: {
      type: "object",
      properties: { limit: str("Max entries to return (default 20, cap 50)") },
    },
    fn: "agentRecentActivity",
    kind: "query",
    mutates: false,
  },
  {
    name: "review_progress",
    description:
      "Review-round health: per-round assignment completion and which submissions still have no scores.",
    input_schema: { type: "object", properties: {} },
    fn: "agentReviewProgress",
    kind: "query",
    mutates: false,
  },
  {
    name: "content_status",
    description:
      "Deliverable review state per speaker: what's uploaded, approved, pending review, sent back for changes, or not uploaded yet.",
    input_schema: { type: "object", properties: {} },
    fn: "agentContentStatus",
    kind: "query",
    mutates: false,
  },
  {
    name: "auto_schedule",
    description:
      "Place every unscheduled session into the earliest conflict-free slot (9:00\u201317:00 event-local; room overlaps and speaker double-bookings respected). Organizer can drag to adjust afterward. Returns how many were placed.",
    input_schema: { type: "object", properties: {} },
    fn: "autoScheduleSessions",
    kind: "mutation",
    mutates: true,
  },
  {
    name: "email_speakers",
    description:
      "Send a one-off email to specific speakers (by userId; find them with pending_tasks or content_status). Merge tags {{speaker_name}}, {{event_name}}, {{portal_link}} work in subject and body. Real email \u2014 confirm the recipient list and copy with the organizer first.",
    input_schema: {
      type: "object",
      properties: {
        speakerUserIds: {
          type: "array",
          items: { type: "string" },
          description: "Speaker user ids",
        },
        subject: str("Email subject"),
        body: str("Plain-text body; merge tags allowed"),
        confirm: confirmArg,
      },
      required: ["speakerUserIds", "subject", "body", "confirm"],
    },
    fn: "agentEmailSpeakers",
    kind: "mutation",
    mutates: true,
  },
  {
    name: "nudge_speakers",
    description:
      "Send the task-reminder email to specific speakers (by userId; use pending_tasks to find them). Real email — confirm intent first.",
    input_schema: {
      type: "object",
      properties: {
        speakerUserIds: {
          type: "array",
          items: { type: "string" },
          description: "Speaker user ids — get them from pending_tasks first",
        },
        confirm: confirmArg,
      },
      required: ["speakerUserIds", "confirm"],
    },
    fn: "nudgeSpeakers",
    kind: "mutation",
    mutates: true,
  },
  {
    name: "send_schedule_invites",
    description:
      "Email calendar invites (.ics) to a scheduled session's speakers. Re-sending after a move updates their calendars.",
    input_schema: {
      type: "object",
      properties: { sessionId: str("Session id"), confirm: confirmArg },
      required: ["sessionId", "confirm"],
    },
    fn: "sendScheduleInvites",
    kind: "mutation",
    mutates: true,
  },
];

export function toolDefsForLlm() {
  return AGENT_TOOLS.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}

export function toolByName(name: string): AgentToolDef | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}

export const COPILOT_SYSTEM_PROMPT = `You are the smolboard event copilot — the operating partner for a conference organizer. You manage their call-for-speakers pipeline: reviewing submissions, accepting/rejecting, building the agenda, and keeping speakers on track.

Rules:
- Ground every answer in tool results; never invent submissions, scores, or names.
- Destructive or outward-facing actions (set_submission_status, nudge_speakers, email_speakers, send_schedule_invites) email real people. They require confirm: true, and you may set it only when the organizer's current message asks for that action in their own words. Otherwise describe what you would do, name who it reaches, and stop.
- Never take an outward-facing action to clear an error from another tool. schedule_session refuses submissions that are not accepted; that is a decision for the organizer, so report it and ask — do not accept the submission yourself to get past it.
- schedule_session refuses conflicting placements and returns the conflicts — when that happens, explain the collision and propose the nearest free slot.
- Be concise. Organizers are busy; lead with the answer, use short lists, no filler.
- Refer to submissions, sessions, and speakers by title and name. Never print raw ids (submissionId, sessionId, userId) — they mean nothing to the organizer; pass them to tools silently.
- The UI next to you is live — after your writes, the tables update in real time, so refer to results by name, not by "refresh to see".`;
