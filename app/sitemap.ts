import type { Sitemap } from "@pylonsync/react";

// app/sitemap.ts → served at /sitemap.xml. Enumerates every public, indexable
// page. The marketing pages are driven by the SAME data modules the nav,
// footer, and [slug] routes read (lib/products.ts + lib/site.ts), so the
// sitemap can never list a page that doesn't exist — add a product or a
// solution and it shows up here automatically. /dashboard is private and
// /login + /signup are `robots: "noindex"`, so they're intentionally omitted.
// Point SITE_URL at your domain in production.
const SITE = process.env.SITE_URL ?? "http://localhost:4321";

export default async function sitemap(): Promise<Sitemap> {
  // Each marketing collection → its /base/:slug URLs, typed so the literal
  // changeFrequency isn't widened to string.
  const collection = (base: string, slugs: string[]): Sitemap =>
    slugs.map((slug) => ({
      url: `${SITE}${base}/${slug}`,
      changeFrequency: "monthly",
      priority: 0.7,
    }));

  // Only smolboard's own pages. The starter template's product-catalog routes
  // (/products, /solutions, /resources, /compare) still resolve but describe a
  // different, fictional product, so they are deliberately not advertised.
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    ...collection("/company", ["terms", "privacy"]),
  ];

  // The export is async, so you can also enumerate pages from a DB read:
  //
  //   const posts = await fetchPublishedPosts();
  //   return [...routes, ...posts.map((p) => ({
  //     url: `${SITE}/blog/${p.slug}`,
  //     lastModified: p.updatedAt,
  //   }))];
}
