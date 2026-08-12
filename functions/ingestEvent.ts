import { action, v } from "@pylonsync/functions";

// First-party relay for Revtrail beacons.
//
// The browser CANNOT post to userevtrail.com directly: that endpoint answers
// with `access-control-allow-origin: https://pylon-revtrail.fly.dev`, its own
// origin, so every cross-origin beacon from smolboard.app is blocked by CORS
// and logs an error on each page. Server to server there is no Origin header
// and no preflight, so the relay works.
//
// Same-origin also means an ad blocker's third-party host rules don't apply.
// The tracker derives its endpoint as `new URL(script.src).origin +
// "/api/fn/ingestEvent"`, so serving the script from /rt/track.js on this
// domain points it here with no extra configuration.
const UPSTREAM = "https://userevtrail.com/api/fn/ingestEvent";

export default action({
  // Anonymous visitors send these; there is no session to require.
  auth: "public",
  args: {
    site: v.string(),
    name: v.string(),
    path: v.optional(v.string()),
    hostname: v.optional(v.string()),
    referrer: v.optional(v.string()),
    visitorId: v.optional(v.string()),
    visitorHash: v.optional(v.string()),
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    utmContent: v.optional(v.string()),
  },
  async handler(ctx, args) {
    // Forward the exact bytes the browser sent when we have them, so a new
    // field in a future tracker release rides through untouched instead of
    // being dropped by this function's arg list.
    const body = ctx.request?.rawBody?.trim() || JSON.stringify(args);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Without these the upstream sees this server, not the visitor, and every
    // event lands in one country with one user agent.
    const incoming = ctx.request?.headers ?? {};
    const userAgent = incoming["user-agent"];
    const country = incoming["cf-ipcountry"];
    const forwardedFor = incoming["x-forwarded-for"] ?? incoming["cf-connecting-ip"];
    if (userAgent) headers["user-agent"] = userAgent;
    if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
    if (country) headers["cf-ipcountry"] = country;

    try {
      const res = await fetch(UPSTREAM, { method: "POST", headers, body });
      const text = await res.text();
      // The tracker reads visitorId off this response to stop re-sending the
      // slower fetch path, so hand the upstream body back verbatim.
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        return { ok: res.ok };
      }
    } catch {
      // Analytics must never surface as an error in the product. A dropped
      // beacon is a lost datapoint, not a failed page.
      return { ok: false };
    }
  },
});
