// The SDK's signOut authenticates with the stored client token, so the server
// revokes the token's session. When the browser also carries a cookie session
// from an earlier sign-in (magic code on one page, password on another), that
// cookie survives and the reload comes back signed in. Revoke the cookie
// session explicitly so Sign out always means signed out.
export async function revokeCookieSession(): Promise<void> {
  try {
    await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
  } catch {
    // Best effort — the caller reloads either way and lands on the login
    // screen if either revocation stuck.
  }
}
