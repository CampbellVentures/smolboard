import { query, v } from "@pylonsync/functions";

// Public speaker gallery for /[eventSlug]/speakers. Anonymous; lists ONLY
// speakers with an accepted submission, ONLY safe profile fields (no email).
// Gated on the published schedule like getPublicSchedule.
export default query<
  { eventSlug: string },
  {
    event: { name: string; slug: string } | null;
    published: boolean;
    speakers: {
      name: string;
      tagline: string | null;
      bio: string | null;
      company: string | null;
      jobTitle: string | null;
      talks: string[];
    }[];
  }
>({
  auth: "public",
  args: { eventSlug: v.string() },
  async handler(ctx, args) {
    // ctx.db.unsafe: anonymous public feed — output filtered to safe fields,
    // gated on schedulePublished.
    const event = await ctx.db.unsafe.lookup("Event", "slug", args.eventSlug.trim().toLowerCase());
    if (!event || event.cfpStatus === "draft") {
      return { event: null, published: false, speakers: [] };
    }
    const safeEvent = { name: event.name as string, slug: event.slug as string };
    if (!event.schedulePublished) {
      return { event: safeEvent, published: false, speakers: [] };
    }
    const eventId = event.id as string;
    const submissions = await ctx.db.unsafe.query("Submission", { eventId, status: "accepted" });
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", { eventId });
    const bySpeaker = new Map<string, string[]>();
    for (const s of submissions) {
      const uid = s.speakerUserId as string;
      bySpeaker.set(uid, [...(bySpeaker.get(uid) ?? []), s.title as string]);
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
            talks,
          };
        })
        .filter((s): s is NonNullable<typeof s> => !!s)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});
