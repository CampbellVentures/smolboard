import { query } from "@pylonsync/functions";

// Agent tool (MCP discovery): the caller's workspace events, so an MCP client
// can find eventIds without any UI. Lists every event in orgs the caller
// belongs to.
export default query({
  args: {},
  async handler(ctx) {
    if (!ctx.auth.userId) throw ctx.error("UNAUTHENTICATED", "Sign in required.");
    // ctx.db.unsafe: rows are filtered to the caller's own memberships below.
    const memberships = await ctx.db.unsafe.query("OrgMember", { userId: ctx.auth.userId });
    const orgIds = new Set(memberships.map((m) => m.orgId as string));
    const events = await ctx.db.unsafe.list("Event");
    return {
      events: events
        .filter((e) => orgIds.has(e.orgId as string))
        .map((e) => ({
          eventId: e.id,
          name: e.name,
          slug: e.slug,
          cfpStatus: e.cfpStatus,
          startDate: e.startDate ?? null,
        })),
    };
  },
});
