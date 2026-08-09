import { mutation, v } from "@pylonsync/functions";
import { matchesEventAnchor } from "../lib/tenantAnchors";

const KINDS = ["confirm", "upload", "form", "link"];
const APPLIES_TO = ["accepted", "all", "selected"];

export default mutation({
  args: {
    eventId: v.id("Event"),
    templateId: v.optional(v.id("TaskTemplate")),
    title: v.string(),
    description: v.optional(v.string()),
    kind: v.string(),
    target: v.optional(v.string()),
    responsePrompt: v.optional(v.string()),
    dueAt: v.optional(v.string()),
    appliesTo: v.string(),
    speakerUserIds: v.optional(v.array(v.id("User"))),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    const title = args.title.trim();
    if (!title) throw ctx.error("INVALID_ARGS", "Task title is required.");
    if (!KINDS.includes(args.kind)) throw ctx.error("INVALID_ARGS", "Unsupported task type.");
    if (!APPLIES_TO.includes(args.appliesTo)) {
      throw ctx.error("INVALID_ARGS", "Task audience must be accepted, all, or selected speakers.");
    }
    if (args.kind === "link" && !args.target?.trim()) {
      throw ctx.error("INVALID_ARGS", "Link tasks require a destination URL.");
    }
    if (args.dueAt && !Number.isFinite(new Date(args.dueAt).getTime())) {
      throw ctx.error("INVALID_ARGS", "Due date is invalid.");
    }

    const responsePrompt = args.responsePrompt?.trim();
    const formJson =
      args.kind === "form"
        ? JSON.stringify([
            {
              key: "response",
              type: "long_text",
              label: responsePrompt || "Your response",
              required: true,
            },
          ])
        : undefined;
    const payload = {
      title,
      description: args.description?.trim() || undefined,
      kind: args.kind,
      target: args.kind === "link" || args.kind === "upload" ? args.target?.trim() || undefined : undefined,
      formJson,
      dueAt: args.dueAt || undefined,
      appliesTo: args.appliesTo,
    };

    let templateId = args.templateId;
    if (templateId) {
      const existing = await ctx.db.unsafe.get("TaskTemplate", templateId);
      if (!existing || existing.eventId !== args.eventId || existing.orgId !== event.orgId) {
        throw ctx.error("NOT_FOUND", "Task template not found.");
      }
      await ctx.db.unsafe.update("TaskTemplate", templateId, payload);
    } else {
      const existing = await ctx.db.unsafe.query("TaskTemplate", { eventId: args.eventId });
      templateId = await ctx.db.unsafe.insert("TaskTemplate", {
        orgId: event.orgId as string,
        eventId: args.eventId,
        ...payload,
        sortOrder: existing.filter((template) =>
          matchesEventAnchor(template, args.eventId, event.orgId as string),
        ).length,
      });
    }

    // Creating a task after speakers were accepted must still assign it. This
    // is idempotent and also fills any gaps when an existing template changes.
    const profiles = (await ctx.db.unsafe.query("SpeakerProfile", { eventId: args.eventId })).filter(
      (profile) => profile.orgId === event.orgId,
    );
    const profileUsers = new Set(profiles.map((profile) => profile.userId as string));
    const submissions = await ctx.db.unsafe.query("Submission", { eventId: args.eventId });
    const accepted = new Set(
      submissions
        .filter((submission) => submission.orgId === event.orgId && submission.status === "accepted")
        .map((submission) => submission.speakerUserId as string),
    );
    for (const profile of profiles) {
      if (profile.status === "confirmed") accepted.add(profile.userId as string);
    }
    const requested = new Set(args.speakerUserIds ?? []);
    if (args.appliesTo === "selected" && requested.size === 0) {
      throw ctx.error("INVALID_ARGS", "Select at least one speaker for this task.");
    }
    if ([...requested].some((userId) => !profileUsers.has(userId))) {
      throw ctx.error("NOT_FOUND", "A selected speaker does not belong to this event.");
    }
    const eligible =
      args.appliesTo === "selected"
        ? requested
        : args.appliesTo === "all"
          ? profileUsers
          : accepted;
    const assigned = (await ctx.db.unsafe.query("SpeakerTask", { taskTemplateId: templateId })).filter(
      (task) => task.eventId === args.eventId && task.orgId === event.orgId,
    );
    const alreadyAssigned = new Set(assigned.map((task) => task.speakerUserId as string));
    if (args.appliesTo === "selected") {
      for (const task of assigned) {
        if (!eligible.has(task.speakerUserId as string)) {
          const slots = await ctx.db.unsafe.query("DeliverableSlot", { taskId: task.id as string });
          if (slots.some((slot) => matchesEventAnchor(slot, args.eventId, event.orgId as string))) {
            throw ctx.error("INVALID_ARGS", "A speaker with deliverable history cannot be removed from this task.");
          }
          await ctx.db.unsafe.delete("SpeakerTask", task.id as string);
          alreadyAssigned.delete(task.speakerUserId as string);
        }
      }
    }
    let tasksCreated = 0;
    for (const speakerUserId of eligible) {
      if (alreadyAssigned.has(speakerUserId)) continue;
      await ctx.db.unsafe.insert("SpeakerTask", {
        orgId: event.orgId as string,
        eventId: args.eventId,
        taskTemplateId: templateId,
        speakerUserId,
        status: "pending",
      });
      tasksCreated++;
    }

    return { id: templateId, tasksCreated };
  },
});
