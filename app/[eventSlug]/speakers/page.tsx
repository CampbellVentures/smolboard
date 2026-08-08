import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { PublicSpeakers } from "./speakers-client";
import type { EventRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Speakers",
};

// Public speaker gallery: /[eventSlug]/speakers (SPEC M4 — the "embeddable
// speaker gallery" the brief waived but wanted). Same access pattern as the
// public schedule: SSR the event shell, fetch safe speaker data through the
// gated public query.
export default function PublicSpeakersPage({
  params,
  response,
  serverData,
}: PageProps<{ eventSlug: string }>) {
  const events = use(serverData.list<EventRow>("Event"));
  const event = events.find((e) => e.slug === params.eventSlug);
  if (!event) {
    response.notFound();
    return null;
  }
  return <PublicSpeakers eventSlug={event.slug} eventName={event.name} />;
}
