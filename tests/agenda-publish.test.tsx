import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const update = mock(async () => {});
const success = mock(() => {});
const error = mock(() => {});

mock.module("@pylonsync/react", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  callFn: async () => ({}),
  db: {
    insert: async () => "row-1",
    update,
    delete: async () => {},
    useQuery: () => ({
      data: [{ id: "org-1", name: "Smolboard", slug: "smolboard", createdAt: "2027-01-01" }],
      loading: false,
    }),
  },
}));

mock.module("sonner", () => ({ toast: { success, error } }));

const { PublishToggle } = await import(
  "../app/dashboard/events/[id]/agenda/agenda-client"
);

const event = {
  id: "event-1",
  orgId: "org-1",
  name: "DevFlow Conf 2027",
  slug: "devflow-conf-2027",
  timezone: "America/Los_Angeles",
  cfpStatus: "closed",
  schedulePublished: false,
  createdAt: "2027-01-01T00:00:00Z",
};

beforeEach(() => {
  update.mockReset();
  update.mockImplementation(async () => {});
  success.mockClear();
  error.mockClear();
});

afterEach(cleanup);

test("publishes and unpublishes without reloading", async () => {
  render(<PublishToggle event={event} />);

  fireEvent.click(screen.getByRole("button", { name: "Publish schedule" }));

  await waitFor(() => {
    expect(update).toHaveBeenNthCalledWith(1, "Event", "event-1", {
      schedulePublished: true,
    });
  });
  expect(await screen.findByRole("button", { name: "Unpublish" })).toBeDefined();
  expect(screen.getByRole("link", { name: "View live" }).getAttribute("href")).toBe(
    "/smolboard/devflow-conf-2027#schedule",
  );
  expect(success).toHaveBeenNthCalledWith(
    1,
    "Schedule is live at /smolboard/devflow-conf-2027#schedule",
  );

  fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));

  await waitFor(() => {
    expect(update).toHaveBeenNthCalledWith(2, "Event", "event-1", {
      schedulePublished: false,
    });
  });
  expect(await screen.findByRole("button", { name: "Publish schedule" })).toBeDefined();
  expect(screen.queryByRole("link", { name: "View live" })).toBeNull();
  expect(success).toHaveBeenNthCalledWith(2, "Schedule unpublished.");
});

test("keeps unpublished state when publishing fails", async () => {
  update.mockImplementationOnce(async () => {
    throw new Error("Could not publish schedule.");
  });
  render(<PublishToggle event={event} />);

  fireEvent.click(screen.getByRole("button", { name: "Publish schedule" }));

  await waitFor(() => {
    expect(error).toHaveBeenCalledWith("Could not publish schedule.");
  });
  expect(screen.getByRole("button", { name: "Publish schedule" })).toBeDefined();
  expect(screen.queryByRole("link", { name: "View live" })).toBeNull();
  expect(success).not.toHaveBeenCalled();
});
