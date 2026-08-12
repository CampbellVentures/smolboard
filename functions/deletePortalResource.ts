import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: { resourceId: v.id("PortalResource") },
  async handler(ctx, args) {
    const row = await ctx.db.unsafe.get("PortalResource", args.resourceId);
    if (!row) throw ctx.error("NOT_FOUND", "Page not found.");
    await ctx.requireMember(row.orgId as string, { role: ["owner", "admin"] });
    await ctx.db.unsafe.delete("PortalResource", args.resourceId);
    return { deleted: true };
  },
});
