import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { DashboardLanding } from "./dashboard-landing";
import { ProvisionWorkspace } from "./provision-workspace";
import { submissionCountsByEvent } from "@/lib/dashboard-events";
import type { EventRow, SubmissionRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Dashboard — smolboard",
  robots: "noindex",
};

export default function DashboardPage({ auth, response, serverData }: PageProps) {
  if (!auth.tenant_id) {
    // A speaker with no organization belongs in the portal, not in a
    // workspace we'd otherwise create for them on the spot.
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
    <DashboardLanding
      tenantId={auth.tenant_id}
      initial={events}
      submissionCounts={submissionCounts}
    />
  );
}
