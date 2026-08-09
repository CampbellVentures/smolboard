import React from "react";
import { BrandMark } from "@/components/brand";
import { Link, type PageAuth, type SsrResponse } from "@pylonsync/react";

// `(auth)` route group → the shared split-screen frame for /login and /signup:
// the form card on the left, a brand/testimonial panel on the right (hidden on
// small screens). Each page supplies what differs — heading, switch link, and
// the form — as `children`. The group segment adds no URL prefix, and because
// these routes sit outside `(marketing)`, none of the site nav/footer renders
// here.
interface LayoutProps {
  children: React.ReactNode;
  auth: PageAuth;
  response: SsrResponse;
}

export default function AuthLayout({ children, auth, response }: LayoutProps) {
  // Already signed in? Skip the auth screens entirely. Gating here covers
  // every page in the group; `response.redirect` runs in the synchronous
  // shell render, so it's a real 307 before any HTML is sent.
  if (auth.user_id) {
    response.redirect("/dashboard");
    return null;
  }
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      {/* Form side */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px] rounded-2xl border border-zinc-200/70 p-8">
          <Link href="/" className="inline-flex">
            <BrandMark size={36} />
          </Link>
          {children}
        </div>
      </div>

      {/* Product context */}
      <div className="relative hidden flex-col justify-center bg-zinc-50 px-14 lg:flex">
        <div className="max-w-md">
          <div className="font-serif text-5xl leading-none text-zinc-300">
            &ldquo;
          </div>
          <blockquote className="mt-2 text-[1.6rem] font-medium leading-snug tracking-tight text-zinc-900">
            Run your call for speakers, reviews, onboarding, and schedule from
            one focused workspace.
          </blockquote>
          <div className="mt-8 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-zinc-200 text-[13px] font-semibold text-zinc-500">
              S
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-zinc-900">
                Built for event teams
              </div>
              <div className="text-[13px] text-zinc-500">
                Open source and powered by Pylon
              </div>
            </div>
          </div>
        </div>
        <p className="absolute bottom-8 left-14 text-[13px] text-zinc-400">
          Speaker operations without the enterprise clutter.
        </p>
      </div>
    </div>
  );
}
