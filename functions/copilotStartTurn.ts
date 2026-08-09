import { mutation, v } from "@pylonsync/functions";

// First hop of a copilot turn (the copilotChat ACTION has no ctx.db, so the
// transactional parts live here): verify membership, create the thread on
// first message, persist the user's message, and return the compact history
// the LLM loop needs.
export default mutation<
  { eventId: string; threadId?: string; message: string },
  {
    threadId: string;
    orgId: string;
    eventName: string;
    history: { role: string; text: string }[];
  }
>({
  internal: true,
  args: {
    eventId: v.id("Event"),
    threadId: v.optional(v.id("CopilotThread")),
    message: v.string(),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    const message = args.message.trim();
    if (!message) throw ctx.error("INVALID_ARGS", "Say something first.");
    if (message.length > 4000) throw ctx.error("INVALID_ARGS", "Keep messages under 4000 characters.");

    // ctx.db.unsafe (below): membership verified above; copilot rows are
    // function-managed (policies deny direct writes).
    let threadId = args.threadId;
    if (threadId) {
      const thread = await ctx.db.unsafe.get("CopilotThread", threadId);
      if (!thread || thread.eventId !== args.eventId) {
        throw ctx.error("NOT_FOUND", "Thread not found.");
      }
      await ctx.db.unsafe.update("CopilotThread", threadId, {
        updatedAt: new Date().toISOString(),
      });
    } else {
      threadId = await ctx.db.unsafe.insert("CopilotThread", {
        orgId: event.orgId as string,
        eventId: args.eventId,
        title: message.slice(0, 60),
        createdBy: ctx.auth.userId,
      });
    }

    const prior = await ctx.db.unsafe.query("CopilotMessage", { threadId });
    prior.sort((a, b) => ((a.createdAt as string) < (b.createdAt as string) ? -1 : 1));

    await ctx.db.unsafe.insert("CopilotMessage", {
      orgId: event.orgId as string,
      threadId,
      role: "user",
      text: message,
    });

    return {
      threadId,
      orgId: event.orgId as string,
      eventName: event.name as string,
      // Last 20 turns keeps context bounded; tool call payloads are not
      // replayed — the model re-queries live data instead of trusting stale
      // results.
      history: prior.slice(-20).map((m) => ({
        role: m.role as string,
        text: m.text as string,
      })),
    };
  },
});
