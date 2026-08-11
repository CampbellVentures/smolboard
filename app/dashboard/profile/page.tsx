import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { ProfileClient } from "./profile-client";

export const metadata: Metadata = {
  title: "Your profile — smolboard",
  robots: "noindex",
};

export default function ProfilePage({ auth, response, serverData }: PageProps) {
  if (!auth.user_id) {
    response.redirect("/login");
    return null;
  }
  const me = use(
    serverData.get<{ email?: string; displayName?: string; createdAt?: string }>(
      "User",
      auth.user_id,
    ),
  );
  return (
    <ProfileClient
      email={me?.email ?? ""}
      displayName={me?.displayName ?? ""}
      joinedAt={me?.createdAt ?? null}
    />
  );
}
