import { afterEach, expect, test } from "bun:test";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { CalendarPlus } from "lucide-react";

import {
  DashboardEmptyState,
  DashboardPage,
  DashboardPanel,
  DashboardStatStrip,
  DashboardWidePage,
} from "../components/dashboard";

afterEach(cleanup);

test("standard dashboard pages share one bounded canvas", () => {
  render(
    <DashboardPage data-testid="page">
      <DashboardPanel title="Team">Members</DashboardPanel>
    </DashboardPage>,
  );

  expect(screen.getByTestId("page").className).toContain("max-w-3xl");
  expect(screen.getByText("Team")).toBeDefined();
  expect(screen.getByText("Members")).toBeDefined();
});

test("dense dashboard tools opt into the explicit wide canvas", () => {
  render(<DashboardWidePage data-testid="wide">Builder</DashboardWidePage>);

  expect(screen.getByTestId("wide").className).not.toContain("max-w-");
});

test("dashboard empty states compose the shared empty primitive", () => {
  render(
    <DashboardEmptyState
      icon={CalendarPlus}
      title="No events yet"
      description="Create your first event."
    />,
  );

  expect(screen.getByText("No events yet")).toBeDefined();
  expect(document.querySelector('[data-slot="empty"]')).not.toBeNull();
});

test("dashboard panels default to a flat surface and expose contained variants", () => {
  const { rerender } = render(<DashboardPanel title="Activity">Updates</DashboardPanel>);

  expect(document.querySelector('[data-slot="card"]')?.getAttribute("data-variant")).toBe(
    "flat",
  );

  rerender(
    <DashboardPanel title="Editor" variant="elevated">
      Content
    </DashboardPanel>,
  );
  expect(document.querySelector('[data-slot="card"]')?.getAttribute("data-variant")).toBe(
    "elevated",
  );
});

test("dashboard stat strip groups live metrics into one calm surface", () => {
  render(
    <DashboardStatStrip
      items={[
        { icon: CalendarPlus, label: "Events", value: 4 },
        { icon: CalendarPlus, label: "Open forms", value: 2 },
      ]}
    />,
  );

  expect(document.querySelector('[data-slot="dashboard-stat-strip"]')).not.toBeNull();
  expect(screen.getByText("4").className).toContain("tabular-nums");
});
