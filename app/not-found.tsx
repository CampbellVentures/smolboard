import React from "react";
import { Link, useRouter, type Metadata, type NotFoundProps } from "@pylonsync/react";
import { Button } from "@/components/ui/button";

// `app/not-found.tsx` → rendered at HTTP 404 for any unmatched URL, and when a
// page calls `response.notFound()`.
//
// This used to sit in the `(marketing)` group, reasoning that a group adds no
// URL prefix so it was still the root boundary and would pick up the marketing
// layout's nav and footer. It was not: nothing rendered it. Every 404 (unknown
// URL, missing event, missing org) served Pylon's built-in "This page could not
// be found" with no branding and no way back, while this file sat unused. It
// has to be at the app root to be the root boundary, which costs the marketing
// chrome and is worth it.
//
// HYDRATED, so it's interactive: the buttons below use the client router.
// Not-found boundaries receive the standard page props (and, matching Next,
// no `reset`).

// Without this the tab reads empty. Pylon's built-in 404 supplied its own
// title, so taking over the boundary means taking over the title too.
export const metadata: Metadata = {
  title: "Page not found · smolboard",
  robots: "noindex",
};

export default function NotFound(_props: NotFoundProps) {
  const router = useRouter();
  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-6 py-24">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">404</h1>
        <p className="mt-2 text-muted-foreground">
          We couldn&apos;t find that page.
        </p>
      </section>
      <div className="flex items-center gap-3">
        <Button onClick={() => router.back()} variant="outline">
          ← Go back
        </Button>
        <Button asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
