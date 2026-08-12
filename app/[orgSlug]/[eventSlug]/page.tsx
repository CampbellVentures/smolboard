import React, { use } from "react";
import { type GenerateMetadata, type PageProps } from "@pylonsync/react";
import { EventSite, type ScheduleFeed, type SpeakersFeed } from "./event-site-client";
import { PublicEventShell } from "@/components/public-shell";
import { PublicWidget } from "@/components/public-widget";
import { parseBranding } from "@/lib/branding";
import { publicEventInfo, resolvePublicEvent } from "@/lib/public-site";
import type { EventRow, OrgRow, SubmissionFormRow } from "@/lib/types";

// The tab title and share preview carry the event's own name, not a generic
// label — this page is the one an attendee bookmarks and shares.
export const generateMetadata: GenerateMetadata<{
  orgSlug: string;
  eventSlug: string;
}> = async ({ params, serverData }) => {
  const [orgs, events] = await Promise.all([
    serverData.list<OrgRow>("Org"),
    serverData.list<EventRow>("Event"),
  ]);
  const resolved = resolvePublicEvent(orgs, events, params.orgSlug, params.eventSlug);
  if (!resolved) return { title: "Event not found" };
  const { org, event } = resolved;
  const description =
    event.description?.trim() ||
    `The schedule, speakers, and call for speakers for ${event.name}.`;
  return {
    title: `${event.name} · ${org.name}`,
    description,
    openGraph: { title: event.name, description },
  };
};

// The event's public site is ONE page: /<org-slug>/<event-slug> holds the
// description, schedule (#schedule), and speakers (#speakers); the header
// tabs scroll to the sections. Only the CFP is a separate route.
export default function EventHomePage({
  auth,
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
  // Draft-branding preview for the Branding page's iframe: ?brandPreview=<json>
  // overrides the saved branding, but ONLY for an organizer of this org —
  // anonymous visitors can't restyle the public page via a crafted link.
  const rawPreview = typeof searchParams.brandPreview === "string" ? searchParams.brandPreview : "";
  const brandingOverride =
    rawPreview && auth.tenant_id === org.id ? parseBranding(rawPreview) : null;
  const eventInfo = {
    ...publicEventInfo(org, event),
    ...(brandingOverride ? { branding: brandingOverride } : {}),
  };
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
  const rawEmbed = typeof searchParams.embed === "string" ? searchParams.embed : "";
  // "agenda" is what the schedule widget is called everywhere except this
  // parameter, so accept it rather than silently serving the whole page to
  // someone who guessed the obvious name.
  const embed = rawEmbed === "agenda" ? "schedule" : rawEmbed;

  // An embed is meant to be iframed onto the organizer's own site. The runtime
  // sends X-Frame-Options: SAMEORIGIN on every response, which makes exactly
  // that fail — the snippet renders blank on any other origin. frame-ancestors
  // supersedes X-Frame-Options wherever both are present, so widget responses
  // opt back in. Only embed URLs get this; the dashboard keeps the default.
  //
  // Must run in the synchronous shell render: the HTTP head commits before any
  // suspended subtree resolves.
  if (embed) {
    response.setHeader("content-security-policy", "frame-ancestors *");
    response.setHeader("x-frame-options", "ALLOWALL");
  }
  // Embed appearance is configured through the snippet's query string.
  const theme = searchParams.theme === "dark" ? "dark" : searchParams.theme === "auto" ? "auto" : "light";
  const accentParam = typeof searchParams.accent === "string" ? searchParams.accent : "";
  const embedAccent = /^[0-9a-fA-F]{6}$/.test(accentParam)
    ? `#${accentParam}`
    : parseBranding(event.brandingJson).accent;
  const hideBranding = searchParams.branding === "0";
  const embedShell = [
    "p-2",
    theme === "dark" ? "dark bg-zinc-950" : theme === "auto" ? "bg-transparent" : "bg-transparent",
  ].join(" ");
  // Standalone widget surfaces beyond the two site sections.
  if (embed === "sessions" || embed === "itinerary" || embed === "gallery") {
    return (
      <div
        className={embedShell}
        style={embedAccent ? ({ "--event-accent": embedAccent } as React.CSSProperties) : undefined}
      >
        <PublicWidget
          kind={embed}
          schedule={schedule}
          speakers={speakers}
          eventSlug={params.eventSlug}
          icsHref={`/${params.orgSlug}/${params.eventSlug}/calendar.ics`}
          accent={embedAccent}
        />
        {hideBranding ? null : (
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
        )}
      </div>
    );
  }
  if (embed === "schedule" || embed === "speakers") {
    return (
      <div className="bg-transparent p-2">
        <EventSite
          event={eventInfo}
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
    <PublicEventShell event={eventInfo} active="home">
      <EventSite
        event={eventInfo}
        description={event.description ?? null}
        cfpOpen={cfpOpen}
        initialSchedule={schedule}
        initialSpeakers={speakers}
      />
    </PublicEventShell>
  );
}
