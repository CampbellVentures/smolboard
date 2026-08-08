import { afterEach, expect, test } from "bun:test";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { CalendarPlus } from "lucide-react";

import {
  DashboardEmptyState,
  DashboardPage,
  DashboardPanel,
  DashboardWidePage,
} from "../components/dashboard";

afterEach(cleanup);

test("standard dashboard pages share one bounded canvas", () => {
  render(
    <DashboardPage data-testid="page">
      <DashboardPanel title="Team">Members</DashboardPanel>
    </DashboardPage>,
  );

  expect(screen.getByTestId("page").className).toContain("max-w-4xl");
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
