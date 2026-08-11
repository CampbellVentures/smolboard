import React from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { AcceptInvite } from "./accept-client";

export const metadata: Metadata = { title: "Accept invite · smolboard", robots: "noindex" };

// `/invite/[token]` — the clickable landing for org invites. The framework's
// accept endpoint is POST-only, so a link needs this page to do the POST for
// the signed-in visitor (and to route signed-out visitors through login).
export default function InvitePage({ params, auth }: PageProps<{ token: string }>) {
  return <AcceptInvite token={params.token} signedIn={Boolean(auth.user_id)} />;
}
