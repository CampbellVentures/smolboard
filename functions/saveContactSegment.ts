import { mutation, v } from "@pylonsync/functions";

// A saved segment is a named filter over the directory, so a curated view like
// "AI infra folks we haven't contacted" reopens with its members.
export default mutation<
  { orgId: string; segmentId?: string; name: string; filters: Record<string, string> },
  { id: string }
>({
  args: {
    orgId: v.id("Org"),
    segmentId: v.optional(v.id("ContactSegment")),
    name: v.string(),
    filters: v.json(),
  },
  async handler(ctx, args) {
    await ctx.requireMember(args.orgId, { role: ["owner", "admin"] });
    const name = args.name.trim();
    if (!name) throw ctx.error("INVALID_ARGS", "Name the segment.");
    if (args.segmentId) {
      const existing = await ctx.db.unsafe.get("ContactSegment", args.segmentId);
      if (!existing || existing.orgId !== args.orgId) {
        throw ctx.error("NOT_FOUND", "Segment not found.");
      }
      await ctx.db.unsafe.update("ContactSegment", args.segmentId, {
        name,
        filtersJson: args.filters,
      });
      return { id: args.segmentId };
    }
    const id = (await ctx.db.unsafe.insert("ContactSegment", {
      orgId: args.orgId,
      name,
      filtersJson: args.filters,
    })) as string;
    return { id };
  },
});
