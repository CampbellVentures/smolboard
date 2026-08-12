import { mutation, v } from "@pylonsync/functions";
import { matchesEventAnchor } from "../lib/tenantAnchors";
import { logActivity } from "../lib/activity";
import { assignEventTasks } from "./_taskAssignment";

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
    await ctx.requireMember(sub.orgId as string, { role: ["owner", "admin"] });

    await ctx.db.unsafe.update("Submission", args.submissionId, {
      status: args.status,
      updatedAt: new Date().toISOString(),
    });

    let tasksCreated = 0;
    if (args.status === "accepted") {
      // ctx.db.unsafe inside: membership verified above; templates and tasks
      // are org rows.
      tasksCreated = await assignEventTasks(ctx, {
        orgId: sub.orgId as string,
        eventId: sub.eventId as string,
        speakerUserId: sub.speakerUserId as string,
      });
    }

    let emailQueued = false;
    const notify = args.notify !== false;
    if (notify && (args.status === "accepted" || args.status === "rejected")) {
      const profiles = await ctx.db.unsafe.query("SpeakerProfile", {
        eventId: sub.eventId as string,
        userId: sub.speakerUserId as string,
      });
      const profile = profiles.find((candidate) =>
        matchesEventAnchor(candidate, sub.eventId as string, sub.orgId as string),
      );
      const to = (profile?.email as string) ?? null;
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
            speaker_name: (profile?.name as string) ?? "",
            talk_title: sub.title as string,
          },
        });
        emailQueued = true;
      }
    }

    await logActivity(ctx, {
      orgId: sub.orgId as string,
      eventId: sub.eventId as string,
      kind: "submission.status",
      message: `“${sub.title}” marked ${args.status.replace("_", " ")}`,
      href: `/dashboard/events/${sub.eventId}/abstracts`,
    });
    return { id: args.submissionId, status: args.status, emailQueued, tasksCreated };
  },
});
