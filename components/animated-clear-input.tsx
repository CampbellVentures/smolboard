"use client";

import React, { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

interface AnimatedClearInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder: string;
  label: string;
}

const numberVariable = (name: string, fallback: number) => {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
};

function bezier(value: string) {
  const match = String(value).match(/cubic-bezier\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/);
  if (!match) return (time: number) => time;
  const [x1, y1, x2, y2] = match.slice(1).map(Number);
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (time: number) => {
    if (time <= 0) return 0;
    if (time >= 1) return 1;
    let sample = time;
    for (let index = 0; index < 8; index += 1) {
      const delta = ((ax * sample + bx) * sample + cx) * sample - time;
      const derivative = (3 * ax * sample + 2 * bx) * sample + cx;
      if (Math.abs(delta) < 1e-6 || derivative === 0) break;
      sample -= delta / derivative;
    }
    return ((ay * sample + by) * sample + cy) * sample;
  };
}

export function AnimatedClearInput({
  value,
  onChange,
  onClear,
  placeholder,
  label,
}: AnimatedClearInputProps) {
  const wrapRef = useRef<HTMLLabelElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const clearingRef = useRef(false);

  useEffect(() => {
    if (mirrorRef.current && !clearingRef.current) {
      mirrorRef.current.textContent = value.replace(/ /g, "\u00a0");
    }
  }, [value]);

  function buildGlow(text: string): string {
    const wrap = wrapRef.current;
    const input = inputRef.current;
    if (!wrap || !input) return "";
    const canvas = document.createElement("canvas").getContext("2d");
    if (!canvas) return "";
    canvas.font = getComputedStyle(input).font;
    const root = document.documentElement;
    const isDark = root.classList.contains("dark") || root.getAttribute("data-theme") === "dark";
    const rgb = isDark ? "255,255,255" : "0,0,0";
    const width = wrap.clientWidth || 280;
    const paddingLeft = parseFloat(getComputedStyle(input).paddingLeft) || 12;
    const spread = numberVariable("--glow-spread", 1.5);
    const layers: string[] = [];
    let x = 0;
    text.split(/(\s+)/).forEach((segment) => {
      const segmentWidth = canvas.measureText(segment).width;
      if (segment.trim()) {
        const center = paddingLeft + x + segmentWidth / 2;
        const halfWidth = Math.max(segmentWidth * 0.45, 8) * spread;
        [[0, 0.8, 7, 0.22], [halfWidth * 0.45, 0.55, 8, 0.18], [-halfWidth * 0.4, 0.65, 6, 0.16], [halfWidth * 0.15, 0.9, 5, 0.14]].forEach(([dx, radiusWidth, radiusHeight, alpha]) => {
          const left = (((center + dx) / width) * 100).toFixed(2);
          layers.push(`radial-gradient(ellipse ${Math.max(halfWidth * radiusWidth, 2).toFixed(1)}px ${radiusHeight}px at ${left}% 100%, rgba(${rgb},${alpha}), transparent)`);
        });
      }
      x += segmentWidth;
    });
    return layers.join(", ");
  }

  function clearWithAnimation() {
    const wrap = wrapRef.current;
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    const fakePlaceholder = placeholderRef.current;
    const glow = glowRef.current;
    if (clearingRef.current || !value || !wrap || !input || !mirror || !fakePlaceholder || !glow) {
      onClear();
      return;
    }
    clearingRef.current = true;
    const keepFocus = document.activeElement === input;
    mirror.textContent = value.replace(/ /g, "\u00a0");
    const total = numberVariable("--clear-dur", 1000);
    const outDuration = numberVariable("--clear-out-dur", 400);
    const inDuration = numberVariable("--clear-in-dur", 400);
    const outFly = numberVariable("--clear-out-fly", 12);
    const inFly = numberVariable("--clear-in-fly", 12);
    const blur = numberVariable("--clear-blur", 2);
    const delay = numberVariable("--glow-delay", 50);
    const peakAt = numberVariable("--glow-peak-at", 0.15);
    const glowOpacity = numberVariable("--glow-opacity", 0.42);
    const rootStyle = getComputedStyle(document.documentElement);
    const easeOut = bezier(rootStyle.getPropertyValue("--clear-out-ease"));
    const easeIn = bezier(rootStyle.getPropertyValue("--clear-in-ease"));

    onClear();
    wrap.classList.add("is-clearing");
    glow.style.background = buildGlow(mirror.textContent ?? "");
    glow.style.opacity = "0";
    fakePlaceholder.style.transform = `translateY(-${inFly}px)`;
    fakePlaceholder.style.opacity = "0.9";
    fakePlaceholder.style.filter = `blur(${blur}px)`;

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const exitProgress = easeOut(Math.min(1, elapsed / outDuration));
      mirror.style.transform = `translateY(${(exitProgress * outFly).toFixed(1)}px)`;
      mirror.style.opacity = (1 - exitProgress).toFixed(3);
      mirror.style.filter = `blur(${(exitProgress * blur).toFixed(1)}px)`;
      const enterProgress = easeIn(Math.min(1, elapsed / inDuration));
      fakePlaceholder.style.transform = `translateY(${(-inFly + enterProgress * inFly).toFixed(1)}px)`;
      fakePlaceholder.style.opacity = (0.9 + enterProgress * 0.1).toFixed(3);
      fakePlaceholder.style.filter = `blur(${(blur - enterProgress * blur).toFixed(1)}px)`;
      let glowProgress = 0;
      if (elapsed > delay) {
        const position = Math.min(1, (elapsed - delay) / Math.max(1, total - delay));
        glowProgress = position < peakAt ? position / peakAt : 1 - (position - peakAt) / (1 - peakAt);
      }
      glow.style.opacity = (glowProgress * glowOpacity).toFixed(3);
      if (elapsed < total) {
        requestAnimationFrame(tick);
        return;
      }
      wrap.classList.remove("is-clearing");
      [mirror, fakePlaceholder].forEach((element) => element.removeAttribute("style"));
      mirror.textContent = "";
      glow.removeAttribute("style");
      clearingRef.current = false;
      if (keepFocus) requestAnimationFrame(() => input.focus({ preventScroll: true }));
    };
    requestAnimationFrame(tick);
  }

  return (
    <label ref={wrapRef} className={`t-clear relative h-9 min-w-48 flex-1 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)] dark:bg-zinc-900 ${value ? "has-value" : ""}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 z-[4] size-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-9 w-full rounded-full bg-transparent pl-9 pr-9 text-[13px] text-zinc-700 outline-none placeholder:text-transparent focus:shadow-[0_0_0_1px_rgba(0,0,0,0.15)] dark:text-zinc-200"
      />
      <div ref={mirrorRef} className="t-clear-mirror pl-9 pr-9 text-[13px] text-zinc-700 dark:text-zinc-200" aria-hidden="true" />
      <div ref={placeholderRef} className="t-clear-placeholder pl-9 pr-9 text-[13px] text-zinc-400" aria-hidden="true">{placeholder}</div>
      <div ref={glowRef} className="t-clear-glow" aria-hidden="true" />
      {value ? (
        <button type="button" className="t-clear-btn absolute right-1 top-1 z-[4] grid size-7 place-items-center rounded-full text-zinc-400 hover:text-zinc-700" aria-label="Clear search" onPointerDown={(event) => event.preventDefault()} onClick={clearWithAnimation}>
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </label>
  );
}
