import { query, v } from "@pylonsync/functions";

// Mint a downloadable URL for a deliverable version. /api/files/<id> is
// owner-scoped at the framework level, so an organizer can't hit it directly;
// ctx.files.signedUrl (pylon ≥0.4.1) mints a short-lived signed URL that the
// GET handler honors for anyone. Authorization here: the uploading speaker or
// an owner/admin of the org. Until the runtime ships signedUrl we fall back to
// the plain URL, which still works for the speaker themselves.
export default query<{ versionId: string }, { url: string; filename: string; signed: boolean }>({
  args: { versionId: v.id("DeliverableVersion") },
  async handler(ctx, args) {
    const version = await ctx.db.unsafe.get("DeliverableVersion", args.versionId);
    if (!version) throw ctx.error("NOT_FOUND", "File not found.");
    if (version.speakerUserId !== ctx.auth.userId) {
      await ctx.requireMember(version.orgId as string, { role: ["owner", "admin"] });
    }

    const fileId = version.fileId as string;
    const files = (ctx as { files?: { signedUrl?: (id: string, opts?: { ttlSecs?: number }) => Promise<string> } }).files;
    if (files?.signedUrl) {
      return {
        url: await files.signedUrl(fileId, { ttlSecs: 300 }),
        filename: version.filename as string,
        signed: true,
      };
    }
    return { url: `/api/files/${fileId}`, filename: version.filename as string, signed: false };
  },
});
