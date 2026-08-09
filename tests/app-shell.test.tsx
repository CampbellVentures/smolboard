import { afterEach, expect, mock, test } from "bun:test";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

mock.module("@pylonsync/react", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRoom: () => ({ peers: [], isConnected: true, error: null }),
  useRoomMessages: () => {},
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/dashboard",
  callFn: async () => ({}),
  db: { useQuery: () => ({ data: [], loading: false }) },
}));

mock.module("@pylonsync/client", () => ({
  OrganizationSwitcher: ({ initialActiveName }: { initialActiveName?: string }) => (
    <button type="button">{initialActiveName ?? "Workspace"}</button>
  ),
  useAuth: () => ({ signOut: async () => {} }),
}));

const { AppShell } = await import("../components/app-shell");

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test("dashboard shell exposes calm navigation, presence, and contextual copilot", () => {
  render(
    <AppShell
      active="overview"
      title="Event dashboard"
      userEmail="organizer@example.com"
      userId="user-1"
      userName="Ada Organizer"
      workspaceId="org-1"
      orgName="AIE"
      event={{ id: "event-1", name: "AI Engineer Summit" }}
    >
      Dashboard content
    </AppShell>,
  );

  expect(screen.getByRole("heading", { name: "Event dashboard" })).toBeDefined();
  expect(screen.getAllByRole("link", { name: "Overview" }).length).toBeGreaterThan(0);
  expect(screen.getByLabelText("1 online in AI Engineer Summit")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Ask smolboard" }));
  // Inside an event the pane is the LIVE copilot (components/copilot-chat.tsx),
  // not the workspace teaser.
  expect(screen.getByText(/I can run AI Engineer Summit/)).toBeDefined();
  expect(screen.getByRole("button", { name: "Find agenda conflicts" })).toBeDefined();
});

test("dashboard shell provides a mobile navigation sheet", () => {
  render(
    <AppShell
      active="events"
      title="Events"
      userEmail="organizer@example.com"
      userId="user-1"
      userName="Ada Organizer"
      workspaceId="org-1"
      orgName="AIE"
    >
      Events
    </AppShell>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
  expect(screen.getByText("Dashboard navigation")).toBeDefined();
  expect(
    within(screen.getByRole("dialog")).getByRole("link", { name: "All events" }),
  ).toBeDefined();
  expect(
    within(screen.getByRole("dialog"))
      .getByRole("link", { name: "All events" })
      .getAttribute("href"),
  ).toBe("/dashboard/events");
});

test("reviewer mode exposes only the assignment queue and no organizer copilot", () => {
  render(
    <AppShell
      active="reviews"
      title="Review queue"
      userEmail="reviewer@example.com"
      userId="reviewer-1"
      userName="Rae Reviewer"
      workspaceId="org-1"
      orgName="AIE"
      reviewerMode
    >
      Assigned reviews
    </AppShell>,
  );

  expect(screen.getAllByRole("link", { name: "Review queue" }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("link", { name: "All events" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Team" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Ask smolboard" })).toBeNull();
});
