import React from "react";
import { Link, useRouter, type NotFoundProps } from "@pylonsync/react";
import { Button } from "@/components/ui/button";

// The TRUE root 404 boundary.
//
// `(marketing)/not-found.tsx` was intended to cover this — a group segment adds
// no URL prefix, so in principle it is the root boundary. In practice only URLs
// that resolve inside the marketing group reached it, and everything else
// (/dashboard/…, /portal, an unknown /<org>/<event>) fell through to the
// runtime's unstyled "404 This page could not be found." This file catches
// those. The marketing copy still wins for marketing URLs, where the nav and
// footer are the more useful frame.
//
// It renders under the root layout only, so it brings its own centering and
// brand mark rather than assuming a section's chrome. Not-found boundaries are
// HYDRATED, so router.back() works.
export default function NotFound(_props: NotFoundProps) {
  const router = useRouter();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-24 text-center">
      <img
        src="/assets/img/icon.svg"
        alt=""
        width={40}
        height={40}
        className="mb-6 size-10 rounded-lg"
      />
      <p className="text-sm font-medium tabular-nums text-muted-foreground">404</p>
      <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-2 max-w-sm text-pretty text-sm text-muted-foreground">
        The link may be out of date, or the event may not be published yet.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => router.back()} variant="outline">
          Go back
        </Button>
        <Button asChild>
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}
