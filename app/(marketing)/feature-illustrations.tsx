import React from "react";

// Ambient illustrations for the landing page's feature bento. Each one shows
// the feature doing its job rather than sitting behind an icon: a conditional
// field appearing, a talk landing in a slot, stars filling in.
//
// All CSS, no JavaScript and no images. Keyframes live in app/globals.css and
// every loop stops under prefers-reduced-motion.

// A shared frame so all six illustrations share one height, inset, and surface.
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-36 overflow-hidden rounded-xl bg-zinc-50/80 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
      <div className="absolute inset-0 p-4">{children}</div>
    </div>
  );
}

const bar = "rounded bg-zinc-200";
const chip = "rounded-md bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)]";

// A form where the conditional field appears once "Workshop" is chosen.
export function FormsIllustration() {
  return (
    <Frame>
      <div className="flex flex-col gap-2.5">
        <div className={`${chip} flex h-7 items-center px-2.5 text-[10px] font-medium text-zinc-500`}>
          Session format
          <span
            className="sb-anim ml-auto rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700"
            style={{ animationName: "sb-select-swap" }}
          >
            Workshop
          </span>
        </div>
        <div className={`${chip} flex h-7 items-center gap-2 px-2.5`}>
          <span className={`${bar} h-1.5 w-14`} />
        </div>
        {/* The point of the card: this row only exists for Workshop. */}
        <div
          className="sb-anim rounded-md border border-dashed border-violet-300 bg-violet-50/60 px-2.5 py-2"
          style={{ animationName: "sb-field-in" }}
        >
          <div className="text-[9.5px] font-semibold text-violet-700">Workshop prerequisites</div>
          <div className="mt-1.5 h-1.5 w-24 rounded bg-violet-200" />
        </div>
      </div>
    </Frame>
  );
}

// A talk dragged out of the unscheduled tray into a room slot, then the
// double-booking warning firing.
export function AgendaIllustration() {
  return (
    <Frame>
      <div className="flex h-full gap-3">
        <div className="flex w-20 shrink-0 flex-col gap-1.5">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
            Unscheduled
          </div>
          <div className={`${chip} h-8 px-2 py-1.5`}>
            <div className={`${bar} h-1.5 w-12`} />
          </div>
        </div>
        <div className="relative flex-1 rounded-md bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">
          <div className="grid grid-cols-2 border-b border-zinc-100 text-[9px] font-medium text-zinc-400">
            <div className="border-r border-zinc-100 px-2 py-1">Main Stage</div>
            <div className="px-2 py-1">Workshop</div>
          </div>
          <div className="grid grid-cols-2">
            <div className="space-y-1 border-r border-zinc-100 p-1.5">
              <div className="h-5 rounded bg-sky-100" />
              <div className="h-5 rounded bg-emerald-100" />
            </div>
            <div className="space-y-1 p-1.5">
              <div
                className="sb-anim h-5 rounded bg-violet-200"
                style={{ animationName: "sb-drop-in" }}
              />
              <div className="h-5 rounded bg-zinc-100" />
            </div>
          </div>
          <div
            className="sb-anim absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-700 shadow-sm"
            style={{ animationName: "sb-conflict" }}
          >
            Priya is double-booked
          </div>
        </div>
      </div>
    </Frame>
  );
}

// Stars filling one at a time, with the weighted average landing after them.
export function ReviewsIllustration() {
  return (
    <Frame>
      <div className="flex h-full flex-col justify-center gap-3">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <svg
              key={i}
              viewBox="0 0 24 24"
              className="sb-anim size-5 fill-amber-400"
              style={{ animationName: "sb-star", animationDelay: `${i * 0.18}s` }}
              aria-hidden="true"
            >
              <path d="M12 2l2.9 6.2 6.6.9-4.8 4.7 1.2 6.7L12 17.3 6.1 20.5l1.2-6.7L2.5 9.1l6.6-.9z" />
            </svg>
          ))}
          <span className="ml-1 text-[13px] font-semibold tabular-nums text-zinc-900">4.6</span>
        </div>
        <div className="space-y-1.5">
          {[
            { label: "Originality", w: "w-[86%]" },
            { label: "Clarity", w: "w-[72%]" },
            { label: "Fit", w: "w-[94%]" },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-2">
              <span className="w-14 text-[9.5px] text-zinc-400">{row.label}</span>
              <span className="h-1.5 flex-1 rounded bg-zinc-200">
                <span className={`block h-full rounded bg-zinc-900/70 ${row.w}`} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

// The speaker's onboarding list checking itself off.
export function PortalIllustration() {
  const tasks = ["Confirm your bio", "Upload a headshot", "Send final slides"];
  return (
    <Frame>
      <div className="flex flex-col gap-2">
        {tasks.map((task, i) => (
          <div key={task} className={`${chip} flex items-center gap-2 px-2.5 py-2`}>
            <span className="relative flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <svg
                viewBox="0 0 24 24"
                className="sb-anim size-2.5 stroke-emerald-600"
                style={{ animationName: "sb-check", animationDelay: `${i * 0.5}s` }}
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 12l6 6L20 6" />
              </svg>
            </span>
            <span className="relative text-[10.5px] text-zinc-600">
              {task}
              <span
                className="sb-anim absolute inset-x-0 top-1/2 h-px origin-left bg-zinc-400"
                style={{ animationName: "sb-strike", animationDelay: `${i * 0.5}s` }}
              />
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

// An acceptance email leaving, with the calendar invite it carries.
export function EmailsIllustration() {
  return (
    <Frame>
      <div className="relative flex h-full items-center justify-center">
        <div className={`${chip} w-full max-w-[190px] overflow-hidden`}>
          <div className="flex items-center gap-1.5 border-b border-zinc-100 px-2.5 py-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span className="text-[9.5px] font-medium text-zinc-500">Accepted</span>
            <span className="ml-auto rounded bg-zinc-100 px-1 py-0.5 text-[8.5px] text-zinc-500">
              .ics
            </span>
          </div>
          <div className="space-y-1.5 px-2.5 py-2.5">
            <div className={`${bar} h-1.5 w-28`} />
            <div className={`${bar} h-1.5 w-20`} />
            <div className="flex items-center gap-1.5 pt-1">
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[8.5px] font-medium text-sky-700">
                Add to calendar
              </span>
            </div>
          </div>
        </div>
        <svg
          viewBox="0 0 24 24"
          className="sb-anim absolute right-4 top-5 size-5 fill-violet-500"
          style={{ animationName: "sb-send" }}
          aria-hidden="true"
        >
          <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
        </svg>
      </div>
    </Frame>
  );
}

// A snippet being pasted, and the widget it renders showing up under it.
export function EmbedsIllustration() {
  return (
    <Frame>
      <div className="flex flex-col gap-2.5">
        <div className="overflow-hidden rounded-md bg-zinc-900 px-2.5 py-2 font-mono text-[9px] leading-relaxed text-zinc-300">
          <span
            className="sb-anim inline-block overflow-hidden whitespace-nowrap align-bottom"
            style={{ animationName: "sb-type" }}
          >
            &lt;iframe src=&quot;smolboard.app/…/embed&quot;&gt;
          </span>
          <span className="sb-anim inline-block" style={{ animationName: "sb-caret", animationDuration: "1s" }}>
            ▍
          </span>
        </div>
        <div
          className="sb-anim rounded-md bg-white p-2 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
          style={{ animationName: "sb-widget-in" }}
        >
          <div className="flex items-center gap-2">
            <span className="size-6 rounded-full bg-zinc-200" />
            <span className="flex-1 space-y-1">
              <span className={`${bar} block h-1.5 w-24`} />
              <span className="block h-1.5 w-14 rounded bg-zinc-100" />
            </span>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[8.5px] font-medium text-emerald-700">
              9:00
            </span>
          </div>
        </div>
      </div>
      {/* A faint highlight pass. Kept low: over the dark code block a strong
          white gradient reads as the panel fading out, not as a sheen. */}
      <div
        aria-hidden="true"
        className="sb-anim pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 bg-gradient-to-r from-transparent via-white/[0.14] to-transparent"
        style={{ animationName: "sb-sweep", animationDuration: "6s" }}
      />
    </Frame>
  );
}
