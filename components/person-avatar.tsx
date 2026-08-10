import React from "react";

// THE avatar. Every person rendered anywhere — rosters, schedule chips,
// galleries, account menus — goes through this so photos and initials always
// look the same (round, subtle black outline on photos, zinc chip fallback).

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-7 text-[11px]",
  md: "size-8 text-[12px]",
  lg: "size-10 text-[12px]",
  xl: "size-11 text-[13px]",
} as const;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts.at(-1)![0]!).toUpperCase();
}

export function PersonAvatar({
  name,
  src,
  size = "md",
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`${SIZES[size].split(" ")[0]} shrink-0 rounded-full object-cover outline outline-1 -outline-offset-1 outline-black/10 ${className}`}
      />
    );
  }
  return (
    <span
      className={`flex ${SIZES[size]} shrink-0 items-center justify-center rounded-full bg-zinc-100 font-semibold text-zinc-600 ${className}`}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
