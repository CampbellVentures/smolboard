import { query, v } from "@pylonsync/functions";

// Copilot/MCP tool: the workspace's recent activity feed — same rows the bell
// menu shows. Organizer-gated via the event's org, like every agent tool.
export default query<
  { eventId: string; limit?: number },
  { activity: { when: string; kind: string; message: string; actor?: string }[] }
>({
  args: { eventId: v.id("Event"), limit: v.optional(v.int()) },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const rows = (await ctx.db.unsafe.query("ActivityLog", { orgId: event.orgId as string }))
      .sort((a, b) => ((a.createdAt as string) < (b.createdAt as string) ? 1 : -1))
      .slice(0, limit);
    return {
      activity: rows.map((row) => ({
        when: row.createdAt as string,
        kind: row.kind as string,
        message: row.message as string,
        actor: (row.actorName as string) ?? undefined,
      })),
    };
  },
});
