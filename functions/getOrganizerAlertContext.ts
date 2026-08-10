import { query, v } from "@pylonsync/functions";
import { parseBranding, type EventBranding } from "../lib/branding";

// Internal: everything sendOrganizerAlert needs in one round trip — the event
// name, its branding, and the owner/admin inboxes for its workspace.

export interface OrganizerAlertContext {
  orgId: string;
  eventName: string;
  branding: EventBranding;
  toEmails: string[];
}

export default query<{ eventId: string }, OrganizerAlertContext | null>({
  internal: true,
  args: { eventId: v.id("Event") },
  async handler(ctx, args) {
    const event = await ctx.db.unsafe.get("Event", args.eventId);
    if (!event) return null;
    const orgId = event.orgId as string;
    const members = (await ctx.db.unsafe.query("OrgMember", { orgId })).filter((member) =>
      ["owner", "admin"].includes(member.role as string),
    );
    const toEmails: string[] = [];
    for (const member of members) {
      const user = await ctx.db.unsafe.get("User", member.userId as string);
      const email = (user?.email as string) ?? "";
      if (email && !email.endsWith(".local") && !email.endsWith(".test")) {
        toEmails.push(email);
      }
    }
    return {
      orgId,
      eventName: event.name as string,
      branding: parseBranding(event.brandingJson),
      toEmails,
    };
  },
});
