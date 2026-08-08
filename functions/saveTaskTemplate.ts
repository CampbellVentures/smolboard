import { mutation, v } from "@pylonsync/functions";

const KINDS = ["confirm", "upload", "form", "link"];
const APPLIES_TO = ["accepted", "all"];

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
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string);

    const title = args.title.trim();
    if (!title) throw ctx.error("INVALID_ARGS", "Task title is required.");
    if (!KINDS.includes(args.kind)) throw ctx.error("INVALID_ARGS", "Unsupported task type.");
    if (!APPLIES_TO.includes(args.appliesTo)) {
      throw ctx.error("INVALID_ARGS", "Task audience must be accepted speakers or all speakers.");
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
      if (!existing || existing.eventId !== args.eventId) {
        throw ctx.error("NOT_FOUND", "Task template not found.");
      }
      await ctx.db.unsafe.update("TaskTemplate", templateId, payload);
    } else {
      const existing = await ctx.db.unsafe.query("TaskTemplate", { eventId: args.eventId });
      templateId = await ctx.db.unsafe.insert("TaskTemplate", {
        orgId: event.orgId as string,
        eventId: args.eventId,
        ...payload,
        sortOrder: existing.length,
      });
    }

    // Creating a task after speakers were accepted must still assign it. This
    // is idempotent and also fills any gaps when an existing template changes.
    const submissions = await ctx.db.unsafe.query("Submission", { eventId: args.eventId });
    const eligible = new Set(
      submissions
        .filter((submission) => args.appliesTo === "all" || submission.status === "accepted")
        .map((submission) => submission.speakerUserId as string),
    );
    const assigned = await ctx.db.unsafe.query("SpeakerTask", { taskTemplateId: templateId });
    const alreadyAssigned = new Set(assigned.map((task) => task.speakerUserId as string));
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
