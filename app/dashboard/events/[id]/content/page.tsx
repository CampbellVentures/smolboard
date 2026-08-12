import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { ContentTable } from "./content-client";
import type {
  DeliverableCommentRow,
  DeliverableSlotRow,
  DeliverableVersionRow,
  EventRow,
  SessionRow,
  SpeakerProfileRow,
  SpeakerTaskRow,
  TaskTemplateRow,
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
  // Slots carry a sessionId; the table names the session so an organizer can
  // see which talk a deck belongs to, not just who sent it.
  const sessions = use(serverData.list<SessionRow>("Session")).filter(
    (row) => row.eventId === event.id,
  );
  // A slot only exists once a speaker uploads something. The assigned upload
  // task is the record of a deliverable that is still owed, so the desk needs
  // both to answer "who has not sent their deck yet".
  const templates = use(serverData.list<TaskTemplateRow>("TaskTemplate")).filter(
    (row) => row.eventId === event.id,
  );
  const tasks = use(serverData.list<SpeakerTaskRow>("SpeakerTask")).filter(
    (row) => row.eventId === event.id,
  );
  return (
    <ContentTable
      event={event}
      initialSlots={slots}
      initialVersions={versions}
      initialComments={comments}
      initialProfiles={profiles}
      initialSessions={sessions}
      initialTemplates={templates}
      initialTasks={tasks}
    />
  );
}
