"use client";

import { useEffect, useState } from "react";

type MotionPhase = "closed" | "open" | "closing";

function durationMs(variable: string, fallback: number): number {
  const value = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(variable),
  );
  return Number.isFinite(value) ? value : fallback;
}

export function useMotionPresence(
  open: boolean,
  closeDurationVariable: string,
  fallbackMs: number,
) {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<MotionPhase>(open ? "open" : "closed");

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setPhase("open"));
      return () => cancelAnimationFrame(frame);
    }
    if (!mounted) return;
    setPhase("closing");
    const timer = window.setTimeout(() => {
      setMounted(false);
      setPhase("closed");
    }, durationMs(closeDurationVariable, fallbackMs));
    return () => window.clearTimeout(timer);
  }, [closeDurationVariable, fallbackMs, mounted, open]);

  return {
    mounted,
    motionClassName: phase === "open" ? "is-open" : phase === "closing" ? "is-closing" : "",
  };
}
