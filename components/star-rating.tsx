"use client";

import React from "react";
import { Star } from "lucide-react";

// THE score input. Organizers and reviewers rate the same way, so a criterion
// never renders as stars on one screen and a number box on another.
export function StarRating({
  label,
  value,
  max = 5,
  onChange,
}: {
  label: string;
  value: number | null;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={label}>
      {Array.from({ length: max }, (_, i) => i + 1).map((step) => (
        <button
          key={step}
          type="button"
          aria-label={`${label}: ${step} of ${max}`}
          aria-pressed={(value ?? 0) >= step}
          onClick={() => onChange(step)}
          className="p-0.5"
        >
          <Star
            className={
              "size-4 " +
              ((value ?? 0) >= step
                ? "fill-amber-400 text-amber-400"
                : "text-zinc-300 hover:text-zinc-400")
            }
            aria-hidden="true"
          />
        </button>
      ))}
      <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
        {value ? `${value}/${max}` : "unscored"}
      </span>
    </div>
  );
}
