import type { MutationCtx } from "@pylonsync/functions";

// Materializing a speaker's onboarding checklist. Three paths add a speaker to
// an event — accepting a submission, importing a CSV, and pushing a CRM
// contact — and only the first one used to assign tasks. The other two left
// the speaker with an empty portal while the organizer's tasks page said the
// task applied to every speaker.
//
// Idempotent: a speaker who already holds a task for a template keeps the one
// row, so calling this again after a re-accept or a re-import changes nothing.
export async function assignEventTasks(
  ctx: MutationCtx<"required">,
  args: { orgId: string; eventId: string; speakerUserId: string },
): Promise<number> {
  const templates = (await ctx.db.unsafe.query("TaskTemplate", { eventId: args.eventId })).filter(
    (template) => template.orgId === args.orgId,
  );
  if (templates.length === 0) return 0;
  const existing = await ctx.db.unsafe.query("SpeakerTask", {
    eventId: args.eventId,
    speakerUserId: args.speakerUserId,
  });
  const have = new Set(
    existing
      .filter((task) => task.eventId === args.eventId && task.orgId === args.orgId)
      .map((task) => task.taskTemplateId as string),
  );
  let created = 0;
  for (const template of templates) {
    // "accepted" and "all" both land here: every path that calls this has just
    // put the speaker on the event, which is what "accepted" means outside the
    // CFP. A template scoped to named speakers ("selected") is assigned by
    // saveTaskTemplate and must not be widened here.
    if (template.appliesTo !== "all" && template.appliesTo !== "accepted") continue;
    if (have.has(template.id as string)) continue;
    await ctx.db.unsafe.insert("SpeakerTask", {
      orgId: args.orgId,
      eventId: args.eventId,
      taskTemplateId: template.id as string,
      speakerUserId: args.speakerUserId,
      status: "pending",
    });
    created++;
  }
  return created;
}
