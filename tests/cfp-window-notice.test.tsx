import React from "react";
import { expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { CfpWindowNotice } from "../app/[orgSlug]/[eventSlug]/cfp/[formSlug]/cfp-window-notice";

test("deadline notice renders upcoming, open, and closed states explicitly", () => {
  const view = render(<CfpWindowNotice state="upcoming" opensLabel="May 1, 2027, 9:00 AM CDT" />);
  expect(screen.getByText("Submissions open May 1, 2027, 9:00 AM CDT.")).toBeDefined();

  view.rerender(<CfpWindowNotice state="open" closesLabel="May 31, 2027, 11:59 PM CDT" />);
  expect(screen.getByText("Submit by May 31, 2027, 11:59 PM CDT.")).toBeDefined();

  view.rerender(<CfpWindowNotice state="closed" closesLabel="May 31, 2027, 11:59 PM CDT" />);
  expect(screen.getByText("Submissions are closed as of May 31, 2027, 11:59 PM CDT.")).toBeDefined();
  expect(document.querySelector("[data-cfp-window=closed]")).not.toBeNull();
  cleanup();
});
