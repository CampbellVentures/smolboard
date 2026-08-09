import * as React from "react";

// The smolboard mark: a lime mic on ink, rounded square.
// Inline SVG so every surface (nav, auth, portal) renders the same artwork at
// any size with no asset request; public/icon.svg is the same drawing for the
// favicon. Change the colors in ONE place: BRAND_INK/BRAND_LIME (+ globals.css
// and lib/site.config.ts colors).

export const BRAND_INK = "#1A1A1A";
export const BRAND_LIME = "#BEF264";

export function BrandMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="smolboard"
      className={className}
    >
      <rect width="512" height="512" rx="116" fill={BRAND_INK} />
      <rect x="212" y="108" width="88" height="172" rx="44" fill={BRAND_LIME} />
      <path
        d="M168 240a88 88 0 0 0 176 0"
        stroke={BRAND_LIME}
        strokeWidth="30"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M256 328v46" stroke={BRAND_LIME} strokeWidth="30" strokeLinecap="round" />
      <path d="M204 396h104" stroke={BRAND_LIME} strokeWidth="30" strokeLinecap="round" />
    </svg>
  );
}
