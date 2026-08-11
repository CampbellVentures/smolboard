import { mutation } from "@pylonsync/functions";
import { orgSlugCandidates } from "../lib/org-slug";

// Idempotent: gives the caller's workspace a public URL slug if it doesn't
// have one yet. Fired from the dashboard shell on load, so every org that has
// ever opened the dashboard can serve /<org-slug>/<event-slug> pages.
export default mutation<Record<string, never>, { slug: string }>({
  args: {},
  async handler(ctx) {
    const orgId = ctx.auth.tenantId;
    if (!orgId) throw ctx.error("FORBIDDEN", "Select a workspace first.");
    await ctx.requireMember(orgId, { role: ["owner", "admin"] });

    const org = await ctx.db.get("Org", orgId);
    if (!org) throw ctx.error("NOT_FOUND", "Workspace not found.");
    const existing = org.slug as string | undefined;
    if (existing) return { slug: existing };

    // ctx.db.unsafe: the Org policy is all-deny for writes (the row is
    // framework-managed); slug is the one app-owned column, and membership
    // was verified above.
    for (const candidate of orgSlugCandidates(org.name as string)) {
      const taken = await ctx.db.unsafe.query("Org", { slug: candidate });
      if (taken.length > 0) continue;
      await ctx.db.unsafe.update("Org", orgId, { slug: candidate });
      return { slug: candidate };
    }
    throw ctx.error("CONFLICT", "Could not find a free URL handle. Set one in workspace settings.");
  },
});
