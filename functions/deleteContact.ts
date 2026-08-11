import { mutation, v } from "@pylonsync/functions";

// Removing a contact takes its stage history with it; speaker profiles already
// pushed into an event are separate records and stay put.
export default mutation<{ contactId: string }, { deleted: boolean }>({
  args: { contactId: v.id("Contact") },
  async handler(ctx, args) {
    const contact = await ctx.db.unsafe.get("Contact", args.contactId);
    if (!contact) return { deleted: false };
    await ctx.requireMember(contact.orgId as string, { role: ["owner", "admin"] });
    const events = await ctx.db.unsafe.query("ContactStageEvent", { contactId: args.contactId });
    for (const event of events) {
      await ctx.db.unsafe.delete("ContactStageEvent", event.id as string);
    }
    await ctx.db.unsafe.delete("Contact", args.contactId);
    return { deleted: true };
  },
});
