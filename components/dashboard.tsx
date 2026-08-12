import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

// Dashboard pages use one predictable canvas. Dense tools opt into the wide
// variant explicitly; ordinary lists, forms, and settings never pick their own
// max-width ad hoc.
export function DashboardPage({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-page"
      className={cn("mx-auto flex w-full max-w-3xl flex-col gap-6", className)}
      {...props}
    />
  );
}

export function DashboardWidePage({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-wide-page"
      className={cn("flex w-full min-w-0 flex-col gap-5", className)}
      {...props}
    />
  );
}

// THE brand gradient. Every surface that wants the app's color uses this
// string: the page hero's aurora, the bulk-action bar, checked checkboxes.
// Defined once so a new surface can't invent its own palette.
export const BRAND_GRADIENT =
  "bg-[linear-gradient(110deg,#18181b_0%,#2b2440_28%,#1f3350_55%,#1d3f44_78%,#18181b_100%)]";

// THE page hero. A card with a soft aurora gradient pooling in the top-right
// corner, the one place a page gets real color. Pass the whole header layout
// as children; the shell only owns the surface.
export function DashboardHero({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn("relative overflow-hidden rounded-xl border bg-card p-5", className)}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-20 -top-36 size-80 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="absolute -right-44 top-4 size-72 rounded-full bg-sky-300/35 blur-3xl" />
        <div className="absolute right-28 -top-24 size-64 rounded-full bg-amber-200/50 blur-3xl" />
        <div className="absolute -right-8 top-20 size-56 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute right-64 -top-10 size-48 rounded-full bg-pink-300/30 blur-3xl" />
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

// Icon chip for cards and action rows (Codex-style square). The wrapper is
// ALWAYS light gray — only the icon carries the tone's color. Colored chip
// backgrounds read as AI slop; don't reintroduce them.
const CHIP_TONES = {
  violet: "bg-zinc-100 text-violet-600",
  sky: "bg-zinc-100 text-sky-600",
  amber: "bg-zinc-100 text-amber-600",
  emerald: "bg-zinc-100 text-emerald-600",
  pink: "bg-zinc-100 text-pink-600",
  zinc: "bg-zinc-100 text-zinc-600",
} as const;

export type DashboardChipTone = keyof typeof CHIP_TONES;

export function DashboardIconChip({
  icon: Icon,
  tone = "zinc",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: DashboardChipTone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "size-8 rounded-lg [&_svg]:size-4",
    md: "size-9 rounded-lg [&_svg]:size-4",
    lg: "size-11 rounded-xl [&_svg]:size-5",
  } as const;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center outline outline-1 -outline-offset-1 outline-black/5",
        sizes[size],
        CHIP_TONES[tone],
        className,
      )}
    >
      <Icon />
    </span>
  );
}

export function DashboardToolbar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-toolbar"
      className={cn(
        "flex min-h-9 flex-wrap items-center justify-between gap-2",
        className,
      )}
      {...props}
    />
  );
}

export function DashboardPanel({
  title,
  description,
  action,
  icon,
  tone = "zinc",
  variant = "flat",
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: LucideIcon;
  tone?: DashboardChipTone;
  variant?: "flat" | "subtle" | "elevated";
  className?: string;
  children: React.ReactNode;
}) {
  const contained = variant !== "flat";
  return (
    <Card
      data-variant={variant}
      className={cn(
        "gap-0 overflow-hidden py-0",
        variant === "flat" && "rounded-none border-0 bg-transparent shadow-none",
        variant === "subtle" && "rounded-xl border bg-card shadow-none",
        variant === "elevated" &&
          "rounded-xl border shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
        className,
      )}
    >
      <CardHeader
        className={cn(
          "flex-row items-start justify-between gap-4",
          contained ? "p-4" : "px-0 pb-3 pt-0",
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          {icon ? <DashboardIconChip icon={icon} tone={tone} /> : null}
          <div className={cn("flex min-w-0 flex-col gap-1", icon && "pt-0.5")}>
            <CardTitle className="text-balance text-sm">{title}</CardTitle>
            {description ? (
              <CardDescription className="text-pretty">{description}</CardDescription>
            ) : null}
          </div>
        </div>
        {action}
      </CardHeader>
      <CardContent className={contained ? "px-4 pb-4 pt-0" : "p-0"}>
        {children}
      </CardContent>
    </Card>
  );
}

export interface DashboardStat {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}

export function DashboardStatStrip({
  items,
  className,
}: {
  items: DashboardStat[];
  className?: string;
}) {
  return (
    <div
      data-slot="dashboard-stat-strip"
      className={cn(
        "grid overflow-hidden rounded-xl border bg-card sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]",
        className,
      )}
    >
      {items.map(({ icon: Icon, label, value, hint }) => (
        <div
          key={label}
          className="flex min-w-0 flex-col border-b border-border/70 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Icon className="size-3.5" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </div>
          <div className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums text-foreground">
            {value}
          </div>
          {hint != null ? (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}


export function DashboardEmptyState({
  icon,
  title,
  description,
  size = "default",
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  size?: "default" | "compact";
  children?: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <Empty
      className={cn(
        "rounded-xl border bg-card",
        size === "compact" ? "min-h-40 p-5 md:p-5" : "min-h-48 p-6 md:p-6",
      )}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-sm">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  );
}

// Status reads as a colored dot on a quiet pill (UserJot-style) — the hue
// carries the state, the pill itself stays neutral so a row of badges doesn't
// shout.
function statusDot(status: string): string {
  if (["rejected", "failed", "error", "overdue"].includes(status)) return "bg-red-500";
  if (["open", "live", "accepted", "completed", "done", "sent"].includes(status)) {
    return "bg-emerald-500";
  }
  if (["in_review", "reviewing", "in progress", "progress"].includes(status)) {
    return "bg-violet-500";
  }
  if (["pending", "submitted", "waitlisted", "planned"].includes(status)) return "bg-amber-400";
  return "bg-zinc-300";
}


export function DashboardStatusBadge({
  status,
  children,
}: {
  status: string;
  children?: React.ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className="gap-1.5 whitespace-nowrap bg-card capitalize text-foreground/80"
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", statusDot(status.toLowerCase()))}
      />
      {children ?? status.replace(/_/g, " ")}
    </Badge>
  );
}
