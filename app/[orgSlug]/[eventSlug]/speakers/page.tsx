import React from "react";
import type { PageProps } from "@pylonsync/react";

// Speakers are a section of the one event page now; keep the old URL working.
export default function SpeakersRedirect({
  params,
  response,
}: PageProps<{ orgSlug: string; eventSlug: string }>) {
  response.redirect(`/${params.orgSlug}/${params.eventSlug}#speakers`);
  return null;
}
