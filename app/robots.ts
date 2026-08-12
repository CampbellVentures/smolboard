import type { Robots } from "@pylonsync/react";

// app/robots.ts → served at /robots.txt.
//
// Same default as app/sitemap.ts: fall back to the canonical domain, never
// localhost. An unset env var in production would otherwise point crawlers at
// http://localhost:4321/sitemap.xml, which resolves to nothing.
const SITE = (process.env.SITE_URL ?? "https://www.smolboard.app").replace(/\/$/, "");

export default function robots(): Robots {
  return {
    // Keep the authenticated app and the API out of the index. Public event
    // pages at /<orgSlug>/<eventSlug> stay crawlable on purpose: organizers
    // want their schedule found.
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/portal", "/api/"] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
