import { mutation, v } from "@pylonsync/functions";
import { isValidSpeakerEmail, normalizeSpeakerEmail, speakerEmailLock } from "../lib/speakers";
import { matchesEventAnchor } from "../lib/tenantAnchors";

// Correct a speaker's identity email.
//
// saveSpeakerProfile refuses to touch this address, and it is right to: the
// email is the key that ties a SpeakerProfile to its User, so rewriting it
// under a signed-in speaker would hand their account to whoever holds the new
// inbox. But that left an organizer who mistyped an address at import with no
// way back. The speaker could never sign in, and deleting the record to retype
// it would take their sessions, tasks, and deliverables with it.
//
// The window where a correction is safe is before anyone proves inbox control.
// speakerEmailLock decides that. The address is shared by every profile on the
// account, so all of them move together.
export default mutation({
  args: {
    eventId: v.id("Event"),
    profileId: v.id("SpeakerProfile"),
    email: v.string(),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    const profile = await ctx.db.unsafe.get("SpeakerProfile", args.profileId);
    if (!matchesEventAnchor(profile, args.eventId, event.orgId as string)) {
      throw ctx.error("NOT_FOUND", "Speaker profile not found.");
    }
    const email = normalizeSpeakerEmail(args.email);
    if (!isValidSpeakerEmail(email)) throw ctx.error("INVALID_ARGS", "Enter a valid speaker email.");

    const userId = profile!.userId as string;
    const user = await ctx.db.unsafe.get("User", userId);
    if (!user) throw ctx.error("NOT_FOUND", "Speaker account not found.");
    const previous = normalizeSpeakerEmail(user.email as string);
    // A submission freezes its participants at submit time, and the review
    // sheet renders that snapshot under "Participants" as if it were current
    // contact detail. Left alone it keeps showing the address we just moved
    // away from. Syncing runs even when the email is already correct, so the
    // repair is idempotent and fixes drift from earlier renames.
    const snapshots = await syncParticipantSnapshots(
      ctx,
      event.orgId as string,
      userId,
      email,
      profile!.name as string,
    );
    if (previous === email) return { changed: false, email, snapshots };

    const owned = (await ctx.db.unsafe.query("SpeakerProfile", { userId })).filter(
      (row) => (row.userId as string) === userId,
    );
    const memberships = await ctx.db.unsafe.query("OrgMember", { userId });
    const lock = speakerEmailLock(
      owned.map((row) => ({ claimStatus: row.claimStatus as string | undefined })),
      memberships.some((row) => (row.userId as string) === userId),
    );
    if (lock.locked) throw ctx.error("CONFLICT", lock.reason!);

    // The new address must be free, or the correction would merge two people.
    const users = await ctx.db.unsafe.list("User");
    if (users.some((row) => (row.id as string) !== userId && normalizeSpeakerEmail(row.email as string) === email)) {
      throw ctx.error("CONFLICT", "Another account already uses that email.");
    }
    const eventProfiles = (await ctx.db.unsafe.query("SpeakerProfile", { eventId: args.eventId })).filter((row) =>
      matchesEventAnchor(row, args.eventId, event.orgId as string),
    );
    if (
      eventProfiles.some(
        (row) => (row.userId as string) !== userId && normalizeSpeakerEmail(row.email as string) === email,
      )
    ) {
      throw ctx.error("CONFLICT", "A speaker with this email already exists for the event.");
    }

    const now = new Date().toISOString();
    await ctx.db.unsafe.update("User", userId, { email });
    for (const row of owned) {
      await ctx.db.unsafe.update("SpeakerProfile", row.id as string, { email, updatedAt: now });
    }
    // Notes are filed against the address rather than the user, so they would
    // be orphaned by the rename.
    const notes = (await ctx.db.unsafe.query("SpeakerNote", { orgId: event.orgId as string })).filter(
      (row) => normalizeSpeakerEmail(row.email as string) === previous,
    );
    for (const note of notes) {
      await ctx.db.unsafe.update("SpeakerNote", note.id as string, { email });
    }
    return { changed: true, email, profiles: owned.length, notes: notes.length, snapshots };
  },
});

// Rewrite this person's entry in every submission's frozen participant list.
// Keyed on userId, so it repairs the row no matter which address it froze.
async function syncParticipantSnapshots(
  ctx: { db: { unsafe: { list: (e: string) => Promise<Record<string, unknown>[]>; update: (e: string, id: string, patch: Record<string, unknown>) => Promise<unknown> } } },
  orgId: string,
  userId: string,
  email: string,
  name: string,
): Promise<number> {
  // Submission is queryable by eventId, not orgId, and this person's talks can
  // span several events in the workspace — so scan and filter.
  const submissions = (await ctx.db.unsafe.list("Submission")).filter((row) => row.orgId === orgId);
  let changed = 0;
  for (const submission of submissions) {
    const snapshot = submission.participantSnapshotJson;
    if (!Array.isArray(snapshot)) continue;
    let dirty = false;
    const next = snapshot.map((entry) => {
      const row = entry as Record<string, unknown>;
      if (row.userId !== userId) return row;
      if (row.email === email && row.name === name) return row;
      dirty = true;
      return { ...row, email, name };
    });
    if (!dirty) continue;
    await ctx.db.unsafe.update("Submission", submission.id as string, { participantSnapshotJson: next });
    changed += 1;
  }
  return changed;
}
