import type { EventRow, OrgRow } from "./types";

// Resolve /<org-slug>/<event-slug> from the two policy-readable lists. Pages
// start both serverData promises before awaiting either (see callers) and
// hand the resolved rows here.
export function resolvePublicEvent(
  orgs: OrgRow[],
  events: EventRow[],
  orgSlug: string,
  eventSlug: string,
): { org: OrgRow; event: EventRow } | null {
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) return null;
  const event = events.find((e) => e.orgId === org.id && e.slug === eventSlug);
  if (!event) return null;
  return { org, event };
}

export function publicEventInfo(org: OrgRow, event: EventRow) {
  return {
    name: event.name,
    slug: event.slug,
    orgSlug: org.slug ?? "",
    location: event.location ?? null,
    startDate: event.startDate ?? null,
    endDate: event.endDate ?? null,
  };
}
