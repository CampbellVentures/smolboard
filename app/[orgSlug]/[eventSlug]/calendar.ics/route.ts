import type { RawRouteHandler } from "@pylonsync/react";
import { buildScheduleCalendar } from "@/lib/ics";
import { approvedContent } from "@/lib/session-content";
import type {
  EventRow,
  OrgRow,
  RoomRow,
  SessionContentRevisionRow,
  SessionRow,
} from "@/lib/types";

// Subscribable calendar feed for the published schedule. Route-handler db
// bypasses policies, so this handler enforces the public contract itself:
// non-draft event, published schedule, scheduled sessions only, and the SAME
// approved-content gate as getPublicSchedule (approved revision's title and
// description — never the live draft). Anonymous by design — calendar apps
// poll without cookies.
//
// ?sessions=<id>,<id> narrows the feed to one attendee's picks, which is what
// the itinerary widget's "Add to calendar" sends. The ids are filtered against
// the same published set the full feed serves, so an unknown or unpublished id
// simply matches nothing.
export const GET: RawRouteHandler<{ orgSlug: string; eventSlug: string }> = async ({
  params,
  searchParams,
  db,
}) => {
  const orgs = await db.list<OrgRow>("Org");
  const org = orgs.find((row) => row.slug === params.orgSlug);
  if (!org) return { status: 404, body: "Not found" };
  const events = await db.query<EventRow>("Event", { orgId: org.id });
  const event = events.find((row) => row.slug === params.eventSlug);
  if (!event || event.cfpStatus === "draft" || !event.schedulePublished) {
    return { status: 404, body: "Not found" };
  }
  const [sessions, rooms, revisions] = await Promise.all([
    db.query<SessionRow>("Session", { eventId: event.id }),
    db.query<RoomRow>("Room", { eventId: event.id }),
    db.query<SessionContentRevisionRow>("SessionContentRevision", { eventId: event.id }),
  ]);
  const roomName = new Map(rooms.map((room) => [room.id, room.name]));
  const picked = (searchParams.sessions ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const wanted = picked.length > 0 ? new Set(picked) : null;
  const url = `https://www.smolboard.app/${params.orgSlug}/${params.eventSlug}`;
  const ics = buildScheduleCalendar({
    calendarName: wanted ? `${event.name} — my schedule` : event.name,
    events: sessions
      .filter((session) => session.startTime && session.endTime)
      .filter((session) => !wanted || wanted.has(session.id))
      .sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1))
      .flatMap((session) => {
        const content = approvedContent(session, revisions);
        if (!content) return [];
        return [{
          uid: `${session.id}@smolboard`,
          start: session.startTime!,
          end: session.endTime!,
          summary: content.title,
          description: content.description ?? undefined,
          location:
            [roomName.get(session.roomId ?? ""), event.location].filter(Boolean).join(", ") ||
            undefined,
          url,
        }];
      }),
  });
  return {
    body: ics,
    contentType: "text/calendar; charset=utf-8",
    headers: { "Content-Disposition": `attachment; filename="${event.slug}.ics"` },
  };
};
