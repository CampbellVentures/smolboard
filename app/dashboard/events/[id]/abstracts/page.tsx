import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { AbstractsView } from "./abstracts-client";
import type {
  EventRow,
  ReviewRoundRow,
  ReviewRow,
  SpeakerProfileRow,
  SubmissionFormRow,
  SubmissionRow,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Submissions - smolboard",
  robots: "noindex",
};

// `/dashboard/events/[id]/abstracts` — review + scoring (SPEC req 4). All
// event rows resolve server-side for first paint; the client keeps them live.
export default function AbstractsPage({ auth, params, response, serverData }: PageProps<{ id: string }>) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  const event = use(serverData.get<EventRow>("Event", params.id));
  if (!event || event.orgId !== auth.tenant_id) {
    response.notFound();
    return null;
  }
  const byEvent = <T extends { eventId: string }>(rows: T[]) =>
    rows.filter((r) => r.eventId === event.id);
  return (
    <AbstractsView
      event={event}
      currentUserId={auth.user_id!}
      initialSubmissions={byEvent(use(serverData.list<SubmissionRow>("Submission")))}
      initialReviews={byEvent(use(serverData.list<ReviewRow>("Review")))}
      initialRounds={byEvent(use(serverData.list<ReviewRoundRow>("ReviewRound")))}
      profiles={byEvent(use(serverData.list<SpeakerProfileRow>("SpeakerProfile")))}
      forms={byEvent(use(serverData.list<SubmissionFormRow>("SubmissionForm")))}
    />
  );
}
