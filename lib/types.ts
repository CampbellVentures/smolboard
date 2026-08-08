// Entity row shapes as returned by serverData/db reads (mirrors app.ts).
// Keep in sync with the entity declarations — these are the client-visible
// fields only (serverOnly columns never appear).

import { parseFields, parseRouting, type FormField, type RoutingConfig, type Answers } from "./forms";

// SDK 0.3.373 has no field.json(), so *Json columns are strings holding
// serialized JSON. Parse defensively at every read site via these helpers.
export function parseJson<T>(raw: string | undefined | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function fieldsOf(row: { fieldsJson?: string; formJson?: string }): FormField[] {
  return parseFields(parseJson(row.fieldsJson ?? row.formJson));
}

export function routingOf(row: { routingJson?: string }): RoutingConfig | undefined {
  return parseRouting(parseJson(row.routingJson));
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
  fieldsJson?: string;
  routingJson?: string;
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
  answersJson?: string;
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
  linksJson?: string;
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

export interface ReviewRoundRow {
  id: string;
  orgId: string;
  eventId: string;
  roundNumber: number;
  name: string;
  criteriaJson?: string;
  status: string;
}

export interface ReviewRow {
  id: string;
  orgId: string;
  eventId: string;
  submissionId: string;
  roundId: string;
  reviewerUserId: string;
  scoresJson?: string;
  comment?: string;
  recommendation?: string;
  createdAt: string;
  updatedAt?: string;
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
  speakerUserIdsJson?: string;
  kind: string;
}

export interface TaskTemplateRow {
  id: string;
  orgId: string;
  eventId: string;
  title: string;
  description?: string;
  kind: string;
  formJson?: string;
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
  responseJson?: string;
}

export interface EmailTemplateRow {
  id: string;
  orgId: string;
  eventId: string;
  key: string;
  subject: string;
  body: string;
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
