import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A styled native `<select>`.
 *
 * shadcn's Select is a Radix listbox; this deliberately isn't. A native select
 * needs no extra dependency, is keyboard- and screen-reader-correct for free,
 * and opens as the platform picker on mobile — which is what you want for the
 * plain "pick one value" case that scaffolded forms are full of. Reach for
 * `npx shadcn add select` when you need custom option rendering or search.
 */
function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "flex h-8 w-full appearance-none rounded-lg border border-input bg-background py-1 pl-3 pr-8 text-[13px] text-foreground transition-[border-color,box-shadow]",
          "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 opacity-50" />
    </div>
  );
}

export { Select };
