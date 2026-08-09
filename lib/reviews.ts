import type {
  ReviewAssignmentRow,
  ReviewCriterion,
  ReviewRow,
} from "./types";

export function reviewRoundForNumber<T extends { roundNumber: number }>(
  rounds: readonly T[],
  roundNumber: number,
): T | undefined {
  return rounds.find((round) => round.roundNumber === roundNumber);
}

export interface NormalizedReviewCriterion {
  key: string;
  label: string;
  type: "numeric" | "select" | "text";
  min?: number;
  max?: number;
  options?: string[];
  weight: number;
  required: boolean;
}

export function normalizeCriteria(raw: unknown): NormalizedReviewCriterion[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const criteria: NormalizedReviewCriterion[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const item = value as ReviewCriterion;
    const key = typeof item.key === "string" ? item.key.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!key || !label || seen.has(key)) continue;
    const type = item.type === "select" || item.type === "text" ? item.type : "numeric";
    const weight = typeof item.weight === "number" && Number.isFinite(item.weight) && item.weight > 0
      ? item.weight
      : 1;
    if (type === "numeric") {
      const min = typeof item.min === "number" && Number.isFinite(item.min) ? item.min : 1;
      const max = typeof item.max === "number" && Number.isFinite(item.max) ? item.max : 5;
      if (max <= min) continue;
      criteria.push({ key, label, type, min, max, weight, required: item.required === true });
    } else if (type === "select") {
      const options = Array.isArray(item.options)
        ? [...new Set(item.options.filter((option): option is string => typeof option === "string").map((option) => option.trim()).filter(Boolean))]
        : [];
      if (options.length === 0) continue;
      criteria.push({ key, label, type, options, weight, required: item.required === true });
    } else {
      criteria.push({ key, label, type, weight, required: item.required === true });
    }
    seen.add(key);
  }
  return criteria;
}

export function validateReviewValues(
  rawCriteria: unknown,
  rawValues: unknown,
): { values: Record<string, number | string>; errors: string[] } {
  const criteria = normalizeCriteria(rawCriteria);
  const input = rawValues && typeof rawValues === "object" && !Array.isArray(rawValues)
    ? rawValues as Record<string, unknown>
    : {};
  const allowed = new Set(criteria.map((criterion) => criterion.key));
  const errors = Object.keys(input)
    .filter((key) => !allowed.has(key))
    .map((key) => `Unknown criterion: ${key}.`);
  const values: Record<string, number | string> = {};
  for (const criterion of criteria) {
    const value = input[criterion.key];
    const missing = value === undefined || value === null || value === "";
    if (missing) {
      if (criterion.required) errors.push(`${criterion.label} is required.`);
      continue;
    }
    if (criterion.type === "numeric") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < (criterion.min ?? 1) ||
        value > (criterion.max ?? 5)
      ) {
        errors.push(`${criterion.label} must be between ${criterion.min} and ${criterion.max}.`);
      } else {
        values[criterion.key] = value;
      }
    } else if (criterion.type === "select") {
      if (typeof value !== "string" || !criterion.options?.includes(value)) {
        errors.push(`${criterion.label} must use one of its configured options.`);
      } else {
        values[criterion.key] = value;
      }
    } else if (typeof value !== "string") {
      errors.push(`${criterion.label} must be text.`);
    } else {
      const text = value.trim();
      if (criterion.required && !text) errors.push(`${criterion.label} is required.`);
      else if (text) values[criterion.key] = text;
    }
  }
  return { values, errors };
}

export function assignmentProgress(assignments: readonly Pick<ReviewAssignmentRow, "status">[]) {
  const total = assignments.filter((assignment) => assignment.status !== "recused").length;
  const complete = assignments.filter((assignment) => assignment.status === "complete").length;
  return { total, complete, percent: total === 0 ? 0 : Math.round((complete / total) * 100) };
}

export function weightedReviewScore(
  rawCriteria: unknown,
  scores: unknown,
): number | undefined {
  const criteria = normalizeCriteria(rawCriteria).filter((criterion) => criterion.type === "numeric");
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) return undefined;
  const values = scores as Record<string, unknown>;
  let weighted = 0;
  let weight = 0;
  for (const criterion of criteria) {
    const value = values[criterion.key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const min = criterion.min ?? 1;
    const max = criterion.max ?? 5;
    weighted += ((value - min) / (max - min)) * criterion.weight;
    weight += criterion.weight;
  }
  return weight === 0 ? undefined : weighted / weight;
}

export function aggregateSubmissionScore(rawCriteria: unknown, reviews: readonly Pick<ReviewRow, "scoresJson">[]) {
  const values = reviews
    .map((review) => weightedReviewScore(rawCriteria, review.scoresJson))
    .filter((score): score is number => score !== undefined);
  return values.length === 0 ? undefined : values.reduce((sum, score) => sum + score, 0) / values.length;
}

export function reminderReviewerIds(
  assignments: readonly Pick<ReviewAssignmentRow, "reviewerUserId" | "status">[],
): string[] {
  return [...new Set(assignments.filter((assignment) => assignment.status === "assigned").map((assignment) => assignment.reviewerUserId))].sort();
}

export function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
