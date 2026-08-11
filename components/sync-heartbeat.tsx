"use client";

import { useEffect } from "react";
import { db } from "@pylonsync/react";

// Cross-client freshness fallback.
//
// The server broadcasts change events over the sync socket (runtime 0.4.4+),
// but the client engine in @pylonsync/sync 0.4.2 doesn't act on the frames it
// receives: a second organizer's write lands on the socket and the local
// replica never applies it. Measured on prod — frame at +178ms, no follow-up
// pull, no re-render through 30s.
//
// Until the engine consumes those frames, poll while the tab is actually being
// looked at. An empty pull short-circuits server-side, and pausing on hidden
// tabs keeps idle background tabs off the wire. Same-client writes don't need
// this (lib/fn.ts pulls on X-Pylon-Change-Seq); this is only for changes made
// somewhere else. Delete once the engine applies change frames.
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
