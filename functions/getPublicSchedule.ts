import { query, v } from "@pylonsync/functions";

// Public schedule feed for /<org-slug>/<event-slug>/schedule — and the public
// API bonus (SPEC): POST /api/fn/getPublicSchedule. Anonymous; gated on the
// organizer's "publish schedule" toggle. Returns ONLY safe fields — speaker
// emails and internal ids stay server-side.
export default query<
  { orgSlug: string; eventSlug: string },
  {
    event: {
      name: string;
      slug: string;
      description: string | null;
      timezone: string;
      startDate: string | null;
      endDate: string | null;
      location: string | null;
    } | null;
    published: boolean;
    rooms: { id: string; name: string }[];
    tracks: { id: string; name: string; color: string | null }[];
    sessions: {
      id: string;
      title: string;
      description: string | null;
      kind: string;
      roomId: string | null;
      trackId: string | null;
      startTime: string | null;
      endTime: string | null;
      speakers: { name: string; tagline: string | null; company: string | null }[];
    }[];
  }
>({
  auth: "public",
  args: { orgSlug: v.string(), eventSlug: v.string() },
  async handler(ctx, args) {
    // ctx.db.unsafe: anonymous public feed — rows are filtered to safe fields
    // below and the whole payload is gated on schedulePublished.
    const orgs = await ctx.db.unsafe.query("Org", { slug: args.orgSlug.trim().toLowerCase() });
    const events = orgs.length
      ? await ctx.db.unsafe.query("Event", {
          orgId: orgs[0].id as string,
          slug: args.eventSlug.trim().toLowerCase(),
        })
      : [];
    const event = events[0];
    if (!event || event.cfpStatus === "draft") {
      return { event: null, published: false, rooms: [], tracks: [], sessions: [] };
    }
    const safeEvent = {
      name: event.name as string,
      slug: event.slug as string,
      description: (event.description as string) ?? null,
      timezone: (event.timezone as string) || "UTC",
      startDate: (event.startDate as string) ?? null,
      endDate: (event.endDate as string) ?? null,
      location: (event.location as string) ?? null,
    };
    if (!event.schedulePublished) {
      return { event: safeEvent, published: false, rooms: [], tracks: [], sessions: [] };
    }
    const eventId = event.id as string;
    const [rooms, tracks, sessions, profiles] = [
      await ctx.db.unsafe.query("Room", { eventId }),
      await ctx.db.unsafe.query("Track", { eventId }),
      await ctx.db.unsafe.query("Session", { eventId }),
      await ctx.db.unsafe.query("SpeakerProfile", { eventId }),
    ];
    return {
      event: safeEvent,
      published: true,
      rooms: rooms
        .sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number))
        .map((r) => ({ id: r.id as string, name: r.name as string })),
      tracks: tracks
        .sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number))
        .map((t) => ({ id: t.id as string, name: t.name as string, color: (t.color as string) ?? null })),
      sessions: sessions
        .filter((s) => s.startTime && s.endTime)
        .map((s) => {
          const ids = Array.isArray(s.speakerUserIdsJson) ? (s.speakerUserIdsJson as string[]) : [];
          return {
            id: s.id as string,
            title: s.title as string,
            description: (s.description as string) ?? null,
            kind: (s.kind as string) || "talk",
            roomId: (s.roomId as string) ?? null,
            trackId: (s.trackId as string) ?? null,
            startTime: s.startTime as string,
            endTime: s.endTime as string,
            speakers: ids
              .map((uid) => profiles.find((p) => p.userId === uid))
              .filter((p): p is NonNullable<typeof p> => !!p)
              .map((p) => ({
                name: p.name as string,
                tagline: (p.tagline as string) ?? null,
                company: (p.company as string) ?? null,
              })),
          };
        }),
    };
  },
});
