import React from "react";
import { ImageResponse } from "@pylonsync/react";
import { BRAND_INK, BRAND_LIME } from "@/components/brand";
import { ogFonts } from "@/lib/og-fonts";

// Per-event OG card: /<org-slug>/<event-slug>/opengraph-image (also covers
// the cfp subtree). The module gets { params }; event data comes from the
// app's own public feed — the same anonymous, safe-fields-only query the
// schedule page uses — so a draft event falls back to the generic card.
// Renders are cached hard (CDN + disk ISR), so the self-fetch is rare.

export const size = { width: 1200, height: 630 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtRange(start?: string | null, end?: string | null): string {
  if (!start) return "";
  const s = new Date(start);
  const label = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  if (!end || end === start) return label(s);
  const e = new Date(end);
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${MONTHS[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}, ${s.getUTCFullYear()}`;
  }
  return `${label(s)} – ${label(e)}`;
}

interface FeedEvent {
  name: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
}

async function fetchEvent(orgSlug: string, eventSlug: string): Promise<FeedEvent | null> {
  const base = process.env.PYLON_PUBLIC_URL || "http://localhost:4321";
  try {
    const res = await fetch(`${base}/api/fn/getPublicSchedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgSlug, eventSlug }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { event: FeedEvent | null };
    return data.event;
  } catch {
    return null;
  }
}

function Mark({ tile }: { tile: number }) {
  return (
    <svg width={tile} height={tile} viewBox="0 0 512 512">
      <rect width="512" height="512" rx="116" fill={BRAND_LIME} />
      <rect x="212" y="108" width="88" height="172" rx="44" fill={BRAND_INK} />
      <path
        d="M168 240a88 88 0 0 0 176 0"
        stroke={BRAND_INK}
        strokeWidth="30"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M256 328v46" stroke={BRAND_INK} strokeWidth="30" strokeLinecap="round" />
      <path d="M204 396h104" stroke={BRAND_INK} strokeWidth="30" strokeLinecap="round" />
    </svg>
  );
}

export default async function OpengraphImage({
  params,
}: {
  params: { orgSlug: string; eventSlug: string };
}) {
  const event = await fetchEvent(params.orgSlug, params.eventSlug);
  const meta = [fmtRange(event?.startDate, event?.endDate), event?.location ?? ""]
    .filter(Boolean)
    .join("  ·  ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: BRAND_INK,
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Mark tile={56} />
          <span style={{ fontSize: 36, fontWeight: 600, color: "#a1a1aa" }}>smolboard</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span
            style={{
              fontSize: event && event.name.length > 34 ? 62 : 78,
              fontWeight: 600,
              color: "#ffffff",
              lineHeight: 1.08,
              letterSpacing: -2,
            }}
          >
            {event?.name ?? "smolboard"}
          </span>
          {meta && (
            <span style={{ fontSize: 34, fontWeight: 600, color: BRAND_LIME }}>{meta}</span>
          )}
        </div>
        <span style={{ fontSize: 28, color: "#71717a" }}>
          {`smolboard.app/${params.orgSlug}/${params.eventSlug}`}
        </span>
      </div>
    ),
    { ...size, fonts: ogFonts() },
  );
}
