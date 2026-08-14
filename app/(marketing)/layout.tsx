import React from "react";
import { Link, type PageAuth } from "@pylonsync/react";
import { siteConfig } from "@/lib/site.config";
import { Analytics } from "@/components/analytics";
import { BrandMark } from "@/components/brand";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";

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
            <MarketingMobileNav signedIn={signedIn} />
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
