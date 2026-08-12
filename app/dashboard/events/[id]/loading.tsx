import React from "react";
import { PageSkeleton } from "@/components/page-skeleton";

// Nearest fallback for every event page: overview, abstracts, agenda,
// speakers, tasks, content, emails, forms, embeds, branding, settings.
export default function Loading() {
  return <PageSkeleton rows={6} />;
}
