import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { ContentTable } from "./content-client";
import type {
  DeliverableCommentRow,
  DeliverableSlotRow,
  DeliverableVersionRow,
  EventRow,
  SpeakerProfileRow,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Content · smolboard",
  robots: "noindex",
};

// `/dashboard/events/[id]/content` — the review desk for everything speakers
// have uploaded (deliverable slots + versions), with approve / request-changes
// verdicts and per-slot version history.
export default function ContentPage({ auth, params, response, serverData }: PageProps<{ id: string }>) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  const event = use(serverData.get<EventRow>("Event", params.id));
  if (!event || event.orgId !== auth.tenant_id) {
    response.notFound();
    return null;
  }
  const slots = use(serverData.list<DeliverableSlotRow>("DeliverableSlot")).filter(
    (row) => row.eventId === event.id,
  );
  const versions = use(serverData.list<DeliverableVersionRow>("DeliverableVersion")).filter(
    (row) => row.eventId === event.id,
  );
  const comments = use(serverData.list<DeliverableCommentRow>("DeliverableComment")).filter(
    (row) => row.eventId === event.id,
  );
  const profiles = use(serverData.list<SpeakerProfileRow>("SpeakerProfile")).filter(
    (row) => row.eventId === event.id,
  );
  return (
    <ContentTable
      event={event}
      initialSlots={slots}
      initialVersions={versions}
      initialComments={comments}
      initialProfiles={profiles}
    />
  );
}
