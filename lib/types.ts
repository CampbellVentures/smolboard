// Entity row shapes as returned by serverData/db reads (mirrors app.ts).
// Keep in sync with the entity declarations — these are the client-visible
// fields only (serverOnly columns never appear).

import { parseFields, parseRouting, type FormField, type RoutingConfig, type Answers } from "./forms";

// field.json() columns (SDK ≥0.3.378) are parsed-on-read — reads hand back the
// real value. parseJson stays as a tolerant coercion so rows written before
// the 0.3.378 migration (values stored as JSON strings) still read correctly.
export function parseJson<T>(raw: unknown): T | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }
  return raw as T;
}

export function fieldsOf(row: { fieldsJson?: unknown; formJson?: unknown }): FormField[] {
  return parseFields(parseJson(row.fieldsJson ?? row.formJson));
}

export function routingOf(row: { routingJson?: unknown }): RoutingConfig | undefined {
  return parseRouting(parseJson(row.routingJson));
}

export interface OrgRow {
  id: string;
  name: string;
  slug?: string;
  createdAt: string;
}

export interface EventRow {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  timezone: string;
  location?: string;
  cfpStatus: string;
  schedulePublished: boolean;
  createdAt: string;
}

export interface SubmissionFormRow {
  id: string;
  orgId: string;
  eventId: string;
  name: string;
  slug: string;
  description?: string;
  status: string;
  fieldsJson?: FormField[];
  routingJson?: RoutingConfig;
  confirmationMessage?: string;
  createdAt: string;
}

export interface SubmissionRow {
  id: string;
  orgId: string;
  eventId: string;
  formId: string;
  speakerUserId: string;
  title: string;
  abstract?: string;
  answersJson?: Answers;
  category?: string;
  status: string;
  currentRound: number;
  submittedAt: string;
  updatedAt?: string;
}

export interface SpeakerProfileRow {
  id: string;
  orgId: string;
  eventId: string;
  userId: string;
  name: string;
  email: string;
  tagline?: string;
  bio?: string;
  company?: string;
  jobTitle?: string;
  headshotFileId?: string;
  linksJson?: Record<string, string>;
  createdAt: string;
}

export interface SpeakerFileRow {
  id: string;
  orgId: string;
  eventId: string;
  userId: string;
  kind: string;
  fileId: string;
  label?: string;
  createdAt: string;
}

export type ReviewCriterionType = "numeric" | "select" | "text";

export interface ReviewCriterion {
  key: string;
  label: string;
  type?: ReviewCriterionType;
  min?: number;
  max?: number;
  options?: string[];
  weight?: number;
  required?: boolean;
}

export interface ReviewRoundRow {
  id: string;
  orgId: string;
  eventId: string;
  roundNumber: number;
  name: string;
  criteriaJson?: ReviewCriterion[];
  status: string;
  opensAt?: string;
  closesAt?: string;
  anonymized: boolean;
  revealPeerReviews: boolean;
}

export interface ReviewerMembershipRow {
  id: string;
  orgId: string;
  userId: string;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ReviewRoundReviewerRow {
  id: string;
  orgId: string;
  eventId: string;
  roundId: string;
  reviewerUserId: string;
  status: string;
  addedAt: string;
}

export interface ReviewAssignmentRow {
  id: string;
  orgId: string;
  eventId: string;
  roundId: string;
  submissionId: string;
  reviewerUserId: string;
  status: "assigned" | "complete" | "recused";
  assignedAt: string;
  completedAt?: string;
  recusedAt?: string;
  recusalReason?: string;
}

export interface ReviewRow {
  id: string;
  orgId: string;
  eventId: string;
  submissionId: string;
  roundId: string;
  reviewerUserId: string;
  scoresJson?: Record<string, number | string>;
  comment?: string;
  recommendation?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ReviewerQueueItem {
  assignmentId: string;
  assignmentStatus: ReviewAssignmentRow["status"];
  event: { id: string; name: string };
  round: {
    id: string;
    name: string;
    status: string;
    opensAt?: string;
    closesAt?: string;
    anonymized: boolean;
    criteria: ReviewCriterion[];
  };
  submission: {
    id: string;
    title: string;
    abstract?: string;
    category?: string;
    answers?: Record<string, unknown>;
  };
  author?: {
    name: string;
    email: string;
    company?: string;
    jobTitle?: string;
  };
  review?: Pick<ReviewRow, "id" | "scoresJson" | "comment" | "recommendation">;
  peerReviews?: Array<{
    scoresJson?: Record<string, unknown>;
    recommendation?: string;
  }>;
}

export interface RoomRow {
  id: string;
  orgId: string;
  eventId: string;
  name: string;
  capacity?: number;
  sortOrder: number;
}

export interface TrackRow {
  id: string;
  orgId: string;
  eventId: string;
  name: string;
  color?: string;
  sortOrder: number;
}

export interface SessionRow {
  id: string;
  orgId: string;
  eventId: string;
  submissionId?: string;
  title: string;
  description?: string;
  roomId?: string;
  trackId?: string;
  startTime?: string;
  endTime?: string;
  speakerUserIdsJson?: string[];
  kind: string;
}

export interface TaskTemplateRow {
  id: string;
  orgId: string;
  eventId: string;
  title: string;
  description?: string;
  kind: string;
  formJson?: FormField[];
  target?: string;
  dueAt?: string;
  appliesTo: string;
  sortOrder: number;
}

export interface SpeakerTaskRow {
  id: string;
  orgId: string;
  eventId: string;
  taskTemplateId: string;
  speakerUserId: string;
  status: string;
  completedAt?: string;
  responseJson?: Answers;
}

export interface EmailTemplateRow {
  id: string;
  orgId: string;
  eventId: string;
  key: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  bodyJson?: string;
  enabled: boolean;
}

export interface EmailLogRow {
  id: string;
  orgId: string;
  eventId: string;
  toEmail: string;
  templateKey?: string;
  subject: string;
  status: string;
  error?: string;
  sentAt: string;
}

export const SUBMISSION_STATUSES = [
  "submitted",
  "in_review",
  "accepted",
  "rejected",
  "waitlisted",
  "withdrawn",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export interface CopilotThreadRow {
  id: string;
  orgId: string;
  eventId: string;
  title: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CopilotToolCall {
  name: string;
  input?: unknown;
  result?: unknown;
  isError?: boolean;
}

export interface CopilotMessageRow {
  id: string;
  orgId: string;
  threadId: string;
  role: string;
  text: string;
  toolCallsJson?: CopilotToolCall[];
  createdAt: string;
}
