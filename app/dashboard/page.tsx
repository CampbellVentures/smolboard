import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { ProvisionWorkspace } from "./provision-workspace";
import { EventsList } from "./events-client";
import type { EventRow, SubmissionRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Events — smolboard",
  robots: "noindex",
};

// `/dashboard` — the workspace's events. The layout owns the auth gate and
// shell; this page resolves the list server-side so it paints with real data
// on the first byte.
export default function DashboardPage({ auth, serverData }: PageProps) {
  // No active workspace (signup's auto-provision failed, or the user left/
  // deleted their last org): provision one client-side, then reload into a
  // ready dashboard. The layout renders this bare (no shell).
  if (!auth.tenant_id) {
    return <ProvisionWorkspace />;
  }
  // The Event read policy also returns other orgs' public (non-draft) events,
  // so scope to the active workspace here.
  const allEvents = use(serverData.list<EventRow>("Event"));
  const events = allEvents.filter((e) => e.orgId === auth.tenant_id);
  const submissions = use(serverData.list<SubmissionRow>("Submission"));
  const counts: Record<string, number> = {};
  for (const s of submissions) counts[s.eventId] = (counts[s.eventId] ?? 0) + 1;

  return (
    <EventsList tenantId={auth.tenant_id} initial={events} submissionCounts={counts} />
  );
}
