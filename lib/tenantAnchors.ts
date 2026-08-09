export function matchesEventAnchor(
  row: { eventId?: unknown; orgId?: unknown } | null | undefined,
  eventId: string,
  orgId: string,
) {
  return row?.eventId === eventId && row.orgId === orgId;
}
