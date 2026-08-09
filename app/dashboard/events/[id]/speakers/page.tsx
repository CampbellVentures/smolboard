import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { SpeakersTable } from "./speakers-client";
import type {
  EventRow,
  SessionRow,
  SpeakerFileRow,
  SpeakerProfileRow,
  SpeakerTaskRow,
  SubmissionRow,
  TaskTemplateRow,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Speakers — smolboard",
  robots: "noindex",
};

export default function SpeakersPage({ auth, params, response, serverData }: PageProps<{ id: string }>) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  const event = use(serverData.get<EventRow>("Event", params.id));
  if (!event || event.orgId !== auth.tenant_id) {
    response.notFound();
    return null;
  }
  const profiles = use(serverData.list<SpeakerProfileRow>("SpeakerProfile")).filter(
    (p) => p.eventId === event.id,
  );
  const submissions = use(serverData.list<SubmissionRow>("Submission")).filter(
    (s) => s.eventId === event.id,
  );
  const sessions = use(serverData.list<SessionRow>("Session")).filter((row) => row.eventId === event.id);
  const tasks = use(serverData.list<SpeakerTaskRow>("SpeakerTask")).filter((row) => row.eventId === event.id);
  const templates = use(serverData.list<TaskTemplateRow>("TaskTemplate")).filter((row) => row.eventId === event.id);
  const files = use(serverData.list<SpeakerFileRow>("SpeakerFile")).filter((row) => row.eventId === event.id);
  return (
    <SpeakersTable
      event={event}
      initialProfiles={profiles}
      initialSubmissions={submissions}
      initialSessions={sessions}
      initialTasks={tasks}
      initialTemplates={templates}
      initialFiles={files}
    />
  );
}
