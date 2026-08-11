import { mutation, v } from "@pylonsync/functions";

// Fold duplicate contacts into one record: the primary keeps its identity,
// gains any field it was missing, inherits tags and notes, absorbs the losers'
// stage history, and the duplicates are removed.
export default mutation<
  { orgId: string; primaryId: string; duplicateIds: string[] },
  { merged: number }
>({
  args: {
    orgId: v.id("Org"),
    primaryId: v.id("Contact"),
    duplicateIds: v.array(v.id("Contact")),
  },
  async handler(ctx, args) {
    await ctx.requireMember(args.orgId, { role: ["owner", "admin"] });
    const primary = await ctx.db.unsafe.get("Contact", args.primaryId);
    if (!primary || primary.orgId !== args.orgId) {
      throw ctx.error("NOT_FOUND", "Contact not found.");
    }

    const patch: Record<string, unknown> = {};
    const tags = new Set<string>(
      Array.isArray(primary.tagsJson) ? (primary.tagsJson as string[]) : [],
    );
    const notes: string[] = [];
    if (primary.notes) notes.push(primary.notes as string);
    let merged = 0;

    for (const id of args.duplicateIds) {
      if (id === args.primaryId) continue;
      const dup = await ctx.db.unsafe.get("Contact", id);
      if (!dup || dup.orgId !== args.orgId) continue;
      for (const field of ["company", "jobTitle", "bio", "headshotUrl"] as const) {
        if (!primary[field] && dup[field] && !patch[field]) patch[field] = dup[field];
      }
      for (const tag of Array.isArray(dup.tagsJson) ? (dup.tagsJson as string[]) : []) {
        tags.add(tag);
      }
      if (dup.notes) notes.push(`(merged from ${dup.email as string}) ${dup.notes as string}`);
      // Keep the losing record's history under the surviving contact.
      const events = await ctx.db.unsafe.query("ContactStageEvent", { contactId: id });
      for (const event of events) {
        await ctx.db.unsafe.update("ContactStageEvent", event.id as string, {
          contactId: args.primaryId,
        });
      }
      await ctx.db.unsafe.delete("Contact", id);
      merged++;
    }

    if (tags.size > 0) patch.tagsJson = [...tags];
    if (notes.length > 0) patch.notes = notes.join("\n\n");
    patch.updatedAt = new Date().toISOString();
    await ctx.db.unsafe.update("Contact", args.primaryId, patch);
    return { merged };
  },
});
