"use client";

import React, { useEffect } from "react";
import { useRouter } from "@pylonsync/react";
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
  const router = useRouter();
  useEffect(() => {
    const lastEventId = localStorage.getItem(lastEventStorageKey(tenantId));
    // Client-side replace: a full-document redirect here made every visit to
    // /dashboard paint the events list and then reload into the event.
    router.replace(
      dashboardDestination(initial.map((event) => event.id), lastEventId),
    );
  }, [initial, tenantId, router]);

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
