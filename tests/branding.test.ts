import { expect, test } from "bun:test";
import { isValidAccent, parseBranding } from "../lib/branding";

test("valid blob parses", () => {
  const b = parseBranding(
    JSON.stringify({ accent: "#7c3aed", logoUrl: "https://x.com/l.svg", tagline: " Two days of AI " }),
  );
  expect(b).toEqual({ accent: "#7c3aed", logoUrl: "https://x.com/l.svg", tagline: "Two days of AI", heroUrl: null });
});

test("malformed JSON degrades to defaults", () => {
  expect(parseBranding("{oops")).toEqual({ accent: null, logoUrl: null, tagline: null, heroUrl: null });
  expect(parseBranding(undefined)).toEqual({ accent: null, logoUrl: null, tagline: null, heroUrl: null });
  expect(parseBranding("")).toEqual({ accent: null, logoUrl: null, tagline: null, heroUrl: null });
});

test("bad accent and unsafe logo URLs are dropped", () => {
  const b = parseBranding({ accent: "red", logoUrl: "javascript:alert(1)", tagline: "" });
  expect(b).toEqual({ accent: null, logoUrl: null, tagline: null, heroUrl: null });
  expect(parseBranding({ logoUrl: "data:image/png;base64,x" }).logoUrl).toBeNull();
  expect(parseBranding({ logoUrl: "/assets/logo.svg" }).logoUrl).toBe("/assets/logo.svg");
});

test("tagline is capped at 160 chars", () => {
  const long = "x".repeat(300);
  expect(parseBranding({ tagline: long }).tagline?.length).toBe(160);
});

test("isValidAccent", () => {
  expect(isValidAccent("#7c3aed")).toBe(true);
  expect(isValidAccent("#7C3AED")).toBe(true);
  expect(isValidAccent("#fff")).toBe(false);
  expect(isValidAccent("7c3aed")).toBe(false);
});
