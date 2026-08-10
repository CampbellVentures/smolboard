import React, { use } from "react";
import { Link, type Metadata, type PageProps } from "@pylonsync/react";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { formatRange } from "@/components/public-shell";
import { parseBranding } from "@/lib/branding";
import type { EventRow, OrgRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Events",
};

// The org's public site index: /<org-slug>. Lists every non-draft event —
// the anonymous Event policy already filters drafts out of serverData.
export default function OrgSitePage({
  params,
  response,
  serverData,
}: PageProps<{ orgSlug: string }>) {
  const orgsPromise = serverData.list<OrgRow>("Org");
  const eventsPromise = serverData.list<EventRow>("Event");
  const orgs = use(orgsPromise);
  const events = use(eventsPromise);
  const org = orgs.find((o) => o.slug === params.orgSlug);
  if (!org) {
    response.notFound();
    return null;
  }
  const orgEvents = events
    .filter((e) => e.orgId === org.id)
    .sort((a, b) => ((a.startDate ?? "") < (b.startDate ?? "") ? 1 : -1));

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="border-b border-zinc-200/70 bg-white">
        <div className="mx-auto w-full max-w-3xl px-6 py-10">
          <BrandMark size={22} />
          <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-zinc-900">
            {org.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {orgEvents.length === 0
              ? "No public events yet."
              : `${orgEvents.length} event${orgEvents.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <div className="space-y-3">
          {orgEvents.map((e) => (
            <Link
              key={e.id}
              href={`/${org.slug}/${e.slug}`}
              className="block overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_2px_6px_rgba(0,0,0,0.06)]"
            >
              {(() => {
                const branding = parseBranding(e.brandingJson);
                return (
                  <>
                    {branding.heroUrl ? (
                      <div
                        className="h-24 bg-cover bg-center"
                        style={{ backgroundImage: `url(${branding.heroUrl})` }}
                        aria-hidden="true"
                      />
                    ) : branding.accent ? (
                      <div className="h-1" style={{ background: branding.accent }} aria-hidden="true" />
                    ) : null}
                  </>
                );
              })()}
              <div className="flex items-center gap-4 px-6 py-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-zinc-900">{e.name}</span>
                  {e.cfpStatus === "open" ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      CFP open
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-4 text-[13px] text-zinc-500">
                  {e.startDate && (
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="size-3.5 text-zinc-400" aria-hidden="true" />
                      {formatRange(e.startDate, e.endDate)}
                    </span>
                  )}
                  {e.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-zinc-400" aria-hidden="true" />
                      {e.location}
                    </span>
                  )}
                </div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-3xl items-center justify-center gap-1.5 px-6 pb-10 text-xs text-zinc-400">
        <BrandMark size={14} />
        <a href="/" className="transition-colors hover:text-zinc-900">
          Powered by smolboard
        </a>
      </footer>
    </div>
  );
}
