import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { EventOverview } from "./overview-client";
import type { EventRow, SubmissionRow, SubmissionFormRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Event — smolboard",
  robots: "noindex",
};

// `/dashboard/events/[id]` — the event's live dashboard (SPEC req 6 grows
// here). The layout owns auth + chrome; this page re-verifies event ownership
// because the Event read policy exposes non-draft events publicly.
export default function EventPage({ auth, params, response, serverData }: PageProps<{ id: string }>) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  const event = use(serverData.get<EventRow>("Event", params.id));
  if (!event || event.orgId !== auth.tenant_id) {
    response.notFound();
    return null;
  }
  const submissions = use(serverData.list<SubmissionRow>("Submission")).filter(
    (s) => s.eventId === event.id,
  );
  const forms = use(serverData.list<SubmissionFormRow>("SubmissionForm")).filter(
    (f) => f.eventId === event.id,
  );
  return <EventOverview event={event} initialSubmissions={submissions} forms={forms} />;
}
