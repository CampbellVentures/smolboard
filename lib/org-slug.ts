import { slugify } from "./forms";

// Org slugs are the first segment of every public URL (/<org-slug>/…), so they
// must never collide with the app's own top-level routes.
export const RESERVED_ORG_SLUGS = new Set([
  "dashboard",
  "portal",
  "login",
  "signup",
  "api",
  "cfp",
  "company",
  "compare",
  "products",
  "resources",
  "solutions",
  "admin",
  "app",
  "docs",
  "blog",
  "help",
  "support",
  "status",
  "settings",
  "assets",
  "static",
  "public",
  "www",
]);

export function isValidOrgSlug(slug: string): boolean {
  return (
    /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug) &&
    !RESERVED_ORG_SLUGS.has(slug)
  );
}

// Candidate slugs for an org name, in preference order: base, base-2, base-3…
// The caller tries each against the unique index until one sticks.
export function orgSlugCandidates(name: string, count = 10): string[] {
  let base = slugify(name);
  if (!base || RESERVED_ORG_SLUGS.has(base)) base = base ? `${base}-org` : "org";
  return [base, ...Array.from({ length: count - 1 }, (_, i) => `${base}-${i + 2}`)];
}
