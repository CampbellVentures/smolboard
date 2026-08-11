"use client";

import { useEffect } from "react";
import { db } from "@pylonsync/react";

// Diagnostic hook for sync-engine investigations, off unless the URL carries
// ?__syncdebug=1. Exposes the engine as window.__syncEngine so a session can
// read leader/transport/store state from the console. No effect on a normal
// page load; nothing here changes app behavior.
export function SyncDebug() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("__syncdebug")) return;
    const w = window as unknown as Record<string, unknown>;
    w.__syncEngine = db.sync;
    w.__syncReport = () => {
      const engine = db.sync as unknown as {
        isMultiTabLeader?: boolean;
        isWebSocketConnected?: () => boolean;
        store?: { list?: (entity: string) => unknown[] };
      };
      let rooms: number | string = "n/a";
      try {
        rooms = engine.store?.list?.("Room")?.length ?? "no store.list";
      } catch (error) {
        rooms = `err ${String(error).slice(0, 40)}`;
      }
      return {
        isMultiTabLeader: engine.isMultiTabLeader,
        isWebSocketConnected: engine.isWebSocketConnected?.(),
        rooms,
      };
    };
  }, []);
  return null;
}
