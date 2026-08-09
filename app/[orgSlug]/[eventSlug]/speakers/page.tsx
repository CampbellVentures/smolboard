import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { PublicSpeakers } from "./speakers-client";
import { publicEventInfo, resolvePublicEvent } from "@/lib/public-site";
import type { EventRow, OrgRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Speakers",
};

// Public speaker gallery: /<org-slug>/<event-slug>/speakers. Shell SSRs;
// speaker data loads through the gated getPublicSpeakers query (safe fields
// only — emails never leave the server).
export default function PublicSpeakersPage({
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
  return <PublicSpeakers event={publicEventInfo(resolved.org, resolved.event)} />;
}
