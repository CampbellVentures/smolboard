import {
  entity,
  field,
  policy,
  auth,
  buildManifest,
  discoverAppRoutes,
  discoverFunctions,
  font,
  cron,
} from "@pylonsync/sdk";

// ---------------------------------------------------------------------------
// smolboard — open-source speaker & CFP management (Sessionboard replacement).
// See SPEC.md. Two user populations share the User table:
//   - Organizers: org members, password or magic-code login, use /dashboard.
//   - Speakers: NOT org members, auto-created at CFP submission, magic-code
//     login only, use /portal. Speaker access rides either an explicit
//     `auth.userId == data.<owner>` policy clause or a server function.
// ---------------------------------------------------------------------------

const User = entity(
  "User",
  {
    email: field.string(),
    emailVerified: field.datetime().optional(),
    displayName: field.string().optional(),
    passwordHash: field.string().serverOnly().optional(),
    avatarColor: field.string().optional(),
    createdAt: field.datetime().defaultNow(),
  },
  { indexes: [{ name: "by_email", fields: ["email"], unique: true }] },
);

const Org = entity(
  "Org",
  {
    name: field.string(),
    // Public URL handle: every event page lives under /<org-slug>/<event-slug>.
    // App-owned (the framework mirror only writes name/createdBy/createdAt);
    // set by ensureOrgSlug on first dashboard load and editable in workspace
    // settings.
    slug: field.string().optional(),
    // Workspace branding: { accent, logoUrl }. The org index page at
    // /<org-slug> is public and had nowhere to carry the organizer's mark, so
    // it fell back to smolboard's. Same JSON shape as Event.brandingJson.
    brandingJson: field.json().optional(),
    createdBy: field.id("User").serverOnly(),
    createdAt: field.datetime(),
  },
  {
    indexes: [
      { name: "by_created_by", fields: ["createdBy"], unique: false },
      { name: "by_slug", fields: ["slug"], unique: true },
    ],
  },
);

const OrgMember = entity(
  "OrgMember",
  {
    orgId: field.id("Org"),
    userId: field.id("User"),
    role: field.string(),
    joinedAt: field.datetime(),
  },
  {
    indexes: [
      { name: "by_org_user", fields: ["orgId", "userId"], unique: true },
      { name: "by_user", fields: ["userId"], unique: false },
    ],
  },
);

const OrgInvite = entity(
  "OrgInvite",
  {
    orgId: field.id("Org"),
    email: field.string(),
    role: field.string(),
    invitedBy: field.id("User"),
    tokenHash: field.string().serverOnly(),
    tokenPrefix: field.string(),
    createdAt: field.datetime(),
    expiresAt: field.datetime(),
    acceptedAt: field.datetime().optional(),
    acceptedByUserId: field.id("User").optional(),
  },
  {
    indexes: [
      { name: "by_org", fields: ["orgId"], unique: false },
      { name: "by_email_org", fields: ["email", "orgId"], unique: false },
    ],
  },
);

// ---------------------------------------------------------------------------
// Domain. Every entity carries orgId (denormalized from its Event) so policies
// stay flat single-row expressions — CEL policies can't join across tables.
// ---------------------------------------------------------------------------

const Event = entity(
  "Event",
  {
    orgId: field.id("Org").readonly(),
    name: field.string(),
    // URL handle within the org's public site: /<org-slug>/<slug>/….
    slug: field.string(),
    description: field.string().optional(),
    startDate: field.datetime().optional(),
    endDate: field.datetime().optional(),
    timezone: field.string().default("America/Los_Angeles"),
    location: field.string().optional(),
    // "draft" | "open" | "closed" — non-draft events are publicly readable
    // (name/dates/description power the public CFP + schedule pages).
    cfpStatus: field.string().default("draft"),
    schedulePublished: field.boolean().default(false),
    // Public-site branding: JSON { accent, logoUrl, tagline } edited on the
    // Branding page and consumed by the public event site.
    brandingJson: field.string().optional(),
    createdAt: field.datetime().defaultNow(),
  },
  {
    indexes: [
      { name: "by_org_slug", fields: ["orgId", "slug"], unique: true },
      { name: "by_org", fields: ["orgId"], unique: false },
    ],
  },
);

const SubmissionForm = entity(
  "SubmissionForm",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    name: field.string(),
    slug: field.string(),
    description: field.string().optional(),
    // "draft" | "open" | "closed" — open forms are publicly readable (the
    // public CFP page renders fieldsJson directly).
    status: field.string().default("draft"),
    opensAt: field.datetime().optional(),
    closesAt: field.datetime().optional(),
    // Ordered FormField[] — see lib/forms.ts for the shape (type, key, label,
    // required, options, showIf).
    fieldsJson: field.json().optional(),
    // RoutingRule[] — first matching rule assigns the submission's category.
    routingJson: field.json().optional(),
    // Explicit organizer-owned source field/value mappings for agenda handoff.
    handoffMappingsJson: field.json().optional(),
    confirmationMessage: field.string().optional(),
    createdAt: field.datetime().defaultNow(),
  },
  {
    indexes: [
      { name: "by_event", fields: ["eventId"], unique: false },
      { name: "by_event_slug", fields: ["eventId", "slug"], unique: true },
    ],
  },
);

const Submission = entity(
  "Submission",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    formId: field.id("SubmissionForm").readonly(),
    speakerUserId: field.id("User").readonly(),
    title: field.string(),
    abstract: field.string().optional(),
    // Answers keyed by field key, validated against the form's fieldsJson at
    // submit time (lib/forms.ts validateAnswers).
    answersJson: field.json().optional(),
    // Immutable snapshot stamped only when an authenticated draft finalizes.
    participantSnapshotJson: field.json().readonly().optional(),
    // Stamped by routing rules at submit; organizers can override.
    category: field.string().optional(),
    // "submitted" | "in_review" | "accepted" | "rejected" | "waitlisted" |
    // "withdrawn". Status changes go through functions so emails can fire.
    status: field.string().default("submitted"),
    currentRound: field.int().default(1),
    // True when the submitter had not proven their inbox at submit time.
    // Intake is open to anyone, so organizers get to see which addresses are
    // unproven rather than the CFP silently refusing them.
    emailUnverified: field.boolean().default(false),
    // AI first-pass triage: advisory only, never a decision.
    triageScore: field.float().optional(),
    triageSummary: field.string().optional(),
    triageAt: field.datetime().optional(),
    submittedAt: field.datetime().defaultNow(),
    updatedAt: field.datetime().optional(),
    finalizedAt: field.datetime().optional(),
  },
  {
    indexes: [
      { name: "by_event", fields: ["eventId"], unique: false },
      { name: "by_speaker", fields: ["speakerUserId"], unique: false },
      { name: "by_form", fields: ["formId"], unique: false },
    ],
  },
);

const SubmissionDraft = entity(
  "SubmissionDraft",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    formId: field.id("SubmissionForm").readonly(),
    ownerUserId: field.id("User").readonly(),
    name: field.string(),
    title: field.string(),
    abstract: field.string().optional(),
    answersJson: field.json().optional(),
    lifecycle: field.string().default("draft"),
    finalizedSubmissionId: field.id("Submission").optional(),
    createdAt: field.datetime().defaultNow(),
    updatedAt: field.datetime().defaultNow(),
    finalizedAt: field.datetime().optional(),
  },
  {
    indexes: [
      { name: "by_owner_form", fields: ["ownerUserId", "formId"], unique: false },
      { name: "by_owner", fields: ["ownerUserId"], unique: false },
      { name: "by_event", fields: ["eventId"], unique: false },
    ],
  },
);

const SubmissionParticipantInvite = entity(
  "SubmissionParticipantInvite",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    formId: field.id("SubmissionForm").readonly(),
    draftId: field.id("SubmissionDraft").readonly(),
    ownerUserId: field.id("User").readonly(),
    provisionalUserId: field.id("User").readonly(),
    email: field.string().readonly(),
    name: field.string(),
    roleLabel: field.string(),
    tokenHash: field.string().serverOnly(),
    status: field.string().default("pending"),
    expiresAt: field.datetime(),
    consumedAt: field.datetime().optional(),
    createdAt: field.datetime().defaultNow(),
  },
  {
    indexes: [
      { name: "by_draft_email", fields: ["draftId", "email"], unique: true },
      { name: "by_participant", fields: ["provisionalUserId"], unique: false },
      { name: "by_draft", fields: ["draftId"], unique: false },
    ],
  },
);

const SpeakerProfile = entity(
  "SpeakerProfile",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    userId: field.id("User").readonly(),
    name: field.string(),
    email: field.string(),
    tagline: field.string().optional(),
    bio: field.string().optional(),
    company: field.string().optional(),
    jobTitle: field.string().optional(),
    headshotFileId: field.string().optional(),
    headshotUrl: field.string().optional(),
    status: field.string().default("invited"),
    claimStatus: field.string().default("unclaimed"),
    logistics: field.string().optional(),
    tagsJson: field.json().optional(),
    customJson: field.json().optional(),
    invitedAt: field.datetime().optional(),
    claimedAt: field.datetime().optional(),
    // Set when an organizer revokes the claim (resetSpeakerClaim). While
    // present, claimSpeakerProfile refuses the same account's automatic
    // re-claim; correctSpeakerEmail clears it once the address is fixed.
    claimResetAt: field.datetime().optional(),
    updatedAt: field.datetime().optional(),
    // { website?, twitter?, linkedin?, github? }
    linksJson: field.json().optional(),
    createdAt: field.datetime().defaultNow(),
  },
  {
    indexes: [
      { name: "by_event_user", fields: ["eventId", "userId"], unique: true },
      { name: "by_user", fields: ["userId"], unique: false },
      { name: "by_event", fields: ["eventId"], unique: false },
    ],
  },
);

const SpeakerFile = entity(
  "SpeakerFile",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    userId: field.id("User").readonly(),
    // "headshot" | "slides" | "document"
    kind: field.string(),
    fileId: field.string(),
    label: field.string().optional(),
    createdAt: field.datetime().defaultNow(),
  },
  {
    indexes: [
      { name: "by_event_user", fields: ["eventId", "userId"], unique: false },
    ],
  },
);

// Task/session-bound deliverables are additive to SpeakerFile. SpeakerFile is
// retained for existing profile/headshot rows; it never satisfies a bounded
// upload task.
const DeliverableSlot = entity(
  "DeliverableSlot",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    speakerUserId: field.id("User").readonly(),
    taskId: field.id("SpeakerTask").readonly().optional(),
    sessionId: field.id("Session").readonly().optional(),
    kind: field.string(),
    title: field.string(),
    // Organizer verdict on the current version: "pending" | "approved" |
    // "changes_requested". Written only by reviewDeliverable; a new version
    // upload resets it to pending. All client writes are policy-denied.
    status: field.string().default("pending"),
    reviewNote: field.string().optional(),
    reviewedAt: field.datetime().optional(),
    createdAt: field.datetime().defaultNow(),
  },
  {
    indexes: [
      { name: "by_task", fields: ["taskId"], unique: true },
      { name: "by_session_speaker", fields: ["sessionId", "speakerUserId"], unique: false },
      { name: "by_event_speaker", fields: ["eventId", "speakerUserId"], unique: false },
    ],
  },
);

const DeliverableVersion = entity(
  "DeliverableVersion",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    slotId: field.id("DeliverableSlot").readonly(),
    speakerUserId: field.id("User").readonly(),
    uploaderUserId: field.id("User").readonly(),
    fileId: field.string().readonly(),
    // Confirmation URLs can be provider-specific or short-lived; never expose
    // them through entity reads. Speakers download through /api/files/<id>.
    fileUrl: field.string().readonly().serverOnly(),
    filename: field.string().readonly(),
    mimeType: field.string().readonly(),
    size: field.int().readonly(),
    versionNumber: field.int().readonly(),
    createdAt: field.datetime().defaultNow(),
  },
  {
    indexes: [
      { name: "by_slot_version", fields: ["slotId", "versionNumber"], unique: true },
      { name: "by_event", fields: ["eventId"], unique: false },
    ],
  },
);

const DeliverableComment = entity(
  "DeliverableComment",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    slotId: field.id("DeliverableSlot").readonly(),
    versionId: field.id("DeliverableVersion").readonly().optional(),
    speakerUserId: field.id("User").readonly(),
    authorUserId: field.id("User").readonly(),
    authorName: field.string().readonly(),
    authorRole: field.string().readonly(),
    body: field.string().readonly(),
    createdAt: field.datetime().defaultNow(),
  },
  { indexes: [{ name: "by_slot", fields: ["slotId"], unique: false }] },
);

const ReviewerMembership = entity(
  "ReviewerMembership",
  {
    orgId: field.id("Org").readonly(),
    userId: field.id("User").readonly(),
    // Framework role remains `member`; this app-owned designation is the
    // reviewer authority checked by every review function.
    status: field.string().default("active"),
    createdBy: field.id("User").readonly(),
    createdAt: field.datetime().defaultNow(),
    updatedAt: field.datetime().optional(),
  },
  {
    indexes: [
      { name: "by_org_user", fields: ["orgId", "userId"], unique: true },
      { name: "by_user", fields: ["userId"], unique: false },
    ],
  },
);

const ReviewRound = entity(
  "ReviewRound",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    roundNumber: field.int(),
    name: field.string(),
    // ReviewCriterion[]; legacy { key, label, max } rows remain numeric.
    criteriaJson: field.json().optional(),
    opensAt: field.datetime().optional(),
    closesAt: field.datetime().optional(),
    anonymized: field.boolean().default(true),
    revealPeerReviews: field.boolean().default(false),
    // "open" | "closed"
    status: field.string().default("open"),
  },
  {
    indexes: [
      { name: "by_event_round", fields: ["eventId", "roundNumber"], unique: true },
    ],
  },
);

const ReviewRoundReviewer = entity(
  "ReviewRoundReviewer",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    roundId: field.id("ReviewRound").readonly(),
    reviewerUserId: field.id("User").readonly(),
    status: field.string().default("active"),
    addedAt: field.datetime().defaultNow(),
  },
  {
    indexes: [
      { name: "by_round_reviewer", fields: ["roundId", "reviewerUserId"], unique: true },
      { name: "by_reviewer", fields: ["reviewerUserId"], unique: false },
    ],
  },
);

const ReviewAssignment = entity(
  "ReviewAssignment",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    roundId: field.id("ReviewRound").readonly(),
    submissionId: field.id("Submission").readonly(),
    reviewerUserId: field.id("User").readonly(),
    // "assigned" | "complete" | "recused"
    status: field.string().default("assigned"),
    assignedAt: field.datetime().defaultNow(),
    completedAt: field.datetime().optional(),
    recusedAt: field.datetime().optional(),
    recusalReason: field.string().optional(),
  },
  {
    indexes: [
      {
        name: "by_round_submission_reviewer",
        fields: ["roundId", "submissionId", "reviewerUserId"],
        unique: true,
      },
      { name: "by_round_reviewer", fields: ["roundId", "reviewerUserId"], unique: false },
      { name: "by_reviewer", fields: ["reviewerUserId"], unique: false },
      { name: "by_submission", fields: ["submissionId"], unique: false },
    ],
  },
);

const Review = entity(
  "Review",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    submissionId: field.id("Submission").readonly(),
    roundId: field.id("ReviewRound").readonly(),
    reviewerUserId: field.id("User").readonly(),
    // { [criterionKey]: number }
    scoresJson: field.json().optional(),
    comment: field.string().optional(),
    // "accept" | "reject" | "neutral"
    recommendation: field.string().optional(),
    createdAt: field.datetime().defaultNow(),
    updatedAt: field.datetime().optional(),
  },
  {
    indexes: [
      {
        name: "by_submission_round_reviewer",
        fields: ["submissionId", "roundId", "reviewerUserId"],
        unique: true,
      },
      { name: "by_event", fields: ["eventId"], unique: false },
    ],
  },
);

const Room = entity(
  "Room",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    name: field.string(),
    capacity: field.int().optional(),
    sortOrder: field.int().default(0),
  },
  { indexes: [{ name: "by_event", fields: ["eventId"], unique: false }] },
);

// Reference material an organizer publishes into the speaker portal: a run of
// show, a brand kit, travel notes. `bodyHtml` accepts embed markup (a Notion or
// Google Doc iframe, a video) so existing material can be pointed at rather
// than retyped, which is the whole point of the requirement.
const PortalResource = entity(
  "PortalResource",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    title: field.string(),
    // Plain prose, rendered as markdown in the portal.
    body: field.string().optional(),
    // Raw embed markup. Sanitized on the way in (lib/portal-resources.ts) and
    // rendered in a sandboxed iframe, never injected into the portal document.
    embedUrl: field.string().optional(),
    // Speakers only see published pages; drafts stay organizer-only.
    published: field.boolean().default(false),
    sortOrder: field.int().default(0),
    createdAt: field.datetime().defaultNow(),
    updatedAt: field.datetime().optional(),
  },
  { indexes: [{ name: "by_event", fields: ["eventId"], unique: false }] },
);

const Track = entity(
  "Track",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    name: field.string(),
    color: field.string().optional(),
    sortOrder: field.int().default(0),
  },
  { indexes: [{ name: "by_event", fields: ["eventId"], unique: false }] },
);

const Session = entity(
  "Session",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    // Breaks/keynotes have no backing submission.
    submissionId: field.id("Submission").optional(),
    title: field.string(),
    description: field.string().optional(),
    roomId: field.id("Room").optional(),
    trackId: field.id("Track").optional(),
    // Null start/room = unscheduled tray.
    startTime: field.datetime().optional(),
    endTime: field.datetime().optional(),
    // string[] of User ids — sessions can have co-speakers.
    speakerUserIdsJson: field.json().optional(),
    // "talk" | "keynote" | "break" | "workshop"
    kind: field.string().default("talk"),
    // Content approval is independent from schedule publication.
    contentStatus: field.string().default("draft"),
    currentRevisionId: field.id("SessionContentRevision").optional(),
    approvedRevisionId: field.id("SessionContentRevision").optional(),
    approvedAt: field.datetime().optional(),
    approvedByUserId: field.id("User").optional(),
  },
  { indexes: [{ name: "by_event", fields: ["eventId"], unique: false }] },
);

const SessionContentRevision = entity(
  "SessionContentRevision",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    sessionId: field.id("Session").readonly(),
    revisionNumber: field.int().readonly(),
    title: field.string().readonly(),
    description: field.string().readonly().optional(),
    speakerUserIdsJson: field.json().readonly().optional(),
    editorUserId: field.id("User").readonly(),
    editorName: field.string().readonly(),
    restoredFromRevisionId: field.id("SessionContentRevision").readonly().optional(),
    createdAt: field.datetime().defaultNow(),
  },
  {
    indexes: [
      { name: "by_session_revision", fields: ["sessionId", "revisionNumber"], unique: true },
      { name: "by_event", fields: ["eventId"], unique: false },
    ],
  },
);

const TaskTemplate = entity(
  "TaskTemplate",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    title: field.string(),
    description: field.string().optional(),
    // "confirm" | "upload" | "form" | "link"
    kind: field.string().default("confirm"),
    // For kind=form: same FormField[] shape as SubmissionForm.fieldsJson.
    formJson: field.json().optional(),
    // For kind=upload: SpeakerFile.kind to require. For kind=link: the URL.
    target: field.string().optional(),
    dueAt: field.datetime().optional(),
    // "accepted" | "all"
    appliesTo: field.string().default("accepted"),
    sortOrder: field.int().default(0),
  },
  { indexes: [{ name: "by_event", fields: ["eventId"], unique: false }] },
);

const SpeakerTask = entity(
  "SpeakerTask",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    taskTemplateId: field.id("TaskTemplate").readonly(),
    speakerUserId: field.id("User").readonly(),
    // "pending" | "done"
    status: field.string().default("pending"),
    completedAt: field.datetime().optional(),
    // For kind=form tasks: the speaker's answers.
    responseJson: field.json().optional(),
  },
  {
    indexes: [
      {
        name: "by_template_speaker",
        fields: ["taskTemplateId", "speakerUserId"],
        unique: true,
      },
      { name: "by_event_speaker", fields: ["eventId", "speakerUserId"], unique: false },
    ],
  },
);

const EmailTemplate = entity(
  "EmailTemplate",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    // "submission_received" | "accepted" | "rejected" | "task_reminder" |
    // "schedule_invite" | custom keys.
    key: field.string(),
    subject: field.string(),
    // Plain-text export used by today's email transport and as a fallback for
    // templates created before the visual editor was introduced.
    body: field.string(),
    // React Email Editor exports. JSON is the editable source; HTML is ready
    // for the runtime's HTML transport once that API is available.
    bodyHtml: field.string().optional(),
    bodyJson: field.json().optional(),
    enabled: field.boolean().default(true),
  },
  {
    indexes: [{ name: "by_event_key", fields: ["eventId", "key"], unique: true }],
  },
);

const EmailLog = entity(
  "EmailLog",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    toEmail: field.string(),
    templateKey: field.string().optional(),
    subject: field.string(),
    // "sent" | "failed"
    status: field.string(),
    error: field.string().optional(),
    sentAt: field.datetime().defaultNow(),
  },
  { indexes: [{ name: "by_event", fields: ["eventId"], unique: false }] },
);

// Copilot chat history — threads survive tab switches and devices because
// messages are rows, not client state. Writes go through the copilot
// functions only.
const CopilotThread = entity(
  "CopilotThread",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    title: field.string(),
    createdBy: field.id("User").readonly(),
    createdAt: field.datetime().defaultNow(),
    updatedAt: field.datetime().optional(),
  },
  { indexes: [{ name: "by_event", fields: ["eventId"], unique: false }] },
);

const CopilotMessage = entity(
  "CopilotMessage",
  {
    orgId: field.id("Org").readonly(),
    threadId: field.id("CopilotThread").readonly(),
    // "user" | "assistant"
    role: field.string(),
    text: field.string(),
    // [{name, input, result, isError?}] for assistant turns that used tools.
    toolCallsJson: field.json().optional(),
    createdAt: field.datetime().defaultNow(),
  },
  { indexes: [{ name: "by_thread", fields: ["threadId"], unique: false }] },
);

// Secret-token calendar downloads. The token is never replicated or returned
// by entity APIs; getCalendarInvite is the only public read surface and looks
// up exactly one unguessable token.
// Workspace-level CRM notes. Keyed to the PERSON (email), not a per-event
// profile, so a note written after one event follows the speaker to the next.
const SpeakerNote = entity(
  "SpeakerNote",
  {
    orgId: field.id("Org").readonly(),
    email: field.string().readonly(),
    authorUserId: field.id("User").readonly(),
    authorName: field.string().readonly(),
    body: field.string().readonly(),
    createdAt: field.datetime().defaultNow(),
  },
  { indexes: [{ name: "by_org_email", fields: ["orgId", "email"], unique: false }] },
);

const Contact = entity(
  "Contact",
  {
    orgId: field.id("Org").readonly(),
    name: field.string(),
    email: field.string(),
    company: field.string().optional(),
    jobTitle: field.string().optional(),
    headshotUrl: field.string().optional(),
    bio: field.string().optional(),
    // Sourcing pipeline: "prospect" | "contacted" | "invited" | "confirmed" | "declined".
    stage: field.string().default("prospect"),
    tagsJson: field.json().optional(),
    notes: field.string().optional(),
    createdAt: field.datetime().defaultNow(),
    updatedAt: field.datetime().defaultNow(),
  },
  {
    indexes: [
      { name: "by_org", fields: ["orgId"], unique: false },
      { name: "by_org_email", fields: ["orgId", "email"], unique: true },
    ],
  },
);

// Stage moves are the CRM's audit trail, so they're rows, not a JSON blob.
const ContactStageEvent = entity(
  "ContactStageEvent",
  {
    orgId: field.id("Org").readonly(),
    contactId: field.id("Contact").readonly(),
    fromStage: field.string().optional().readonly(),
    toStage: field.string().readonly(),
    actorName: field.string().optional().readonly(),
    createdAt: field.datetime().defaultNow(),
  },
  { indexes: [{ name: "by_contact", fields: ["contactId"], unique: false }] },
);

// A saved segment is a named filter over the directory.
const ContactSegment = entity(
  "ContactSegment",
  {
    orgId: field.id("Org").readonly(),
    name: field.string(),
    filtersJson: field.json(),
    createdAt: field.datetime().defaultNow(),
  },
  { indexes: [{ name: "by_org", fields: ["orgId"], unique: false }] },
);

const ActivityLog = entity(
  "ActivityLog",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.string().optional().readonly(),
    actorName: field.string().optional().readonly(),
    // Dotted kind, e.g. "submission.created", "content.approved".
    kind: field.string().readonly(),
    message: field.string().readonly(),
    // In-app link the bell menu navigates to.
    href: field.string().optional().readonly(),
    createdAt: field.datetime().defaultNow(),
  },
  { indexes: [{ name: "by_org", fields: ["orgId"], unique: false }] },
);

const CalendarInvite = entity(
  "CalendarInvite",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    sessionId: field.id("Session").readonly(),
    speakerUserId: field.id("User").readonly(),
    token: field.string().unique().serverOnly(),
    sequence: field.int().default(0),
    lastSentAt: field.datetime().optional(),
    createdAt: field.datetime().defaultNow(),
  },
  {
    indexes: [
      {
        name: "by_session_speaker",
        fields: ["sessionId", "speakerUserId"],
        unique: true,
      },
    ],
    sync: false,
  },
);

// ---------------------------------------------------------------------------
// Policies. Organizer surface = active-tenant match. Speaker surface = owner
// match where a single-row expression can express it; everything richer
// (editing submissions, completing tasks) goes through server functions that
// re-check ownership in the handler.
// ---------------------------------------------------------------------------

const userPolicy = policy({
  name: "user_self",
  entity: "User",
  allowRead: "auth.userId == data.id",
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

// Orgs are publicly readable: the public event site lives at
// /<org-slug>/<event-slug> and anonymous visitors resolve the org by slug.
// Only name/slug/createdAt are exposed — createdBy is serverOnly.
const orgPolicy = policy({
  name: "org_access",
  entity: "Org",
  allowRead: "true",
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});
const orgMemberPolicy = policy({
  name: "org_member_access",
  entity: "OrgMember",
  allowRead: "auth.userId == data.userId || auth.tenantId == data.orgId",
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});
const orgInvitePolicy = policy({
  name: "org_invite_access",
  entity: "OrgInvite",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

// Non-draft events are public: the CFP page + schedule need name/dates. All
// writes stay in the active tenant.
const eventPolicy = policy({
  name: "event_access",
  entity: "Event",
  allowRead: 'auth.tenantId == data.orgId || data.cfpStatus != "draft"',
  allowInsert: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowUpdate: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowDelete: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
});

// Open forms are public (the CFP page renders fieldsJson).
const formPolicy = policy({
  name: "form_access",
  entity: "SubmissionForm",
  allowRead: 'auth.tenantId == data.orgId || data.status != "draft"',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const submissionDraftPolicy = policy({
  name: "submission_draft_owner",
  entity: "SubmissionDraft",
  allowRead: "auth.userId == data.ownerUserId",
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const submissionParticipantInvitePolicy = policy({
  name: "submission_participant_invite_access",
  entity: "SubmissionParticipantInvite",
  allowRead: "auth.userId == data.ownerUserId || auth.userId == data.provisionalUserId",
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

// Reviewers are framework members, so tenant equality alone is not an
// organizer gate. Raw proposal access is owner/admin or speaker-self only;
// reviewers receive assignment-scoped projections from getReviewerQueue.
const submissionPolicy = policy({
  name: "submission_access",
  entity: "Submission",
  allowRead:
    'auth.userId == data.speakerUserId || (auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin"))',
  allowInsert: "false",
  allowUpdate: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowDelete: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
});

// Speakers and organizers read only their permitted rows. All profile writes
// use validated server functions so lifecycle and ownership fields cannot be
// changed through direct entity updates.
const speakerProfilePolicy = policy({
  name: "speaker_profile_access",
  entity: "SpeakerProfile",
  allowRead:
    'auth.userId == data.userId || (auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin"))',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
});

const speakerFilePolicy = policy({
  name: "speaker_file_access",
  entity: "SpeakerFile",
  allowRead:
    'auth.userId == data.userId || (auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin"))',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete:
    'auth.userId == data.userId || (auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin"))',
});

const deliverableSlotPolicy = policy({
  name: "deliverable_slot_access",
  entity: "DeliverableSlot",
  allowRead:
    'auth.userId == data.speakerUserId || (auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin"))',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const deliverableVersionPolicy = policy({
  name: "deliverable_version_access",
  entity: "DeliverableVersion",
  allowRead:
    'auth.userId == data.speakerUserId || (auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin"))',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const deliverableCommentPolicy = policy({
  name: "deliverable_comment_access",
  entity: "DeliverableComment",
  allowRead:
    'auth.userId == data.speakerUserId || (auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin"))',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const reviewRoundPolicy = policy({
  name: "review_round_access",
  entity: "ReviewRound",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const reviewPolicy = policy({
  name: "review_access",
  entity: "Review",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const reviewerMembershipPolicy = policy({
  name: "reviewer_membership_access",
  entity: "ReviewerMembership",
  allowRead:
    'auth.userId == data.userId || (auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin"))',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const reviewRoundReviewerPolicy = policy({
  name: "review_round_reviewer_access",
  entity: "ReviewRoundReviewer",
  allowRead:
    'auth.userId == data.reviewerUserId || (auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin"))',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const reviewAssignmentPolicy = policy({
  name: "review_assignment_access",
  entity: "ReviewAssignment",
  allowRead:
    'auth.userId == data.reviewerUserId || (auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin"))',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const roomPolicy = policy({
  name: "room_access",
  entity: "Room",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});
const portalResourcePolicy = policy({
  name: "portal_resource_access",
  entity: "PortalResource",
  // Organizers read their workspace's pages; speakers read published ones
  // through getPortalResources (auth: "user"), which filters server-side.
  // Writes are function-only so the embed sanitizer can never be bypassed.
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});
const trackPolicy = policy({
  name: "track_access",
  entity: "Track",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});
const sessionPolicy = policy({
  name: "session_access",
  entity: "Session",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});
const sessionContentRevisionPolicy = policy({
  name: "session_content_revision_access",
  entity: "SessionContentRevision",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const taskTemplatePolicy = policy({
  name: "task_template_access",
  entity: "TaskTemplate",
  allowRead:
    '(auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")) || exists(SpeakerTask where taskTemplateId == data.id and speakerUserId == auth.userId)',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

// Speakers see their own task rows live in the portal; completion goes through
// completeTask (validates form answers, stamps completedAt).
const speakerTaskPolicy = policy({
  name: "speaker_task_access",
  entity: "SpeakerTask",
  allowRead:
    'auth.userId == data.speakerUserId || (auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin"))',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const emailTemplatePolicy = policy({
  name: "email_template_access",
  entity: "EmailTemplate",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowUpdate: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowDelete: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
});
const emailLogPolicy = policy({
  name: "email_log_access",
  entity: "EmailLog",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});
const copilotThreadPolicy = policy({
  name: "copilot_thread_access",
  entity: "CopilotThread",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
});
const copilotMessagePolicy = policy({
  name: "copilot_message_access",
  entity: "CopilotMessage",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const speakerNotePolicy = policy({
  name: "speaker_note_access",
  entity: "SpeakerNote",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const contactPolicy = policy({
  name: "contact_access",
  entity: "Contact",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});
const contactStageEventPolicy = policy({
  name: "contact_stage_event_access",
  entity: "ContactStageEvent",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});
const contactSegmentPolicy = policy({
  name: "contact_segment_access",
  entity: "ContactSegment",
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const activityLogPolicy = policy({
  name: "activity_log_access",
  entity: "ActivityLog",
  // Organizers read their workspace's feed; rows are written only by server
  // functions (logActivity) so clients can't forge history.
  allowRead: 'auth.tenantId == data.orgId && auth.hasAnyRole("owner", "admin")',
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const calendarInvitePolicy = policy({
  name: "calendar_invite_server_only",
  entity: "CalendarInvite",
  allowRead: "false",
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});

const discoveredFunctions = await discoverFunctions();

const manifest = buildManifest({
  name: "smolboard",
  version: "0.1.0",
  entities: [
    User,
    Org,
    OrgMember,
    OrgInvite,
    Event,
    SubmissionForm,
    Submission,
    SubmissionDraft,
    SubmissionParticipantInvite,
    SpeakerProfile,
    SpeakerFile,
    PortalResource,
    DeliverableSlot,
    DeliverableVersion,
    DeliverableComment,
    ReviewerMembership,
    ReviewRound,
    ReviewRoundReviewer,
    ReviewAssignment,
    Review,
    Room,
    Track,
    Session,
    SessionContentRevision,
    TaskTemplate,
    SpeakerTask,
    EmailTemplate,
    EmailLog,
    SpeakerNote,
    Contact,
    ContactStageEvent,
    ContactSegment,
    ActivityLog,
    CalendarInvite,
    CopilotThread,
    CopilotMessage,
  ],
  // Read from functions/ rather than hand-listed, so the manifest cannot
  // drift from what the router actually serves.
  queries: discoveredFunctions.queries,
  actions: discoveredFunctions.actions,
  policies: [
    userPolicy,
    orgPolicy,
    orgMemberPolicy,
    orgInvitePolicy,
    eventPolicy,
    formPolicy,
    submissionPolicy,
    submissionDraftPolicy,
    submissionParticipantInvitePolicy,
    speakerProfilePolicy,
    speakerFilePolicy,
    deliverableSlotPolicy,
    deliverableVersionPolicy,
    deliverableCommentPolicy,
    reviewerMembershipPolicy,
    reviewRoundPolicy,
    reviewRoundReviewerPolicy,
    reviewAssignmentPolicy,
    reviewPolicy,
    roomPolicy,
    trackPolicy,
    portalResourcePolicy,
    sessionPolicy,
    sessionContentRevisionPolicy,
    taskTemplatePolicy,
    speakerTaskPolicy,
    emailTemplatePolicy,
    emailLogPolicy,
    speakerNotePolicy,
    contactPolicy,
    contactStageEventPolicy,
    contactSegmentPolicy,
    activityLogPolicy,
    calendarInvitePolicy,
    copilotThreadPolicy,
    copilotMessagePolicy,
  ],
  crons: [
    cron("0 14 * * *", "sendActivityDigest", {
      description: "Email organizers a daily summary of workspace activity",
    }),
    cron("0 15 * * *", "sendTaskReminders", {
      description: "Email speakers with due or overdue onboarding tasks",
    }),
  ],
  // Email/password (organizers) + magic codes (speakers) are both built-in;
  // magic /api/auth/magic/* routes need no extra config. trustedOrigins is
  // REQUIRED in production — without it the CORS gate refuses to boot.
  auth: auth({
    trustedOrigins: [
      "https://smolboard.smallware.run",
      "https://smolboard.app",
      "https://www.smolboard.app",
      "http://localhost:4321",
    ],
  }),
  fonts: [
    font({
      family: "Inter",
      variable: "--font-sans",
      weights: ["400", "500", "600", "700"],
      subsets: ["latin"],
      display: "swap",
      preload: true,
    }),
  ],
  routes: await discoverAppRoutes(),
});

console.log(JSON.stringify(manifest, null, 2));

export default manifest;
