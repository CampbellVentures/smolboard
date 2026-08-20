import type { Answers } from "./forms";
import { parseParticipantSnapshot } from "./submission-participants";

export interface SubmissionHandoffConfig {
  formatFieldKey: string | null;
  formatValues: Record<string, string>;
  trackFieldKey: string | null;
  trackValues: Record<string, string>;
}

export interface HandoffIssue {
  dimension: "configuration" | "format" | "track";
  fieldKey?: string;
  value?: string;
  reason: string;
}

export interface MaterializedSessionData {
  submissionId: string;
  title: string;
  description?: string;
  trackId?: string;
  speakerUserIdsJson: string[];
  kind: string;
}

export const SESSION_KINDS = new Set(["talk", "keynote", "workshop", "panel", "break"]);

export function parseHandoffConfig(raw: unknown): SubmissionHandoffConfig | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  if (!("formatFieldKey" in value) || !("trackFieldKey" in value)) return undefined;
  const field = (candidate: unknown) => typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
  const mappings = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
    return Object.fromEntries(Object.entries(candidate as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[0].trim()) && Boolean(entry[1].trim())));
  };
  return {
    formatFieldKey: field(value.formatFieldKey),
    formatValues: mappings(value.formatValues),
    trackFieldKey: field(value.trackFieldKey),
    trackValues: mappings(value.trackValues),
  };
}

export function answerValues(answers: Answers, fieldKey: string | null): string[] {
  if (!fieldKey) return [];
  const raw = answers[fieldKey];
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

export function mappingSourceValues(
  submissions: readonly { answersJson?: unknown }[],
  fieldKey: string | null,
): string[] {
  const values = new Set<string>();
  for (const submission of submissions) {
    const answers = submission.answersJson && typeof submission.answersJson === "object" && !Array.isArray(submission.answersJson)
      ? submission.answersJson as Answers
      : {};
    for (const value of answerValues(answers, fieldKey)) values.add(value);
  }
  return [...values].sort();
}

export function materializeSubmissionData(input: {
  submission: { id: string; title: string; abstract?: string; speakerUserId: string; answersJson?: unknown; participantSnapshotJson?: unknown };
  configRaw: unknown;
  validTrackIds: ReadonlySet<string>;
  // A Session's track is optional; its kind is not. When the caller can live
  // without a track (scheduling: a talk in a room at a time is useful with or
  // without a track label) an unmapped track is reported but does not block.
  // The agenda handoff leaves this off and stays strict.
  allowUnresolvedTrack?: boolean;
}): { data?: MaterializedSessionData; unresolved: HandoffIssue[] } {
  // Forms saved since the handoff feature always carry a config (the builder
  // writes one on every save). A missing config means the form predates the
  // feature — materialize the way scheduling always worked for those forms
  // (default talk, no track) instead of dead-ending the drag. Organizers opt
  // into strict mapping by saving the form's "Agenda handoff mappings" panel.
  const config = parseHandoffConfig(input.configRaw) ?? {
    formatFieldKey: null,
    formatValues: {},
    trackFieldKey: null,
    trackValues: {},
  };
  const answers = input.submission.answersJson && typeof input.submission.answersJson === "object" && !Array.isArray(input.submission.answersJson)
    ? input.submission.answersJson as Answers
    : {};
  const unresolved: HandoffIssue[] = [];
  let kind = "talk";
  const formatValues = answerValues(answers, config.formatFieldKey);
  if (config.formatFieldKey) {
    if (formatValues.length === 0) unresolved.push({ dimension: "format", fieldKey: config.formatFieldKey, reason: "No submitted format value." });
    const mapped = [...new Set(formatValues.map((value) => config.formatValues[value]).filter(Boolean))];
    for (const value of formatValues.filter((value) => !config.formatValues[value])) {
      unresolved.push({ dimension: "format", fieldKey: config.formatFieldKey, value, reason: "Format value is not mapped." });
    }
    if (mapped.length === 1 && SESSION_KINDS.has(mapped[0])) kind = mapped[0];
    else if (mapped.length > 1) unresolved.push({ dimension: "format", fieldKey: config.formatFieldKey, reason: "Format values resolve to multiple session kinds." });
    else if (mapped.some((value) => !SESSION_KINDS.has(value))) unresolved.push({ dimension: "format", fieldKey: config.formatFieldKey, reason: "Mapped session kind is invalid." });
  }
  let trackId: string | undefined;
  const trackValues = answerValues(answers, config.trackFieldKey);
  if (config.trackFieldKey) {
    if (trackValues.length === 0) unresolved.push({ dimension: "track", fieldKey: config.trackFieldKey, reason: "No submitted track value." });
    const mapped = [...new Set(trackValues.map((value) => config.trackValues[value]).filter(Boolean))];
    for (const value of trackValues.filter((value) => !config.trackValues[value])) {
      unresolved.push({ dimension: "track", fieldKey: config.trackFieldKey, value, reason: "Track value is not mapped." });
    }
    if (mapped.length === 1 && input.validTrackIds.has(mapped[0])) trackId = mapped[0];
    else if (mapped.length > 1) unresolved.push({ dimension: "track", fieldKey: config.trackFieldKey, reason: "Track values resolve to multiple tracks." });
    else if (mapped.some((value) => !input.validTrackIds.has(value))) unresolved.push({ dimension: "track", fieldKey: config.trackFieldKey, reason: "Mapped track no longer belongs to this event." });
  }
  const blocking = input.allowUnresolvedTrack
    ? unresolved.filter((issue) => issue.dimension !== "track")
    : unresolved;
  if (blocking.length > 0) return { unresolved };
  const snapshot = parseParticipantSnapshot(input.submission.participantSnapshotJson);
  const speakers = snapshot.length > 0
    ? [...new Set(snapshot.map((participant) => participant.userId))]
    : [input.submission.speakerUserId];
  return {
    unresolved: [],
    data: {
      submissionId: input.submission.id,
      title: input.submission.title,
      description: input.submission.abstract?.trim() || undefined,
      trackId,
      speakerUserIdsJson: speakers,
      kind,
    },
  };
}
