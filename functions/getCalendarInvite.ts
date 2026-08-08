import { query, v } from "@pylonsync/functions";
import { buildCalendarUrls, buildIcsInvite } from "../lib/ics";

interface CalendarInviteResult {
  filename: string;
  content: string;
  title: string;
  start: string;
  end: string;
  urls: { ics: string; google: string; outlook: string };
}

export default query<{ token: string }, CalendarInviteResult | null>({
  auth: "public",
  args: { token: v.string() },
  async handler(ctx, args) {
    if (args.token.length < 40) return null;
    const invite = await ctx.db.unsafe.lookup("CalendarInvite", "token", args.token);
    if (!invite) return null;
    const session = await ctx.db.unsafe.get("Session", invite.sessionId as string);
    const event = session
      ? await ctx.db.unsafe.get("Event", session.eventId as string)
      : null;
    const profile = await ctx.db.unsafe.query("SpeakerProfile", {
      eventId: invite.eventId as string,
      userId: invite.speakerUserId as string,
    });
    const room = session?.roomId
      ? await ctx.db.unsafe.get("Room", session.roomId as string)
      : null;
    if (!session?.startTime || !session.endTime || !event || !profile[0]?.email) return null;

    const base = ctx.env.PYLON_PUBLIC_URL || "http://localhost:4321";
    const icsUrl = `${base}/calendar/${args.token}`;
    const input = {
      start: session.startTime as string,
      end: session.endTime as string,
      summary: session.title as string,
      description: session.description as string | undefined,
      location: (room?.name as string | undefined) || (event.location as string | undefined),
      icsUrl,
    };
    return {
      filename: `${slug(session.title as string) || "session"}.ics`,
      content: buildIcsInvite({
        uid: `${session.id as string}-${invite.speakerUserId as string}@smolboard`,
        sequence: Number(invite.sequence ?? 0),
        start: input.start,
        end: input.end,
        summary: input.summary,
        description: input.description,
        location: input.location,
        attendeeEmail: profile[0].email as string,
        url: `${base}/${event.slug as string}/schedule`,
      }),
      title: input.summary,
      start: input.start,
      end: input.end,
      urls: buildCalendarUrls(input),
    };
  },
});

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
