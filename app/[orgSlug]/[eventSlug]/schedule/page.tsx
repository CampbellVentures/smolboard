import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { PublicSchedule } from "./schedule-client";
import { publicEventInfo, resolvePublicEvent } from "@/lib/public-site";
import type { EventRow, OrgRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Schedule",
};

// Public schedule: /<org-slug>/<event-slug>/schedule. The event shell SSRs
// (non-draft events are policy-readable anonymously); sessions/rooms/tracks
// load through the gated getPublicSchedule query so nothing sensitive rides
// on open policies.
export default function PublicSchedulePage({
  params,
  response,
  serverData,
}: PageProps<{ orgSlug: string; eventSlug: string }>) {
  const orgsPromise = serverData.list<OrgRow>("Org");
  const eventsPromise = serverData.list<EventRow>("Event");
  const resolved = resolvePublicEvent(
    use(orgsPromise),
    use(eventsPromise),
    params.orgSlug,
    params.eventSlug,
  );
  if (!resolved) {
    response.notFound();
    return null;
  }
  return <PublicSchedule event={publicEventInfo(resolved.org, resolved.event)} />;
}
