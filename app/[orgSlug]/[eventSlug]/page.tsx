import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { EventSite } from "./event-site-client";
import { PublicEventShell } from "@/components/public-shell";
import { publicEventInfo, resolvePublicEvent } from "@/lib/public-site";
import type { EventRow, OrgRow, SubmissionFormRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Event",
};

// The event's public site is ONE page: /<org-slug>/<event-slug> holds the
// description, schedule (#schedule), and speakers (#speakers); the header
// tabs scroll to the sections. Only the CFP is a separate route.
export default function EventHomePage({
  params,
  response,
  serverData,
}: PageProps<{ orgSlug: string; eventSlug: string }>) {
  const orgsPromise = serverData.list<OrgRow>("Org");
  const eventsPromise = serverData.list<EventRow>("Event");
  const formsPromise = serverData.list<SubmissionFormRow>("SubmissionForm");
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
  const { org, event } = resolved;
  const cfpOpen =
    event.cfpStatus === "open" &&
    use(formsPromise).some((f) => f.eventId === event.id && f.status === "open");

  return (
    <PublicEventShell event={publicEventInfo(org, event)} active="home">
      <EventSite
        event={publicEventInfo(org, event)}
        description={event.description ?? null}
        cfpOpen={cfpOpen}
      />
    </PublicEventShell>
  );
}
