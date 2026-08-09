import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { SpeakerDirectory } from "./directory-client";
import type { EventRow, SpeakerProfileRow, SubmissionRow } from "@/lib/types";

export const metadata: Metadata = { title: "Speakers — smolboard", robots: "noindex" };

// `/dashboard/speakers` — the workspace-wide speaker CRM. One row per person
// (keyed by email) across every event in the org, with their full history.
export default function SpeakerDirectoryPage({ auth, response, serverData }: PageProps) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  const profiles = use(serverData.list<SpeakerProfileRow>("SpeakerProfile")).filter(
    (row) => row.orgId === auth.tenant_id,
  );
  const events = use(serverData.list<EventRow>("Event")).filter(
    (row) => row.orgId === auth.tenant_id,
  );
  const submissions = use(serverData.list<SubmissionRow>("Submission")).filter(
    (row) => row.orgId === auth.tenant_id,
  );
  return (
    <SpeakerDirectory
      initialProfiles={profiles}
      initialEvents={events}
      initialSubmissions={submissions}
    />
  );
}
