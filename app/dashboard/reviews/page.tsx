import React from "react";
import type { Metadata, PageProps } from "@pylonsync/react";
import { ReviewerQueue } from "./reviewer-queue";

export const metadata: Metadata = { title: "Review queue — smolboard", robots: "noindex" };

export default function ReviewerQueuePage({ auth, response }: PageProps) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  return <ReviewerQueue orgId={auth.tenant_id} />;
}
