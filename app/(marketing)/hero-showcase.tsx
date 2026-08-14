"use client";

import * as React from "react";
import { BRAND_GRADIENT } from "@/components/dashboard";
import { cn } from "@/lib/utils";
import { useSlidingTabs } from "@/hooks/use-sliding-tabs";

// The landing hero's product tour: one tab per surface, screenshots taken from
// the live app. Every frame stays mounted and cross-fades on opacity, so
// switching tabs never reflows the page or re-fetches an image.
// Each surface ships two captures: the desktop app and the same screen on a
// phone. A shrunk-to-342px desktop screenshot is an unreadable smear, so the
// small breakpoint gets the real mobile UI instead.
const SURFACES = [
  {
    id: "dashboard",
    label: "Dashboard",
    alt: "The event overview: submission counts, next steps, event readiness checks, and a submission activity chart.",
  },
  {
    id: "submissions",
    label: "Submissions",
    alt: "The submissions table with speakers, tracks, review scores, and accept or reject status.",
  },
  {
    id: "agenda",
    label: "Agenda",
    alt: "The agenda builder: a day-by-room grid with talks placed in time slots and an unscheduled queue beside it.",
  },
  {
    id: "speakers",
    label: "Speakers",
    alt: "The speaker roster with headshots, companies, onboarding status, and task progress.",
  },
  {
    id: "embeds",
    label: "Embeds",
    alt: "The embeds page: a live preview of the schedule widget next to its copyable snippet.",
  },
  {
    id: "public",
    label: "Public site",
    alt: "The attendee-facing event site with a branded header, day tabs, and the published schedule.",
  },
] as const;

// Bump when the screenshots are regenerated. They are served
// public, max-age=14400 with no content hash, so without a new filename
// Cloudflare serves the previous deploy's images for four hours. Measured:
// the plain URL returned the old 66680-byte file while a cache-busted one
// returned the new 66720-byte file from the same deploy.
const SHOT_VERSION = "v2";

const SM_BREAKPOINT = "(min-width: 640px)";

export function HeroShowcase() {
  const [active, setActive] = React.useState(0);
  const { barRef, pillRef, tabRefs } = useSlidingTabs(active, SURFACES.length);

  // Arrow keys move between tabs, the way a real tablist behaves.
  function onKeyDown(event: React.KeyboardEvent) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (active + delta + SURFACES.length) % SURFACES.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="mt-12">
      <div
        ref={barRef}
        role="tablist"
        aria-label="Product screens"
        onKeyDown={onKeyDown}
        // A segmented control on a track, NOT a row of buttons. The active tab
        // used to be a solid dark pill, identical to the primary CTA directly
        // above it, so a selection state read as a second call to action.
        className="t-tabs -mx-6 max-w-[calc(100vw-1.5rem)] overflow-x-auto sm:mx-auto sm:w-fit [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <span ref={pillRef} className="t-tabs-pill" aria-hidden="true" />
        {SURFACES.map((surface, index) => {
          const selected = index === active;
          return (
            <button
              key={surface.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`showcase-tab-${surface.id}`}
              aria-selected={selected}
              aria-controls={`showcase-panel-${surface.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              className={cn(
                "t-tab h-10 shrink-0 px-4 text-[13.5px] font-medium",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900",
              )}
            >
              {surface.label}
            </button>
          );
        })}
      </div>

      {/* The brand gradient, used once and at full strength: a dark stage the
          light screenshots sit on. Outer radius = inner radius + padding. */}
      <div
        className={cn(
          "relative mt-4 rounded-[20px] p-2 shadow-[0_24px_60px_-24px_rgba(24,24,27,0.45)] sm:rounded-[32px] sm:p-5",
          BRAND_GRADIENT,
        )}
      >
        {/* Concentric: 20 - 8 = 12 on mobile, 32 - 20 = 12 from sm up, so the
            inner radius is 12px at both sizes. The aspect follows the capture
            that is actually showing at each breakpoint. */}
        <div className="relative aspect-[390/620] w-full overflow-hidden rounded-[12px] sm:aspect-[2720/1720]">
          {SURFACES.map((surface, index) => {
            const selected = index === active;
            return (
              <picture
                key={surface.id}
                role="tabpanel"
                id={`showcase-panel-${surface.id}`}
                aria-labelledby={`showcase-tab-${surface.id}`}
                aria-hidden={!selected}
                className={cn(
                  "absolute inset-0 block size-full",
                  "transition-[opacity,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                  selected ? "scale-100 opacity-100" : "pointer-events-none scale-[0.99] opacity-0",
                )}
              >
                <source
                  media={SM_BREAKPOINT}
                  srcSet={`/assets/img/tab-${surface.id}.${SHOT_VERSION}.webp`}
                  width={2040}
                  height={1290}
                />
                <img
                  src={`/assets/img/tab-${surface.id}-sm.${SHOT_VERSION}.webp`}
                  alt={surface.alt}
                  width={780}
                  height={1240}
                  // The first frame is the LCP image; the rest load in the
                  // background so a tab switch is instant.
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  className="block size-full rounded-[12px] object-cover object-top outline outline-1 -outline-offset-1 outline-white/10"
                />
              </picture>
            );
          })}
        </div>
      </div>
    </div>
  );
}
