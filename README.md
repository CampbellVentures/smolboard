# smolboard

Open-source speaker & CFP management — a [Sessionboard](https://www.sessionboard.com/) replacement built for the [AI Engineer hackathon](https://x.com/swyx/status/2085517544795079014). One [Pylon](https://pylonsync.com) process serves the API, auth, live sync, SSR, and the agent runtime.

**Live demo:** https://www.smolboard.app
**Public schedule example:** https://www.smolboard.app/ai-engineer/ai-engineer-sandbox

## For graders

**Organizer:** sign in at `/login` with email + password (or Google). A seeded
organizer account is in the submission notes; it owns a populated event with
submissions across every status, two open CFP forms, a published two-day
agenda, a review round with scores, and an approved deck.

**Speaker (no inbox required):** `demo.speaker@smolboard.dev` /
`demo-speaker-Kx7RtQ2wLp`. Sign in at `/login` like any other account; a
speaker lands in `/portal`, not the organizer dashboard. This account can
submit proposals, complete tasks, and upload deliverables straight away.

Speakers normally sign in with a 6-digit emailed code, which a browser agent
can't complete. Two ways around it, in order of convenience:

1. Use the seeded speaker above. Nothing to set up.
2. Use your own address: set `personaEmails.speaker` to an inbox you control
   and run `pnpm run sbek -- auth --persona speaker`, then request the code at
   `/portal` and paste it into that window.

New self-registered accounts must still verify their email before they can
submit, which is deliberate: it stops anyone registering someone else's
address and submitting as them. Speakers an organizer adds are vouched for by
that organizer and skip the step.

Scenarios write into whichever event you drive. Two are seeded, both populated
and both fine to use:

| Event | Public site | Use |
|---|---|---|
| AI Engineer Sandbox Event | `/ai-engineer/ai-engineer-sandbox` | branded demo, used in the video |
| Grading Sandbox | `/ai-engineer/grading-sandbox` | scratch space, write freely |

## What it does

The six requirements from the brief, all working end to end:

1. **Custom CFP forms** — visual builder with conditional logic (show field X when answer Y) and first-match category routing. Server re-validates everything, including conditional requireds. Public form at `/<org>/<event>/cfp/<form>`.
2. **Speaker portal** — passwordless (6-digit email code). Speakers are auto-created on submission; they track status live, edit their profile, upload files, and complete onboarding tasks at `/portal`.
3. **Automated speaker emails** — per-event templates with merge tags, accept/reject sends, daily cron reminders for overdue tasks, and **real calendar invites**: `.ics` attached as `text/calendar; method=REQUEST` (RSVP-able in Gmail/Outlook), stable UID + SEQUENCE bump so a reschedule updates the speaker's calendar instead of duplicating.
4. **Review & scoring** — score-sorted submissions table, per-criterion star scoring, committee comments, multi-round advancement, bulk accept/reject with confirmation. Two reviewers scoring at once see each other's scores land live.
5. **Drag-and-drop agenda** — day × room grid, 15-minute slots, drag accepted talks from the tray, conflict detection (room overlaps + double-booked speakers) recomputed on every change. List and track views. One-click publish to a public schedule page.
6. **Real-time dashboard** — submissions, review progress, and speaker onboarding status, all live queries: no refresh, ever.

Beyond the brief:

- **Content desk** — versioned speaker deliverables (slides, headshots) with organizer review; approving content is what gates it onto the public schedule, and approved files ship as signed URLs or a one-click ZIP.
- **Branding & white-label** — per-event accent color, logo, tagline, and a full-bleed header image (ai.engineer-style) on the public site; alert emails render in the same brand. Assets upload straight to a CDN.
- **Embeds** — copy-paste iframe widgets for the live schedule and speaker gallery, with in-dashboard previews framed as a real browser.
- **Activity everywhere** — a server-written audit feed drives the bell menu, immediate organizer alert emails (new submission, file awaiting review), and a daily digest that stays silent on quiet days.
- **Analytics at a glance** — submissions-over-time sparkline and a status funnel on the event overview.
- **Speaker CRM** — a workspace-wide directory aggregating every person across events, with private organizer notes.
- **Cmd+K** — palette over pages, events, submissions, and speakers, powered by the local sync replica (no server round trip).
- **Calendar feed** — `/​<org>/<event>/calendar.ics` is a subscribable schedule (RFC 5545 `METHOD:PUBLISH`) honoring the same content-approval gate as the public page.

## The agent layer

Sessionboard sells "AI & MCP" as six named agents. smolboard ships one tool belt (`lib/agent-tools.ts`) exposed two ways:

- **Event copilot** — a chat pane in the dashboard running a streaming tool-use loop (`ctx.llm.stream`). Ask it to review, accept, schedule (conflict-checked — it refuses collisions and says why), nudge speakers, or summarize what happened today (the activity feed is a tool too). Its writes go through the same functions as the UI buttons, and every table is a live query, so you watch its changes land next to the conversation.
- **MCP server** — the same tools over the Model Context Protocol:

  ```bash
  claude mcp add smolboard --transport http \
    https://www.smolboard.app/api/fn/mcp \
    --header "Authorization: Bearer pk...."
  ```

  Mint the `pk.` API key at `/api/auth/api-keys` (or the dashboard). The MCP client runs *as you* — every tool re-checks org membership server-side, so an agent can never do more than its human.

Public read API (no auth): `POST /api/fn/getPublicSchedule` and `POST /api/fn/getPublicSpeakers` with `{"orgSlug": "...", "eventSlug": "..."}`.

## Run it

```bash
bun install
bun run dev        # http://localhost:4321
bun test           # form logic, conflicts, ICS, ZIP, branding, components
pylon lint --strict
```

Sign up, create a workspace, create an event, open its CFP — then submit to it from an incognito window and watch the dashboard update live.

### Production env

| Variable | Purpose |
|---|---|
| `PYLON_EMAIL_PROVIDER` / `PYLON_EMAIL_API_KEY` / `PYLON_EMAIL_FROM` | Speaker emails + magic-code login (stack0/resend/sendgrid) |
| `PYLON_LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` | The copilot |

Deploy with `pylon deploy`. The manifest already declares `trustedOrigins` for the demo domain — change it for yours.

## Architecture

- `app.ts` — 32 entities + row-level policies. Everything org-scoped; speakers get owner-scoped reads (their submissions/tasks sync live to the portal); public pages read only through gated `auth: "public"` functions that strip private fields (speaker emails never leave the server).
- `functions/` — 90+ server functions. Status changes, emails, scheduling, the copilot loop, and the MCP endpoint. Agent tools and UI buttons share the same functions.
- `lib/` — pure, tested logic: form engine (conditional visibility, validation, routing), agenda math (conflicts, DST-safe timezone handling), RFC 5545 ICS builder, merge-tag templating.
- `app/` — SSR pages: organizer dashboard (three-pane: nav / copilot / content), public CFP + schedule + speakers, speaker portal.

Built during the hackathon with Claude Code, on a Pylon runtime that shipped three framework features mid-build (`field.json()`, email attachments, an RPC fix) because we filed the gaps as we hit them.
