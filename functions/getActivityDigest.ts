import { query } from "@pylonsync/functions";

// Internal: gather the last 24h of ActivityLog rows grouped per org, with the
// owner/admin recipient list. Consumed by sendActivityDigest (daily cron).

export interface OrgDigest {
  orgId: string;
  orgName: string;
  toEmails: string[];
  lines: { message: string; href: string | null; when: string }[];
  count: number;
}

export default query<{}, OrgDigest[]>({
  internal: true,
  args: {},
  async handler(ctx) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const logs = (await ctx.db.unsafe.query("ActivityLog", {})).filter(
      (row) => (row.createdAt as string) >= since,
    );
    if (logs.length === 0) return [];

    const byOrg = new Map<string, typeof logs>();
    for (const row of logs) {
      const key = row.orgId as string;
      const list = byOrg.get(key) ?? [];
      list.push(row);
      byOrg.set(key, list);
    }

    const digests: OrgDigest[] = [];
    for (const [orgId, rows] of byOrg) {
      const org = await ctx.db.unsafe.get("Org", orgId);
      if (!org) continue;
      const members = (await ctx.db.unsafe.query("OrgMember", { orgId })).filter((member) =>
        ["owner", "admin"].includes(member.role as string),
      );
      const toEmails: string[] = [];
      for (const member of members) {
        const user = await ctx.db.unsafe.get("User", member.userId as string);
        const email = (user?.email as string) ?? "";
        // Demo/sample identities have no real inbox.
        if (email && !email.endsWith(".local") && !email.endsWith(".test")) {
          toEmails.push(email);
        }
      }
      if (toEmails.length === 0) continue;
      const sorted = rows
        .slice()
        .sort((a, b) => ((a.createdAt as string) < (b.createdAt as string) ? 1 : -1));
      digests.push({
        orgId,
        orgName: org.name as string,
        toEmails,
        lines: sorted.slice(0, 15).map((row) => ({
          message: row.message as string,
          href: (row.href as string) ?? null,
          when: row.createdAt as string,
        })),
        count: rows.length,
      });
    }
    return digests;
  },
});
