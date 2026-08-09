import type { SessionContentRevisionRow, SessionRow } from "./types";

export function revisionsForSession(revisions: SessionContentRevisionRow[], sessionId: string) {
  return revisions
    .filter((revision) => revision.sessionId === sessionId)
    .slice()
    .sort((a, b) => b.revisionNumber - a.revisionNumber);
}
export function approvedContent(
  session: Pick<SessionRow, "approvedRevisionId" | "contentStatus">,
  revisions: SessionContentRevisionRow[],
) {
  if (session.contentStatus !== "approved" || !session.approvedRevisionId) return undefined;
  return revisions.find((revision) => revision.id === session.approvedRevisionId);
}
