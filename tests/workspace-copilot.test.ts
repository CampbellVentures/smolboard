import { expect, test } from "bun:test";
import {
  AGENT_TOOLS,
  CONFIRM_REQUIRED,
  confirmationGate,
  workspaceToolByName,
  workspaceToolDefsForLlm,
} from "../lib/agent-tools";

// The workspace copilot greets an organizer on the first screen after sign-in
// and is not pinned to an event. It must not be able to reach a speaker from
// there: no mutations on the belt, at all.
test("the workspace tool belt is read-only", () => {
  const names = workspaceToolDefsForLlm().map((tool) => tool.name);
  const mutating = AGENT_TOOLS.filter((tool) => tool.mutates).map((tool) => tool.name);
  for (const name of mutating) expect(names).not.toContain(name);
  for (const name of CONFIRM_REQUIRED) expect(names).not.toContain(name);
  expect(names).toContain("list_events");
});

test("workspaceToolByName refuses to resolve a mutating tool", () => {
  expect(workspaceToolByName("list_submissions")).toBeDefined();
  expect(workspaceToolByName("set_submission_status")).toBeUndefined();
  expect(workspaceToolByName("email_speakers")).toBeUndefined();
});

// Unpinned agents choose the event per call, so every event-scoped tool has to
// advertise eventId — otherwise the model has no way to say which event it
// means and the call fails validation.
test("workspace tools require an explicit eventId, except list_events", () => {
  for (const tool of workspaceToolDefsForLlm()) {
    const schema = tool.input_schema as { required?: string[] };
    if (tool.name === "list_events") {
      expect(schema.required ?? []).not.toContain("eventId");
    } else {
      expect(schema.required ?? []).toContain("eventId");
    }
  }
});

test("outward-facing tools stay gated behind an explicit confirm", () => {
  expect(confirmationGate("set_submission_status", {})).toContain("confirm");
  expect(confirmationGate("set_submission_status", { confirm: false })).toContain("confirm");
  expect(confirmationGate("set_submission_status", { confirm: true })).toBeNull();
  expect(confirmationGate("list_submissions", {})).toBeNull();
});
