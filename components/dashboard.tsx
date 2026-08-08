import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
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
      className={cn("mx-auto flex w-full max-w-4xl flex-col gap-5", className)}
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
        "flex min-h-10 flex-wrap items-center justify-between gap-3",
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
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <CardHeader className="flex-row items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-sm">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-0">{children}</CardContent>
    </Card>
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
    <Card className="gap-0 py-0">
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
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <Empty className="min-h-72 border">
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

function badgeVariant(status: string): BadgeProps["variant"] {
  if (["rejected", "failed", "error"].includes(status)) return "destructive";
  if (["open", "live", "accepted", "completed", "owner"].includes(status)) {
    return "default";
  }
  if (["draft", "closed", "pending", "admin"].includes(status)) return "secondary";
  return "outline";
}

export function DashboardStatusBadge({
  status,
  children,
}: {
  status: string;
  children?: React.ReactNode;
}) {
  return (
    <Badge variant={badgeVariant(status.toLowerCase())} className="capitalize">
      {children ?? status}
    </Badge>
  );
}
