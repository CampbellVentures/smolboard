"use client";

import { useEffect } from "react";
import { db } from "@pylonsync/react";

// Cross-client freshness backstop — and, on current evidence, redundant.
//
// This header once claimed the client engine ignored the change frames the
// server sent it. That was false, and relaying it cost the framework team a
// bug report. Every claim below is a measurement, not a recollection.
//
// Measured against sync 0.4.7 + runtime 0.4.4, on pages verified to still be
// the page under test, with a third client doing the write:
//
//   leader tab    row in replica AND DOM at 190ms  (prod), 4ms (local)
//   follower tab  row in replica AND DOM at 205ms  (local, second tab in the
//                 same context, no transport of its own)
//
// This poll fires every 10s, so nothing under ~9s can be its doing. Both the
// leader and the follower case are the engine applying frames. The follower
// was the case most likely to fail — WebSocketTransport.start() returns early
// for followers — and it does not.
//
// So why is this still mounted? Timing, not evidence. It was kept through the
// judged demo on 2026-08-12 rather than removing safety margin hours before
// it, for one pull per 10s per VISIBLE tab, short-circuited server-side when
// nothing changed and paused on hidden tabs. Same-client writes never needed
// it: callFn observes X-Pylon-Change-Seq as of Pylon 0.4.7.
//
// DELETE THIS FILE. The only case left unmeasured is an entity whose read
// policy might gate the frame over WS; the framework team's position is that
// the 0.4.4 WS enricher runs the same role resolution as HTTP, so an entity
// readable over HTTP is readable over WS. Measure one policy-gated entity from
// the speaker portal, and if it behaves, remove this component and its two
// mounts. Do not re-add it without a fresh measurement in this comment.
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
