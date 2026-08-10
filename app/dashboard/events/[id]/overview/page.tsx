import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { EventOverview } from "../overview-client";
import type {
  EventRow,
  ReviewAssignmentRow,
  ReviewRoundRow,
  SpeakerFileRow,
  SpeakerProfileRow,
  SpeakerTaskRow,
  SubmissionFormRow,
  SubmissionRow,
  TaskTemplateRow,
  SessionRow,
  DeliverableSlotRow,
  DeliverableVersionRow,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Overview - smolboard",
  robots: "noindex",
};

export default function EventOverviewPage({
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

  const submissions = use(serverData.list<SubmissionRow>("Submission")).filter(
    (row) => row.eventId === event.id,
  );
  const forms = use(serverData.list<SubmissionFormRow>("SubmissionForm")).filter(
    (row) => row.eventId === event.id,
  );
  const profiles = use(serverData.list<SpeakerProfileRow>("SpeakerProfile")).filter(
    (row) => row.eventId === event.id,
  );
  const tasks = use(serverData.list<SpeakerTaskRow>("SpeakerTask")).filter(
    (row) => row.eventId === event.id,
  );
  const templates = use(serverData.list<TaskTemplateRow>("TaskTemplate")).filter(
    (row) => row.eventId === event.id,
  );
  const files = use(serverData.list<SpeakerFileRow>("SpeakerFile")).filter(
    (row) => row.eventId === event.id,
  );
  const assignments = use(serverData.list<ReviewAssignmentRow>("ReviewAssignment")).filter(
    (row) => row.eventId === event.id,
  );
  const sessions = use(serverData.list<SessionRow>("Session")).filter(
    (row) => row.eventId === event.id,
  );
  const slots = use(serverData.list<DeliverableSlotRow>("DeliverableSlot")).filter(
    (row) => row.eventId === event.id,
  );
  const versions = use(serverData.list<DeliverableVersionRow>("DeliverableVersion")).filter(
    (row) => row.eventId === event.id,
  );
  const rounds = use(serverData.list<ReviewRoundRow>("ReviewRound")).filter(
    (row) => row.eventId === event.id,
  );

  return (
    <EventOverview
      event={event}
      initialSubmissions={submissions}
      initialSessions={sessions}
      initialSlots={slots}
      initialVersions={versions}
      forms={forms}
      initialProfiles={profiles}
      initialTasks={tasks}
      initialTemplates={templates}
      initialFiles={files}
      initialAssignments={assignments}
      initialRounds={rounds}
    />
  );
}
