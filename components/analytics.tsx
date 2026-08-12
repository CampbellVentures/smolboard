import React from "react";

// Revtrail, loaded only on smolboard's OWN surfaces: the marketing site, the
// auth screens, and the organizer dashboard. It is deliberately NOT in the root
// layout, because that also wraps /<orgSlug>/<eventSlug> and the widget embeds,
// which are our customers' pages shown to their attendees. Their visitors are
// not ours to measure.
//
// The site key is public by design (it only identifies which site a beacon
// belongs to). Identity is the default daily-cookieless mode: nothing is stored
// in the browser and visitor hashes rotate every day.
const SITE_KEY = "0fa94ce5a7535140";

export function Analytics() {
  return <script defer src="https://userevtrail.com/track.js" data-site={SITE_KEY} />;
}

// Fire a named conversion event. Safe to call before track.js has loaded or
// when a visitor blocks it: analytics must never break a real flow.
export function track(name: string): void {
  try {
    (window as unknown as { revtrail?: (event: string) => void }).revtrail?.(name);
  } catch {
    // Reporting a conversion is never worth an exception in the caller.
  }
}
