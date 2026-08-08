import { expect, test } from "bun:test";
import {
  DEFAULT_TEMPLATES,
  markdownToHtml,
  renderHtmlTemplate,
  renderTemplate,
} from "../lib/email";

test("email merge tags tolerate whitespace and never leak unknown placeholders", () => {
  expect(renderTemplate("Hi {{ speaker_name }} — {{missing}}", { speaker_name: "Ada" })).toBe(
    "Hi Ada — ",
  );
});

test("every required automated email has a usable default", () => {
  expect(DEFAULT_TEMPLATES.map((template) => template.key)).toEqual([
    "submission_received",
    "accepted",
    "rejected",
    "task_reminder",
    "schedule_invite",
  ]);
  expect(DEFAULT_TEMPLATES.every((template) => template.subject && template.body)).toBe(true);
});

test("email markdown renderer escapes HTML before adding safe formatting", () => {
  expect(markdownToHtml("<script>\n\n**Hello** [portal]({{portal_link}})")).toBe(
    "<p>&lt;script&gt;</p>\n<p><strong>Hello</strong> <a href=\"{{portal_link}}\">portal</a></p>",
  );
});

test("email markdown renderer preserves merge tags with underscores", () => {
  expect(
    markdownToHtml("Hi {{speaker_name}},\n\n**{{talk_title}}** for {{event_name}}"),
  ).toBe(
    "<p>Hi {{speaker_name}},</p>\n<p><strong>{{talk_title}}</strong> for {{event_name}}</p>",
  );
});

test("HTML merge tags escape text and attribute-breaking characters", () => {
  expect(
    renderHtmlTemplate('<p>Hi {{speaker_name}}</p><a href="{{portal_link}}">Portal</a>', {
      speaker_name: "Ada <Admin>",
      portal_link: 'https://example.com/?next="dashboard"&from=email',
    }),
  ).toBe(
    '<p>Hi Ada &lt;Admin&gt;</p><a href="https://example.com/?next=&quot;dashboard&quot;&amp;from=email">Portal</a>',
  );
});
