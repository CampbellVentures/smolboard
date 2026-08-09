import { afterEach, expect, test } from "bun:test";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import {
  ResponsiveDetailOverlay,
  ResponsiveFormOverlay,
} from "../components/responsive-overlay";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

function setDesktop(matches: boolean) {
  window.matchMedia = () =>
    ({
      matches,
      media: "(min-width: 768px)",
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

test("responsive form overlay exposes one labelled, scroll-contained surface", () => {
  setDesktop(false);

  render(
    <ResponsiveFormOverlay.Root open onOpenChange={() => {}}>
      <ResponsiveFormOverlay.Content>
        <ResponsiveFormOverlay.Header>
          <ResponsiveFormOverlay.Title>New event</ResponsiveFormOverlay.Title>
          <ResponsiveFormOverlay.Description>Event details</ResponsiveFormOverlay.Description>
        </ResponsiveFormOverlay.Header>
        <ResponsiveFormOverlay.Body>Form fields</ResponsiveFormOverlay.Body>
        <ResponsiveFormOverlay.Footer>Actions</ResponsiveFormOverlay.Footer>
      </ResponsiveFormOverlay.Content>
    </ResponsiveFormOverlay.Root>,
  );

  const dialog = screen.getByRole("dialog", { name: "New event" });
  expect(dialog.className).toContain("max-h-[96dvh]");
  expect(screen.getByText("Form fields").className).toContain("overflow-y-auto");
});

test("responsive detail overlay becomes a side sheet on desktop", () => {
  setDesktop(true);
  render(
    <ResponsiveDetailOverlay.Root open onOpenChange={() => {}}>
      <ResponsiveDetailOverlay.Content>
        <ResponsiveDetailOverlay.Header>
          <ResponsiveDetailOverlay.Title>Submission</ResponsiveDetailOverlay.Title>
          <ResponsiveDetailOverlay.Description>Review details</ResponsiveDetailOverlay.Description>
        </ResponsiveDetailOverlay.Header>
        <ResponsiveDetailOverlay.Body>Scores</ResponsiveDetailOverlay.Body>
      </ResponsiveDetailOverlay.Content>
    </ResponsiveDetailOverlay.Root>,
  );

  const dialog = screen.getByRole("dialog", { name: "Submission" });
  expect(dialog.className).toContain("sm:max-w-md");
  expect(dialog.className).toContain("right-0");
});
