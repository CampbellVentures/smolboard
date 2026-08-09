import { action, v } from "@pylonsync/functions";

// Uploads an email-body image to the stack0 CDN and returns its public URL.
// Email clients fetch images anonymously with no expiry, so the app's
// owner-scoped /api/files storage (and TTL'd signed URLs) can't serve them —
// the CDN can. Uses the same stack0 API key as email delivery; a deployment
// without one gets a clear error instead of a broken image.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const STACK0_API = "https://api.stack0.dev";

export default action<
  { eventId: string; filename: string; mimeType: string; dataBase64: string },
  { url: string }
>({
  timeout: 60,
  args: {
    eventId: v.id("Event"),
    filename: v.string(),
    mimeType: v.string(),
    dataBase64: v.string(),
  },
  async handler(ctx, args) {
    const event = await ctx.runQuery<{ event: { id: string; orgId: string } | null }>(
      "getEmailContext",
      { eventId: args.eventId, templateKey: "general" },
    );
    if (!event.event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.event.orgId, { role: ["owner", "admin"] });

    if (!/^image\/(png|jpe?g|gif|webp|svg\+xml)$/.test(args.mimeType)) {
      throw ctx.error("INVALID_ARGS", "Only PNG, JPEG, GIF, WebP, or SVG images.");
    }
    const apiKey = ctx.env.STACK0_API_KEY || ctx.env.PYLON_EMAIL_API_KEY;
    if (!apiKey || ctx.env.PYLON_EMAIL_PROVIDER !== "stack0") {
      throw ctx.error("INVALID_ARGS", "Image uploads need the stack0 email provider configured.");
    }
    const projectSlug = ctx.env.STACK0_PROJECT_SLUG || "smolboard";

    const bytes = Uint8Array.from(atob(args.dataBase64), (c) => c.charCodeAt(0));
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      throw ctx.error("INVALID_ARGS", "Images must be non-empty and 4 MB or smaller.");
    }
    const filename = args.filename.trim().slice(0, 120) || "image";

    const init = await fetch(`${STACK0_API}/v1/cdn/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        projectSlug,
        filename,
        mimeType: args.mimeType,
        size: bytes.length,
      }),
    });
    if (!init.ok) {
      throw ctx.error("UPSTREAM", `CDN upload init failed (${init.status}).`);
    }
    const slot = (await init.json()) as { uploadUrl: string; assetId: string };

    const put = await fetch(slot.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": args.mimeType },
      body: bytes,
    });
    if (!put.ok) throw ctx.error("UPSTREAM", `CDN upload failed (${put.status}).`);

    const confirm = await fetch(`${STACK0_API}/v1/cdn/upload/${slot.assetId}/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!confirm.ok) throw ctx.error("UPSTREAM", `CDN confirm failed (${confirm.status}).`);
    const asset = (await confirm.json()) as { cdnUrl?: string };
    if (!asset.cdnUrl) throw ctx.error("UPSTREAM", "CDN did not return a URL.");
    return { url: asset.cdnUrl };
  },
});
