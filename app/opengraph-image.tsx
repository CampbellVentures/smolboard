import React from "react";
import { ImageResponse } from "@pylonsync/react";
import { BRAND_INK, BRAND_LIME } from "@/components/brand";
import { ogFonts } from "@/lib/og-fonts";

// Site-wide OG card: /opengraph-image (Next-style file convention; Satori
// renders it to PNG server-side). Satori is flexbox-only — every multi-child
// node needs an explicit display:flex.

export const size = { width: 1200, height: 630 };

function Mark({ tile = 120 }: { tile?: number }) {
  // The brand mic, inverted for the dark card: lime tile, ink glyph.
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

export default function OpengraphImage() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Mark tile={88} />
          <span style={{ fontSize: 56, fontWeight: 600, color: "#ffffff" }}>smolboard</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <span
            style={{
              fontSize: 76,
              fontWeight: 600,
              color: "#ffffff",
              lineHeight: 1.1,
              letterSpacing: -2,
            }}
          >
            Open-source speaker
          </span>
          <span
            style={{
              fontSize: 76,
              fontWeight: 600,
              color: BRAND_LIME,
              lineHeight: 1.1,
              letterSpacing: -2,
            }}
          >
            &amp; CFP management
          </span>
        </div>
        <span style={{ fontSize: 30, color: "#a1a1aa" }}>smolboard.app</span>
      </div>
    ),
    { ...size, fonts: ogFonts() },
  );
}
