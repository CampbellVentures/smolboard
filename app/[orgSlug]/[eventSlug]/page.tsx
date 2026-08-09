import React, { use } from "react";
import { Link, type Metadata, type PageProps } from "@pylonsync/react";
import { ArrowRight, CalendarClock, Send } from "lucide-react";
import { PublicEventShell } from "@/components/public-shell";
import { publicEventInfo, resolvePublicEvent } from "@/lib/public-site";
import type { EventRow, OrgRow, SubmissionFormRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Event",
};

// Event home: /<org-slug>/<event-slug>. The About page of the event's mini
// site — description plus the two things a visitor came to do.
export default function EventHomePage({
  params,
  response,
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

  return (
    <PublicEventShell event={publicEventInfo(org, event)} active="overview">
      {event.description && (
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-zinc-600">
          {event.description}
        </p>
      )}
      <div className={"grid gap-3 sm:grid-cols-2 " + (event.description ? "mt-8" : "")}>
        {event.schedulePublished && (
          <Link
            href={`/${org.slug}/${event.slug}/schedule`}
            className="flex items-center gap-4 rounded-xl bg-white px-6 py-5 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_2px_6px_rgba(0,0,0,0.06)]"
          >
            <CalendarClock className="size-5 shrink-0 text-zinc-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-zinc-900">Schedule</div>
              <p className="text-[13px] text-zinc-500">Talks, times, and rooms.</p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
          </Link>
        )}
        {cfpOpen && (
          <Link
            href={`/${org.slug}/${event.slug}/cfp`}
            className="flex items-center gap-4 rounded-xl bg-white px-6 py-5 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_2px_6px_rgba(0,0,0,0.06)]"
          >
            <Send className="size-5 shrink-0 text-zinc-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-zinc-900">Call for speakers</div>
              <p className="text-[13px] text-zinc-500">Submit a talk — the CFP is open.</p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
          </Link>
        )}
      </div>
      {!event.description && !event.schedulePublished && !cfpOpen && (
        <p className="py-12 text-center text-sm text-zinc-400">
          Nothing public here yet — check back soon.
        </p>
      )}
    </PublicEventShell>
  );
}
