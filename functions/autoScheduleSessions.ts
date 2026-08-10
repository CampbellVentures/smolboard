import { mutation, v } from "@pylonsync/functions";
import { logActivity } from "../lib/activity";
import { computeAutoSchedule, type DaySpec, type SchedulableSession } from "../lib/auto-schedule";
import { parseJson } from "../lib/types";

// One-click agenda packing: place every unscheduled session into the earliest
// conflict-free slot (9:00–17:00 event-local, existing sessions and speaker
// double-bookings respected). Schedule fields only — content approval and
// publication state are untouched, and the organizer can still drag to adjust.

function tzOffsetMinutes(timeZone: string, utcMs: number): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
  );
  return (asUtc - utcMs) / 60_000;
}

function speakerIds(raw: unknown): string[] {
  const value = parseJson<unknown>(raw);
  return Array.isArray(value) ? (value as string[]) : [];
}

export default mutation<
  { eventId: string },
  { placed: number; unplaced: number }
>({
  args: { eventId: v.id("Event") },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    if (!event.startDate) {
      throw ctx.error("INVALID_ARGS", "Set the event dates before auto-scheduling.");
    }
    const rooms = (await ctx.db.unsafe.query("Room", { eventId: args.eventId }))
      .filter((room) => room.orgId === event.orgId)
      .sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number));
    if (rooms.length === 0) {
      throw ctx.error("INVALID_ARGS", "Add at least one room before auto-scheduling.");
    }

    const timeZone = (event.timezone as string) || "UTC";
    const start = String(event.startDate).slice(0, 10);
    const end = String(event.endDate || event.startDate).slice(0, 10);
    const days: DaySpec[] = [];
    for (
      let cursor = new Date(`${start}T00:00:00Z`);
      days.length < 7 && cursor.toISOString().slice(0, 10) <= end;
      cursor = new Date(cursor.getTime() + 86_400_000)
    ) {
      const day = cursor.toISOString().slice(0, 10);
      days.push({ day, tzOffsetMin: tzOffsetMinutes(timeZone, cursor.getTime() + 43_200_000) });
    }

    const sessions = (await ctx.db.unsafe.query("Session", { eventId: args.eventId })).filter(
      (session) => session.orgId === event.orgId,
    );
    const toSchedulable = (session: (typeof sessions)[number]): SchedulableSession => ({
      id: session.id as string,
      kind: session.kind as string,
      startTime: session.startTime as string | null,
      endTime: session.endTime as string | null,
      roomId: session.roomId as string | null,
      speakerUserIds: speakerIds(session.speakerUserIdsJson),
    });
    const unscheduled = sessions.filter((s) => !s.startTime).map(toSchedulable);
    const scheduled = sessions.filter((s) => s.startTime && s.endTime).map(toSchedulable);

    const { placements, unplacedIds } = computeAutoSchedule(
      unscheduled,
      scheduled,
      rooms.map((room) => room.id as string),
      days,
    );
    for (const placement of placements) {
      await ctx.db.unsafe.update("Session", placement.sessionId, {
        startTime: placement.startTime,
        endTime: placement.endTime,
        roomId: placement.roomId,
      });
    }
    await logActivity(ctx, {
      orgId: event.orgId as string,
      eventId: args.eventId,
      kind: "agenda.autoscheduled",
      message: `Auto-schedule placed ${placements.length} session${placements.length === 1 ? "" : "s"}`,
      href: `/dashboard/events/${args.eventId}/agenda`,
    });
    return { placed: placements.length, unplaced: unplacedIds.length };
  },
});
