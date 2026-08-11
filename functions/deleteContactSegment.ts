import { mutation, v } from "@pylonsync/functions";

export default mutation<{ segmentId: string }, { deleted: boolean }>({
  args: { segmentId: v.id("ContactSegment") },
  async handler(ctx, args) {
    const segment = await ctx.db.unsafe.get("ContactSegment", args.segmentId);
    if (!segment) return { deleted: false };
    await ctx.requireMember(segment.orgId as string, { role: ["owner", "admin"] });
    await ctx.db.unsafe.delete("ContactSegment", args.segmentId);
    return { deleted: true };
  },
});
