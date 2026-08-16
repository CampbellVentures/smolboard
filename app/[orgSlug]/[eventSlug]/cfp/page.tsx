import React, { use } from "react";
import { Link, type GenerateMetadata, type PageProps } from "@pylonsync/react";
import { ArrowRight } from "lucide-react";
import { PublicEventShell } from "@/components/public-shell";
import { publicEventInfo, resolvePublicEvent } from "@/lib/public-site";
import type { EventRow, OrgRow, SubmissionFormRow } from "@/lib/types";
import { cfpWindowState, formatCfpInstant } from "@/lib/cfp-window";

export const generateMetadata: GenerateMetadata<{
  orgSlug: string;
  eventSlug: string;
}> = async ({ params, serverData }) => {
  const [orgs, events] = await Promise.all([
    serverData.list<OrgRow>("Org"),
    serverData.list<EventRow>("Event"),
  ]);
  const resolved = resolvePublicEvent(orgs, events, params.orgSlug, params.eventSlug);
  if (!resolved) return { title: "Call for speakers" };
  const { event } = resolved;
  const description = `Open calls for speakers for ${event.name}. Submit a talk, lightning talk, or workshop.`;
  return {
    title: `Call for speakers · ${event.name}`,
    description,
    openGraph: { title: `Call for speakers · ${event.name}`, description },
  };
};

// CFP index: /<org-slug>/<event-slug>/cfp. Anonymous reads work because the
// Event policy exposes non-draft events and the form policy exposes open
// forms.
export default function CfpIndexPage({
  params,
  response,
  serverData,
}: PageProps<{ orgSlug: string; eventSlug: string }>) {
  const orgsPromise = serverData.list<OrgRow>("Org");
  const eventsPromise = serverData.list<EventRow>("Event");
  const formsPromise = serverData.list<SubmissionFormRow>("SubmissionForm");
  const speakersPromise = serverData.fn<{ published: boolean; speakers: unknown[] }>("getPublicSpeakers", {
    orgSlug: params.orgSlug,
    eventSlug: params.eventSlug,
  });
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
  const speakersFeed = use(speakersPromise);
  const hasSpeakers = Boolean(speakersFeed?.published) && (speakersFeed?.speakers.length ?? 0) > 0;
  const forms = use(formsPromise).filter((f) => f.eventId === event.id && f.status !== "draft");
  const cfpOpen = forms.some((form) => cfpWindowState({
    eventStatus: event.cfpStatus,
    formStatus: form.status,
    opensAt: form.opensAt,
    closesAt: form.closesAt,
  }) === "open");

  return (
    <PublicEventShell event={publicEventInfo(org, event)} active="cfp" hasSpeakers={hasSpeakers}>
      {forms.length === 0 ? (
        <div className="rounded-xl bg-white px-6 py-10 text-center shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)]">
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
              href={`/${org.slug}/${event.slug}/cfp/${f.slug}`}
              className="flex items-center gap-4 rounded-xl bg-white px-6 py-5 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_2px_6px_rgba(0,0,0,0.06)]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-zinc-900">{f.name}</div>
                {f.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500">{f.description}</p>
                )}
                <p className="mt-1 text-xs text-zinc-400">
                  {(() => {
                    const state = cfpWindowState({ eventStatus: event.cfpStatus, formStatus: f.status, opensAt: f.opensAt, closesAt: f.closesAt });
                    if (state === "upcoming") return `Opens ${formatCfpInstant(f.opensAt, event.timezone) ?? "soon"}`;
                    if (state === "closed") return "Closed";
                    return f.closesAt ? `Deadline ${formatCfpInstant(f.closesAt, event.timezone)}` : "Open";
                  })()}
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
            </Link>
          ))}
          {!cfpOpen ? <p className="pt-2 text-center text-xs text-zinc-500">No CFP form is currently accepting submissions.</p> : null}
          <p className="pt-2 text-center text-xs text-zinc-400">
            Already submitted?{" "}
            <Link href="/portal" className="underline">
              Track your submission in the speaker portal
            </Link>
            .
          </p>
        </div>
      )}
    </PublicEventShell>
  );
}
