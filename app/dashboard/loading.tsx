import React from "react";
import { PageSkeleton } from "@/components/page-skeleton";

// Route-level fallback for the workspace pages. The sidebar and header live in
// the layout, so only the content column is replaced.
export default function Loading() {
  return <PageSkeleton />;
}
