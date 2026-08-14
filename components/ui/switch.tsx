import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  onKeyDown,
  onPointerDown,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      onPointerDown={(event) => {
        event.currentTarget.classList.add("is-init")
        onPointerDown?.(event)
      }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") event.currentTarget.classList.add("is-init")
        onKeyDown?.(event)
      }}
      className={cn(
        "t-toggle peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=default]:[--toggle-travel:14px] data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[size=sm]:[--toggle-travel:10px] data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "t-toggle-thumb pointer-events-none block rounded-full bg-background ring-0 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
