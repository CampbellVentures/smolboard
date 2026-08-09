import { query, v } from "@pylonsync/functions";

// Agent tool: onboarding status per speaker — who still owes what.
export default query({
  args: { eventId: v.id("Event") },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    // ctx.db.unsafe: membership verified above.
    const tasks = await ctx.db.unsafe.query("SpeakerTask", { eventId: args.eventId });
    const templates = await ctx.db.unsafe.query("TaskTemplate", { eventId: args.eventId });
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", { eventId: args.eventId });

    const now = Date.now();
    const bySpeaker: Record<
      string,
      { speakerUserId: string; name: string; email: string; pending: { task: string; dueAt: string | null; overdue: boolean }[] }
    > = {};
    for (const t of tasks) {
      if (t.status === "done") continue;
      const template = templates.find((x) => x.id === t.taskTemplateId);
      const profile = profiles.find((p) => p.userId === t.speakerUserId);
      if (!template || !profile) continue;
      const key = t.speakerUserId as string;
      bySpeaker[key] ??= {
        speakerUserId: key,
        name: profile.name as string,
        email: profile.email as string,
        pending: [],
      };
      const dueAt = (template.dueAt as string | undefined) ?? null;
      bySpeaker[key].pending.push({
        task: template.title as string,
        dueAt,
        overdue: !!dueAt && Date.parse(dueAt) < now,
      });
    }
    const speakers = Object.values(bySpeaker).sort((a, b) => b.pending.length - a.pending.length);
    return { count: speakers.length, speakers };
  },
});
