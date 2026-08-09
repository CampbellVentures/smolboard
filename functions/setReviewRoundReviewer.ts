import { mutation, v } from "@pylonsync/functions";
import { requireOrganizerForEvent } from "./_reviewAccess";

export default mutation({
  args: {
    eventId: v.id("Event"),
    roundId: v.id("ReviewRound"),
    reviewerUserId: v.id("User"),
    active: v.bool(),
  },
  async handler(ctx, args) {
    const event = await requireOrganizerForEvent(ctx, args.eventId);
    const round = await ctx.db.unsafe.get("ReviewRound", args.roundId);
    if (!round || round.eventId !== args.eventId || round.orgId !== event.orgId) {
      throw ctx.error("NOT_FOUND", "Review round not found.");
    }
    const [members, designations] = await Promise.all([
      ctx.db.unsafe.query("OrgMember", { orgId: event.orgId, userId: args.reviewerUserId }),
      ctx.db.unsafe.query("ReviewerMembership", {
        orgId: event.orgId,
        userId: args.reviewerUserId,
        status: "active",
      }),
    ]);
    if (members.length === 0 || designations.length === 0) {
      throw ctx.error("INVALID_ARGS", "Round reviewers need active organization and reviewer memberships.");
    }
    const existing = await ctx.db.unsafe.query("ReviewRoundReviewer", {
      roundId: args.roundId,
      reviewerUserId: args.reviewerUserId,
    });
    const status = args.active ? "active" : "inactive";
    if (existing[0]) {
      await ctx.db.unsafe.update("ReviewRoundReviewer", existing[0].id as string, { status });
      return { id: existing[0].id as string, status };
    }
    const id = await ctx.db.unsafe.insert("ReviewRoundReviewer", {
      orgId: event.orgId,
      eventId: args.eventId,
      roundId: args.roundId,
      reviewerUserId: args.reviewerUserId,
      status,
    });
    return { id, status };
  },
});
