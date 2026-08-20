import { afterAll, beforeAll, expect, test } from "bun:test";
import { createTwoOrgFixture, entityList, jsonRequest } from "../helpers/http-fixtures";
import { startDisposablePylonServer, type DisposablePylonServer } from "../helpers/http-server";
import type { SubmissionRow } from "../../lib/types";

let server: DisposablePylonServer;

beforeAll(async () => {
  server = await startDisposablePylonServer();
}, 30_000);

afterAll(async () => {
  await server?.stop();
}, 10_000);

async function callTool(
  identity: Parameters<typeof jsonRequest>[0],
  name: string,
  args: Record<string, unknown>,
) {
  const { response, body } = await jsonRequest(identity, "/api/fn/mcp", "POST", {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  return { response, body: body as { result?: { isError?: boolean; content?: { text: string }[] } } };
}

// An outward-facing tool emails a real person. The copilot once accepted a
// submission — notifying the speaker — purely to get past schedule_session's
// accepted-only requirement, so refusing unconfirmed calls has to be
// mechanical rather than a line in the prompt.
test("agent tools that email people refuse without an explicit confirm", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "agent-confirm");
  const submissions = await entityList<SubmissionRow>(fixture.a.owner, "Submission");
  const target = submissions.find((row) => row.eventId === fixture.a.eventId);
  expect(target).toBeDefined();

  const unconfirmed = await callTool(fixture.a.owner, "set_submission_status", {
    eventId: fixture.a.eventId,
    submissionId: target!.id,
    status: "accepted",
  });
  expect(unconfirmed.body.result?.isError).toBe(true);
  expect(unconfirmed.body.result?.content?.[0]?.text).toContain("confirm");

  // The status must be untouched: a refused call may not have side effects.
  const afterRefusal = await entityList<SubmissionRow>(fixture.a.owner, "Submission");
  expect(afterRefusal.find((row) => row.id === target!.id)?.status).toBe(target!.status);

  // confirm: false is a decision, not an omission — still refused.
  const declined = await callTool(fixture.a.owner, "set_submission_status", {
    eventId: fixture.a.eventId,
    submissionId: target!.id,
    status: "accepted",
    confirm: false,
  });
  expect(declined.body.result?.isError).toBe(true);

  const confirmed = await callTool(fixture.a.owner, "set_submission_status", {
    eventId: fixture.a.eventId,
    submissionId: target!.id,
    status: "accepted",
    confirm: true,
    notify: false,
  });
  expect(confirmed.body.result?.isError).toBeFalsy();
  const afterConfirm = await entityList<SubmissionRow>(fixture.a.owner, "Submission");
  expect(afterConfirm.find((row) => row.id === target!.id)?.status).toBe("accepted");
});

// Read-only tools carry no confirmation burden.
test("read-only agent tools still run without a confirm flag", async () => {
  const fixture = await createTwoOrgFixture(server.baseUrl, "agent-reads");
  const listed = await callTool(fixture.a.owner, "list_submissions", {
    eventId: fixture.a.eventId,
  });
  expect(listed.body.result?.isError).toBeFalsy();
});
