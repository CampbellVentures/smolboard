import type { RawRouteHandler } from "@pylonsync/react";

// Serves Revtrail's tracker from our own origin.
//
// Two reasons, both real. The tracker derives its beacon endpoint from its own
// script URL (`new URL(script.src).origin + "/api/fn/ingestEvent"`), so loading
// it from here points beacons at functions/ingestEvent.ts, which relays them
// server-side and sidesteps the CORS block on the upstream endpoint. And a
// first-party script path is not on the third-party host lists ad blockers use.
//
// THREE path segments on purpose. A two-segment path is shadowed by the public
// /:orgSlug/:eventSlug event page, which matches it, finds no such org, and
// renders a 404 — the same trap app/layout.tsx notes for /assets/img. The
// tracker only reads this script URL's ORIGIN, so the path is free.
const UPSTREAM = "https://userevtrail.com/track.js";

// Cached in-process so we are not fetching the same file on every page load.
let cached: { body: string; at: number } | null = null;
const TTL_MS = 60 * 60 * 1000;

export const GET: RawRouteHandler = async () => {
  const fresh = cached && Date.now() - cached.at < TTL_MS;
  if (!fresh) {
    try {
      const res = await fetch(UPSTREAM);
      if (res.ok) cached = { body: await res.text(), at: Date.now() };
    } catch {
      // Fall through to whatever we already have.
    }
  }
  if (!cached) {
    // Never 500 a page over analytics: serve a no-op so the <script> tag that
    // references this route stays harmless.
    return {
      body: "/* revtrail unavailable */",
      contentType: "application/javascript; charset=utf-8",
      headers: { "cache-control": "public, max-age=60" },
    };
  }
  return {
    body: cached.body,
    contentType: "application/javascript; charset=utf-8",
    headers: { "cache-control": "public, max-age=3600" },
  };
};
