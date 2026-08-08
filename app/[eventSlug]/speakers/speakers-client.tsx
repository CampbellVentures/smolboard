"use client";

import React, { useEffect, useState } from "react";
import { callFn, Link } from "@pylonsync/react";
import { Loader2, Mic2 } from "lucide-react";

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

const TONES = [
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function PublicSpeakers({ eventSlug, eventName }: { eventSlug: string; eventName: string }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    callFn<Feed>("getPublicSpeakers", { eventSlug })
      .then(setFeed)
      .catch(() => setError(true));
  }, [eventSlug]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200/70 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <p className="text-[13px] font-medium uppercase tracking-wide text-zinc-400">Speakers</p>
          <h1 className="mt-1 text-balance text-3xl font-semibold tracking-tight text-zinc-900">
            {feed?.event?.name ?? eventName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <Link href={`/${eventSlug}/schedule`} className="font-medium text-zinc-600 underline underline-offset-2">
              Schedule
            </Link>
            <Link href={`/cfp/${eventSlug}`} className="font-medium text-zinc-600 underline underline-offset-2">
              Call for speakers
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {feed.speakers.map((sp, i) => (
              <article
                key={sp.name}
                className="rounded-xl bg-white p-5 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={
                      "flex size-11 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold " +
                      TONES[i % TONES.length]
                    }
                  >
                    {initials(sp.name)}
                  </span>
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
      </main>

      <footer className="mx-auto max-w-4xl px-6 pb-10 text-center text-xs text-zinc-300">
        Powered by smolboard
      </footer>
    </div>
  );
}
