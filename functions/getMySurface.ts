import { query } from "@pylonsync/functions";

// Which side of the app does this account belong to? A person with speaker
// profiles and no organization is a speaker: sending them into the organizer
// dashboard would auto-create a workspace they never asked for and show them
// organizer chrome.
export default query<{}, { isSpeaker: boolean; hasOrg: boolean }>({
  args: {},
  async handler(ctx) {
    if (!ctx.auth.userId) return { isSpeaker: false, hasOrg: false };
    const memberships = await ctx.db.unsafe.query("OrgMember", { userId: ctx.auth.userId });
    if (memberships.length > 0) return { isSpeaker: false, hasOrg: true };
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", { userId: ctx.auth.userId });
    return { isSpeaker: profiles.length > 0, hasOrg: false };
  },
});
