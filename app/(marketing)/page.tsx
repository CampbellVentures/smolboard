import React from "react";
import { Link, type Metadata, type PageProps } from "@pylonsync/react";
import {
  CalendarClock,
  Code2,
  FileText,
  Mail,
  Mic2,
  Star,
  type LucideIcon,
} from "lucide-react";
import { BRAND_GRADIENT, DashboardIconChip, type DashboardChipTone } from "@/components/dashboard";
import { siteConfig } from "@/lib/site.config";
import { HeroShowcase } from "./hero-showcase";
import {
  AgendaIllustration,
  EmailsIllustration,
  EmbedsIllustration,
  FormsIllustration,
  PortalIllustration,
  ReviewsIllustration,
} from "./feature-illustrations";

// `/` — the smolboard landing. The copy lives here rather than in siteConfig,
// which now only carries brand, colors, SEO, and the legal pages. SEO strings
// still come from siteConfig so <head> and the page can't drift.
export const metadata: Metadata = {
  title: siteConfig.seo.title,
  description: siteConfig.seo.description,
  openGraph: {
    title: siteConfig.seo.title,
    description: siteConfig.seo.description,
    siteName: "smolboard",
    type: "website",
    url: "https://www.smolboard.app/",
    image: "https://www.smolboard.app/assets/img/og.png",
    imageType: "image/png",
    imageWidth: 2400,
    imageHeight: 1260,
    imageAlt: "smolboard: open-source speaker and CFP management, with the event dashboard.",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.seo.title,
    description: siteConfig.seo.description,
    image: "https://www.smolboard.app/assets/img/og.png",
    imageAlt: "smolboard: open-source speaker and CFP management, with the event dashboard.",
  },
};

const FEATURES: {
  title: string;
  body: string;
  icon: LucideIcon;
  tone: DashboardChipTone;
  illustration: () => React.ReactElement;
  // Column span in the 6-wide bento at lg. 2 + 4 rows read better than a flat
  // 3-up grid and give the wider illustrations room to be legible.
  span: string;
}[] = [
  {
    icon: FileText,
    tone: "violet",
    illustration: FormsIllustration,
    span: "lg:col-span-2",
    title: "CFP forms with conditional logic",
    body: "Show-when rules and category routing, re-validated on the server.",
  },
  {
    icon: CalendarClock,
    tone: "emerald",
    illustration: AgendaIllustration,
    span: "lg:col-span-4",
    title: "Drag-and-drop agenda",
    body: "Day-by-room grid with 15-minute slots. Room overlaps and double-booked speakers surface the moment you create them, before you publish.",
  },
  {
    icon: Star,
    tone: "amber",
    illustration: ReviewsIllustration,
    span: "lg:col-span-3",
    title: "Reviews and scoring",
    body: "Multi-round evaluation, weighted scorecards, blind review, and a results table you can sort and export.",
  },
  {
    icon: Mic2,
    tone: "sky",
    illustration: PortalIllustration,
    span: "lg:col-span-3",
    title: "Self-service speaker portal",
    body: "Profile, uploads, and onboarding tasks. Speakers only ever see their own sessions.",
  },
  {
    icon: Mail,
    tone: "pink",
    illustration: EmailsIllustration,
    span: "lg:col-span-2",
    title: "Emails and real calendar invites",
    body: "Templated decisions, scheduled reminders, and .ics invites that RSVP into Gmail and Outlook.",
  },
  {
    icon: Code2,
    tone: "zinc",
    illustration: EmbedsIllustration,
    span: "lg:col-span-4",
    title: "Five embeddable widgets",
    body: "Sessions list, speakers, agenda, itinerary, and photo gallery. Paste a snippet into any site and it stays in sync with your data.",
  },
];

export default function LandingPage({ auth }: PageProps) {
  const signedIn = Boolean(auth.user_id);
  const primaryHref = signedIn ? "/dashboard" : "/signup";

  return (
    <div className="bg-white">
      {/* ---------------- Hero: one line, one CTA, the product ---------------- */}
      <section className="relative overflow-hidden px-6 pt-16">
        {/* A faint halo behind the headline. Kept narrow and low-opacity on
            purpose: the dark gradient frame below is the page's color, and two
            loud gradients would fight. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-[340px] w-[820px] max-w-[110vw] -translate-x-1/2"
        >
          <div className="absolute left-1/2 top-[-150px] size-[380px] -translate-x-[85%] rounded-full bg-violet-300/20 blur-3xl" />
          <div className="absolute left-1/2 top-[-130px] size-[340px] -translate-x-[15%] rounded-full bg-sky-300/[0.18] blur-3xl" />
          <div className="absolute left-1/2 top-[-160px] size-[300px] translate-x-[45%] rounded-full bg-amber-200/20 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-b from-transparent to-white" />
        </div>

        <div className="relative mx-auto max-w-5xl">
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
                href="/ai-engineer/ai-engineer-sandbox"
                className="inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium text-zinc-600 transition-colors hover:text-zinc-900"
              >
                See a live schedule →
              </a>
            </div>
          </div>

          <HeroShowcase />
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section className="border-t border-zinc-200/70 bg-zinc-50/60">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-zinc-900">
            Everything a call for speakers needs
          </h2>
          <p className="mt-2 max-w-2xl text-pretty text-[15px] leading-relaxed text-zinc-500">
            From the first submission to the published schedule, without paying
            per speaker or per event.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {FEATURES.map((f) => {
              const Illustration = f.illustration;
              return (
                <div
                  key={f.title}
                  className={`flex h-full flex-col rounded-2xl bg-white p-3 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] ${f.span}`}
                >
                  <Illustration />
                  <div className="p-2 pt-3">
                    <div className="flex items-center gap-2.5">
                      <DashboardIconChip icon={f.icon} tone={f.tone} size="sm" />
                      <h3 className="text-balance text-[15px] font-semibold text-zinc-900">
                        {f.title}
                      </h3>
                    </div>
                    <p className="mt-2 text-pretty text-[13.5px] leading-relaxed text-zinc-500">
                      {f.body}
                    </p>
                  </div>
                </div>
              );
            })}
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
              schedule a talk. It calls the same conflict-checked functions the
              UI does, so its changes land in the tables next to the
              conversation. Point any MCP client at smolboard to run the same
              tools from your own agent.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl bg-zinc-900 p-5 font-mono text-[12.5px] leading-relaxed text-zinc-300 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.4)]">
            <p className="text-zinc-500"># any MCP client, e.g. Claude Code</p>
            <p className="mt-1 whitespace-pre">{`claude mcp add smolboard \\
  --transport http \\
  https://www.smolboard.app/api/fn/mcp \\
  --header "Authorization: Bearer pk...."`}</p>
            <p className="mt-3 text-zinc-500"># then</p>
            <p className="mt-1 text-lime-300">
              &gt; accept the top 5 submissions by score and email the speakers
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="px-6 pb-20">
        <div
          className={`mx-auto max-w-5xl overflow-hidden rounded-3xl px-6 py-16 text-center ${BRAND_GRADIENT}`}
        >
          <h2 className="mx-auto max-w-2xl text-balance text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
            Run your next call for speakers on software you own
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-[15px] leading-relaxed text-zinc-300">
            Free and open source. One process, one port, one command to deploy.
            Speakers never pay, and neither do you.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={primaryHref}
              className="inline-flex h-11 items-center rounded-full bg-white px-6 text-[14px] font-medium text-zinc-900 transition-[background-color,scale] duration-150 ease-out hover:bg-zinc-200 active:scale-[0.96] motion-reduce:transform-none"
            >
              {signedIn ? "Open dashboard" : "Create your event"}
            </Link>
            <a
              href="https://github.com/CampbellVentures/smolboard"
              className="inline-flex h-11 items-center rounded-full px-5 text-[14px] font-medium text-zinc-300 transition-colors hover:text-white"
            >
              Read the source →
            </a>
          </div>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-zinc-200/70">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/assets/img/icon.svg" alt="" width={24} height={24} className="rounded-md" />
            <span className="text-[14px] font-semibold tracking-tight text-zinc-900">smolboard</span>
            <span className="text-[13px] text-zinc-400">Open-source speaker &amp; CFP management</span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a
              href="/ai-engineer/ai-engineer-sandbox"
              className="text-[13px] text-zinc-500 transition-colors hover:text-zinc-900"
            >
              Live demo
            </a>
            <Link
              href="/portal"
              className="text-[13px] text-zinc-500 transition-colors hover:text-zinc-900"
            >
              Speaker portal
            </Link>
            <a
              href="https://github.com/CampbellVentures/smolboard"
              className="text-[13px] text-zinc-500 transition-colors hover:text-zinc-900"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
