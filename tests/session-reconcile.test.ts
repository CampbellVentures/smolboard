import { afterEach, expect, mock, test } from "bun:test";
import { configureClient, storageKey } from "@pylonsync/react";
import { reconcileStaleToken } from "../components/session-reconcile";

const realFetch = globalThis.fetch;
const realReload = window.location.reload;

afterEach(() => {
  globalThis.fetch = realFetch;
  window.location.reload = realReload;
  window.localStorage.clear();
});

// /api/auth/me answers as `bearerUser` for the Bearer call and `cookieUser`
// for the cookie call.
function stubMe(bearerUser: string, cookieUser: string) {
  globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
    const viaBearer = Boolean(
      (init?.headers as Record<string, string> | undefined)?.Authorization,
    );
    return new Response(
      JSON.stringify({ user_id: viaBearer ? bearerUser : cookieUser }),
    );
  }) as unknown as typeof fetch;
}

test("a stale token is cleared from the namespaced and the legacy keys", async () => {
  // Pylon 0.22 hydration namespaces the keyspace by app name.
  configureClient({ appName: "smolboard" });
  window.localStorage.setItem(storageKey("token"), "stale");
  window.localStorage.setItem("pylon_token", "stale");
  window.localStorage.setItem("pylon_userId", "old-user");
  const reload = mock(() => {});
  window.location.reload = reload;
  stubMe("old-user", "new-user");

  expect(await reconcileStaleToken()).toBe(true);
  expect(reload).toHaveBeenCalledTimes(1);
  // With the legacy key left behind, the next boot copies it back into the
  // namespaced slot and the reconcile reloads forever.
  expect(window.localStorage.getItem(storageKey("token"))).toBeNull();
  expect(window.localStorage.getItem("pylon_token")).toBeNull();
  expect(window.localStorage.getItem("pylon_userId")).toBeNull();
});

test("a token that matches the cookie identity is kept", async () => {
  configureClient({ appName: "smolboard" });
  window.localStorage.setItem(storageKey("token"), "current");
  const reload = mock(() => {});
  window.location.reload = reload;
  stubMe("same-user", "same-user");

  expect(await reconcileStaleToken()).toBe(false);
  expect(reload).not.toHaveBeenCalled();
  expect(window.localStorage.getItem(storageKey("token"))).toBe("current");
});
