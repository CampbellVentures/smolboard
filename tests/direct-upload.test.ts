import { afterEach, expect, mock, test } from "bun:test";
import { uploadFileDirect } from "../lib/direct-upload";

afterEach(() => mock.restore());

test("direct upload uses init, PUT, and confirm in order", async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method });
    if (url === "/api/files/init") return Response.json({ assetId: "asset", uploadUrl: "/api/files/local-put/asset" });
    if (url === "/api/files/local-put/asset") return new Response(null, { status: 204 });
    if (url === "/api/files/confirm") return Response.json({ id: "file", url: "/api/files/file", size: 4 });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  try {
    const stored = await uploadFileDirect(new File(["deck"], "slides.pdf", { type: "application/pdf" }));
    expect(stored).toEqual({ id: "file", url: "/api/files/file", size: 4 });
    expect(calls).toEqual([
      { url: "/api/files/init", method: "POST" },
      { url: "/api/files/local-put/asset", method: "PUT" },
      { url: "/api/files/confirm", method: "POST" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("direct upload rejects oversized files before network I/O", async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = mock(async () => new Response());
  globalThis.fetch = fetchMock as typeof fetch;
  try {
    const oversized = { name: "huge.pdf", type: "application/pdf", size: 25 * 1024 * 1024 + 1 } as File;
    await expect(uploadFileDirect(oversized)).rejects.toThrow("25 MB");
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
