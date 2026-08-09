import { mutation, v } from "@pylonsync/functions";

// Final hop of a copilot turn: persist the assistant's reply + tool-call
// audit so the thread renders identically on any device, any time.
export default mutation({
  internal: true,
  args: {
    threadId: v.id("CopilotThread"),
    text: v.string(),
    toolCalls: v.optional(v.json()),
  },
  async handler(ctx, args) {
    // ctx.db.unsafe: internal-only, called from the copilot action after the
    // start-turn mutation already verified membership for this thread's org.
    const thread = await ctx.db.unsafe.get("CopilotThread", args.threadId);
    if (!thread) throw ctx.error("NOT_FOUND", "Thread not found.");
    await ctx.requireMember(thread.orgId as string, { role: ["owner", "admin"] });
    const id = await ctx.db.unsafe.insert("CopilotMessage", {
      orgId: thread.orgId as string,
      threadId: args.threadId,
      role: "assistant",
      text: args.text,
      toolCallsJson: Array.isArray(args.toolCalls) && args.toolCalls.length > 0 ? args.toolCalls : undefined,
    });
    return { id };
  },
});
