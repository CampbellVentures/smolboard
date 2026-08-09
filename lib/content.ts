// Pure logic for the deliverable review workflow (organizer verdicts on
// speaker uploads). Kept out of function handlers so it's testable without a
// running app (AGENTS.md tier 1).

export const REVIEW_STATUSES = ["pending", "approved", "changes_requested"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export function isReviewVerdict(value: string): value is "approved" | "changes_requested" {
  return value === "approved" || value === "changes_requested";
}

export function reviewStatusLabel(status: string | undefined): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "changes_requested":
      return "Changes requested";
    default:
      return "Pending review";
  }
}
