import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { EmailsClient } from "./emails-client";
import type { EmailLogRow, EmailTemplateRow, EventRow, SpeakerProfileRow } from "@/lib/types";

export const metadata: Metadata = { title: "Emails · smolboard", robots: "noindex" };

export default function EmailsPage({ auth, params, response, serverData }: PageProps<{ id: string }>) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  const event = use(serverData.get<EventRow>("Event", params.id));
  if (!event || event.orgId !== auth.tenant_id) {
    response.notFound();
    return null;
  }
  const templates = use(serverData.list<EmailTemplateRow>("EmailTemplate")).filter(
    (row) => row.eventId === event.id,
  );
  const logs = use(serverData.list<EmailLogRow>("EmailLog")).filter(
    (row) => row.eventId === event.id,
  );
  const profiles = use(serverData.list<SpeakerProfileRow>("SpeakerProfile")).filter(
    (row) => row.eventId === event.id,
  );
  // The real sender identity, so the editor's From line matches what lands in
  // inboxes. Server-only env — must be read here, not in the client.
  const fromAddress = process.env.PYLON_EMAIL_FROM || `${event.name} <no-reply@localhost>`;
  return (
    <EmailsClient
      event={event}
      fromAddress={fromAddress}
      initialTemplates={templates}
      initialLogs={logs}
      initialProfiles={profiles}
    />
  );
}
