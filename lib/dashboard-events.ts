export function submissionCountsByEvent(
  submissions: Array<{ eventId: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const submission of submissions) {
    counts[submission.eventId] = (counts[submission.eventId] ?? 0) + 1;
  }
  return counts;
}
