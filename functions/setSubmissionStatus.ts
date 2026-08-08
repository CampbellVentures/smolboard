import { mutation, v } from "@pylonsync/functions";

const STATUSES = ["submitted", "in_review", "accepted", "rejected", "waitlisted", "withdrawn"];

// Organizer-gated status change — the ONE path for accept/reject so the
// side-effects always fire together:
//   - accepted/rejected → schedules the templated speaker email
//   - accepted → materializes SpeakerTask rows from the event's TaskTemplates
// The UI batches over this for bulk actions. Round advancement is a separate
// concern (advanceSubmissionRound).
export default mutation<
  { submissionId: string; status: string; notify?: boolean },
  { id: string; status: string; emailQueued: boolean; tasksCreated: number }
>({
  args: {
    submissionId: v.id("Submission"),
    status: v.string(),
    // Bulk UIs sometimes stage several changes then notify once; default on.
    notify: v.optional(v.bool()),
  },
  async handler(ctx, args) {
    if (!STATUSES.includes(args.status)) {
      throw ctx.error("INVALID_ARGS", `Status must be one of ${STATUSES.join(", ")}.`);
    }
    const sub = await ctx.db.get("Submission", args.submissionId);
    if (!sub) throw ctx.error("NOT_FOUND", "Submission not found.");
    // Authorize against the submission's own workspace, never caller input.
    await ctx.requireMember(sub.orgId as string);

    await ctx.db.unsafe.update("Submission", args.submissionId, {
      status: args.status,
      updatedAt: new Date().toISOString(),
    });

    let tasksCreated = 0;
    if (args.status === "accepted") {
      // Materialize onboarding tasks for this speaker (idempotent: skip rows
      // that already exist from a prior accept).
      // ctx.db.unsafe: membership verified above; templates/tasks are org rows.
      const templates = await ctx.db.unsafe.query("TaskTemplate", {
        eventId: sub.eventId as string,
      });
      const existing = await ctx.db.unsafe.query("SpeakerTask", {
        eventId: sub.eventId as string,
        speakerUserId: sub.speakerUserId as string,
      });
      const have = new Set(existing.map((t) => t.taskTemplateId as string));
      for (const t of templates) {
        if (t.appliesTo === "all" || t.appliesTo === "accepted") {
          if (!have.has(t.id as string)) {
            await ctx.db.unsafe.insert("SpeakerTask", {
              orgId: sub.orgId as string,
              eventId: sub.eventId as string,
              taskTemplateId: t.id as string,
              speakerUserId: sub.speakerUserId as string,
              status: "pending",
            });
            tasksCreated++;
          }
        }
      }
    }

    let emailQueued = false;
    const notify = args.notify !== false;
    if (notify && (args.status === "accepted" || args.status === "rejected")) {
      const profiles = await ctx.db.unsafe.query("SpeakerProfile", {
        eventId: sub.eventId as string,
        userId: sub.speakerUserId as string,
      });
      const to = (profiles[0]?.email as string) ?? null;
      if (to) {
        // sendTemplatedEmail is internal:true; elevating covers this enqueue
        // (caller is already a verified org member for THIS submission's org).
        await ctx.auth.elevate({
          admin: true,
          reason: "queue accept/reject email after org-member status change",
        });
        await ctx.scheduler.runAfter(0, "sendTemplatedEmail", {
          eventId: sub.eventId as string,
          templateKey: args.status,
          toEmail: to,
          vars: {
            speaker_name: (profiles[0]?.name as string) ?? "",
            talk_title: sub.title as string,
          },
        });
        emailQueued = true;
      }
    }

    return { id: args.submissionId, status: args.status, emailQueued, tasksCreated };
  },
});
