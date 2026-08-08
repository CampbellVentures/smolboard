import { mutation, v } from "@pylonsync/functions";
import { findConflicts, type AgendaSession } from "../lib/agenda";

// Agent tool: conflict-checked scheduling. Unlike the drag-and-drop grid
// (which paints conflicts after the fact so a human can decide), the agent
// path REFUSES conflicting placements and returns the collisions — the model
// relays them and proposes an alternative.
export default mutation({
  args: {
    eventId: v.id("Event"),
    submissionId: v.optional(v.id("Submission")),
    sessionId: v.optional(v.id("Session")),
    roomName: v.string(),
    startTime: v.string(),
    durationMinutes: v.optional(v.float()),
  },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string);

    const start = new Date(args.startTime);
    if (!Number.isFinite(start.getTime())) {
      throw ctx.error("INVALID_ARGS", "startTime must be ISO 8601.");
    }
    const duration = args.durationMinutes && args.durationMinutes > 0 ? args.durationMinutes : 30;
    const end = new Date(start.getTime() + duration * 60_000);

    // ctx.db.unsafe (all below): membership verified above; org's own rows.
    const rooms = await ctx.db.unsafe.query("Room", { eventId: args.eventId });
    const room = rooms.find(
      (r) => (r.name as string).toLowerCase() === args.roomName.trim().toLowerCase(),
    );
    if (!room) {
      return {
        scheduled: false,
        error: `No room named "${args.roomName}". Rooms: ${rooms.map((r) => r.name).join(", ") || "none yet"}.`,
      };
    }

    let title: string;
    let speakerUserIds: string[] = [];
    let existingSessionId: string | undefined;
    if (args.sessionId) {
      const ses = await ctx.db.unsafe.get("Session", args.sessionId);
      if (!ses || ses.eventId !== args.eventId) throw ctx.error("NOT_FOUND", "Session not found.");
      title = ses.title as string;
      speakerUserIds = Array.isArray(ses.speakerUserIdsJson) ? (ses.speakerUserIdsJson as string[]) : [];
      existingSessionId = args.sessionId;
    } else if (args.submissionId) {
      const sub = await ctx.db.unsafe.get("Submission", args.submissionId);
      if (!sub || sub.eventId !== args.eventId) throw ctx.error("NOT_FOUND", "Submission not found.");
      if (sub.status !== "accepted") {
        return { scheduled: false, error: `"${sub.title}" is ${sub.status}, not accepted — accept it first.` };
      }
      const prior = await ctx.db.unsafe.query("Session", { eventId: args.eventId, submissionId: args.submissionId });
      if (prior[0]) existingSessionId = prior[0].id as string;
      title = sub.title as string;
      speakerUserIds = [sub.speakerUserId as string];
    } else {
      throw ctx.error("INVALID_ARGS", "Pass submissionId or sessionId.");
    }

    // Dry-run the placement against the current agenda.
    const sessions = await ctx.db.unsafe.query("Session", { eventId: args.eventId });
    const candidate: AgendaSession = {
      id: existingSessionId ?? "candidate",
      title,
      roomId: room.id as string,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      speakerUserIds,
    };
    const others: AgendaSession[] = sessions
      .filter((s) => s.id !== existingSessionId)
      .map((s) => ({
        id: s.id as string,
        title: s.title as string,
        roomId: s.roomId as string | undefined,
        startTime: s.startTime as string | undefined,
        endTime: s.endTime as string | undefined,
        speakerUserIds: Array.isArray(s.speakerUserIdsJson) ? (s.speakerUserIdsJson as string[]) : [],
      }));
    const conflicts = findConflicts([...others, candidate]).filter(
      (c) => c.a === candidate.id || c.b === candidate.id,
    );
    if (conflicts.length > 0) {
      const detail = conflicts.map((c) => {
        const otherId = c.a === candidate.id ? c.b : c.a;
        const other = others.find((s) => s.id === otherId);
        return c.kind === "room_overlap"
          ? `room overlap with "${other?.title}" in ${room.name}`
          : `speaker double-booked against "${other?.title}"`;
      });
      return { scheduled: false, conflicts: detail };
    }

    if (existingSessionId) {
      await ctx.db.unsafe.update("Session", existingSessionId, {
        roomId: room.id as string,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      return { scheduled: true, sessionId: existingSessionId, title, room: room.name, start: start.toISOString(), end: end.toISOString() };
    }
    const id = await ctx.db.unsafe.insert("Session", {
      orgId: event.orgId as string,
      eventId: args.eventId,
      submissionId: args.submissionId,
      title,
      roomId: room.id as string,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      speakerUserIdsJson: speakerUserIds,
      kind: "talk",
    });
    return { scheduled: true, sessionId: id, title, room: room.name, start: start.toISOString(), end: end.toISOString() };
  },
});
