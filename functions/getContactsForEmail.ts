import { query, v } from "@pylonsync/functions";

// Internal fetch for the bulk-email action (actions have no direct ctx.db).
export default query({
  internal: true,
  args: { orgId: v.id("Org"), contactIds: v.array(v.id("Contact")) },
  async handler(ctx, args) {
    const wanted = new Set(args.contactIds);
    return (await ctx.db.unsafe.query("Contact", { orgId: args.orgId }))
      .filter((row) => wanted.has(row.id as string))
      .map((row) => ({
        id: row.id as string,
        name: row.name as string,
        email: row.email as string,
        company: row.company as string | undefined,
        jobTitle: row.jobTitle as string | undefined,
      }));
  },
});
