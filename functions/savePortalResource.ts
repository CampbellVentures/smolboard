import { mutation, v } from "@pylonsync/functions";
import { validateResource } from "../lib/portal-resources";

// Create or update a speaker-portal reference page. Function-only writes, so
// the embed sanitizer can never be bypassed by a direct entity write.
export default mutation({
  args: {
    eventId: v.id("Event"),
    resourceId: v.optional(v.id("PortalResource")),
    title: v.string(),
    body: v.optional(v.string()),
    embedUrl: v.optional(v.string()),
    published: v.optional(v.boolean()),
    sortOrder: v.optional(v.int()),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    const check = validateResource({
      title: args.title,
      body: args.body,
      embedUrl: args.embedUrl,
    });
    if (!check.ok) throw ctx.error("INVALID_ARGS", check.error ?? "That page isn't valid.");

    const now = new Date().toISOString();
    const fields = {
      title: args.title.trim(),
      body: args.body?.trim() || undefined,
      // Store only the sanitized URL, never what was pasted.
      embedUrl: check.embedUrl,
      published: args.published ?? false,
      sortOrder: args.sortOrder ?? 0,
      updatedAt: now,
    };

    if (args.resourceId) {
      const existing = await ctx.db.unsafe.get("PortalResource", args.resourceId);
      if (!existing || existing.eventId !== args.eventId) {
        throw ctx.error("NOT_FOUND", "Page not found.");
      }
      await ctx.db.unsafe.update("PortalResource", args.resourceId, fields);
      return { id: args.resourceId };
    }
    const id = await ctx.db.unsafe.insert("PortalResource", {
      orgId: event.orgId as string,
      eventId: args.eventId,
      ...fields,
    });
    return { id };
  },
});
