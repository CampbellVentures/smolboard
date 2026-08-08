import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { EmailsClient } from "./emails-client";
import type { EmailLogRow, EmailTemplateRow, EventRow } from "@/lib/types";

export const metadata: Metadata = { title: "Emails — smolboard", robots: "noindex" };

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
  return <EmailsClient event={event} initialTemplates={templates} initialLogs={logs} />;
}
