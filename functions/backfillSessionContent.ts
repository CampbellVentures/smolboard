import { mutation, v } from "@pylonsync/functions";
import { parseJson } from "../lib/types";

// Legacy rows (pre-0.3.378) store json columns as strings; parse either shape.
function speakerIds(raw: unknown): string[] {
  const value = parseJson<unknown>(raw);
  return Array.isArray(value) ? (value as string[]) : [];
}

// One-time migration for sessions created before the content-revision system:
// they have no revisions, so the public schedule's approval gate hides them
// even though they were publicly visible before the gate existed. For each
// legacy session (no currentRevisionId), snapshot its current title/
// description into revision 1 and approve it — preserving what was already
// public, not weakening the gate for anything new.
export default mutation<{ eventId: string }, { migrated: number; skipped: number }>({
  args: { eventId: v.id("Event") },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    const user = await ctx.db.unsafe.get("User", ctx.auth.userId);
    const editorName = String(user?.displayName || user?.email || "Organizer").slice(0, 200);

    const sessions = (await ctx.db.unsafe.query("Session", { eventId: args.eventId })).filter(
      (session) => session.orgId === event.orgId,
    );
    let migrated = 0;
    let skipped = 0;
    const now = new Date().toISOString();
    for (const session of sessions) {
      if (session.currentRevisionId) {
        // Repair pass: an earlier backfill run wrote empty speaker lists for
        // legacy string-encoded json columns. Restore them on the revision.
        const ids = speakerIds(session.speakerUserIdsJson);
        const revision = await ctx.db.unsafe.get(
          "SessionContentRevision",
          session.currentRevisionId as string,
        );
        const revisionIds = revision ? speakerIds(revision.speakerUserIdsJson) : [];
        if (revision && ids.length > 0 && revisionIds.length === 0) {
          await ctx.db.unsafe.update("SessionContentRevision", revision.id as string, {
            speakerUserIdsJson: ids,
          });
          migrated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }
      const revisionId = await ctx.db.unsafe.insert("SessionContentRevision", {
        orgId: session.orgId as string,
        eventId: args.eventId,
        sessionId: session.id as string,
        revisionNumber: 1,
        title: (session.title as string) ?? "",
        description: (session.description as string) || undefined,
        speakerUserIdsJson: speakerIds(session.speakerUserIdsJson),
        editorUserId: ctx.auth.userId,
        editorName,
      });
      await ctx.db.unsafe.update("Session", session.id as string, {
        currentRevisionId: revisionId,
        contentStatus: "approved",
        approvedRevisionId: revisionId,
        approvedAt: now,
        approvedByUserId: ctx.auth.userId,
      });
      migrated += 1;
    }
    return { migrated, skipped };
  },
});
