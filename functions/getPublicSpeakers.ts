import { query, v } from "@pylonsync/functions";
import { approvedContent } from "../lib/session-content";
import type { SessionContentRevisionRow, SessionRow } from "../lib/types";

// Public speaker gallery for /<org-slug>/<event-slug>/speakers. Anonymous;
// lists ONLY speakers attached to approved session content, ONLY safe profile fields
// (no email). Gated on the published schedule like getPublicSchedule.
export default query<
  { orgSlug: string; eventSlug: string },
  {
    event: { name: string; slug: string } | null;
    published: boolean;
    speakers: {
      name: string;
      tagline: string | null;
      bio: string | null;
      company: string | null;
      jobTitle: string | null;
      headshotUrl: string | null;
      talks: string[];
      sessions: { title: string; startTime: string | null; endTime: string | null; room: string | null }[];
    }[];
  }
>({
  auth: "public",
  args: { orgSlug: v.string(), eventSlug: v.string() },
  async handler(ctx, args) {
    // ctx.db.unsafe: anonymous public feed — output filtered to safe fields,
    // gated on schedulePublished.
    const orgs = await ctx.db.unsafe.query("Org", { slug: args.orgSlug.trim().toLowerCase() });
    const events = orgs.length
      ? await ctx.db.unsafe.query("Event", {
          orgId: orgs[0].id as string,
          slug: args.eventSlug.trim().toLowerCase(),
        })
      : [];
    const event = events[0];
    if (!event || event.cfpStatus === "draft") {
      return { event: null, published: false, speakers: [] };
    }
    const safeEvent = { name: event.name as string, slug: event.slug as string };
    if (!event.schedulePublished) {
      return { event: safeEvent, published: false, speakers: [] };
    }
    const eventId = event.id as string;
    const sessions = await ctx.db.unsafe.query("Session", { eventId });
    const revisions = (await ctx.db.unsafe.query("SessionContentRevision", { eventId })).filter(
      (revision) => revision.orgId === event.orgId && revision.eventId === eventId,
    ) as unknown as SessionContentRevisionRow[];
    const profiles = (await ctx.db.unsafe.query("SpeakerProfile", { eventId })).filter(
      (profile) => profile.orgId === event.orgId && profile.eventId === eventId,
    );
    const rooms = (await ctx.db.unsafe.query("Room", { eventId })).filter(
      (room) => room.orgId === event.orgId && room.eventId === eventId,
    );
    const roomName = (id: unknown) =>
      (rooms.find((room) => room.id === id)?.name as string | undefined) ?? null;
    type SpeakerSession = {
      title: string;
      startTime: string | null;
      endTime: string | null;
      room: string | null;
    };
    const bySpeaker = new Map<string, SpeakerSession[]>();
    for (const session of sessions.filter((row) => row.orgId === event.orgId && row.eventId === eventId)) {
      const content = approvedContent(session as unknown as SessionRow, revisions);
      if (!content) continue;
      const detail: SpeakerSession = {
        title: content.title,
        startTime: (session.startTime as string) ?? null,
        endTime: (session.endTime as string) ?? null,
        room: roomName(session.roomId),
      };
      for (const uid of Array.isArray(content.speakerUserIdsJson) ? content.speakerUserIdsJson : []) {
        bySpeaker.set(uid, [...(bySpeaker.get(uid) ?? []), detail]);
      }
    }
    return {
      event: safeEvent,
      published: true,
      speakers: [...bySpeaker.entries()]
        .map(([uid, talks]) => {
          const p = profiles.find((x) => x.userId === uid);
          if (!p) return null;
          return {
            name: p.name as string,
            tagline: (p.tagline as string) ?? null,
            bio: (p.bio as string) ?? null,
            company: (p.company as string) ?? null,
            jobTitle: (p.jobTitle as string) ?? null,
            headshotUrl: (p.headshotUrl as string) ?? null,
            talks: talks.map((t) => t.title),
            sessions: talks,
          };
        })
        .filter((s): s is NonNullable<typeof s> => !!s)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});
