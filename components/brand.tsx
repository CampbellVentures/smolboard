import * as React from "react";

// The smolboard mark: a white mic on the brand orange, rounded square.
// Inline SVG so every surface (nav, auth, portal) renders the same artwork at
// any size with no asset request; public/icon.svg is the same drawing for the
// favicon. Change the color in ONE place: BRAND_ORANGE (+ globals.css tokens
// and lib/site.config.ts colors).

export const BRAND_ORANGE = "#EA580C";

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
      <rect width="512" height="512" rx="116" fill={BRAND_ORANGE} />
      <rect x="212" y="108" width="88" height="172" rx="44" fill="#fff" />
      <path
        d="M168 240a88 88 0 0 0 176 0"
        stroke="#fff"
        strokeWidth="30"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M256 328v46" stroke="#fff" strokeWidth="30" strokeLinecap="round" />
      <path d="M204 396h104" stroke="#fff" strokeWidth="30" strokeLinecap="round" />
    </svg>
  );
}
