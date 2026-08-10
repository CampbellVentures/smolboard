import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { FormsList } from "./forms-client";
import type { EventRow, SubmissionFormRow, SubmissionRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Forms — smolboard",
  robots: "noindex",
};

export default function FormsPage({ auth, params, response, serverData }: PageProps<{ id: string }>) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  const event = use(serverData.get<EventRow>("Event", params.id));
  if (!event || event.orgId !== auth.tenant_id) {
    response.notFound();
    return null;
  }
  const forms = use(serverData.list<SubmissionFormRow>("SubmissionForm")).filter(
    (f) => f.eventId === event.id,
  );
  const submissions = use(serverData.list<SubmissionRow>("Submission")).filter(
    (s) => s.eventId === event.id,
  );
  return <FormsList event={event} initial={forms} initialSubmissions={submissions} />;
}
