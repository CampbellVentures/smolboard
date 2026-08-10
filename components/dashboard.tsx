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
  variant = "flat",
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
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
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-balance text-sm">{title}</CardTitle>
          {description ? (
            <CardDescription className="text-pretty">{description}</CardDescription>
          ) : null}
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

export function DashboardMetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Card className="gap-0 rounded-xl border bg-card py-0 shadow-none">
      <CardHeader className="flex-row items-center gap-2 px-4 pb-0 pt-4 text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        <CardTitle className="text-[11px] font-medium uppercase tracking-wide">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-2">
        <div className="text-2xl font-semibold tabular-nums text-foreground">{value}</div>
        {hint != null ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
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
