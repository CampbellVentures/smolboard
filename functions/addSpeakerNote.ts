import { mutation, v } from "@pylonsync/functions";

// CRM note on a person (keyed by email so it follows them across events).
// Organizer-only; the email must belong to a speaker the org actually has.
export default mutation<
  { orgId: string; email: string; body: string },
  { id: string }
>({
  args: { orgId: v.id("Org"), email: v.string(), body: v.string() },
  async handler(ctx, args) {
    await ctx.requireMember(args.orgId, { role: ["owner", "admin"] });
    const body = args.body.trim();
    if (!body) throw ctx.error("INVALID_ARGS", "Write the note first.");
    if (body.length > 4000) throw ctx.error("INVALID_ARGS", "Keep notes under 4000 characters.");
    const email = args.email.trim().toLowerCase();
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", { email });
    if (!profiles.some((profile) => profile.orgId === args.orgId)) {
      throw ctx.error("NOT_FOUND", "No speaker with that email in this workspace.");
    }
    const user = await ctx.db.unsafe.get("User", ctx.auth.userId);
    const id = await ctx.db.unsafe.insert("SpeakerNote", {
      orgId: args.orgId,
      email,
      authorUserId: ctx.auth.userId,
      authorName: String(user?.displayName || user?.email || "Organizer").slice(0, 200),
      body,
    });
    return { id };
  },
});
