# smolboard

Open-source speaker & CFP management — a [Sessionboard](https://www.sessionboard.com/) replacement built for the [AI Engineer hackathon](https://x.com/swyx/status/2085517544795079014). One [Pylon](https://pylonsync.com) process serves the API, auth, live sync, SSR, and the agent runtime.

**Live demo:** https://www.smolboard.app
**Public schedule example:** https://www.smolboard.app/ai-engineer/ai-engineer-sandbox

## What it does

The six requirements from the brief, all working end to end:

1. **Custom CFP forms** — visual builder with conditional logic (show field X when answer Y) and first-match category routing. Server re-validates everything, including conditional requireds. Public form at `/<org>/<event>/cfp/<form>`.
2. **Speaker portal** — passwordless (6-digit email code). Speakers are auto-created on submission; they track status live, edit their profile, upload files, and complete onboarding tasks at `/portal`.
3. **Automated speaker emails** — per-event templates with merge tags, accept/reject sends, daily cron reminders for overdue tasks, and **real calendar invites**: `.ics` attached as `text/calendar; method=REQUEST` (RSVP-able in Gmail/Outlook), stable UID + SEQUENCE bump so a reschedule updates the speaker's calendar instead of duplicating.
4. **Review & scoring** — score-sorted submissions table, per-criterion star scoring, committee comments, multi-round advancement, bulk accept/reject with confirmation. Two reviewers scoring at once see each other's scores land live.
5. **Drag-and-drop agenda** — day × room grid, 15-minute slots, drag accepted talks from the tray, conflict detection (room overlaps + double-booked speakers) recomputed on every change. List and track views. One-click publish to a public schedule page.
6. **Real-time dashboard** — submissions, review progress, and speaker onboarding status, all live queries: no refresh, ever.

## The agent layer

Sessionboard sells "AI & MCP" as six named agents. smolboard ships one tool belt (`lib/agent-tools.ts`) exposed two ways:

- **Event copilot** — a chat pane in the dashboard running a streaming tool-use loop (`ctx.llm.stream`). Ask it to review, accept, schedule (conflict-checked — it refuses collisions and says why), or nudge speakers. Its writes go through the same functions as the UI buttons, and every table is a live query, so you watch its changes land next to the conversation.
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
bun test           # 69 tests (form logic, conflicts, ICS, components)
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

- `app.ts` — 21 entities + row-level policies. Everything org-scoped; speakers get owner-scoped reads (their submissions/tasks sync live to the portal); public pages read only through gated `auth: "public"` functions that strip private fields (speaker emails never leave the server).
- `functions/` — 27 server functions. Status changes, emails, scheduling, the copilot loop, and the MCP endpoint. Agent tools and UI buttons share the same functions.
- `lib/` — pure, tested logic: form engine (conditional visibility, validation, routing), agenda math (conflicts, DST-safe timezone handling), RFC 5545 ICS builder, merge-tag templating.
- `app/` — SSR pages: organizer dashboard (three-pane: nav / copilot / content), public CFP + schedule + speakers, speaker portal.

Built during the hackathon with Claude Code, on a Pylon runtime that shipped three framework features mid-build (`field.json()`, email attachments, an RPC fix) because we filed the gaps as we hit them.
