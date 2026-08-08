import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { EventOverview } from "../overview-client";
import type {
  EventRow,
  ReviewRoundRow,
  ReviewRow,
  SpeakerFileRow,
  SpeakerProfileRow,
  SpeakerTaskRow,
  SubmissionFormRow,
  SubmissionRow,
  TaskTemplateRow,
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
  const reviews = use(serverData.list<ReviewRow>("Review")).filter(
    (row) => row.eventId === event.id,
  );
  const rounds = use(serverData.list<ReviewRoundRow>("ReviewRound")).filter(
    (row) => row.eventId === event.id,
  );

  return (
    <EventOverview
      event={event}
      initialSubmissions={submissions}
      forms={forms}
      initialProfiles={profiles}
      initialTasks={tasks}
      initialTemplates={templates}
      initialFiles={files}
      initialReviews={reviews}
      initialRounds={rounds}
    />
  );
}
