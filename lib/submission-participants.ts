export interface SubmissionParticipantSnapshot {
  userId: string;
  name: string;
  email: string;
  roleLabel: string;
}

export function parseParticipantSnapshot(raw: unknown): SubmissionParticipantSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    if (
      typeof row.userId !== "string" ||
      typeof row.name !== "string" ||
      typeof row.email !== "string" ||
      typeof row.roleLabel !== "string"
    ) return [];
    return [{
      userId: row.userId,
      name: row.name,
      email: row.email,
      roleLabel: row.roleLabel,
    }];
  });
}
