import { query, v } from "@pylonsync/functions";

export default query({
  args: { orgId: v.id("Org") },
  async handler(ctx, args) {
    await ctx.requireMember(args.orgId, { role: ["owner", "admin"] });
    // Organizer-only roster projection; direct entity writes remain denied.
    const rows = await ctx.db.unsafe.query("ReviewerMembership", { orgId: args.orgId });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      status: row.status,
    }));
  },
});
