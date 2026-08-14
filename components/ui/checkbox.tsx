import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "t-check peer relative size-4 shrink-0 rounded-[4px] border border-input before:absolute before:-inset-1.5 before:content-[''] shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-zinc-900 data-[state=checked]:bg-[linear-gradient(110deg,#18181b_0%,#2b2440_28%,#1f3350_55%,#1d3f44_78%,#18181b_100%)] data-[state=checked]:text-white dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        <svg className="size-3.5" viewBox="0 0 10.1668 10.1668" fill="none" aria-hidden="true">
          <path d="M1 5.52L3.92 9.17L9.17 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
