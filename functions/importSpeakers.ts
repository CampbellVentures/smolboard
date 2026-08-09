import { mutation, v } from "@pylonsync/functions";
import { normalizeSpeakerEmail, parseSpeakerCsv, SpeakerCsvError } from "../lib/speakers";

export default mutation({
  args: { eventId: v.id("Event"), csv: v.string() },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
    await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
    let rows;
    try {
      rows = parseSpeakerCsv(args.csv);
    } catch (error) {
      if (error instanceof SpeakerCsvError) throw ctx.error("INVALID_ARGS", error.message);
      throw error;
    }

    const profiles = (await ctx.db.unsafe.query("SpeakerProfile", { eventId: args.eventId })).filter(
      (profile) => profile.orgId === event.orgId,
    );
    const users = await ctx.db.unsafe.list("User");
    const userByEmail = new Map<string, string>();
    for (const user of users) {
      const email = normalizeSpeakerEmail(user.email as string);
      if (userByEmail.has(email) && userByEmail.get(email) !== user.id) {
        throw ctx.error("CONFLICT", `Multiple legacy accounts match ${email}.`);
      }
      userByEmail.set(email, user.id as string);
    }
    const existingEmails = new Set(profiles.map((profile) => normalizeSpeakerEmail(profile.email as string)));
    const duplicates: { rowNumber: number; email: string }[] = [];
    const created: { id: string; email: string }[] = [];
    for (const row of rows) {
      if (existingEmails.has(row.email)) {
        duplicates.push({ rowNumber: row.rowNumber, email: row.email });
        continue;
      }
      let userId = userByEmail.get(row.email);
      if (!userId) {
        userId = await ctx.db.unsafe.insert("User", { email: row.email, displayName: row.name });
        userByEmail.set(row.email, userId);
      }
      const id = await ctx.db.unsafe.insert("SpeakerProfile", {
        orgId: event.orgId as string,
        eventId: args.eventId,
        userId,
        name: row.name,
        email: row.email,
        jobTitle: row.jobTitle,
        company: row.company,
        bio: row.bio,
        tagline: row.tagline,
        status: row.status,
        claimStatus: "unclaimed",
        headshotUrl: row.headshotUrl,
        logistics: row.logistics,
        tagsJson: row.tags,
        updatedAt: new Date().toISOString(),
      });
      existingEmails.add(row.email);
      created.push({ id, email: row.email });
    }
    return { created, duplicates, totalRows: rows.length };
  },
});
