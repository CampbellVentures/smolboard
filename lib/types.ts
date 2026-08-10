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
  brandingJson?: string;
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
  opensAt?: string;
  closesAt?: string;
  fieldsJson?: FormField[];
  routingJson?: RoutingConfig;
  handoffMappingsJson?: import("./submission-handoff").SubmissionHandoffConfig;
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
  participantSnapshotJson?: import("./submission-participants").SubmissionParticipantSnapshot[];
  category?: string;
  status: string;
  currentRound: number;
  submittedAt: string;
  updatedAt?: string;
  finalizedAt?: string;
}

export interface SubmissionDraftRow {
  id: string;
  orgId: string;
  eventId: string;
  formId: string;
  ownerUserId: string;
  name: string;
  title: string;
  abstract?: string;
  answersJson?: Answers;
  lifecycle: "draft" | "finalized";
  finalizedSubmissionId?: string;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
}

export interface SubmissionParticipantInviteRow {
  id: string;
  orgId: string;
  eventId: string;
  formId: string;
  draftId: string;
  ownerUserId: string;
  provisionalUserId: string;
  email: string;
  name: string;
  roleLabel: string;
  status: "pending" | "claimed";
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
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
  headshotUrl?: string;
  status: string;
  claimStatus: string;
  logistics?: string;
  tagsJson?: string[];
  customJson?: Record<string, unknown>;
  invitedAt?: string;
  claimedAt?: string;
  updatedAt?: string;
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

export interface DeliverableSlotRow {
  id: string;
  orgId: string;
  eventId: string;
  speakerUserId: string;
  taskId?: string;
  sessionId?: string;
  kind: string;
  title: string;
  // "pending" | "approved" | "changes_requested"
  status?: string;
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface DeliverableVersionRow {
  id: string;
  orgId: string;
  eventId: string;
  slotId: string;
  speakerUserId: string;
  uploaderUserId: string;
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  versionNumber: number;
  createdAt: string;
}

export interface DeliverableCommentRow {
  id: string;
  orgId: string;
  eventId: string;
  slotId: string;
  versionId?: string;
  speakerUserId: string;
  authorUserId: string;
  authorName: string;
  authorRole: "speaker" | "organizer";
  body: string;
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
    participants?: Array<{
      userId?: string;
      name?: string;
      email?: string;
      roleLabel: string;
    }>;
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
  contentStatus: "draft" | "approved";
  currentRevisionId?: string;
  approvedRevisionId?: string;
  approvedAt?: string;
  approvedByUserId?: string;
}

export interface SessionContentRevisionRow {
  id: string;
  orgId: string;
  eventId: string;
  sessionId: string;
  revisionNumber: number;
  title: string;
  description?: string;
  speakerUserIdsJson?: string[];
  editorUserId: string;
  editorName: string;
  restoredFromRevisionId?: string;
  createdAt: string;
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

export interface SpeakerNoteRow {
  id: string;
  orgId: string;
  email: string;
  authorUserId: string;
  authorName: string;
  body: string;
  createdAt: string;
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
