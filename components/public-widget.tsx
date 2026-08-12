"use client";

import React from "react";
import {
  ItineraryWidget,
  SessionsListWidget,
  SpeakerGalleryWidget,
} from "@/components/public-widgets";
import type { ScheduleFeed, SpeakersFeed } from "@/app/[orgSlug]/[eventSlug]/event-site-client";

// One client boundary for the standalone widgets so the SSR page can stay a
// server component and still hand each surface its already-fetched feed.
export function PublicWidget({
  kind,
  schedule,
  speakers,
  eventSlug,
  icsHref,
  accent,
}: {
  kind: "sessions" | "itinerary" | "gallery";
  schedule: ScheduleFeed | null;
  speakers: SpeakersFeed | null;
  eventSlug: string;
  icsHref: string;
  accent?: string | null;
}) {
  if (kind === "sessions") return <SessionsListWidget feed={schedule} accent={accent} />;
  if (kind === "itinerary") {
    return <ItineraryWidget feed={schedule} eventSlug={eventSlug} icsHref={icsHref} accent={accent} />;
  }
  // The speakers feed carries no timezone; session times must still read in
  // the EVENT's zone, so borrow it from the schedule feed.
  return <SpeakerGalleryWidget feed={speakers} tz={schedule?.event?.timezone ?? "UTC"} />;
}
