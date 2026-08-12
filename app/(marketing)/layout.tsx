import React from "react";
import { Link, type PageAuth } from "@pylonsync/react";
import { siteConfig } from "@/lib/site.config";
import { Analytics } from "@/components/analytics";
import { BrandMark } from "@/components/brand";

// `(marketing)` is a ROUTE GROUP: the parens segment is stripped from every
// URL (so `(marketing)/page.tsx` still serves `/`), and this layout wraps
// only the pages inside the group — the marketing nav up top, a fat footer
// below. The other sections bring their own layouts: `(auth)` the split-screen
// frame, `dashboard/` the sidebar shell.
//
// A layout receives the page props plus `children`. `auth.user_id` is null for
// anonymous visitors and the signed-in user's id otherwise — resolved
// server-side from the session cookie before any HTML is sent, so the nav
// renders the right links on the first byte (no flash, no client fetch).
interface LayoutProps {
  children: React.ReactNode;
  auth: PageAuth;
}

// Mobile menu — the desktop nav is `hidden md:flex`, so on phones this is the
// only way to reach Product / Resources / Pricing. Pure-CSS via native
// `<details>` (no client JS, same pattern as the FAQ + user menu); plain `<a>`
// links do a full navigation, which closes the open panel. md:hidden so it
// never shows alongside the desktop nav.
function MobileNav({ signedIn }: { signedIn: boolean }) {
  return (
    <details className="md:hidden">
      <summary
        aria-label="Open menu"
        className="flex size-9 cursor-pointer select-none list-none items-center justify-center rounded-md text-zinc-700 transition-colors marker:hidden hover:bg-zinc-100 [&::-webkit-details-marker]:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </summary>
      <div className="fixed inset-x-0 top-14 z-40 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-zinc-200 bg-white shadow-[0_24px_48px_-24px_rgba(0,0,0,0.25)]">
        <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
          <div className="flex flex-col">
            <a href="/ai-engineer/ai-engineer-sandbox" className="rounded-lg px-2 py-2 text-[14px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50">
              Live demo
            </a>
            <a href="/portal" className="rounded-lg px-2 py-2 text-[14px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50">
              Speaker portal
            </a>
            <a href="https://github.com/CampbellVentures/smolboard" className="rounded-lg px-2 py-2 text-[14px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50">
              GitHub
            </a>
          </div>
          <div className="flex flex-col gap-2 border-t border-zinc-100 pt-5">
            {signedIn ? (
              <a href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 text-[14px] font-medium text-white transition-colors hover:bg-zinc-700">
                Open dashboard
              </a>
            ) : (
              <>
                <a href="/login" className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 text-[14px] font-medium text-zinc-900 transition-colors hover:bg-zinc-50">
                  Log in
                </a>
                <a href="/signup" className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 text-[14px] font-medium text-white transition-colors hover:bg-zinc-700">
                  Get started
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}

export default function MarketingLayout({ children, auth }: LayoutProps) {
  const signedIn = Boolean(auth?.user_id);
  return (
    <>
      <Analytics />
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <BrandMark size={24} />
              <span className="text-[15px] font-semibold tracking-tight text-zinc-900">
                {siteConfig.brand.name}
              </span>
            </Link>
            <nav className="hidden items-center gap-6 md:flex">
              <a
                href="/ai-engineer/ai-engineer-sandbox"
                className="text-[13.5px] text-zinc-600 transition-colors hover:text-zinc-900"
              >
                Live demo
              </a>
              <Link
                href="/portal"
                className="text-[13.5px] text-zinc-600 transition-colors hover:text-zinc-900"
              >
                Speaker portal
              </Link>
              <a
                href="https://github.com/CampbellVentures/smolboard"
                className="text-[13.5px] text-zinc-600 transition-colors hover:text-zinc-900"
              >
                GitHub
              </a>
            </nav>
          </div>
          <nav className="flex items-center gap-2">
            <MobileNav signedIn={signedIn} />
            {signedIn ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-full bg-zinc-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-zinc-700"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden rounded-full px-3 py-1.5 text-[13px] font-medium text-zinc-600 transition-colors hover:text-zinc-900 sm:inline-flex"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center rounded-full bg-zinc-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-zinc-700"
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

    </>
  );
}
