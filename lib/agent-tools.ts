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
      "Accept, reject, or waitlist a submission. Accepting/rejecting emails the speaker (templated) and accepting materializes their onboarding tasks. Use after the organizer's intent is clear — this notifies a real person.",
    input_schema: {
      type: "object",
      properties: {
        submissionId: str("Submission id"),
        status: str('"accepted" | "rejected" | "waitlisted" | "in_review"'),
        notify: { type: "boolean", description: "Send the templated email (default true)" },
      },
      required: ["submissionId", "status"],
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
    name: "review_progress",
    description:
      "Review-round health: per-round assignment completion and which submissions still have no scores.",
    input_schema: { type: "object", properties: {} },
    fn: "agentReviewProgress",
    kind: "query",
    mutates: false,
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
      },
      required: ["speakerUserIds"],
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
      properties: { sessionId: str("Session id") },
      required: ["sessionId"],
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
- Destructive or outward-facing actions (set_submission_status, nudge_speakers, send_schedule_invites) email real people. Only call them when the organizer's message clearly asks for it; otherwise present what you WOULD do and ask.
- schedule_session refuses conflicting placements and returns the conflicts — when that happens, explain the collision and propose the nearest free slot.
- Be concise. Organizers are busy; lead with the answer, use short lists, no filler.
- The UI next to you is live — after your writes, the tables update in real time, so refer to results by name, not by "refresh to see".`;
