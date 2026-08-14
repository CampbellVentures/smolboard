"use client";

import React from "react";
import { Popover } from "radix-ui";

export function MarketingMobileNav({ signedIn }: { signedIn: boolean }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="flex size-9 items-center justify-center rounded-md text-zinc-700 transition-colors hover:bg-zinc-100 md:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          data-origin="top-right"
          className="t-dropdown z-40 max-h-[calc(100vh-4.5rem)] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-[0_24px_48px_-24px_rgba(0,0,0,0.25)] md:hidden"
        >
          <div className="space-y-6 px-6 py-6">
            <div className="flex flex-col">
              <a href="/ai-engineer/ai-engineer-sandbox" className="rounded-lg px-2 py-2 text-[14px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50">Live demo</a>
              <a href="/portal" className="rounded-lg px-2 py-2 text-[14px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50">Speaker portal</a>
              <a href="https://github.com/CampbellVentures/smolboard" className="rounded-lg px-2 py-2 text-[14px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50">GitHub</a>
            </div>
            <div className="flex flex-col gap-2 border-t border-zinc-100 pt-5">
              {signedIn ? (
                <a href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 text-[14px] font-medium text-white transition-colors hover:bg-zinc-700">Open dashboard</a>
              ) : (
                <>
                  <a href="/login" className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 text-[14px] font-medium text-zinc-900 transition-colors hover:bg-zinc-50">Log in</a>
                  <a href="/signup" className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 text-[14px] font-medium text-white transition-colors hover:bg-zinc-700">Get started</a>
                </>
              )}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
