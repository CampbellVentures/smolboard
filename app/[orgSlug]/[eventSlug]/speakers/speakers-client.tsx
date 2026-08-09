"use client";

import React, { useEffect, useState } from "react";
import { callFn } from "@pylonsync/react";
import { Loader2, Mic2 } from "lucide-react";
import {
  InitialsAvatar,
  PublicEventShell,
  type PublicEventInfo,
} from "@/components/public-shell";

interface Feed {
  event: { name: string; slug: string } | null;
  published: boolean;
  speakers: {
    name: string;
    tagline: string | null;
    bio: string | null;
    company: string | null;
    jobTitle: string | null;
    talks: string[];
  }[];
}

export function PublicSpeakers({ event }: { event: PublicEventInfo }) {
  const { orgSlug, slug: eventSlug } = event;
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    callFn<Feed>("getPublicSpeakers", { orgSlug, eventSlug })
      .then(setFeed)
      .catch(() => setError(true));
  }, [orgSlug, eventSlug]);

  return (
    <PublicEventShell event={event} active="speakers">
      <>
        {!feed && !error && (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-400">
            <Loader2 className="size-4 animate-spin" /> Loading speakers…
          </div>
        )}
        {(error || (feed && (!feed.published || feed.speakers.length === 0))) && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <Mic2 className="mx-auto size-8 text-zinc-300" />
            <p className="mt-3 text-sm font-medium text-zinc-700">Speakers haven&apos;t been announced yet</p>
            <p className="mt-1 text-sm text-zinc-400">Check back soon.</p>
          </div>
        )}

        {feed?.published && feed.speakers.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {feed.speakers.map((sp) => (
              <article
                key={sp.name}
                className="rounded-xl bg-white p-5 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center gap-3">
                  <InitialsAvatar name={sp.name} className="size-11 text-[13px]" />
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold text-zinc-900">{sp.name}</h2>
                    <p className="truncate text-xs text-zinc-500">
                      {[sp.jobTitle, sp.company].filter(Boolean).join(", ") || sp.tagline || ""}
                    </p>
                  </div>
                </div>
                {sp.bio && (
                  <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-zinc-500">{sp.bio}</p>
                )}
                {sp.talks.length > 0 && (
                  <div className="mt-3 border-t border-zinc-100 pt-2.5">
                    {sp.talks.map((t) => (
                      <p key={t} className="text-[12.5px] font-medium leading-5 text-zinc-700">
                        {t}
                      </p>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </>
    </PublicEventShell>
  );
}
