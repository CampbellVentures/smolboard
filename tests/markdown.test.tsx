import { expect, test } from "bun:test";
import React from "react";
import { render, screen } from "@testing-library/react";
import { Markdown } from "../components/markdown";

// Copilot replies are model output quoting user data, so this renders a parsed
// token tree as React elements rather than setting innerHTML. These pin both
// halves: the formatting actually renders, and markup in the source can only
// ever become visible text.

test("bold, ordered lists, and nested bullets render as elements", () => {
  const { container } = render(
    <Markdown>{"Four speakers:\n\n1. **Imani Brooks**\n   - Email: imani@sample.dev\n2. **Petr Havel**"}</Markdown>,
  );
  expect(container.querySelector("ol")).not.toBeNull();
  expect(container.querySelector("ol ul")).not.toBeNull();
  expect(screen.getByText("Imani Brooks").tagName).toBe("STRONG");
  // The asterisks themselves must be gone from the visible text.
  expect(container.textContent).not.toContain("**");
});

test("raw HTML in model output renders as text, never as markup", () => {
  const { container } = render(
    <Markdown>{'<img src=x onerror="alert(1)"> <b>not bold</b>'}</Markdown>,
  );
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("b")).toBeNull();
  expect(container.textContent).toContain("not bold");
});

test("a javascript: link renders as text, an https link becomes an anchor", () => {
  const { container } = render(
    <Markdown>{"[bad](javascript:alert(1)) and [good](https://smolboard.app)"}</Markdown>,
  );
  const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  expect(hrefs).toEqual(["https://smolboard.app"]);
  expect(container.textContent).toContain("bad");
});

test("code fences and inline code render without losing content", () => {
  const { container } = render(<Markdown>{"Run `pylon dev`\n\n```\nnpm test\n```"}</Markdown>);
  expect(container.querySelector("pre code")?.textContent).toBe("npm test");
  expect(screen.getByText("pylon dev").tagName).toBe("CODE");
});

test("plain prose still renders", () => {
  render(<Markdown>{"There are no agenda conflicts."}</Markdown>);
  expect(screen.getByText("There are no agenda conflicts.")).toBeDefined();
});
