import { mutation, v } from "@pylonsync/functions";
import { isValidOrgSlug } from "../lib/org-slug";

// Owner/admin-gated rename of the workspace's public URL handle. Existing
// public links break on rename — the settings UI says so before saving.
export default mutation<{ slug: string }, { slug: string }>({
  args: { slug: v.string() },
  async handler(ctx, args) {
    const orgId = ctx.auth.tenantId;
    if (!orgId) throw ctx.error("FORBIDDEN", "Select a workspace first.");
    await ctx.requireMember(orgId, { role: ["owner", "admin"] });

    const slug = args.slug.trim().toLowerCase();
    if (!isValidOrgSlug(slug)) {
      throw ctx.error(
        "INVALID_ARGS",
        "Handles are lowercase letters, numbers, and hyphens, and can't use reserved words.",
      );
    }
    // ctx.db.unsafe: Org writes are policy-denied (framework-managed row);
    // membership + role verified above, slug is app-owned.
    const taken = await ctx.db.unsafe.query("Org", { slug });
    if (taken.some((o) => o.id !== orgId)) {
      throw ctx.error("CONFLICT", `The handle "${slug}" is taken.`);
    }
    await ctx.db.unsafe.update("Org", orgId, { slug });
    return { slug };
  },
});
