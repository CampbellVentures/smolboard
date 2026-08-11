import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { PortalLogin, PortalHome } from "./portal-client";
import type {
  DeliverableCommentRow,
  DeliverableSlotRow,
  DeliverableVersionRow,
  EventRow,
  OrgRow,
  SpeakerFileRow,
  SpeakerProfileRow,
  SpeakerTaskRow,
  SubmissionFormRow,
  SubmissionDraftRow,
  SubmissionRow,
  TaskTemplateRow,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Speaker portal · smolboard",
  robots: "noindex",
};

// `/portal` — the speaker's self-service home. Signed-out visitors get the
// magic-code login (passwordless; the account was created when they submitted
// a CFP). Signed-in speakers see every event they've submitted to: profile,
// submissions, and (soon) tasks + files. All reads are policy-scoped to the
// caller's own rows.
export default function PortalPage({ auth, serverData, searchParams }: PageProps) {
  if (!auth.user_id) {
    return <PortalLogin />;
  }
  const me = use(serverData.get<{ email?: string }>("User", auth.user_id));
  // Policies return own-rows for speakers (plus active-org rows for
  // organizers), so filter to the caller's userId.
  const profiles = use(serverData.list<SpeakerProfileRow>("SpeakerProfile")).filter(
    (p) => p.userId === auth.user_id,
  );
  const submissions = use(serverData.list<SubmissionRow>("Submission")).filter(
    (s) => s.speakerUserId === auth.user_id,
  );
  const drafts = use(serverData.list<SubmissionDraftRow>("SubmissionDraft")).filter(
    (draft) => draft.ownerUserId === auth.user_id,
  );
  // Non-draft events are publicly readable; used for names/dates.
  const events = use(serverData.list<EventRow>("Event"));
  const tasks = use(serverData.list<SpeakerTaskRow>("SpeakerTask")).filter(
    (task) => task.speakerUserId === auth.user_id,
  );
  const templates = use(serverData.list<TaskTemplateRow>("TaskTemplate"));
  const files = use(serverData.list<SpeakerFileRow>("SpeakerFile")).filter(
    (file) => file.userId === auth.user_id,
  );
  const forms = use(serverData.list<SubmissionFormRow>("SubmissionForm"));
  const orgs = use(serverData.list<OrgRow>("Org"));
  const deliverableSlots = use(serverData.list<DeliverableSlotRow>("DeliverableSlot")).filter(
    (slot) => slot.speakerUserId === auth.user_id,
  );
  const deliverableVersions = use(serverData.list<DeliverableVersionRow>("DeliverableVersion")).filter(
    (version) => version.speakerUserId === auth.user_id,
  );
  const deliverableComments = use(serverData.list<DeliverableCommentRow>("DeliverableComment")).filter(
    (comment) => comment.speakerUserId === auth.user_id,
  );

  return (
    <PortalHome
      userId={auth.user_id}
      email={me?.email ?? ""}
      initialProfiles={profiles}
      initialSubmissions={submissions}
      initialDrafts={drafts}
      initialTasks={tasks}
      initialTemplates={templates}
      initialFiles={files}
      initialForms={forms}
      initialDeliverableSlots={deliverableSlots}
      initialDeliverableVersions={deliverableVersions}
      initialDeliverableComments={deliverableComments}
      events={events}
      orgs={orgs}
      participantClaim={
        typeof searchParams.participantInvite === "string" && typeof searchParams.token === "string"
          ? { inviteId: searchParams.participantInvite, token: searchParams.token }
          : undefined
      }
    />
  );
}
