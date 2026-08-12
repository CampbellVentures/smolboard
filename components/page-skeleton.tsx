import React from "react";
import { cn } from "@/lib/utils";

// The shape a dashboard page has before its data arrives. Rendered by the
// route-level loading.tsx boundaries, so it must stay SERVER-ONLY: no hooks,
// no serverData, nothing that suspends.
//
// This exists because a sidebar click had nothing to show for itself. The page
// payload is prefetched, but the route's client chunk is not, so the browser
// sat on the previous page for 170-660ms with no sign the click had registered.
// A skeleton makes the click land immediately and gives the incoming content
// somewhere to appear.

function Bar({ className }: { className?: string }) {
  return <div className={cn("rounded bg-muted", className)} />;
}

export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      className="flex w-full min-w-0 animate-pulse flex-col gap-5"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading</span>
      {/* Hero */}
      <div className="rounded-xl border border-border bg-card p-6">
        <Bar className="h-5 w-56" />
        <Bar className="mt-3 h-3.5 w-96 max-w-full" />
      </div>
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Bar className="h-9 w-64" />
        <Bar className="h-9 w-32" />
        <Bar className="ml-auto h-9 w-28" />
      </div>
      {/* Rows */}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Bar className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Bar className="h-3.5 w-48 max-w-full" />
              <Bar className="mt-2 h-3 w-72 max-w-full" />
            </div>
            <Bar className="h-6 w-20 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
