import React from "react";
import { Link } from "@pylonsync/react";
import {
  ArrowRight,
  CalendarDays,
  Inbox,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardIconChip, DashboardStatusBadge } from "@/components/dashboard";
import { parseBranding } from "@/lib/branding";
import type { EventRow } from "@/lib/types";

interface EventDetailProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}

interface EventCardProps {
  event: EventRow;
  submissionCount: number;
  dateLabel?: string;
  orgSlug?: string | null;
}

function cfpLabel(status: string): string {
  if (status === "open") return "CFP open";
  if (status === "closed") return "CFP closed";
  return "Draft";
}

function nextStep(event: EventRow, submissionCount: number): string {
  if (!event.startDate) return "Next: add event dates";
  if (event.cfpStatus === "draft") return "Next: open your CFP when ready";
  if (event.cfpStatus === "open" && submissionCount === 0) {
    return "Next: share your CFP";
  }
  if (!event.schedulePublished && submissionCount > 0) {
    return "Next: build your agenda";
  }
  return "Event workspace is ready";
}

// The event's hero, the way the public site shows it: a banner across the top
// of the card. Branding is wide art — a 360x80 wordmark squeezed into a 44px
// square mark renders as an 8px sliver — so it needs a wide slot or none.
// Events without a hero keep the plain card and its calendar chip.
function EventBanner({ event }: { event: EventRow }): React.ReactElement | null {
  const { heroUrl } = parseBranding(event.brandingJson);
  if (!heroUrl) return null;
  return (
    <div className="h-24 w-full overflow-hidden bg-zinc-100">
      <img
        src={heroUrl}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="size-full object-cover"
      />
    </div>
  );
}

function EventDetail({
  icon: Icon,
  label,
  value,
}: EventDetailProps): React.ReactElement {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 truncate text-sm text-foreground">{value}</div>
      </div>
    </div>
  );
}

export function EventCard({
  event,
  orgSlug,
  submissionCount,
  dateLabel,
}: EventCardProps): React.ReactElement {
  return (
    <Link
      href={`/dashboard/events/${event.id}/overview`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="overflow-hidden pt-0 transition-[box-shadow] duration-150 ease-out group-hover:shadow-md">
        <EventBanner event={event} />
        <CardHeader className="flex-row items-start justify-between gap-4 pb-5 pt-6">
          <div className="flex min-w-0 items-center gap-3">
            <DashboardIconChip icon={CalendarDays} tone="violet" size="lg" />
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{event.name}</CardTitle>
              <CardDescription className="mt-1 truncate text-pretty">
                /{orgSlug ?? "…"}/{event.slug}
              </CardDescription>
            </div>
          </div>
          <DashboardStatusBadge status={event.cfpStatus}>
            {cfpLabel(event.cfpStatus)}
          </DashboardStatusBadge>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <EventDetail
            icon={CalendarDays}
            label="Dates"
            value={dateLabel ?? "Not set"}
          />
          <EventDetail
            icon={MapPin}
            label="Location"
            value={event.location || "Not set"}
          />
          <EventDetail
            icon={Inbox}
            label="Submissions"
            value={<span className="tabular-nums">{submissionCount}</span>}
          />
        </CardContent>
        <CardFooter className="justify-between gap-4 border-t border-border/70 pt-4">
          <span className="truncate text-xs text-muted-foreground">
            {nextStep(event, submissionCount)}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground">
            Open event
            <ArrowRight
              className="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}
