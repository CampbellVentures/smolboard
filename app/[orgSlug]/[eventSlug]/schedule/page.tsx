import React from "react";
import type { PageProps } from "@pylonsync/react";

// The schedule is a section of the one event page now. This route survives
// as a redirect because calendar invites, portal links, and shared URLs
// pointed here.
export default function ScheduleRedirect({
  params,
  response,
}: PageProps<{ orgSlug: string; eventSlug: string }>) {
  response.redirect(`/${params.orgSlug}/${params.eventSlug}#schedule`);
  return null;
}
