"use client";

import React, { useEffect, useState } from "react";

import { fmtAgo } from "@/lib/activity";
import { fmtDate, fmtDateShort, fmtDateTime } from "@/lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;

function withinDay(iso: string): boolean {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  const age = Date.now() - then;
  return age >= 0 && age < DAY_MS;
}

// A timestamp that reads the way people ask about it: "2h ago" while it is
// still today's news, the plain date once it is older — a relative label on a
// six-month-old row tells you nothing.
//
// Relative time is not hydration-safe on a server-rendered page: the server
// computes "2h ago" at request time and the client recomputes at hydration, so
// anything near a boundary renders two different strings. Paint the
// deterministic UTC date first and swap only after mount — the same gate the
// presence chip uses. The exact timestamp stays on hover either way.
export function TimeAgo({
  iso,
  className,
  dateStyle = "short",
}: {
  iso?: string | null;
  className?: string;
  dateStyle?: "short" | "long";
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!iso) return null;
  const absolute = dateStyle === "long" ? fmtDate(iso) : fmtDateShort(iso);
  // The tooltip is locale-formatted (fmtDateTime → toLocaleString), and Node
  // and the browser disagree on the separator — "Aug 15, 10:35 PM" vs
  // "Aug 15 at 10:35 PM". Rendering it on the server mismatches on hydration,
  // so the precise timestamp is filled in after mount like the label.
  return (
    <time
      dateTime={iso}
      title={mounted ? fmtDateTime(iso) : absolute}
      className={className}
    >
      {mounted && withinDay(iso) ? fmtAgo(iso) : absolute}
    </time>
  );
}
