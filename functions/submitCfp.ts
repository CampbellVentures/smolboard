import { mutation, v } from "@pylonsync/functions";
import {
  parseFields,
  parseRouting,
  pruneAnswers,
  routeSubmission,
  validateAnswers,
  type Answers,
} from "../lib/forms";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public CFP submission. Anonymous callers: finds-or-creates the speaker's
// User row by email (they later sign in to /portal with a magic code sent to
// that address — no password), upserts their per-event SpeakerProfile, and
// inserts the Submission with answers validated server-side against the form
// definition. The confirmation email is scheduled onto an action because
// mutations are transactional and must not do network I/O.
export default mutation<
  {
    formId: string;
    name: string;
    email: string;
    title: string;
    abstract?: string;
    answers?: Record<string, unknown>;
  },
  { submissionId: string; portalPath: string }
>({
  auth: "public",
  args: {
    formId: v.id("SubmissionForm"),
    name: v.string(),
    email: v.string(),
    title: v.string(),
    abstract: v.optional(v.string()),
    answers: v.optional(v.json()),
  },
  async handler(ctx, args) {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const title = args.title.trim();
    if (!name) throw ctx.error("INVALID_ARGS", "Your name is required.");
    if (!EMAIL_RE.test(email)) throw ctx.error("INVALID_ARGS", "Enter a valid email address.");
    if (!title) throw ctx.error("INVALID_ARGS", "A talk title is required.");
    if (title.length > 200) throw ctx.error("INVALID_ARGS", "Keep the title under 200 characters.");

    // Anonymous-callable → read the gate rows via the trusted surface, then
    // enforce the gates by hand: form AND event CFP must both be open.
    // (ctx.db.unsafe: public mutation; the anonymous caller has no tenant, and
    // these rows are the public CFP definition being submitted against.)
    const form = await ctx.db.unsafe.get("SubmissionForm", args.formId);
    if (!form || form.status !== "open") {
      throw ctx.error("NOT_FOUND", "This form is not accepting submissions.");
    }
    const event = await ctx.db.unsafe.get("Event", form.eventId as string);
    if (!event || event.cfpStatus !== "open") {
      throw ctx.error("NOT_FOUND", "The call for speakers is closed.");
    }

    // Validate custom answers against the form definition. prune first so
    // hidden-field and unknown keys are dropped, then check required/format.
    const fields = parseFields(safeParse(form.fieldsJson));
    const answers = pruneAnswers(fields, (args.answers ?? {}) as Answers);
    const errors = validateAnswers(fields, answers);
    if (errors.length > 0) {
      throw ctx.error("INVALID_ARGS", errors.map((e) => e.message).join(" "));
    }
    const category = routeSubmission(parseRouting(safeParse(form.routingJson)), answers);

    // Find-or-create the speaker account by email. Existing organizers/speakers
    // reuse their row; brand-new speakers get a passwordless account (magic
    // code is their sign-in path).
    // ctx.db.unsafe: cross-user lookup by email is exactly the trusted-context
    // case — an anonymous caller must be able to attach to the right account.
    let user = await ctx.db.unsafe.lookup("User", "email", email);
    if (!user) {
      const userId = await ctx.db.unsafe.insert("User", {
        email,
        displayName: name,
      });
      user = { id: userId };
    }
    const speakerUserId = user.id as string;
    const orgId = event.orgId as string;
    const eventId = event.id as string;

    // Upsert the per-event speaker profile (unique by eventId+userId).
    // ctx.db.unsafe: row ownership was just established via the email lookup.
    const profiles = await ctx.db.unsafe.query("SpeakerProfile", {
      eventId,
      userId: speakerUserId,
    });
    if (profiles.length === 0) {
      await ctx.db.unsafe.insert("SpeakerProfile", {
        orgId,
        eventId,
        userId: speakerUserId,
        name,
        email,
      });
    }

    const submissionId = await ctx.db.unsafe.insert("Submission", {
      orgId,
      eventId,
      formId: args.formId,
      speakerUserId,
      title,
      abstract: args.abstract?.trim() || undefined,
      answersJson: answers,
      category,
      status: "submitted",
      currentRound: 1,
    });

    // Confirmation email fires from an action (network I/O is not allowed in a
    // transactional mutation). sendTemplatedEmail is internal:true, so a
    // public caller must elevate to enqueue it — the elevation covers only
    // this scheduler hop, with fixed args we control.
    await ctx.auth.elevate({
      admin: true,
      reason: "queue CFP confirmation email after a validated public submission",
    });
    await ctx.scheduler.runAfter(0, "sendTemplatedEmail", {
      eventId,
      templateKey: "submission_received",
      toEmail: email,
      vars: {
        speaker_name: name,
        talk_title: title,
      },
    });

    return { submissionId, portalPath: "/portal" };
  },
});

// json columns are parsed-on-read since 0.3.378; the string branch covers
// rows written before the migration.
function safeParse(raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
