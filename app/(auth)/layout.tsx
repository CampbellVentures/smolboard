import React from "react";
import { BrandMark } from "@/components/brand";
import { Link, type PageAuth, type SsrResponse } from "@pylonsync/react";

// `(auth)` route group → the shared frame for /login and /signup: one centered
// form card, nothing else. Each page supplies what differs — heading, switch
// link, and the form — as `children`. The group segment adds no URL prefix,
// and because these routes sit outside `(marketing)`, none of the site
// nav/footer renders here.
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
        <Link href="/" className="inline-flex">
          <BrandMark size={36} />
        </Link>
        {children}
      </div>
    </div>
  );
}
