import { mutation, v } from "@pylonsync/functions";

// Remove a copilot conversation and the messages under it.
//
// Copilot rows are function-managed (policies deny direct client writes), so
// without this there was no way to delete a conversation at all — and deleting
// the thread alone would strand its messages in the table forever.
export default mutation<{ threadId: string }, { deleted: true; messages: number }>({
  args: { threadId: v.id("CopilotThread") },
  async handler(ctx, args) {
    const thread = await ctx.db.unsafe.get("CopilotThread", args.threadId);
    if (!thread) throw ctx.error("NOT_FOUND", "Conversation not found.");
    // Membership gates the workspace; the thread's own author gates the row.
    // An admin can be in the org and still have no business reading someone
    // else's conversation with the copilot.
    await ctx.requireMember(thread.orgId as string, { role: ["owner", "admin"] });
    if (thread.createdBy !== ctx.auth.userId) {
      throw ctx.error("NOT_FOUND", "Conversation not found.");
    }

    const messages = (await ctx.db.unsafe.query("CopilotMessage", { threadId: args.threadId }))
      .filter((row) => row.threadId === args.threadId);
    for (const message of messages) {
      await ctx.db.unsafe.delete("CopilotMessage", message.id as string);
    }
    await ctx.db.unsafe.delete("CopilotThread", args.threadId);
    return { deleted: true, messages: messages.length };
  },
});
