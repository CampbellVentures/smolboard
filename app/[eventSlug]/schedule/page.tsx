import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { PublicSchedule } from "./schedule-client";
import type { EventRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Schedule",
};

// Public schedule: /[eventSlug]/schedule (SPEC M4 — shaped like
// wf2025.ai.engineer/schedule). The event shell SSRs (non-draft events are
// policy-readable anonymously); sessions/rooms/tracks load through the gated
// getPublicSchedule query so nothing sensitive rides on open policies.
export default function PublicSchedulePage({
  params,
  response,
  serverData,
}: PageProps<{ eventSlug: string }>) {
  const events = use(serverData.list<EventRow>("Event"));
  const event = events.find((e) => e.slug === params.eventSlug);
  if (!event) {
    response.notFound();
    return null;
  }
  return <PublicSchedule eventSlug={event.slug} eventName={event.name} />;
}
