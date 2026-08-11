import { db } from "@pylonsync/react";

// THE app-side function caller. The free-standing `callFn` from
// @pylonsync/react does a bare fetch and ignores the X-Pylon-Change-Seq
// response header, so the caller's own replica goes stale until some later
// pull — Eric watched a freshly added room not appear until refresh. The
// engine's `db.sync.fn()` observes the header and fires a one-shot pull, so
// every mutation's effects land in local live queries before the promise
// resolves plus one round trip. Import from here, never from the package.
export async function callFn<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return db.sync.fn<T>(name, args);
}
