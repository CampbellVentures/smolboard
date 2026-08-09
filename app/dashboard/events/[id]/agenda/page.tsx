import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { AgendaBuilder } from "./agenda-client";
import type {
  EventRow,
  RoomRow,
  SessionRow,
  SessionContentRevisionRow,
  SpeakerProfileRow,
  SubmissionRow,
  TrackRow,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Agenda — smolboard",
  robots: "noindex",
};

// `/dashboard/events/[id]/agenda` — drag-and-drop schedule builder with
// conflict detection (SPEC req 5).
export default function AgendaPage({ auth, params, response, serverData }: PageProps<{ id: string }>) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  const event = use(serverData.get<EventRow>("Event", params.id));
  if (!event || event.orgId !== auth.tenant_id) {
    response.notFound();
    return null;
  }
  const byEvent = <T extends { eventId: string }>(rows: T[]) =>
    rows.filter((r) => r.eventId === event.id);
  return (
    <AgendaBuilder
      event={event}
      initialSessions={byEvent(use(serverData.list<SessionRow>("Session")))}
      initialRooms={byEvent(use(serverData.list<RoomRow>("Room")))}
      initialTracks={byEvent(use(serverData.list<TrackRow>("Track")))}
      submissions={byEvent(use(serverData.list<SubmissionRow>("Submission")))}
      profiles={byEvent(use(serverData.list<SpeakerProfileRow>("SpeakerProfile")))}
      initialRevisions={byEvent(use(serverData.list<SessionContentRevisionRow>("SessionContentRevision")))}
    />
  );
}
