import { expect, test } from "bun:test";
import { normalizeEmbed, validateResource } from "../lib/portal-resources";

// This field accepts an embed from an organizer and renders it on a page
// speakers visit, so the constraints on it are the security boundary.

test("a pasted iframe snippet has its src extracted", () => {
  const r = normalizeEmbed('<iframe src="https://www.youtube.com/embed/abc" width="560"></iframe>');
  expect(r.url).toBe("https://www.youtube.com/embed/abc");
  expect(r.error).toBeUndefined();
});

test("a bare allowed URL passes through", () => {
  expect(normalizeEmbed("https://docs.google.com/document/d/xyz/preview").url).toBe(
    "https://docs.google.com/document/d/xyz/preview",
  );
});

test("javascript: and data: URLs are refused", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>"]) {
    const r = normalizeEmbed(bad);
    expect(r.url).toBeUndefined();
    expect(r.error).toBeTruthy();
  }
});

test("an iframe whose src is javascript: is refused, not extracted", () => {
  const r = normalizeEmbed(`<iframe src="javascript:alert(1)"></iframe>`);
  expect(r.url).toBeUndefined();
  expect(r.error).toBeTruthy();
});

test("http is refused, since an https portal blocks it anyway", () => {
  expect(normalizeEmbed("http://docs.google.com/x").error).toBeTruthy();
});

test("a host outside the allowlist is refused by name", () => {
  const r = normalizeEmbed("https://evil.example.com/phish");
  expect(r.url).toBeUndefined();
  expect(r.error).toContain("evil.example.com");
});

test("credentials and fragments are stripped from an accepted embed", () => {
  const r = normalizeEmbed("https://user:pw@vimeo.com/123#frag");
  expect(r.url).toBe("https://vimeo.com/123");
});

test("an empty embed is allowed: a page can be prose only", () => {
  const r = validateResource({ title: "Run of show", body: "Doors at 8." });
  expect(r.ok).toBe(true);
  expect(r.embedUrl).toBeUndefined();
});

test("a page needs a title", () => {
  expect(validateResource({ title: "   " }).ok).toBe(false);
});

test("a bad embed fails the whole save rather than saving silently", () => {
  const r = validateResource({ title: "Brand kit", embedUrl: "https://evil.example.com" });
  expect(r.ok).toBe(false);
  expect(r.error).toBeTruthy();
});
