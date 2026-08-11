import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { EventsList } from "../events-client";
import { ProvisionWorkspace } from "../provision-workspace";
import { submissionCountsByEvent } from "@/lib/dashboard-events";
import type { EventRow, SubmissionRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Events · smolboard",
  robots: "noindex",
};

export default function EventsPage({ auth, response, serverData }: PageProps) {
  if (!auth.tenant_id) {
    const surface = use(serverData.fn<{ isSpeaker: boolean }>("getMySurface", {}));
    if (surface?.isSpeaker) {
      response.redirect("/portal");
      return null;
    }
    return <ProvisionWorkspace />;
  }

  // Start both policy-gated reads before either `use` suspends. Keep the
  // original serverData promises intact so Pylon can replay them on hydration.
  const eventsPromise = serverData.list<EventRow>("Event");
  const submissionsPromise = serverData.list<SubmissionRow>("Submission");
  const allEvents = use(eventsPromise);
  const submissions = use(submissionsPromise);
  const events = allEvents.filter((event) => event.orgId === auth.tenant_id);
  const submissionCounts = submissionCountsByEvent(submissions);

  return (
    <EventsList
      tenantId={auth.tenant_id}
      initial={events}
      submissionCounts={submissionCounts}
    />
  );
}
