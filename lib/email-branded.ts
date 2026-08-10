// Branded transactional email renderer. One layout for every organizer alert
// and digest: accent bar, optional event logo, heading, body lines, one CTA.
// Table-based with inline styles so it renders in Gmail/Outlook/Apple Mail.
// The accent + logo come from the event's Branding settings, so alert emails
// match the public site. Sends go through ctx.email.send (stack0 provider).

import type { EventBranding } from "./branding";

export interface BrandedEmailInput {
  branding?: Partial<EventBranding> | null;
  /** "DevSummit 2026" or the workspace name for org-level mail. */
  siteName: string;
  heading: string;
  intro?: string;
  lines?: { text: string; href?: string | null }[];
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
}

const BASE_URL = "https://www.smolboard.app";
const DEFAULT_ACCENT = "#18181b";

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absolutize(href: string): string {
  return href.startsWith("/") ? `${BASE_URL}${href}` : href;
}

export function renderBrandedEmail(input: BrandedEmailInput): { html: string; text: string } {
  const accent = input.branding?.accent || DEFAULT_ACCENT;
  const logoUrl = input.branding?.logoUrl || null;
  const lines = input.lines ?? [];
  const cta = input.ctaLabel && input.ctaHref
    ? { label: input.ctaLabel, href: absolutize(input.ctaHref) }
    : null;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr><td style="height:4px;background:${esc(accent)};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:28px 32px 0;">
            ${
              logoUrl
                ? `<img src="${esc(absolutize(logoUrl))}" alt="${esc(input.siteName)}" height="28" style="height:28px;max-width:180px;object-fit:contain;" />`
                : `<span style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:14px;font-weight:700;color:#18181b;">${esc(input.siteName)}</span>`
            }
          </td></tr>
          <tr><td style="padding:20px 32px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
            <h1 style="margin:0;font-size:18px;line-height:1.4;color:#18181b;">${esc(input.heading)}</h1>
            ${
              input.intro
                ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#52525b;">${esc(input.intro)}</p>`
                : ""
            }
          </td></tr>
          ${
            lines.length > 0
              ? `<tr><td style="padding:16px 32px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #f0f0f1;border-radius:8px;">
              ${lines
                .map(
                  (line) => `<tr><td style="padding:10px 16px;font-size:14px;line-height:1.5;color:#3f3f46;border-bottom:1px solid #f0f0f1;">${
                    line.href
                      ? `<a href="${esc(absolutize(line.href))}" style="color:#18181b;text-decoration:none;">${esc(line.text)}</a>`
                      : esc(line.text)
                  }</td></tr>`,
                )
                .join("")}
            </table>
          </td></tr>`
              : ""
          }
          ${
            cta
              ? `<tr><td style="padding:24px 32px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
            <a href="${esc(cta.href)}" style="display:inline-block;background:${esc(accent)};color:#ffffff;font-size:14px;font-weight:600;line-height:1;padding:12px 20px;border-radius:8px;text-decoration:none;">${esc(cta.label)}</a>
          </td></tr>`
              : ""
          }
          <tr><td style="padding:28px 32px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;border-top:1px solid #f0f0f1;padding-top:16px;">
              ${esc(input.footerNote ?? `You're receiving this because you organize ${input.siteName} on smolboard.`)}
            </p>
          </td></tr>
        </table>
        <p style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:11px;color:#a1a1aa;margin:16px 0 0;">
          Sent by <a href="${BASE_URL}" style="color:#a1a1aa;">smolboard</a>
        </p>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    input.heading,
    input.intro ?? "",
    "",
    ...lines.map((line) => `• ${line.text}${line.href ? ` — ${absolutize(line.href)}` : ""}`),
    cta ? `\n${cta.label}: ${cta.href}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text };
}
