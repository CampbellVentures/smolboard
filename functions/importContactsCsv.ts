import { mutation, v } from "@pylonsync/functions";
import { parseContactCsv } from "../lib/contacts";
import { normalizeSpeakerEmail } from "../lib/speakers";

// Bulk import for the directory. Existing emails update in place rather than
// erroring, so re-importing a corrected sheet is safe.
export default mutation<
  { orgId: string; csv: string },
  { created: number; updated: number; skipped: number; errors: string[] }
>({
  args: { orgId: v.id("Org"), csv: v.string() },
  async handler(ctx, args) {
    await ctx.requireMember(args.orgId, { role: ["owner", "admin"] });
    const { rows, errors } = parseContactCsv(args.csv);
    const existing = await ctx.db.unsafe.query("Contact", { orgId: args.orgId });
    const byEmail = new Map(
      existing.map((row) => [normalizeSpeakerEmail(row.email as string), row]),
    );

    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const email = normalizeSpeakerEmail(row.email);
      const found = byEmail.get(email);
      const payload = {
        name: row.name,
        email,
        company: row.company || undefined,
        jobTitle: row.jobTitle || undefined,
        tagsJson: row.tags.length > 0 ? row.tags : undefined,
        updatedAt: new Date().toISOString(),
      };
      if (found) {
        await ctx.db.unsafe.update("Contact", found.id as string, payload);
        updated++;
      } else {
        const id = (await ctx.db.unsafe.insert("Contact", {
          orgId: args.orgId,
          ...payload,
          stage: row.stage || "prospect",
        })) as string;
        await ctx.db.unsafe.insert("ContactStageEvent", {
          orgId: args.orgId,
          contactId: id,
          toStage: row.stage || "prospect",
          actorName: "CSV import",
        });
        created++;
      }
    }
    return { created, updated, skipped: errors.length, errors: errors.slice(0, 10) };
  },
});
