import { mutation, v } from "@pylonsync/functions";
import { buildCalendarUrls, buildIcsInvite, formatSessionTime } from "../lib/ics";

export default mutation({
  args: { sessionId: v.id("Session") },
  async handler(ctx, args) {
    const session = await ctx.db.unsafe.get("Session", args.sessionId);
    if (!session) throw ctx.error("NOT_FOUND", "Session not found.");
    await ctx.requireMember(session.orgId as string);
    if (!session.startTime || !session.endTime) {
      throw ctx.error("INVALID_ARGS", "Schedule the session before sending invites.");
    }
    const event = await ctx.db.unsafe.get("Event", session.eventId as string);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    const room = session.roomId
      ? await ctx.db.unsafe.get("Room", session.roomId as string)
      : null;
    const speakerUserIds = parseSpeakerIds(session.speakerUserIdsJson);
    if (speakerUserIds.length === 0) {
      throw ctx.error("INVALID_ARGS", "This session has no assigned speakers.");
    }
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", {
      eventId: session.eventId as string,
    });
    const base = ctx.env.PYLON_PUBLIC_URL || "http://localhost:4321";
    const queued: string[] = [];

    await ctx.auth.elevate({
      admin: true,
      reason: "queue organizer-requested calendar invitations",
    });

    for (const speakerUserId of speakerUserIds) {
      const profile = profiles.find((row) => row.userId === speakerUserId);
      if (!profile?.email) continue;
      const existing = await ctx.db.unsafe.query("CalendarInvite", {
        sessionId: args.sessionId,
        speakerUserId,
      });
      const current = existing[0];
      const sequence = current ? Number(current.sequence ?? 0) + 1 : 0;
      const token = current?.token as string | undefined;
      const inviteToken = token || `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
      if (current) {
        await ctx.db.unsafe.update("CalendarInvite", current.id as string, {
          sequence,
          lastSentAt: new Date().toISOString(),
        });
      } else {
        await ctx.db.unsafe.insert("CalendarInvite", {
          orgId: session.orgId as string,
          eventId: session.eventId as string,
          sessionId: args.sessionId,
          speakerUserId,
          token: inviteToken,
          sequence,
          lastSentAt: new Date().toISOString(),
        });
      }
      const links = buildCalendarUrls({
        start: session.startTime as string,
        end: session.endTime as string,
        summary: session.title as string,
        description: session.description as string | undefined,
        location: room?.name as string | undefined,
        icsUrl: `${base}/calendar/${inviteToken}`,
      });
      // Native calendar invite: the SAME stable UID + bumped SEQUENCE means a
      // reschedule UPDATES the event on the speaker's calendar instead of
      // creating a duplicate. contentType passes through verbatim (SDK
      // ≥0.3.378), so Gmail/Outlook render this as an RSVP-able invite; the
      // body's add-to-calendar links remain as the fallback.
      const ics = buildIcsInvite({
        uid: `${inviteToken}@smolboard`,
        sequence,
        start: session.startTime as string,
        end: session.endTime as string,
        summary: session.title as string,
        description: session.description as string | undefined,
        location: (room?.name as string) || (event.location as string) || undefined,
        attendeeEmail: profile.email as string,
        url: `${base}/portal`,
      });
      await ctx.scheduler.runAfter(0, "sendTemplatedEmail", {
        eventId: session.eventId as string,
        templateKey: "schedule_invite",
        toEmail: profile.email as string,
        vars: {
          speaker_name: (profile.name as string) ?? "",
          talk_title: session.title as string,
          session_time: formatSessionTime(
            session.startTime as string,
            session.endTime as string,
            (event.timezone as string) || "UTC",
          ),
          room: (room?.name as string) || (event.location as string) || "To be announced",
          calendar_links: `Download .ics: ${links.ics}\nGoogle Calendar: ${links.google}\nOutlook: ${links.outlook}`,
        },
        attachments: [
          {
            filename: "invite.ics",
            contentType: "text/calendar; method=REQUEST",
            content: Buffer.from(ics, "utf8").toString("base64"),
          },
        ],
      });
      queued.push(speakerUserId);
    }
    return { queued: queued.length };
  },
});

function parseSpeakerIds(raw: unknown): string[] {
  // json column is parsed-on-read since 0.3.378; the string branch covers
  // rows written before the migration.
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === "string");
  if (typeof raw !== "string") return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
