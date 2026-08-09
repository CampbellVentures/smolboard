import { afterEach, expect, test } from "bun:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FormRenderer } from "../components/form-renderer";
import type { Answers, FormField } from "../lib/forms";

const fields: FormField[] = [
  {
    key: "topic",
    type: "short_text",
    label: "Talk topic",
    helpText: "Use a clear, specific title.",
    required: true,
  },
  {
    key: "format",
    type: "multiselect",
    label: "Formats",
    options: ["Talk", "Workshop"],
  },
  {
    key: "recording",
    type: "checkbox",
    label: "I agree to be recorded",
    required: true,
  },
];

afterEach(cleanup);

test("shared form renderer labels controls and reports validation errors", () => {
  const changes: Answers[] = [];
  render(
    <FormRenderer
      fields={fields}
      answers={{}}
      onChange={(next) => changes.push(next)}
      errors={[{ field: "topic", message: "Enter a topic." }]}
    />,
  );

  const topic = screen.getByLabelText(/Talk topic/);
  expect(topic.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("Enter a topic.")).toBeDefined();

  fireEvent.change(topic, { target: { value: "Practical agents" } });
  expect(changes.at(-1)?.topic).toBe("Practical agents");
});

test("shared form renderer uses accessible reusable checkboxes", () => {
  const changes: Answers[] = [];
  render(
    <FormRenderer
      fields={fields}
      answers={{ format: [], recording: false }}
      onChange={(next) => changes.push(next)}
    />,
  );

  fireEvent.click(screen.getByLabelText("Talk"));
  expect(changes.at(-1)?.format).toEqual(["Talk"]);

  fireEvent.click(screen.getByLabelText(/I agree to be recorded/));
  expect(changes.at(-1)?.recording).toBe(true);
});
