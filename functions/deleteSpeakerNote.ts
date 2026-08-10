import { mutation, v } from "@pylonsync/functions";

export default mutation<{ noteId: string }, { deleted: boolean }>({
  args: { noteId: v.id("SpeakerNote") },
  async handler(ctx, args) {
    const note = await ctx.db.unsafe.get("SpeakerNote", args.noteId);
    if (!note) return { deleted: false };
    await ctx.requireMember(note.orgId as string, { role: ["owner", "admin"] });
    await ctx.db.unsafe.delete("SpeakerNote", args.noteId);
    return { deleted: true };
  },
});
