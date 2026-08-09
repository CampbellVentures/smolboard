import { query } from "@pylonsync/functions";
import { parseSpeakerUserIds, type PortalSession } from "../lib/portal";

export default query<Record<string, never>, { sessions: PortalSession[] }>({
  args: {},
  async handler(ctx) {
    const userId = ctx.auth.userId;
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", { userId });
    const sessions: PortalSession[] = [];

    for (const profile of profiles) {
      const eventId = profile.eventId as string;
      const event = await ctx.db.unsafe.get("Event", eventId);
      if (!event) continue;
      const org = await ctx.db.unsafe.get("Org", event.orgId as string);
      const [eventSessions, rooms] = await Promise.all([
        ctx.db.unsafe.query("Session", { eventId }),
        ctx.db.unsafe.query("Room", { eventId }),
      ]);
      const roomNames = new Map(rooms.map((room) => [room.id as string, room.name as string]));

      for (const session of eventSessions) {
        if (!session.startTime || !session.endTime) continue;
        if (!parseSpeakerUserIds(session.speakerUserIdsJson).includes(userId)) continue;
        sessions.push({
          id: session.id as string,
          eventName: event.name as string,
          eventSlug: event.slug as string,
          orgSlug: (org?.slug as string | undefined) ?? null,
          title: session.title as string,
          startTime: session.startTime as string,
          endTime: session.endTime as string,
          timezone: (event.timezone as string) || "UTC",
          roomName: session.roomId
            ? roomNames.get(session.roomId as string)
            : (event.location as string | undefined),
          schedulePublished: event.schedulePublished === true,
        });
      }
    }

    sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return { sessions };
  },
});
