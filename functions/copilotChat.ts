import { action, v, type LlmContentBlock, type LlmMessage } from "@pylonsync/functions";
import { AGENT_TOOLS, COPILOT_SYSTEM_PROMPT, toolByName, toolDefsForLlm } from "../lib/agent-tools";

// The event copilot (SPEC → Differentiators #1): one agent loop over the
// shared tool belt. Runs AS the calling organizer — every tool is a registered
// function that re-checks membership itself, so the model can never do
// something the person couldn't.
//
// Progress streams over the thread's room (survives tab switches; renders on
// any device): topics are "delta" (text tokens), "tool" (a call starting /
// finishing), and "done". The final message is also persisted, so the room
// stream is pure UX — a client that missed it still gets the row.
const MAX_TOOL_ROUNDS = 8;

export default action<
  { eventId: string; threadId?: string; message: string },
  { threadId: string; text: string }
>({
  timeout: 120,
  args: {
    eventId: v.id("Event"),
    threadId: v.optional(v.id("CopilotThread")),
    message: v.string(),
  },
  async handler(ctx, args) {
    const turn = await ctx.runMutation<{
      threadId: string;
      orgId: string;
      eventName: string;
      history: { role: string; text: string }[];
    }>("copilotStartTurn", {
      eventId: args.eventId,
      threadId: args.threadId,
      message: args.message,
    });
    const room = `copilot:${turn.threadId}`;

    const messages: LlmMessage[] = [
      ...turn.history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.text })),
      { role: "user", content: args.message },
    ];
    const system = `${COPILOT_SYSTEM_PROMPT}\n\nCurrent event: "${turn.eventName}" (eventId: ${args.eventId}).`;

    const toolCalls: { name: string; input: unknown; result: unknown; isError?: boolean }[] = [];
    let finalText = "";

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await ctx.llm.stream(
        {
          system,
          messages,
          tools: toolDefsForLlm(),
          max_tokens: 2048,
        },
        (e) => {
          if (e.type === "text_delta") {
            void ctx.rooms.broadcast(room, "delta", { text: e.text });
          }
        },
      );

      const blocks = (Array.isArray(res.content) ? res.content : []) as LlmContentBlock[];
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("");
      if (text) finalText += (finalText ? "\n" : "") + text;

      if (res.stop_reason !== "tool_use" || round === MAX_TOOL_ROUNDS) break;

      const uses = blocks.filter((b) => b.type === "tool_use") as {
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, unknown>;
      }[];
      messages.push({ role: "assistant", content: blocks });

      const results: LlmContentBlock[] = [];
      for (const use of uses) {
        const def = toolByName(use.name);
        void ctx.rooms.broadcast(room, "tool", { name: use.name, phase: "start", input: use.input });
        let result: unknown;
        let isError = false;
        if (!def) {
          result = { error: `Unknown tool ${use.name}` };
          isError = true;
        } else {
          // Tools that operate on the event get eventId injected — the model
          // never chooses the tenant scope.
          const callArgs = { ...use.input, eventId: args.eventId };
          try {
            result =
              def.kind === "query"
                ? await ctx.runQuery(def.fn, callArgs)
                : await ctx.runMutation(def.fn, callArgs);
          } catch (e) {
            result = { error: e instanceof Error ? e.message : String(e) };
            isError = true;
          }
        }
        toolCalls.push({ name: use.name, input: use.input, result, isError: isError || undefined });
        void ctx.rooms.broadcast(room, "tool", {
          name: use.name,
          phase: "end",
          isError,
          summary: JSON.stringify(result).slice(0, 400),
        });
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(result),
          is_error: isError,
        } as unknown as LlmContentBlock);
      }
      messages.push({ role: "user", content: results });
    }

    if (!finalText) finalText = "(no reply)";
    await ctx.runMutation("copilotSaveAssistant", {
      threadId: turn.threadId,
      text: finalText,
      toolCalls,
    });
    await ctx.rooms.broadcast(room, "done", { threadId: turn.threadId });
    return { threadId: turn.threadId, text: finalText };
  },
});
