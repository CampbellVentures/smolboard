import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { TasksClient } from "./tasks-client";
import type {
  EventRow,
  SpeakerProfileRow,
  SpeakerTaskRow,
  SubmissionRow,
  TaskTemplateRow,
} from "@/lib/types";

export const metadata: Metadata = { title: "Speaker tasks · smolboard", robots: "noindex" };

export default function TasksPage({ auth, params, response, serverData }: PageProps<{ id: string }>) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  const event = use(serverData.get<EventRow>("Event", params.id));
  if (!event || event.orgId !== auth.tenant_id) {
    response.notFound();
    return null;
  }
  const templates = use(serverData.list<TaskTemplateRow>("TaskTemplate")).filter(
    (row) => row.eventId === event.id,
  );
  const tasks = use(serverData.list<SpeakerTaskRow>("SpeakerTask")).filter(
    (row) => row.eventId === event.id,
  );
  const profiles = use(serverData.list<SpeakerProfileRow>("SpeakerProfile")).filter(
    (row) => row.eventId === event.id,
  );
  const submissions = use(serverData.list<SubmissionRow>("Submission")).filter(
    (row) => row.eventId === event.id,
  );
  return (
    <TasksClient
      event={event}
      initialTemplates={templates}
      initialTasks={tasks}
      profiles={profiles}
      submissions={submissions}
    />
  );
}
