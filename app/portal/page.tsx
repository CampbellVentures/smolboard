import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { PortalLogin, PortalHome } from "./portal-client";
import type { EventRow, SpeakerProfileRow, SubmissionRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Speaker portal — smolboard",
  robots: "noindex",
};

// `/portal` — the speaker's self-service home. Signed-out visitors get the
// magic-code login (passwordless; the account was created when they submitted
// a CFP). Signed-in speakers see every event they've submitted to: profile,
// submissions, and (soon) tasks + files. All reads are policy-scoped to the
// caller's own rows.
export default function PortalPage({ auth, serverData }: PageProps) {
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
  // Non-draft events are publicly readable; used for names/dates.
  const events = use(serverData.list<EventRow>("Event"));

  return (
    <PortalHome
      userId={auth.user_id}
      email={me?.email ?? ""}
      initialProfiles={profiles}
      initialSubmissions={submissions}
      events={events}
    />
  );
}
