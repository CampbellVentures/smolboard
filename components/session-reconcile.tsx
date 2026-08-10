"use client";

import { useEffect } from "react";
import { storageKey } from "@pylonsync/react";

// After an OAuth sign-in the real session lives in the HttpOnly cookie, but the
// sync engine sends a Bearer token from localStorage when one exists — and the
// server prefers the Bearer. A stale token (an earlier guest session, or a
// previous account) shadows the cookie: every engine call runs as the wrong
// identity and org provisioning fails with "anonymous session" / "Login
// required". The password form avoids this by calling persistSession(); the
// OAuth flow is a plain redirect and can't (the cookie is HttpOnly, so the
// token is unreadable from JS).
//
// Reconcile instead: compare the Bearer identity with the cookie identity once
// per load. When they disagree, the cookie is the fresh sign-in — drop the
// local token (the engine falls back to cookies on every call) and reload.
// Returns true when it reloaded, so callers can skip work this load.
export async function reconcileStaleToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  let token: string | null = null;
  try {
    token = window.localStorage?.getItem(storageKey("token")) ?? null;
  } catch {
    return false;
  }
  if (!token) return false;
  try {
    const [viaBearer, viaCookie] = await Promise.all([
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
      }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/auth/me", { credentials: "include" }).then((r) =>
        r.ok ? r.json() : null,
      ),
    ]);
    if (viaCookie?.user_id && viaBearer?.user_id !== viaCookie.user_id) {
      window.localStorage.removeItem(storageKey("token"));
      window.location.reload();
      return true;
    }
  } catch {
    // Network hiccup — nothing to reconcile this load.
  }
  return false;
}

export function SessionReconcile() {
  useEffect(() => {
    void reconcileStaleToken();
  }, []);
  return null;
}
