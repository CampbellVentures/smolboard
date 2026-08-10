import { action } from "@pylonsync/functions";
import type { OrgDigest } from "./getActivityDigest";

// Daily cron target: one email per organizer summarizing the last 24h of
// workspace activity. Quiet days send nothing — the digest only exists when
// there is something to say.

const BASE_URL = "https://www.smolboard.app";

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default action<{}, { sent: number }>({
  internal: true,
  args: {},
  async handler(ctx) {
    const digests = await ctx.runQuery<OrgDigest[]>("getActivityDigest", {});
    let sent = 0;
    for (const digest of digests) {
      const subject = `${digest.count} update${digest.count === 1 ? "" : "s"} in ${digest.orgName} — smolboard daily`;
      const text = [
        `Here's what happened in ${digest.orgName} over the last 24 hours:`,
        "",
        ...digest.lines.map((line) => `• ${line.message}`),
        digest.count > digest.lines.length
          ? `…and ${digest.count - digest.lines.length} more.`
          : "",
        "",
        `Open your dashboard: ${BASE_URL}/dashboard`,
      ]
        .filter(Boolean)
        .join("\n");
      const html = `
        <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#18181b">
          <h2 style="font-size:16px">What happened in ${esc(digest.orgName)}</h2>
          <p style="color:#71717a;font-size:13px">The last 24 hours, at a glance.</p>
          <ul style="padding-left:18px;font-size:14px;line-height:1.7">
            ${digest.lines
              .map(
                (line) =>
                  `<li>${
                    line.href
                      ? `<a href="${BASE_URL}${esc(line.href)}" style="color:#18181b">${esc(line.message)}</a>`
                      : esc(line.message)
                  }</li>`,
              )
              .join("")}
          </ul>
          ${
            digest.count > digest.lines.length
              ? `<p style="color:#71717a;font-size:13px">…and ${digest.count - digest.lines.length} more.</p>`
              : ""
          }
          <p style="margin-top:20px"><a href="${BASE_URL}/dashboard" style="color:#18181b;font-weight:600">Open your dashboard →</a></p>
        </div>`;
      for (const to of digest.toEmails) {
        try {
          await ctx.email.send({ to, subject, text, html });
          sent++;
        } catch {
          // One bad address shouldn't stop the rest of the batch.
        }
      }
    }
    return { sent };
  },
});
