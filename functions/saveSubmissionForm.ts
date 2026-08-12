import { mutation, v } from "@pylonsync/functions";
import { parseHandoffConfig, SESSION_KINDS } from "../lib/submission-handoff";
import { logActivity } from "../lib/activity";

const STATUSES = ["draft", "open", "closed"];

export default mutation({
  args: {
    eventId: v.id("Event"),
    formId: v.optional(v.id("SubmissionForm")),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    opensAt: v.optional(v.datetime()),
    closesAt: v.optional(v.datetime()),
    fieldsJson: v.optional(v.json()),
    routingJson: v.optional(v.json()),
    handoffMappingsJson: v.optional(v.json()),
    confirmationMessage: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    if (!STATUSES.includes(args.status)) throw ctx.error("INVALID_ARGS", "Invalid form status.");
    const name = args.name.trim();
    const slug = args.slug.trim();
    if (!name || !slug) throw ctx.error("INVALID_ARGS", "Form name and slug are required.");
    if (args.opensAt && args.closesAt && Date.parse(args.opensAt) >= Date.parse(args.closesAt)) {
      throw ctx.error("INVALID_ARGS", "The CFP close time must be after its open time.");
    }
    const handoff = args.handoffMappingsJson === undefined
      ? undefined
      : parseHandoffConfig(args.handoffMappingsJson);
    if (args.handoffMappingsJson !== undefined && !handoff) {
      throw ctx.error("INVALID_ARGS", "Save explicit format and track mapping choices.");
    }
    if (handoff) {
      const tracks = (await ctx.db.unsafe.query("Track", { eventId: args.eventId }))
        .filter((track) => track.orgId === event.orgId);
      const trackIds = new Set(tracks.map((track) => track.id as string));
      if (Object.values(handoff.trackValues).some((trackId) => !trackIds.has(trackId))) {
        throw ctx.error("NOT_FOUND", "A mapped track does not belong to this event.");
      }
      // Track ids were checked but format values were not, so a mapping could
      // be saved pointing at a kind no session can have. It then read as
      // "Unresolved" in the builder with nothing explaining why.
      const badKind = Object.values(handoff.formatValues).find((kind) => !SESSION_KINDS.has(kind));
      if (badKind) {
        throw ctx.error(
          "INVALID_ARGS",
          `"${badKind}" is not a session format. Use one of: ${[...SESSION_KINDS].join(", ")}.`,
        );
      }
    }

    const payload = {
      name,
      slug,
      description: args.description?.trim() || undefined,
      status: args.status,
      opensAt: args.opensAt,
      closesAt: args.closesAt,
      fieldsJson: args.fieldsJson,
      routingJson: args.routingJson,
      handoffMappingsJson: handoff,
      confirmationMessage: args.confirmationMessage?.trim() || undefined,
    };
    if (args.formId) {
      const form = await ctx.db.unsafe.get("SubmissionForm", args.formId);
      if (
        !form ||
        form.eventId !== args.eventId ||
        form.orgId !== event.orgId
      ) {
        throw ctx.error("NOT_FOUND", "Submission form not found.");
      }
      await ctx.db.unsafe.update("SubmissionForm", args.formId, payload);
      if (form.status !== "open" && args.status === "open") {
        await logActivity(ctx, {
          orgId: event.orgId as string,
          eventId: args.eventId,
          kind: "form.published",
          message: `Submission form “${name}” is now open`,
          href: `/dashboard/events/${args.eventId}/forms`,
        });
      }
      return { id: args.formId };
    }
    const id = await ctx.db.unsafe.insert("SubmissionForm", {
      orgId: event.orgId as string,
      eventId: args.eventId,
      ...payload,
    });
    return { id };
  },
});
