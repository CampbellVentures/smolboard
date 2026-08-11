import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { FormBuilder } from "./builder-client";
import type { EventRow, SubmissionFormRow, SubmissionRow, TrackRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Form builder · smolboard",
  robots: "noindex",
};

export default function FormBuilderPage({
  auth,
  params,
  response,
  serverData,
}: PageProps<{ id: string; formId: string }>) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  const event = use(serverData.get<EventRow>("Event", params.id));
  if (!event || event.orgId !== auth.tenant_id) {
    response.notFound();
    return null;
  }
  const form = use(serverData.get<SubmissionFormRow>("SubmissionForm", params.formId));
  if (!form || form.eventId !== event.id) {
    response.notFound();
    return null;
  }
  const tracks = use(serverData.list<TrackRow>("Track")).filter((track) => track.eventId === event.id);
  const submissions = use(serverData.list<SubmissionRow>("Submission")).filter(
    (submission) => submission.formId === form.id && submission.eventId === event.id,
  );
  return <FormBuilder event={event} form={form} tracks={tracks} submissions={submissions} />;
}
