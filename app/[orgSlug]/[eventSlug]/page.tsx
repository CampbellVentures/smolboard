import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { EventSite, type ScheduleFeed, type SpeakersFeed } from "./event-site-client";
import { PublicEventShell } from "@/components/public-shell";
import { publicEventInfo, resolvePublicEvent } from "@/lib/public-site";
import type { EventRow, OrgRow, SubmissionFormRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Event",
};

// The event's public site is ONE page: /<org-slug>/<event-slug> holds the
// description, schedule (#schedule), and speakers (#speakers); the header
// tabs scroll to the sections. Only the CFP is a separate route.
export default function EventHomePage({
  params,
  response,
  searchParams,
  serverData,
}: PageProps<{ orgSlug: string; eventSlug: string }>) {
  const orgsPromise = serverData.list<OrgRow>("Org");
  const eventsPromise = serverData.list<EventRow>("Event");
  const formsPromise = serverData.list<SubmissionFormRow>("SubmissionForm");
  const resolved = resolvePublicEvent(
    use(orgsPromise),
    use(eventsPromise),
    params.orgSlug,
    params.eventSlug,
  );
  if (!resolved) {
    response.notFound();
    return null;
  }
  const { org, event } = resolved;
  const cfpOpen =
    event.cfpStatus === "open" &&
    use(formsPromise).some((f) => f.eventId === event.id && f.status === "open");
  // Schedule + speakers render server-side (serverData.fn, SDK ≥0.4.0) — the
  // feeds arrive in the HTML instead of loading after hydration.
  const feedArgs = { orgSlug: params.orgSlug, eventSlug: params.eventSlug };
  const schedule = use(serverData.fn<ScheduleFeed>("getPublicSchedule", feedArgs));
  const speakers = use(serverData.fn<SpeakersFeed>("getPublicSpeakers", feedArgs));

  // Widget mode: ?embed=schedule|speakers renders one section, chrome-less,
  // sized for an iframe on the organizer's own site.
  const embed = typeof searchParams.embed === "string" ? searchParams.embed : "";
  if (embed === "schedule" || embed === "speakers") {
    return (
      <div className="bg-transparent p-2">
        <EventSite
          event={publicEventInfo(org, event)}
          description={null}
          cfpOpen={false}
          initialSchedule={schedule}
          initialSpeakers={speakers}
          section={embed}
        />
        <p className="mt-4 text-center text-[11px] text-zinc-400">
          <a
            href={`/${params.orgSlug}/${params.eventSlug}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-zinc-600"
          >
            Powered by smolboard
          </a>
        </p>
      </div>
    );
  }

  return (
    <PublicEventShell event={publicEventInfo(org, event)} active="home">
      <EventSite
        event={publicEventInfo(org, event)}
        description={event.description ?? null}
        cfpOpen={cfpOpen}
        initialSchedule={schedule}
        initialSpeakers={speakers}
      />
    </PublicEventShell>
  );
}
