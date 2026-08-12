import { mutation, v } from "@pylonsync/functions";
import { normalizeSpeakerEmail } from "../lib/speakers";
import { assignEventTasks } from "./_taskAssignment";

// CRM → event handoff: turn a directory contact into that event's speaker,
// carrying the profile fields across so nobody retypes them. Idempotent by
// email, and it advances the contact's pipeline stage to "invited".
export default mutation<
  { contactId: string; eventId: string },
  { profileId: string; alreadyPresent: boolean }
>({
  args: { contactId: v.id("Contact"), eventId: v.id("Event") },
  async handler(ctx, args) {
    const contact = await ctx.db.unsafe.get("Contact", args.contactId);
    if (!contact) throw ctx.error("NOT_FOUND", "Contact not found.");
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event || event.orgId !== contact.orgId) {
      throw ctx.error("NOT_FOUND", "Event not found.");
    }
    const member = await ctx.requireMember(contact.orgId as string, { role: ["owner", "admin"] });
    const email = normalizeSpeakerEmail(contact.email as string);

    const existing = (await ctx.db.unsafe.query("SpeakerProfile", { eventId: args.eventId })).find(
      (row) =>
        row.orgId === contact.orgId && normalizeSpeakerEmail(row.email as string) === email,
    );
    if (existing) return { profileId: existing.id as string, alreadyPresent: true };

    // Speakers are users; reuse the account when the address is already known.
    const users = await ctx.db.unsafe.query("User", { email });
    const userId =
      (users[0]?.id as string) ??
      ((await ctx.db.unsafe.insert("User", { email, displayName: contact.name })) as string);

    const profileId = (await ctx.db.unsafe.insert("SpeakerProfile", {
      orgId: contact.orgId as string,
      eventId: args.eventId,
      userId,
      name: contact.name as string,
      email,
      company: contact.company as string | undefined,
      jobTitle: contact.jobTitle as string | undefined,
      bio: contact.bio as string | undefined,
      headshotUrl: contact.headshotUrl as string | undefined,
      tagsJson: Array.isArray(contact.tagsJson) ? contact.tagsJson : undefined,
      status: "invited",
      claimStatus: "unclaimed",
    })) as string;

    // A contact pushed onto the event is a speaker on it, so they get the
    // event's checklist rather than an empty portal.
    await assignEventTasks(ctx, {
      orgId: contact.orgId as string,
      eventId: args.eventId,
      speakerUserId: userId,
    });

    if (contact.stage !== "invited" && contact.stage !== "confirmed") {
      await ctx.db.unsafe.update("Contact", args.contactId, {
        stage: "invited",
        updatedAt: new Date().toISOString(),
      });
      await ctx.db.unsafe.insert("ContactStageEvent", {
        orgId: contact.orgId as string,
        contactId: args.contactId,
        fromStage: contact.stage as string,
        toStage: "invited",
        actorName: (member as { displayName?: string } | undefined)?.displayName,
      });
    }
    return { profileId, alreadyPresent: false };
  },
});
