import { expect, test } from "bun:test";
import { COMPANY, bySlug, siteConfig } from "../lib/site.config";

// The signup form links to /company/terms and /company/privacy, and those pages
// 404 on an unknown slug. If either entry is renamed or dropped, signup gains a
// dead link, so pin both here.

test("the two legal pages the signup form links to resolve", () => {
  for (const slug of ["terms", "privacy"]) {
    const page = bySlug(COMPANY, slug);
    expect(page).toBeDefined();
    expect(page?.sections.length).toBeGreaterThan(0);
  }
});

test("an unknown company slug resolves to undefined so the page can 404", () => {
  expect(bySlug(COMPANY, "definitely-not-a-real-page")).toBeUndefined();
});

test("legal copy names smolboard, not the starter template's placeholder brand", () => {
  const text = JSON.stringify(COMPANY);
  expect(text).not.toContain("Acme");
  expect(text).toContain("smolboard");
});

test("SEO strings are set, since <head> reads them and pages can't override", () => {
  expect(siteConfig.seo.title.length).toBeGreaterThan(0);
  expect(siteConfig.seo.description.length).toBeGreaterThan(0);
});
