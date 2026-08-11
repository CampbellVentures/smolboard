"use client";

import { useCallback, useState } from "react";

// Deletes resolve on the server in ~200ms, but the local replica can take
// seconds to drop the row from a live query — long enough that a list looks
// broken after a confirmed delete. This hides the row the moment the mutation
// succeeds and stops hiding once the query agrees, so there's no flicker back.
//
//   const { hide, isHidden } = useOptimisticRemoval();
//   await callFn("deleteThing", { id }); hide(id);
//   rows.filter((row) => !isHidden(row.id))
export function useOptimisticRemoval() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const hide = useCallback((id: string) => {
    setHidden((prev) => new Set(prev).add(id));
  }, []);
  const isHidden = useCallback((id: string) => hidden.has(id), [hidden]);
  // Callers pass the live ids; anything hidden but already gone upstream can
  // be forgotten so the set never grows without bound.
  const settle = useCallback((liveIds: string[]) => {
    setHidden((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(liveIds);
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, []);
  return { hide, isHidden, settle };
}
