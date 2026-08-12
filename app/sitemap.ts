import type { Sitemap } from "@pylonsync/react";

// app/sitemap.ts → served at /sitemap.xml.
//
// The base URL defaults to the canonical production domain, NOT localhost: an
// unset env var in production would otherwise publish a sitemap full of
// http://localhost:4321 links, which is worse than having no sitemap at all.
// Set SITE_URL to override (a self-hosted instance, or a preview deploy).
const SITE = (process.env.SITE_URL ?? "https://www.smolboard.app").replace(/\/$/, "");

export default async function sitemap(): Promise<Sitemap> {
  // Only smolboard's own pages. /dashboard and /portal are private, /login and
  // /signup are noindex, and every /<orgSlug>/<eventSlug> page belongs to a
  // customer — they are theirs to advertise, not ours.
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/company/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE}/company/privacy`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
