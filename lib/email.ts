// Merge-tag templating for speaker emails — pure, tested. Rendering happens
// server-side (functions/sendTemplatedEmail.ts); templates are stored per
// event in EmailTemplate rows and edited at /dashboard/events/[id]/emails.

export type MergeVars = Record<string, string | undefined>;

// {{tag}} → value; unknown/empty tags render as "" so a half-configured
// template never leaks braces to a speaker.
export function renderTemplate(template: string, vars: MergeVars): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, tag: string) => vars[tag] ?? "");
}

// HTML exports need the same merge tags, but values must not be allowed to
// introduce markup or break attributes such as href="{{portal_link}}".
export function renderHtmlTemplate(template: string, vars: MergeVars): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, tag: string) =>
    escapeHtml(vars[tag] ?? ""),
  );
}

// Keep both rendering paths behind one helper so callers cannot accidentally
// interpolate untrusted merge values directly into composer-authored HTML.
export function renderEmailHtml(
  markdownBody: string,
  htmlBody: string | undefined,
  vars: MergeVars,
): string {
  if (htmlBody?.trim()) return renderHtmlTemplate(htmlBody, vars);
  return markdownToHtml(renderTemplate(markdownBody, vars));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Minimal markdown → HTML for email bodies: paragraphs, **bold**, _italic_,
// [text](url) links, and single line breaks. Deliberately tiny — event emails
// are short notes, not documents.
export function markdownToHtml(md: string): string {
  const esc = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const inline = esc
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/gm, "$1<em>$2</em>")
    .replace(
      /\[([^\]]+)\]\(((?:https?:\/\/[^)\s]+)|(?:\{\{[a-z0-9_]+\}\}))\)/gi,
      '<a href="$2">$1</a>',
    );
  return inline
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export const DEFAULT_TEMPLATES: { key: string; subject: string; body: string }[] = [
  {
    key: "portal_invite",
    subject: "Your {{event_name}} speaker portal",
    body: "Hi {{speaker_name}},\n\nYou have been added as a speaker for {{event_name}}. Open the speaker portal and request a one-time magic code using this exact email address:\n\n[Open your speaker portal]({{portal_link}})\n\n— the {{event_name}} team",
  },
  {
    key: "submission_received",
    subject: "We got your talk: {{talk_title}}",
    body: "Hi {{speaker_name}},\n\nThanks for submitting **{{talk_title}}** to {{event_name}}. Our review team will take it from here — you can track status, update your profile, and upload materials any time in your speaker portal:\n\n[Open your speaker portal]({{portal_link}})\n\n— the {{event_name}} team",
  },
  {
    key: "accepted",
    subject: "🎉 {{talk_title}} is accepted for {{event_name}}",
    body: "Hi {{speaker_name}},\n\nGreat news — **{{talk_title}}** has been accepted for {{event_name}}!\n\nYour speaker portal has onboarding tasks (bio, headshot, slides). Please complete them so we can announce you:\n\n[Open your speaker portal]({{portal_link}})\n\n— the {{event_name}} team",
  },
  {
    key: "rejected",
    subject: "Update on {{talk_title}}",
    body: "Hi {{speaker_name}},\n\nThank you for submitting **{{talk_title}}** to {{event_name}}. We had far more strong submissions than slots this year, and we weren't able to include yours.\n\nWe'd love to see you submit again next time.\n\n— the {{event_name}} team",
  },
  {
    key: "task_reminder",
    subject: "Reminder: {{event_name}} speaker tasks due",
    body: "Hi {{speaker_name}},\n\nA quick reminder that you have outstanding speaker tasks for {{event_name}}:\n\n{{task_list}}\n\n[Complete them in your portal]({{portal_link}})\n\n— the {{event_name}} team",
  },
  {
    key: "schedule_invite",
    subject: "Your {{event_name}} session is scheduled",
    body: "Hi {{speaker_name}},\n\n**{{talk_title}}** is scheduled for {{session_time}} in {{room}}.\n\nAdd it to your calendar: {{calendar_links}}\n\n[View your session in the portal]({{portal_link}})\n\n— the {{event_name}} team",
  },
];
