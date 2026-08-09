import React from "react";
import type { PageProps } from "@pylonsync/react";

// An event opens on its Overview — the operational summary that links out to
// each work queue.
export default function EventPage({ params, response }: PageProps<{ id: string }>) {
  response.redirect(`/dashboard/events/${params.id}/overview`);
  return null;
}
