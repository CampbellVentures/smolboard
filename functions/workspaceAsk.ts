import { action, v, type LlmContentBlock, type LlmMessage } from "@pylonsync/functions";
import {
  WORKSPACE_SYSTEM_PROMPT,
  workspaceToolByName,
  workspaceToolDefsForLlm,
} from "../lib/agent-tools";

// The workspace copilot: the panel that greets an organizer on the events
// screen, before they have opened anything. The event copilot is pinned to one
// event and keeps threads; this one spans events and is deliberately
// stateless — a question and an answer, no CopilotThread row, because thread
// storage is keyed by eventId and a workspace conversation has no event.
//
// READ TOOLS ONLY. The model picks the eventId per call (like the MCP server),
// and nothing on this belt can change a status or reach a speaker — the first
// screen after sign-in is the wrong place to hand an agent write access.
const MAX_TOOL_ROUNDS = 6;

export default action<
  { orgId: string; message: string },
  { text: string; toolCalls: { name: string; isError?: boolean }[] }
>({
  timeout: 120,
  args: { orgId: v.id("Org"), message: v.string() },
  async handler(ctx, args) {
    await ctx.requireMember(args.orgId);
    const message = args.message.trim();
    if (!message) throw ctx.error("INVALID_ARGS", "Ask a question.");
    if (message.length > 2000) {
      throw ctx.error("INVALID_ARGS", "That question is too long; shorten it.");
    }

    const messages: LlmMessage[] = [{ role: "user", content: message }];
    const toolCalls: { name: string; isError?: boolean }[] = [];
    let finalText = "";

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await ctx.llm.complete({
        system: WORKSPACE_SYSTEM_PROMPT,
        messages,
        tools: workspaceToolDefsForLlm(),
      });

      const blocks = (res.content ?? []) as LlmContentBlock[];
      for (const block of blocks) {
        if ((block as { type?: string }).type === "text") {
          finalText += (block as { text?: string }).text ?? "";
        }
      }

      const uses = blocks.filter(
        (block) => (block as { type?: string }).type === "tool_use",
      ) as unknown as { id: string; name: string; input: Record<string, unknown> }[];
      if (uses.length === 0 || res.stop_reason !== "tool_use") break;

      messages.push({ role: "assistant", content: blocks });
      const results: LlmContentBlock[] = [];
      for (const use of uses) {
        // workspaceToolByName resolves reads only, so a hallucinated write
        // tool name lands here as "not available" instead of executing.
        const def = workspaceToolByName(use.name);
        let result: unknown;
        let isError = false;
        if (!def) {
          result = {
            error: `${use.name} is not available from the workspace copilot. It is read-only; open the event to make changes.`,
          };
          isError = true;
        } else {
          try {
            result = await ctx.runQuery(def.fn, use.input ?? {});
          } catch (e) {
            result = { error: e instanceof Error ? e.message : String(e) };
            isError = true;
          }
        }
        toolCalls.push({ name: use.name, isError: isError || undefined });
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(result),
          is_error: isError,
        } as unknown as LlmContentBlock);
      }
      messages.push({ role: "user", content: results });
    }

    return { text: finalText.trim() || "(no reply)", toolCalls };
  },
});
