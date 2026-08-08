# smolboard — Spec

Open-source Sessionboard replacement for the AIE hackathon. Deadline: **Wed Aug 12, 10PM PT**. Judged by the AIE team against the video walkthrough on a **deployed site**, tiebreak on "would we actually use/buy this" + speed.

## The six firm requirements (everything else is optional)

1. Custom CFP submission forms with conditional logic and category-based routing
2. Self-service speaker portal (bios, headshots, slides, documents)
3. Automated templated speaker emails, incl. reminders and real calendar invites (Gmail/Outlook/iCal)
4. Submission evaluation + scoring workflows (multi-round; AI-assist was struck through — skip)
5. Drag-and-drop agenda builder with conflict detection; list/day/track/room views
6. Real-time dashboard of speakers with outstanding onboarding tasks

Bonuses we take: speed (Pylon SSR is fast by default), API (public read endpoints + documented `/api/fn`). Bonuses we skip: Cloudflare, Airtable, Forge — they fight the stack and are explicitly "mild".

## Architecture

One Pylon app (this repo). Three surfaces, one process:

- **Organizer app** — `/dashboard/*` (exists in template; repurpose). Org = event-organizing team (multi-tenant, from template).
- **Public CFP** — `/cfp/[eventSlug]` and `/cfp/[eventSlug]/[formSlug]`. No auth to view; submitting creates a speaker account.
- **Speaker portal** — `/portal/*`. Speakers are `User` rows that are NOT org members; access scoped by `SpeakerProfile`. Speakers log in with Pylon's built-in **magic codes** (6-digit emailed code, auto-creates the user, no password) — zero custom auth code, zero speaker friction.

Template changes: **remove Stripe billing** (lib/billing.ts, functions/_pylonStripe*, billing dashboard page) — no billing in this product, it's dead weight. Keep auth, orgs, shadcn components. Replace `Project` entity with the domain below. Rewrite marketing homepage as smolboard landing. Replace the template's dashboard shell with the three-pane shell below.

## Organizer UI shell (three-pane)

Nav sidebar, persistent agent pane, content pane. `components/app-shell.tsx` used by every `/dashboard/*` page:

1. **Left sidebar (~220px)** — org/event switcher at top, then event nav: Dashboard, Forms, Abstracts, Agenda, Speakers, Tasks, Emails, Settings. Below: list of recent copilot threads. Collapsible to icons.
2. **Agent pane (~320px, collapsible)** — the **event copilot**, always present. Thread view renders narration + tool-call cards (each `list_submissions` / `schedule_session` call shown as a compact expandable card), input at bottom with model row. Streaming via `ctx.llm.stream` → `ctx.rooms.broadcast`, so threads survive tab switches and render on any device. Until the copilot ships (M3.5), the pane renders collapsed by default with a teaser — layout unchanged, no dead UI.
3. **Content pane (flex-1)** — the working surface. Dense data tables: top tab strip where it earns its keep (Abstracts: All / By category / By round), toolbar with search + filter + `+ New` right-aligned, checkbox column for bulk actions (advance round, accept+email, nudge). Row click → right-side detail drawer, not a page nav, so the table keeps context.

Speaker portal and public pages do NOT use this shell — they get a simple centered single-column layout (speakers never need an agent pane).

Copilot actions write through the same server functions as the UI, and every Pylon query is live — so when the agent accepts 12 submissions, the organizer watches the Abstracts table update row-by-row in the content pane next to it. That side-by-side moment is the demo.

## Data model (app.ts)

Existing: `User`, `Org`, `OrgMember`, `OrgInvite` (keep as-is).

New entities, all org-scoped via `eventId → Event.orgId` (denormalize `orgId` onto every entity for flat policies):

- **Event** — orgId, name, slug (unique), description, startDate, endDate, timezone, location, cfpStatus ("draft"|"open"|"closed"), settings
- **SubmissionForm** — orgId, eventId, name, slug, status, `fieldsJson` (ordered field defs: type, label, required, options, `showIf` conditions), `routingJson` (rules: answer predicate → category), confirmationMessage
- **Submission** — orgId, eventId, formId, speakerUserId, title, abstract, `answersJson`, category (from routing), status ("submitted"|"in_review"|"accepted"|"rejected"|"waitlisted"|"withdrawn"), currentRound, submittedAt
- **SpeakerProfile** — orgId, eventId, userId, name, email, tagline, bio, company, title, headshotFileId, links, onboarding state. Unique (eventId, userId).
- **SpeakerFile** — orgId, eventId, userId, kind ("headshot"|"slides"|"document"), fileId (via `/api/files`), label
- **ReviewRound** — orgId, eventId, roundNumber, name, `criteriaJson` (name + max score per criterion), status
- **Review** — orgId, submissionId, roundId, reviewerUserId, `scoresJson`, comment, recommendation ("accept"|"reject"|"neutral"). Unique (submissionId, roundId, reviewerUserId).
- **Room** — orgId, eventId, name, capacity, sortOrder
- **Track** — orgId, eventId, name, color, sortOrder
- **Session** — orgId, eventId, submissionId (optional — breaks/keynotes have none), title, description, roomId?, trackId?, startTime?, endTime?, speakerUserIds (json array). Null start/room = "unscheduled" tray.
- **TaskTemplate** — orgId, eventId, title, description, kind ("upload"|"form"|"confirm"|"link"), `formJson` (for kind=form), dueAt, appliesTo ("accepted"|"all")
- **TaskStatus** — orgId, eventId, taskTemplateId, speakerUserId, status ("pending"|"done"), completedAt, `responseJson`. Unique (taskTemplateId, speakerUserId).
- **EmailTemplate** — orgId, eventId, key ("submission_received"|"accepted"|"rejected"|"task_reminder"|"schedule_invite"|custom), subject, body (markdown + `{{var}}` merge tags), enabled
- **EmailLog** — orgId, eventId, toEmail, templateKey, subject, status, sentAt, error?

### Policies

- Organizer entities: `auth.tenantId == data.orgId` for read/write (template pattern), reviews writable only by the reviewer (`auth.userId == data.reviewerUserId` on update).
- Speaker-facing reads/writes go through **server functions only** (policies deny direct client access to Submission/SpeakerProfile/TaskStatus for non-org users; functions check `ctx.auth.userId` ownership). This avoids policy expressions that can't join across tables.
- Public reads (published schedule, form definitions for open CFPs): `auth: "public"` queries, never direct entity access.
- `pylon lint --strict` clean before deploy.

## Feature specs

### 1. Form builder + public CFP

- Builder at `/dashboard/events/[id]/forms/[formId]`: left panel = field palette (short text, long text, select, multiselect, checkbox, email, url, file, section header), center = live preview (same renderer as public page), right = field settings incl. **conditional logic** ("show this field if {field} {equals|not|contains} {value}") and required flag.
- **Routing rules**: ordered list of "if {field} {op} {value} → category {X}"; first match wins; default category. Category drives review assignment filters and reporting.
- Public page `/cfp/[eventSlug]/[formSlug]`: SSR, fast, mobile-friendly. Renderer evaluates showIf client-side. Submit → `submitCfp` mutation: upsert User (by email) + SpeakerProfile, insert Submission, run routing, send `submission_received` email, return portal link. If email already has an account, prompt login first.
- One shared pure module `lib/forms.ts`: field schema types, `evaluateShowIf(answers, rules)`, `routeSubmission(answers, routingRules)`, `validateAnswers(fields, answers)` — exhaustively unit tested (Tier 1).

### 2. Speaker portal

- `/portal` (speaker-authed): lists their events/submissions. Per event: profile editor (bio, tagline, headshot via `<FileUpload>`, links), submission view/edit-while-CFP-open, files (slides/docs upload), **task checklist** with due dates, and their scheduled session(s).
- Login: magic code (built-in `/api/auth/magic/*` flow). Submitting a CFP auto-creates the user; every portal link in email just says "log in with your email".

### 3. Emails + calendar invites

- Pylon has a built-in email provider layer (`PYLON_EMAIL_PROVIDER=stack0|resend|sendgrid|webhook`) that already powers magic codes and invites — **we use stack0** for everything (auth + app sends). App-triggered sends go through `lib/email.ts` merge-tag helper. Merge tags: `{{speaker_name}}, {{event_name}}, {{talk_title}}, {{portal_link}}, {{task_list}}, {{session_time}}, {{room}}`. Since 0.3.378, `ctx.email.send` supports html bodies + base64 attachments with verbatim contentType — calendar invites attach real `text/calendar; method=REQUEST` parts, with hosted `.ics` + add-to-calendar links kept in the body as fallback.
- Template editor at `/dashboard/events/[id]/emails`: per-key subject/body, preview with sample data, enable toggle, "send test to me".
- Triggered sends: submission received; accept/reject (on status change, with confirm dialog + batch send); task reminder.
- **Reminders**: cron (daily, `cron("0 15 * * *", "sendTaskReminders")`, internal) — emails speakers with pending tasks due within N days or overdue. Log every send to EmailLog.
- **Calendar invites**: `lib/ics.ts` generates RFC 5545 `.ics` (METHOD:REQUEST, ATTENDEE=speaker, UID stable per session+speaker, SEQUENCE bump on reschedule) attached to the `schedule_invite` email via `ctx.email.send` attachments (0.3.378+). Gmail/Outlook/Apple render these as real invites. Unit-test the ICS builder (escaping, folding, timezones via event tz). "Send/re-send invites" button on the agenda page; auto-offer resend when a scheduled session moves.

### 4. Review + scoring

- `/dashboard/events/[id]/abstracts`: table of submissions (filter by status/category/round, search, sort by avg score). Row → detail drawer: answers, speaker profile, per-round scores, comments.
- Reviewers = org members. Score entry: criteria from ReviewRound (e.g. Relevance/Quality/Speaker 1–5), comment, recommendation. Avg + count shown live.
- Round advance: select submissions → "advance to round 2" / accept / reject / waitlist. Accept/reject triggers (confirmable) templated email.

### 5. Agenda builder

- `/dashboard/events/[id]/agenda`: grid — columns = rooms, rows = time slots (15-min granularity), one day at a time + unscheduled tray of accepted submissions. Native HTML5 drag-and-drop (no heavy dep): drag from tray → slot, drag to move, edge-drag to resize duration.
- **Conflict detection** in pure `lib/agenda.ts`: `findConflicts(sessions)` → room overlap, speaker double-booking. Conflicting cards get red outline + tooltip; also a conflicts list panel. Unit tested.
- Views: **grid (day×room)**, **list** (chronological, filter by day/track/room), **track** lanes. Public read-only schedule page `/[eventSlug]/schedule` (shape it like wf2025.ai.engineer/schedule) + `/[eventSlug]/speakers` gallery — these double as the waived-but-impressive embeds requirement.

### 6. Real-time dashboard

- `/dashboard/events/[id]` (event home): live tiles — submissions by status/category, review progress per round, **speaker onboarding table**: each accepted speaker × task completion (done/pending/overdue), profile completeness (bio? headshot? slides?), last activity. `db.useQuery` makes it live for free. "Nudge" button → task_reminder email to selected speakers.

### API bonus

- Public queries: `getSchedule(eventSlug)`, `getSpeakers(eventSlug)`, `getSessions(eventSlug)` returning clean JSON at `/api/fn/*`. Document in README + `/[eventSlug]/api` docs page. Mirrors the Sessionboard API surface shape where cheap.

## Differentiators (beyond parity)

Sessionboard's site markets "AI & MCP" and six AI agents (Reviewer, Scheduler, Coordinator, Editor, Scout, Team Lead). Shipping a *working, open-source* version of that story is the strongest tiebreaker play. Ordered by demo-value-per-hour; all post-M3, cut from the bottom:

1. **Event copilot** — the agent pane in the shell (see UI section), on `ctx.llm.stream` with tools from a shared `lib/agent-tools.ts`: `list_submissions`, `get_submission`, `score_submission`, `set_status` (accept/reject + triggers the templated email), `schedule_session` (runs `findConflicts` before committing), `pending_tasks`, `nudge_speakers`, `draft_email`. This *is* their "Team Lead agent," one implementation instead of six SKUs. Built first among differentiators because the shell showcases it on every screen.
2. **MCP server** (`app/api/mcp/route.ts` — streamable-HTTP JSON-RPC, tools-only) exposing the *same* `lib/agent-tools.ts`, organizer-scoped via API token minted in settings; plus public unauthed tools `get_schedule`, `get_speakers`, `submit_cfp`. Demo line for the README: "add smolboard to Claude Code and run your CFP from chat." Also the answer to their "AI & MCP" slide — except ours is real and inspectable. Cheap once #1 exists.
3. **Auto-schedule suggestion** — greedy solver in `lib/agenda.ts` (pure, tested): place accepted talks into rooms/slots honoring track affinity + speaker availability, zero conflicts; organizer reviews the proposal in the agenda tray and applies. Their "Scheduler agent."
4. **AI triage on submissions** — `ctx.llm` batch action: tag/categorize, flag duplicates/near-duplicates (title+abstract similarity), one-paragraph neutral summary per submission for reviewers. Explicitly *assistive* — the brief struck AI review as a requirement, so this is labeled "triage," never auto-scoring.

Also free differentiation Pylon gives us that Sessionboard can't match: everything is live-synced (two reviewers scoring simultaneously see each other's scores; the dashboard is real-time without refresh), and it deploys as one binary an org can self-host.

## Pylon framework gaps (wishlist — things that would have helped)

Found while speccing; worth feeding back into Pylon itself:

1. **MCP server primitive** — `buildManifest({ mcp: { tools: [...] } })` auto-exposing selected functions as MCP tools with token auth. We're hand-rolling JSON-RPC in a route.ts; the framework already has typed function defs + validators, so it has everything needed to generate this. Biggest gap; "agent-native" pitch practically demands it.
2. ~~Email attachments + HTML bodies~~ FIXED (options overload with verbatim attachment contentType); smolboard migrated — invites attach real `text/calendar; method=REQUEST` parts. Stack0 contract verified from source (needs ≥0.3.379: the .378 stack0 arm sent snake_case `content_type`, silently stripped by stack0's zod parser). Stack0 caps: 10 attachments / 10MB base64 each per send — keep invite batches under 10. A real send through sendScheduleInvites when a key lands remains a good smoke test, but is not a demo blocker.
2b. ~~`field.json()` missing~~ FIXED in 0.3.378 (parsed-on-read everywhere, `v.json()` validator); smolboard migrated — `lib/types.ts` keeps a tolerant `parseJson` only for rows written before the migration.
3. **Multipart uploads in `<Form>`/route.ts** — documented as unsupported; public CFP file-upload questions need client-side JS against `/api/files` instead of degrading gracefully to native forms.
4. **Anonymous upload policy for `/api/files`** — unclear whether an unauthenticated CFP submitter can upload before their account exists. Our workaround: create the account (magic-code flow) *before* the file step. Needs verification early in M1.
5. **Rate limiting/captcha primitive for public endpoints** — auth flows have cooldowns built in, but a public `submit_cfp` mutation has nothing; we'll add a naive per-IP throttle in the function.
6. **`.ics` helper + CSV export helpers** — small utilities every event/CRM-ish app rewrites.
7. **Cross-entity policy expressions** — policies can't join (e.g. "speaker can read Submission if a SpeakerProfile row links them"); forces the function-only access pattern for the whole speaker surface. Fine, but it's the main reason our policy file denies so much.

## Routes summary

```
app/
  page.tsx                     # smolboard landing (rewrite marketing)
  login/ signup/               # template (keep)
  cfp/[eventSlug]/page.tsx     # event CFP index (open forms)
  cfp/[eventSlug]/[formSlug]/page.tsx
  [eventSlug]/schedule/page.tsx    # public schedule
  [eventSlug]/speakers/page.tsx    # public speaker gallery
  portal/page.tsx              # speaker home
  portal/[eventSlug]/…         # profile, submission, tasks, files
  dashboard/page.tsx           # events list (repurpose projects)
  dashboard/events/[id]/page.tsx        # live dashboard (req 6)
  dashboard/events/[id]/forms/…         # form list + builder (req 1)
  dashboard/events/[id]/abstracts/…     # review/scoring (req 4)
  dashboard/events/[id]/agenda/page.tsx # builder (req 5)
  dashboard/events/[id]/tasks/page.tsx  # task templates
  dashboard/events/[id]/emails/page.tsx # templates + log (req 3)
  dashboard/events/[id]/settings/page.tsx
  dashboard/members/ settings/          # template (keep)
```

## Testing

- Tier 1 (bulk of coverage): `lib/forms.ts` (showIf, routing, validation), `lib/agenda.ts` (conflicts), `lib/ics.ts` (ICS output), `lib/email.ts` (merge tags).
- Tier 3 smoke: submitCfp → submission exists + profile created; accept flow → status + email log.
- `pylon test:security` against dev before deploy — speaker/organizer boundary is the risk area.

## Milestones

- **M1 (Fri–Sat): core loop.** Strip billing; entities + policies; form builder + public CFP + submitCfp; speaker account creation + portal shell. *A speaker can submit and see their portal.*
- **M2 (Sat–Sun): review + agenda.** Abstracts table, scoring, rounds, accept/reject; agenda grid + DnD + conflicts + views; rooms/tracks. *Organizer can score, accept, and schedule.*
- **M3 (Sun–Mon): comms + dashboard.** stack0 email wiring, templates editor, triggered sends, cron reminders, ICS invites; live dashboard + tasks system.
- **M3.5 (Mon–Tue, cut-from-bottom): differentiators.** DONE for #1 + #2: `lib/agent-tools.ts` (shared 8-tool belt), event copilot (`functions/copilotChat.ts`, ctx.llm.stream agent loop, room-broadcast streaming, persisted threads, live pane UI — needs ANTHROPIC_API_KEY at runtime), and the MCP server (`/api/fn/mcp`, JSON-RPC over the action surface, framework API-key auth: `claude mcp add smolboard --transport http <url>/api/fn/mcp --header "Authorization: Bearer pk...."`). Remaining, optional: auto-schedule suggestions → AI triage.
- **M4 (Tue): polish + deploy.** Public schedule/speakers pages, API queries, landing page, seed demo data (an "AIE Sandbox" event mirroring their sandbox CFP), `pylon deploy`, walk the judges' video flow end-to-end on the deployed site, README.
- **Buffer (Wed):** Sunday's requirement-freeze video may add clarifications; keep Wed for fixes only.

## Out of scope

Accelevents integration, wiki/CMS embeds, AI-assisted review, Airtable/Cloudflare bonuses, payment/billing, speaker travel/logistics modules, multi-language.

## Resolved decisions

- Speaker auth: built-in magic codes (passwordless), auto-created at CFP submission.
- Email: stack0 via `PYLON_EMAIL_PROVIDER` for auth + app sends.
- Skip Cloudflare/Airtable/Forge bonuses; compete on the tiebreakers (product quality, speed) and differentiators instead.

## Unresolved questions

1. **Watch the walkthrough video** (youtu.be/vUuK4Knl7oc) — the screenshots' field-level details (exact form field types, task/form structures) aren't in the doc text. Spec should be sanity-checked against it before M2, and against the Sunday requirements-freeze video.
2. ~~Attachments~~ Fixed in SDK 0.3.378 — native `text/calendar` attachments shipped; links kept as body fallback.
3. ~~Anonymous `/api/files` uploads~~ Resolved by design: CFP submission collects no files; uploads happen in the portal after magic-code sign-in (multipart `/api/files/upload` was removed in 0.3.91 — use the 3-step flow).
4. Demo/seed data: clone their sandbox event content ("AI Engineer Sandbox Event") so judges see a familiar shape — any objection?
