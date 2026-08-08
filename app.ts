import {
  entity,
  field,
  policy,
  auth,
  buildManifest,
  discoverAppRoutes,
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
    createdBy: field.id("User"),
    createdAt: field.datetime(),
  },
  { indexes: [{ name: "by_created_by", fields: ["createdBy"], unique: false }] },
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
    // Global URL handle: /cfp/[slug], /[slug]/schedule.
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
    createdAt: field.datetime().defaultNow(),
  },
  {
    indexes: [
      { name: "by_slug", fields: ["slug"], unique: true },
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
    // Ordered FormField[] — see lib/forms.ts for the shape (type, key, label,
    // required, options, showIf).
    fieldsJson: field.json().optional(),
    // RoutingRule[] — first matching rule assigns the submission's category.
    routingJson: field.json().optional(),
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
    // Stamped by routing rules at submit; organizers can override.
    category: field.string().optional(),
    // "submitted" | "in_review" | "accepted" | "rejected" | "waitlisted" |
    // "withdrawn". Status changes go through functions so emails can fire.
    status: field.string().default("submitted"),
    currentRound: field.int().default(1),
    submittedAt: field.datetime().defaultNow(),
    updatedAt: field.datetime().optional(),
  },
  {
    indexes: [
      { name: "by_event", fields: ["eventId"], unique: false },
      { name: "by_speaker", fields: ["speakerUserId"], unique: false },
      { name: "by_form", fields: ["formId"], unique: false },
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

const ReviewRound = entity(
  "ReviewRound",
  {
    orgId: field.id("Org").readonly(),
    eventId: field.id("Event").readonly(),
    roundNumber: field.int(),
    name: field.string(),
    // ReviewCriterion[]: { key, label, max } (e.g. Relevance 1–5).
    criteriaJson: field.json().optional(),
    // "open" | "closed"
    status: field.string().default("open"),
  },
  {
    indexes: [
      { name: "by_event_round", fields: ["eventId", "roundNumber"], unique: true },
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
  },
  { indexes: [{ name: "by_event", fields: ["eventId"], unique: false }] },
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

const orgPolicy = policy({
  name: "org_access",
  entity: "Org",
  allowRead: "auth.tenantId == data.id",
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
  allowRead: "auth.tenantId == data.orgId",
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
  allowInsert: "auth.tenantId == data.orgId",
  allowUpdate: "auth.tenantId == data.orgId",
  allowDelete: "auth.tenantId == data.orgId",
});

// Open forms are public (the CFP page renders fieldsJson).
const formPolicy = policy({
  name: "form_access",
  entity: "SubmissionForm",
  allowRead: 'auth.tenantId == data.orgId || data.status == "open"',
  allowInsert: "auth.tenantId == data.orgId",
  allowUpdate: "auth.tenantId == data.orgId",
  allowDelete: "auth.tenantId == data.orgId",
});

// Speakers read their own rows (live portal queries); all speaker writes go
// through functions (submitCfp / updateMySubmission) so validation + status
// rules apply. Organizers manage rows but status changes should use functions
// so emails fire.
const submissionPolicy = policy({
  name: "submission_access",
  entity: "Submission",
  allowRead: "auth.tenantId == data.orgId || auth.userId == data.speakerUserId",
  allowInsert: "false",
  allowUpdate: "auth.tenantId == data.orgId",
  allowDelete: "auth.tenantId == data.orgId",
});

// Speakers own their profile and may edit it directly from the portal — the
// org/event/user anchor fields are .readonly() so a client update can't move
// the row across tenants.
const speakerProfilePolicy = policy({
  name: "speaker_profile_access",
  entity: "SpeakerProfile",
  allowRead: "auth.tenantId == data.orgId || auth.userId == data.userId",
  allowInsert: "false",
  allowUpdate: "auth.tenantId == data.orgId || auth.userId == data.userId",
  allowDelete: "auth.tenantId == data.orgId",
});

const speakerFilePolicy = policy({
  name: "speaker_file_access",
  entity: "SpeakerFile",
  allowRead: "auth.tenantId == data.orgId || auth.userId == data.userId",
  allowInsert: "auth.userId == data.userId",
  allowUpdate: "false",
  allowDelete: "auth.tenantId == data.orgId || auth.userId == data.userId",
});

const reviewRoundPolicy = policy({
  name: "review_round_access",
  entity: "ReviewRound",
  allowRead: "auth.tenantId == data.orgId",
  allowInsert: "auth.tenantId == data.orgId",
  allowUpdate: "auth.tenantId == data.orgId",
  allowDelete: "auth.tenantId == data.orgId",
});

// Any org member can read all reviews (scores are visible to the committee),
// but a review row is only writable by its own reviewer.
const reviewPolicy = policy({
  name: "review_access",
  entity: "Review",
  allowRead: "auth.tenantId == data.orgId",
  allowInsert: "auth.tenantId == data.orgId && auth.userId == data.reviewerUserId",
  allowUpdate: "auth.tenantId == data.orgId && auth.userId == data.reviewerUserId",
  allowDelete: "auth.tenantId == data.orgId && auth.userId == data.reviewerUserId",
});

const roomPolicy = policy({
  name: "room_access",
  entity: "Room",
  allowRead: "auth.tenantId == data.orgId",
  allowInsert: "auth.tenantId == data.orgId",
  allowUpdate: "auth.tenantId == data.orgId",
  allowDelete: "auth.tenantId == data.orgId",
});
const trackPolicy = policy({
  name: "track_access",
  entity: "Track",
  allowRead: "auth.tenantId == data.orgId",
  allowInsert: "auth.tenantId == data.orgId",
  allowUpdate: "auth.tenantId == data.orgId",
  allowDelete: "auth.tenantId == data.orgId",
});
const sessionPolicy = policy({
  name: "session_access",
  entity: "Session",
  allowRead: "auth.tenantId == data.orgId",
  allowInsert: "auth.tenantId == data.orgId",
  allowUpdate: "auth.tenantId == data.orgId",
  allowDelete: "auth.tenantId == data.orgId",
});

const taskTemplatePolicy = policy({
  name: "task_template_access",
  entity: "TaskTemplate",
  allowRead:
    "auth.tenantId == data.orgId || exists(SpeakerTask where taskTemplateId == data.id and speakerUserId == auth.userId)",
  allowInsert: "auth.tenantId == data.orgId",
  allowUpdate: "auth.tenantId == data.orgId",
  allowDelete: "auth.tenantId == data.orgId",
});

// Speakers see their own task rows live in the portal; completion goes through
// completeTask (validates form answers, stamps completedAt).
const speakerTaskPolicy = policy({
  name: "speaker_task_access",
  entity: "SpeakerTask",
  allowRead: "auth.tenantId == data.orgId || auth.userId == data.speakerUserId",
  allowInsert: "auth.tenantId == data.orgId",
  allowUpdate: "auth.tenantId == data.orgId",
  allowDelete: "auth.tenantId == data.orgId",
});

const emailTemplatePolicy = policy({
  name: "email_template_access",
  entity: "EmailTemplate",
  allowRead: "auth.tenantId == data.orgId",
  allowInsert: "auth.tenantId == data.orgId",
  allowUpdate: "auth.tenantId == data.orgId",
  allowDelete: "auth.tenantId == data.orgId",
});
const emailLogPolicy = policy({
  name: "email_log_access",
  entity: "EmailLog",
  allowRead: "auth.tenantId == data.orgId",
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "false",
});
const copilotThreadPolicy = policy({
  name: "copilot_thread_access",
  entity: "CopilotThread",
  allowRead: "auth.tenantId == data.orgId",
  allowInsert: "false",
  allowUpdate: "false",
  allowDelete: "auth.tenantId == data.orgId",
});
const copilotMessagePolicy = policy({
  name: "copilot_message_access",
  entity: "CopilotMessage",
  allowRead: "auth.tenantId == data.orgId",
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
    SpeakerProfile,
    SpeakerFile,
    ReviewRound,
    Review,
    Room,
    Track,
    Session,
    TaskTemplate,
    SpeakerTask,
    EmailTemplate,
    EmailLog,
    CalendarInvite,
    CopilotThread,
    CopilotMessage,
  ],
  queries: [],
  actions: [],
  policies: [
    userPolicy,
    orgPolicy,
    orgMemberPolicy,
    orgInvitePolicy,
    eventPolicy,
    formPolicy,
    submissionPolicy,
    speakerProfilePolicy,
    speakerFilePolicy,
    reviewRoundPolicy,
    reviewPolicy,
    roomPolicy,
    trackPolicy,
    sessionPolicy,
    taskTemplatePolicy,
    speakerTaskPolicy,
    emailTemplatePolicy,
    emailLogPolicy,
    calendarInvitePolicy,
    copilotThreadPolicy,
    copilotMessagePolicy,
  ],
  crons: [
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
