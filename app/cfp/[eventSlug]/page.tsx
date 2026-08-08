import React, { use } from "react";
import { Link, type Metadata, type PageProps } from "@pylonsync/react";
import { CalendarDays, MapPin, ArrowRight } from "lucide-react";
import type { EventRow, SubmissionFormRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Call for speakers",
};

// Public CFP landing for an event: /cfp/[eventSlug]. Anonymous reads work
// because the Event policy exposes non-draft events and the form policy
// exposes open forms. One open form → link straight to it.
export default function CfpIndexPage({ params, response, serverData }: PageProps<{ eventSlug: string }>) {
  const events = use(serverData.list<EventRow>("Event"));
  const event = events.find((e) => e.slug === params.eventSlug);
  if (!event) {
    response.notFound();
    return null;
  }
  const forms = use(serverData.list<SubmissionFormRow>("SubmissionForm")).filter(
    (f) => f.eventId === event.id && f.status === "open",
  );
  const cfpOpen = event.cfpStatus === "open" && forms.length > 0;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-[13px] font-medium uppercase tracking-wide text-zinc-400">
          Call for speakers
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
          {event.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-zinc-500">
          {event.startDate && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4 text-zinc-400" />
              {formatRange(event.startDate, event.endDate)}
            </span>
          )}
          {event.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 text-zinc-400" />
              {event.location}
            </span>
          )}
        </div>
        {event.description && (
          <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-zinc-600">
            {event.description}
          </p>
        )}

        <div className="mt-10">
          {!cfpOpen ? (
            <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center">
              <p className="text-sm font-medium text-zinc-700">
                The call for speakers is currently closed.
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                Already submitted?{" "}
                <Link href="/portal" className="font-medium text-zinc-600 underline">
                  Open your speaker portal
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {forms.map((f) => (
                <Link
                  key={f.id}
                  href={`/cfp/${event.slug}/${f.slug}`}
                  className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white px-6 py-5 transition-colors hover:border-zinc-400"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-zinc-900">{f.name}</div>
                    {f.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500">{f.description}</p>
                    )}
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-zinc-400" />
                </Link>
              ))}
              <p className="pt-2 text-center text-xs text-zinc-400">
                Already submitted?{" "}
                <Link href="/portal" className="underline">
                  Track your submission in the speaker portal
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function fmt(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
function formatRange(start: string, end?: string) {
  if (!end || end === start) return fmt(start);
  const s = new Date(start);
  const e = new Date(end);
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${MONTHS[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}, ${s.getUTCFullYear()}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}
