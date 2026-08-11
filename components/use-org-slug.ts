"use client";

import { useEffect, useState } from "react";
import { db } from "@pylonsync/react";
import { callFn } from "@/lib/fn";
import type { OrgRow } from "@/lib/types";

// The workspace's public URL handle, for building /<org-slug>/<event-slug>
// links in the dashboard. Live: streams in as soon as ensureOrgSlug (fired by
// the shell on load) assigns one. Null while unknown — callers hide or
// disable public links until then.
export function useOrgSlug(orgId: string | undefined | null): string | null {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const { data } = db.useQuery<OrgRow>("Org");
  if (!hydrated || !orgId) return null;
  return data.find((o) => o.id === orgId)?.slug ?? null;
}

// Fire-and-forget: make sure the active workspace has a slug. Idempotent on
// the server; safe to call on every dashboard load.
export function useEnsureOrgSlug(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    callFn("ensureOrgSlug", {}).catch(() => {
      // Best-effort — a signed-out or org-less session just skips it.
    });
  }, [enabled]);
}
