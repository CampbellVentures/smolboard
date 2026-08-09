import { mutation, v } from "@pylonsync/functions";

export default mutation({
  args: {
    orgId: v.id("Org"),
    userId: v.id("User"),
    active: v.bool(),
  },
  async handler(ctx, args) {
    await ctx.requireMember(args.orgId, { role: ["owner", "admin"] });
    // Membership is the framework half of reviewer authorization.
    const members = await ctx.db.unsafe.query("OrgMember", { orgId: args.orgId, userId: args.userId });
    if (members.length === 0) throw ctx.error("NOT_FOUND", "Reviewer must first join this organization.");
    const existing = await ctx.db.unsafe.query("ReviewerMembership", {
      orgId: args.orgId,
      userId: args.userId,
    });
    const status = args.active ? "active" : "inactive";
    if (existing[0]) {
      await ctx.db.unsafe.update("ReviewerMembership", existing[0].id as string, {
        status,
        updatedAt: new Date().toISOString(),
      });
      return { id: existing[0].id as string, status };
    }
    const id = await ctx.db.unsafe.insert("ReviewerMembership", {
      orgId: args.orgId,
      userId: args.userId,
      status,
      createdBy: ctx.auth.userId,
    });
    return { id, status };
  },
});
