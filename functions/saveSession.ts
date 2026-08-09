import { mutation, v, type MutationCtx } from "@pylonsync/functions";
import { matchesEventAnchor } from "../lib/tenantAnchors";

type SessionData = {
  submissionId?: string | null;
  title?: string;
  description?: string | null;
  roomId?: string | null;
  trackId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  speakerUserIdsJson?: string[];
  kind?: string;
};

export default mutation({
  args: {
    eventId: v.id("Event"),
    sessionId: v.optional(v.id("Session")),
    data: v.json(),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });

    const data = validateData(ctx, args.data);
    const existing = args.sessionId
      ? await ctx.db.unsafe.get("Session", args.sessionId)
      : null;
    if (
      args.sessionId &&
      (!existing || !matchesEventAnchor(existing, args.eventId, event.orgId as string))
    ) {
      throw ctx.error("NOT_FOUND", "Session not found.");
    }
    const merged = { ...(existing ?? {}), ...data };
    await validateRelations(ctx, args.eventId, event.orgId as string, merged);

    if ("title" in data && !data.title?.trim()) {
      throw ctx.error("INVALID_ARGS", "Session title is required.");
    }
    const payload = cleanPayload(data);
    if (args.sessionId) {
      await ctx.db.unsafe.update("Session", args.sessionId, payload);
      return { id: args.sessionId };
    }
    const title = data.title?.trim();
    if (!title) throw ctx.error("INVALID_ARGS", "Session title is required.");
    const id = await ctx.db.unsafe.insert("Session", {
      orgId: event.orgId as string,
      eventId: args.eventId,
      ...payload,
      title,
      kind: data.kind || "talk",
    });
    return { id };
  },
});

function cleanPayload(data: SessionData) {
  const payload: Record<string, unknown> = {};
  if ("submissionId" in data) payload.submissionId = data.submissionId ?? undefined;
  if ("title" in data) {
    payload.title = data.title!.trim();
  }
  if ("description" in data) payload.description = data.description?.trim() || undefined;
  if ("roomId" in data) payload.roomId = data.roomId ?? undefined;
  if ("trackId" in data) payload.trackId = data.trackId ?? undefined;
  if ("startTime" in data) payload.startTime = data.startTime ?? undefined;
  if ("endTime" in data) payload.endTime = data.endTime ?? undefined;
  if ("speakerUserIdsJson" in data) payload.speakerUserIdsJson = data.speakerUserIdsJson;
  if ("kind" in data) payload.kind = data.kind?.trim() || "talk";
  return payload;
}

function validateData(ctx: MutationCtx<"required">, raw: unknown): SessionData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw ctx.error("INVALID_ARGS", "Session data must be an object.");
  }
  const data = raw as Record<string, unknown>;
  const allowed = new Set([
    "submissionId",
    "title",
    "description",
    "roomId",
    "trackId",
    "startTime",
    "endTime",
    "speakerUserIdsJson",
    "kind",
  ]);
  if (Object.keys(data).some((key) => !allowed.has(key))) {
    throw ctx.error("INVALID_ARGS", "Session data contains unsupported fields.");
  }
  for (const key of ["submissionId", "description", "roomId", "trackId", "startTime", "endTime"] as const) {
    const value = data[key];
    if (value !== undefined && value !== null && typeof value !== "string") {
      throw ctx.error("INVALID_ARGS", `Session ${key} must be a string or null.`);
    }
  }
  for (const key of ["title", "kind"] as const) {
    const value = data[key];
    if (value !== undefined && typeof value !== "string") {
      throw ctx.error("INVALID_ARGS", `Session ${key} must be a string.`);
    }
  }
  if (
    data.speakerUserIdsJson !== undefined &&
    (!Array.isArray(data.speakerUserIdsJson) ||
      data.speakerUserIdsJson.some((value) => typeof value !== "string"))
  ) {
    throw ctx.error("INVALID_ARGS", "Session speakers must be user ids.");
  }
  return data as SessionData;
}

async function validateRelations(
  ctx: MutationCtx<"required">,
  eventId: string,
  orgId: string,
  data: SessionData,
) {
  for (const [entity, id] of [
    ["Submission", data.submissionId],
    ["Room", data.roomId],
    ["Track", data.trackId],
  ] as const) {
    if (!id) continue;
    const row = await ctx.db.unsafe.get(entity, id);
    if (!matchesEventAnchor(row, eventId, orgId)) {
      throw ctx.error("NOT_FOUND", `${entity} does not belong to this event.`);
    }
  }
  if (data.startTime && !Number.isFinite(new Date(data.startTime).getTime())) {
    throw ctx.error("INVALID_ARGS", "Session start time is invalid.");
  }
  if (data.endTime && !Number.isFinite(new Date(data.endTime).getTime())) {
    throw ctx.error("INVALID_ARGS", "Session end time is invalid.");
  }
  if (data.startTime && data.endTime && Date.parse(data.endTime) <= Date.parse(data.startTime)) {
    throw ctx.error("INVALID_ARGS", "Session end time must be after its start time.");
  }
  const speakerIds = Array.isArray(data.speakerUserIdsJson) ? data.speakerUserIdsJson : [];
  for (const userId of new Set(speakerIds)) {
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", { eventId, userId });
    if (!profiles.some((profile) => profile.orgId === orgId)) {
      throw ctx.error("NOT_FOUND", "Session speaker does not belong to this event.");
    }
  }
}
