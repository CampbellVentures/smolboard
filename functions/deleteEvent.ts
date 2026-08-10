import { mutation, v } from "@pylonsync/functions";

// Deleting an event removes everything that hangs off it. The bare entity
// delete used to leave orphans (profiles, sessions, reviews…) that haunted
// cross-event views like the speaker directory.
const CHILD_ENTITIES = [
  "SubmissionForm",
  "Submission",
  "SubmissionDraft",
  "SubmissionParticipantInvite",
  "SpeakerProfile",
  "SpeakerFile",
  "DeliverableSlot",
  "DeliverableVersion",
  "DeliverableComment",
  "ReviewRound",
  "ReviewRoundReviewer",
  "ReviewAssignment",
  "Review",
  "Room",
  "Track",
  "Session",
  "SessionContentRevision",
  "TaskTemplate",
  "SpeakerTask",
  "EmailTemplate",
  "EmailLog",
  "CopilotThread",
  "CalendarInvite",
] as const;

export default mutation<{ eventId: string }, { deleted: boolean; rows: number }>({
  args: { eventId: v.id("Event") },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) return { deleted: false, rows: 0 };
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    let rows = 0;
    for (const entity of CHILD_ENTITIES) {
      const children = (await ctx.db.unsafe.query(entity, { eventId: args.eventId })).filter(
        (row) => row.orgId === event.orgId,
      );
      for (const row of children) {
        // Copilot messages hang off threads, not the event.
        if (entity === "CopilotThread") {
          const messages = await ctx.db.unsafe.query("CopilotMessage", { threadId: row.id as string });
          for (const message of messages) {
            await ctx.db.unsafe.delete("CopilotMessage", message.id as string);
            rows += 1;
          }
        }
        await ctx.db.unsafe.delete(entity, row.id as string);
        rows += 1;
      }
    }
    await ctx.db.unsafe.delete("Event", args.eventId);
    return { deleted: true, rows: rows + 1 };
  },
});
