import React from "react";
import { Link, type Metadata, type PageProps } from "@pylonsync/react";
import { siteConfig } from "@/lib/site.config";

// `/` — the smolboard landing. Self-contained copy (the Acme template's
// product-catalog sections don't apply to a single-product tool); SEO strings
// come from siteConfig so <head> and the page can't drift.
export const metadata: Metadata = {
  title: siteConfig.seo.title,
  description: siteConfig.seo.description,
};

const FEATURES: { title: string; body: string }[] = [
  {
    title: "CFP forms with conditional logic",
    body: "A visual builder with show-when rules and category routing. The server re-validates everything — including conditionally required fields.",
  },
  {
    title: "Self-service speaker portal",
    body: "Speakers are created on submission and sign in with a 6-digit email code. Status, profile, uploads, and onboarding tasks — all live, no refresh.",
  },
  {
    title: "Emails and real calendar invites",
    body: "Templated accept/reject sends, cron reminders, and .ics invites that RSVP into Gmail and Outlook. Reschedules update the event, not duplicate it.",
  },
  {
    title: "Reviews and scoring",
    body: "Score-sorted queue, per-criterion stars, committee comments, multi-round advancement, bulk accept with one confirmation.",
  },
  {
    title: "Drag-and-drop agenda",
    body: "Day-by-room grid with 15-minute slots. Conflicts — room overlaps, double-booked speakers — surface the moment you create them.",
  },
  {
    title: "Live dashboard",
    body: "Submissions, review progress, and speaker onboarding as live queries. Two reviewers see each other's scores land in real time.",
  },
];

export default function LandingPage({ auth }: PageProps) {
  const signedIn = Boolean(auth.user_id);
  const primaryHref = signedIn ? "/dashboard" : "/signup";

  return (
    <div className="bg-white">
      {/* ---------------- Hero: one line, one CTA, the product ---------------- */}
      <section className="mx-auto max-w-5xl px-6 pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-zinc-900 sm:text-[44px] sm:leading-[1.1]">
            Open-source speaker &amp; CFP management
          </h1>
          <div className="mt-7 flex items-center justify-center gap-3">
            <Link
              href={primaryHref}
              className="inline-flex h-10 items-center rounded-full bg-zinc-900 px-5 text-[14px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-zinc-700"
            >
              {signedIn ? "Open dashboard" : "Get started free"}
            </Link>
            <a
              href="/ai-engineer-sandbox/schedule"
              className="inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium text-zinc-600 transition-colors hover:text-zinc-900"
            >
              See a live schedule →
            </a>
          </div>
        </div>

        {/* The event dashboard, full-bleed. Bottom edge fades so the hero
            hands off to the features band without a hard cut. */}
        <div className="relative mt-12">
          <div className="overflow-hidden rounded-xl shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_24px_60px_-24px_rgba(0,0,0,0.25)]">
            <img
              src="/hero-dashboard.png"
              alt="The smolboard event dashboard: a submissions table with speakers, categories, review scores, and statuses, next to the event navigation."
              width={2720}
              height={1720}
              className="block w-full"
            />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent"
          />
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section className="border-t border-zinc-200/70 bg-zinc-50/60">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl bg-white p-5 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <h2 className="text-[15px] font-semibold text-zinc-900">{f.title}</h2>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-500">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Agent layer ---------------- */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-400">
              Agent-native
            </p>
            <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-zinc-900">
              A copilot in the dashboard. The same tools over MCP.
            </h2>
            <p className="mt-3 text-pretty text-[15px] leading-relaxed text-zinc-500">
              Ask the copilot to review submissions, accept the top ten, or
              schedule a talk — it uses the same conflict-checked functions as
              the UI, so you watch its changes land in the tables next to the
              conversation. Prefer your own agent? Point any MCP client at
              smolboard and run your CFP from chat.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl bg-zinc-900 p-5 font-mono text-[12.5px] leading-relaxed text-zinc-300 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.4)]">
            <p className="text-zinc-500"># any MCP client, e.g. Claude Code</p>
            <p className="mt-1 whitespace-pre">{`claude mcp add smolboard \\
  --transport http \\
  https://smolboard.smallware.run/api/fn/mcp \\
  --header "Authorization: Bearer pk...."`}</p>
            <p className="mt-3 text-zinc-500"># then</p>
            <p className="mt-1 text-lime-300">
              &gt; accept the top 5 submissions by score and email the speakers
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="border-t border-zinc-200/70">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-zinc-900">
            Your next event, off the enterprise treadmill
          </h2>
          <p className="mt-2 text-[15px] text-zinc-500">
            Free and open source. One process to deploy. Speakers never pay, and
            neither should you.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href={primaryHref}
              className="inline-flex h-10 items-center rounded-full bg-zinc-900 px-5 text-[14px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-zinc-700"
            >
              {signedIn ? "Open dashboard" : "Create your event"}
            </Link>
            <a
              href="https://github.com/CampbellVentures/smolboard"
              className="inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium text-zinc-600 transition-colors hover:text-zinc-900"
            >
              Read the source →
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
