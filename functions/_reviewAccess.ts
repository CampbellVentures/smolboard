type Row = Record<string, unknown>;

interface ReviewAccessContext {
  auth: { userId: string };
  error(code: string, message: string): Error;
  requireMember(
    orgId: string,
    options?: { role?: string | string[]; entity?: string; roleField?: string },
  ): Promise<Row>;
  db: {
    unsafe: {
      get(entity: string, id: string): Promise<Row | null>;
      query(entity: string, filter: Record<string, unknown>): Promise<Row[]>;
    };
  };
}

export async function requireOrganizerForEvent(ctx: ReviewAccessContext, eventId: string) {
  // Authorization derives the org from the trusted event row.
  const event = await ctx.db.unsafe.get("Event", eventId);
  if (!event) throw ctx.error("NOT_FOUND", "Event not found.");
  await ctx.requireMember(event.orgId as string, { role: ["owner", "admin"] });
  return event;
}

export async function requireActiveReviewer(ctx: ReviewAccessContext, orgId: string) {
  await ctx.requireMember(orgId);
  await ctx.requireMember(orgId, {
    entity: "ReviewerMembership",
    roleField: "status",
    role: "active",
  });
}

export async function activeReviewerUserIds(ctx: ReviewAccessContext, orgId: string) {
  // Organizer callers are authorized before this cross-user app-role lookup.
  const rows = await ctx.db.unsafe.query("ReviewerMembership", { orgId, status: "active" });
  return rows.map((row) => row.userId as string).sort();
}
