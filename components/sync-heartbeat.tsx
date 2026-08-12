"use client";

import { useEffect } from "react";
import { db } from "@pylonsync/react";

// Cross-client freshness backstop.
//
// This header used to claim the client engine ignored the change frames the
// server sent it — "frame at +178ms, no follow-up pull, no re-render through
// 30s". That is NOT true, and the claim caused a bad bug report to the
// framework team before anyone re-measured it.
//
// Re-measured on prod against @pylonsync/sync 0.4.2 + runtime 0.4.4, on a page
// verified to still be the page under test: a second client created a Track
// over plain HTTP, and the observing tab's replica AND its DOM both had the row
// 190ms later. The poll below runs every 10s, so 190ms can only have come from
// the engine applying the frame. Cross-client sync works.
//
// So why is this still here? It is a cheap backstop for the cases the single
// measurement above does not cover: a tab that is not the multi-tab leader, and
// entities whose read policy might gate the frame. One pull per 10s per VISIBLE
// tab, short-circuited server-side when nothing changed, paused on hidden tabs.
// Same-client writes never needed it — lib/fn.ts pulls on X-Pylon-Change-Seq.
//
// Delete it once those two cases are measured too. Do not re-add a "the engine
// is broken" justification without a fresh measurement attached.
const INTERVAL_MS = 10_000;

export function SyncHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        void db.sync.pull().catch(() => {
          // A failed poll is not worth surfacing; the next tick retries.
        });
      }, INTERVAL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Catch up immediately on refocus, then resume the cadence.
        void db.sync.pull().catch(() => {});
        start();
      } else {
        stop();
      }
    };

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, []);

  return null;
}
