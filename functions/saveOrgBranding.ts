import { mutation, v } from "@pylonsync/functions";
import { isValidAccent } from "../lib/branding";

// Workspace branding for the public org index at /<org-slug>.
//
// Org rows are policy-denied for client writes (the framework mirror owns
// name/createdBy/createdAt), so branding cannot go through db.update the way
// Event branding does. This is the one path that can set it.
export default mutation<
  { orgId: string; accent?: string | null; logoUrl?: string | null },
  { saved: true }
>({
  args: {
    orgId: v.id("Org"),
    accent: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
  },
  async handler(ctx, args) {
    await ctx.requireMember(args.orgId, { role: ["owner", "admin"] });
    const accent = args.accent?.trim() || null;
    if (accent && !isValidAccent(accent)) {
      throw ctx.error("INVALID_ARGS", "Accent must be a 6-digit hex color like #7c3aed.");
    }
    const logoUrl = args.logoUrl?.trim() || null;
    if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
      throw ctx.error("INVALID_ARGS", "The logo must be an http(s) URL.");
    }
    if (logoUrl && logoUrl.length > 2000) {
      throw ctx.error("INVALID_ARGS", "That logo URL is too long.");
    }
    // null, not undefined: an update ignores undefined, so clearing a logo
    // would silently do nothing and report success.
    await ctx.db.unsafe.update("Org", args.orgId, {
      brandingJson: accent || logoUrl ? { accent, logoUrl } : null,
    });
    return { saved: true };
  },
});
