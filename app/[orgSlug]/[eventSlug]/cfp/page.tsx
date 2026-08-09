import React, { use } from "react";
import { Link, type Metadata, type PageProps } from "@pylonsync/react";
import { ArrowRight } from "lucide-react";
import { PublicEventShell } from "@/components/public-shell";
import { publicEventInfo, resolvePublicEvent } from "@/lib/public-site";
import type { EventRow, OrgRow, SubmissionFormRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Call for speakers",
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
  const forms = use(formsPromise).filter(
    (f) => f.eventId === event.id && f.status === "open",
  );
  const cfpOpen = event.cfpStatus === "open" && forms.length > 0;

  return (
    <PublicEventShell event={publicEventInfo(org, event)} active="cfp">
      {!cfpOpen ? (
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
              </div>
              <ArrowRight className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
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
    </PublicEventShell>
  );
}
