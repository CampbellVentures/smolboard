import { mutation, v } from "@pylonsync/functions";
import { normalizeSpeakerEmail } from "../lib/speakers";

const STAGES = ["prospect", "contacted", "invited", "confirmed", "declined"];

// Create or update a directory contact. Stage moves write a ContactStageEvent
// so the pipeline carries its own history rather than only a current value.
export default mutation<
  {
    orgId: string;
    contactId?: string;
    name: string;
    email: string;
    company?: string;
    jobTitle?: string;
    bio?: string;
    headshotUrl?: string;
    stage?: string;
    tags?: string[];
    notes?: string;
  },
  { id: string; stageChanged: boolean }
>({
  args: {
    orgId: v.id("Org"),
    contactId: v.optional(v.id("Contact")),
    name: v.string(),
    email: v.string(),
    company: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    bio: v.optional(v.string()),
    headshotUrl: v.optional(v.string()),
    stage: v.optional(v.string()),
    tags: v.optional(v.json()),
    notes: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const member = await ctx.requireMember(args.orgId, { role: ["owner", "admin"] });
    const stage = args.stage && STAGES.includes(args.stage) ? args.stage : "prospect";
    const email = normalizeSpeakerEmail(args.email);
    const name = args.name.trim();
    if (!name || !email) throw ctx.error("INVALID_ARGS", "Name and email are required.");
    const actorName = (member as { displayName?: string } | undefined)?.displayName;

    const payload = {
      name,
      email,
      company: args.company?.trim() || undefined,
      jobTitle: args.jobTitle?.trim() || undefined,
      bio: args.bio?.trim() || undefined,
      headshotUrl: args.headshotUrl?.trim() || undefined,
      tagsJson: Array.isArray(args.tags) ? args.tags : undefined,
      notes: args.notes?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    if (args.contactId) {
      const existing = await ctx.db.unsafe.get("Contact", args.contactId);
      if (!existing || existing.orgId !== args.orgId) {
        throw ctx.error("NOT_FOUND", "Contact not found.");
      }
      const from = existing.stage as string;
      await ctx.db.unsafe.update("Contact", args.contactId, { ...payload, stage });
      if (from !== stage) {
        await ctx.db.unsafe.insert("ContactStageEvent", {
          orgId: args.orgId,
          contactId: args.contactId,
          fromStage: from,
          toStage: stage,
          actorName,
        });
      }
      return { id: args.contactId, stageChanged: from !== stage };
    }

    const duplicate = (await ctx.db.unsafe.query("Contact", { orgId: args.orgId })).find(
      (row) => normalizeSpeakerEmail(row.email as string) === email,
    );
    if (duplicate) throw ctx.error("CONFLICT", "A contact with that email already exists.");

    const id = (await ctx.db.unsafe.insert("Contact", {
      orgId: args.orgId,
      ...payload,
      stage,
    })) as string;
    await ctx.db.unsafe.insert("ContactStageEvent", {
      orgId: args.orgId,
      contactId: id,
      toStage: stage,
      actorName,
    });
    return { id, stageChanged: true };
  },
});
