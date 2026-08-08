import React from "react";
import type { PageProps } from "@pylonsync/react";

// An event opens on its primary work queue. Overview remains available as a
// secondary operational summary at /overview.
export default function EventPage({ params, response }: PageProps<{ id: string }>) {
  response.redirect(`/dashboard/events/${params.id}/abstracts`);
  return null;
}
