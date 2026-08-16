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
    const owned = await ctx.db.unsafe.query("SpeakerProfile", { userId });

    if (previous === email) {
      // Idempotent repair path: nothing moves, so it is safe for claimed
      // accounts. A submission freezes its participants at submit time, and
      // the review sheet renders that snapshot under "Participants" — this
      // fixes drift from earlier renames. It also clears a pending claim
      // reset, which is the organizer's undo for a reset made by mistake.
      const snapshots = await syncParticipantSnapshots(
        ctx,
        event.orgId as string,
        userId,
        email,
        profile!.name as string,
      );
      await clearClaimResets(ctx, owned);
      return { changed: false, email, snapshots };
    }

    const memberships = await ctx.db.unsafe.query("OrgMember", { userId });
    const lock = speakerEmailLock(
      owned.map((row) => ({ claimStatus: row.claimStatus as string | undefined })),
      memberships.length > 0,
    );
    if (lock.locked) throw ctx.error("CONFLICT", lock.reason!);
    // A claim reset unlocks the profile above, but the account behind it may
    // still belong to a real person. A password, a live claim, or a revoked
    // claim (claimResetAt survives as the record that someone once proved
    // inbox control) all mean sessions may exist on this account. Renaming it
    // would hand those sessions the new address — when the rightful owner
    // later requests a magic code, they sign in to the wrong person's
    // account. Organizer-created shells have none of these (emailVerified is
    // stamped at import as the organizer vouching, so it is NOT the signal),
    // and the plain typo repair stays open for them.
    if (user.passwordHash || owned.some((row) => row.claimedAt || row.claimResetAt)) {
      throw ctx.error(
        "CONFLICT",
        "Someone has signed in to this speaker account. Correcting the address would move their access; invite the right email as a new speaker instead.",
      );
    }

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

    // All guards passed — only now touch the participant snapshots, so a
    // rejected correction cannot leave the review sheet renamed to an address
    // the function refused.
    const snapshots = await syncParticipantSnapshots(
      ctx,
      event.orgId as string,
      userId,
      email,
      profile!.name as string,
    );
    const now = new Date().toISOString();
    await ctx.db.unsafe.update("User", userId, { email });
    for (const row of owned) {
      await ctx.db.unsafe.update("SpeakerProfile", row.id as string, {
        email,
        claimResetAt: null,
        updatedAt: now,
      });
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

// The organizer's correction is the recovery act for a claim reset; once it
// lands, the (new) address may claim again.
async function clearClaimResets(
  ctx: { db: { unsafe: { update: (e: string, id: string, patch: Record<string, unknown>) => Promise<unknown> } } },
  owned: Record<string, unknown>[],
): Promise<void> {
  for (const row of owned) {
    if (!row.claimResetAt) continue;
    await ctx.db.unsafe.update("SpeakerProfile", row.id as string, {
      claimResetAt: null,
      updatedAt: new Date().toISOString(),
    });
  }
}

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
