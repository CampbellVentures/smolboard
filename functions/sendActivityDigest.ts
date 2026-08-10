import { action } from "@pylonsync/functions";
import { renderBrandedEmail } from "../lib/email-branded";
import type { OrgDigest } from "./getActivityDigest";

// Daily cron target: one branded email per organizer summarizing the last 24h
// of workspace activity. Quiet days send nothing — the digest only exists
// when there is something to say.

export default action<{}, { sent: number }>({
  internal: true,
  args: {},
  async handler(ctx) {
    const digests = await ctx.runQuery<OrgDigest[]>("getActivityDigest", {});
    let sent = 0;
    for (const digest of digests) {
      const subject = `${digest.count} update${digest.count === 1 ? "" : "s"} in ${digest.orgName} — smolboard daily`;
      const extra = digest.count - digest.lines.length;
      const { html, text } = renderBrandedEmail({
        siteName: digest.orgName,
        heading: `What happened in ${digest.orgName}`,
        intro: `The last 24 hours, at a glance.${extra > 0 ? ` Showing ${digest.lines.length} of ${digest.count}.` : ""}`,
        lines: digest.lines.map((line) => ({ text: line.message, href: line.href })),
        ctaLabel: "Open your dashboard",
        ctaHref: "/dashboard",
        footerNote: `You're receiving the daily digest because you organize ${digest.orgName} on smolboard.`,
      });
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
