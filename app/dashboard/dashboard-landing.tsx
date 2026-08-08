"use client";

import React, { useEffect } from "react";
import { EventsList } from "./events-client";
import {
  dashboardDestination,
  lastEventStorageKey,
} from "@/lib/dashboard-routing";
import type { EventRow } from "@/lib/types";

interface DashboardLandingProps {
  tenantId: string;
  initial: EventRow[];
  submissionCounts: Record<string, number>;
}

export function DashboardLanding({
  tenantId,
  initial,
  submissionCounts,
}: DashboardLandingProps): React.ReactElement {
  useEffect(() => {
    const lastEventId = localStorage.getItem(lastEventStorageKey(tenantId));
    window.location.replace(
      dashboardDestination(initial.map((event) => event.id), lastEventId),
    );
  }, [initial, tenantId]);

  // Keep a useful, fully rendered fallback in place until client navigation
  // restores the last event. This also keeps the zero-event onboarding usable
  // if JavaScript is delayed or unavailable.
  return (
    <EventsList
      tenantId={tenantId}
      initial={initial}
      submissionCounts={submissionCounts}
    />
  );
}
