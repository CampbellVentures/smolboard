export function lastEventStorageKey(workspaceId: string): string {
  return `sb.workspace.${workspaceId}.last-event`;
}

export function dashboardDestination(
  eventIds: string[],
  lastEventId?: string | null,
): string {
  if (lastEventId && eventIds.includes(lastEventId)) {
    return `/dashboard/events/${lastEventId}/overview`;
  }

  if (eventIds.length === 1) {
    return `/dashboard/events/${eventIds[0]}/overview`;
  }

  return "/dashboard/events";
}
