import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { ResourcesPage } from "./resources-client";
import type { EventRow, PortalResourceRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Resources · smolboard",
  robots: "noindex",
};

export default function EventResourcesPage({
  auth,
  params,
  response,
  serverData,
}: PageProps<{ id: string }>) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  const event = use(serverData.get<EventRow>("Event", params.id));
  if (!event || event.orgId !== auth.tenant_id) {
    response.notFound();
    return null;
  }
  const resources = use(serverData.list<PortalResourceRow>("PortalResource")).filter(
    (row) => row.eventId === event.id,
  );
  return <ResourcesPage event={event} initialResources={resources} />;
}
