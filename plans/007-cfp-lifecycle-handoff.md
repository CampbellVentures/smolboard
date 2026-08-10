# Plan 007: Complete CFP dates, drafts, participants, and agenda handoff

> **Executor instructions**: Follow steps and gates, touch only scope, STOP on mismatch. Reviewer maintains the index.
>
> **Drift check**: `git diff --stat 6d40c9a..HEAD -- app.ts app/[orgSlug] app/portal app/dashboard/events functions lib tests`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans 002, 003, and 004
- **Category**: direction
- **Planned at**: commit `6d40c9a`, 2026-08-09

## Why this matters

CFP basics work, but there is no scheduled submission window/deadline, resumable draft, co-presenter roles, or lossless track/format handoff. Manual status toggles cannot satisfy date-bound closing/edit rules, and accepted agenda sessions explicitly drop track metadata.

## Current state

- `app.ts:122-143`: forms have manual status but no open/close timestamps.
- `app.ts:149-176`: submissions have one speaker and no draft lifecycle.
- `functions/submitCfp.ts:53-60` and `updateMySubmission.ts:23-29`: gate only manual statuses.
- `app/dashboard/events/[id]/agenda/agenda-client.tsx:158-175`: conversion copies title/speaker and sets `trackId` undefined.

## Framework compatibility decisions

- Durable drafts require a real authenticated Pylon user. Public form input may
  begin in client-local state, but create/resume/update/finalize mutations use
  user auth and derive `ownerUserId` only from `ctx.auth.userId`.
- Participant invitations remain pending/unverified. Claim requires the
  caller's persisted `User.emailVerified`, exact normalized email and expected
  provisional user id, plus a valid single-use invitation. Sending mail or
  possessing a token never verifies identity.
- Generic legacy answers have no reliable track/format semantics. Preserve
  `answersJson` and add organizer-owned per-form source-field/value mappings to
  canonical session kind and event track. Exact-match suggestions may be shown
  but never auto-applied; unresolved values remain visible.
- Replace anonymous finalization in `submitCfp` with authenticated draft
  finalization for new work. Preserve existing submitted rows and treat their
  provisional users as unclaimed until the verified Plan 004 claim succeeds.

## Commands

`bun run check`; `bun test`; `bun run app.ts`; Pylon policy lint.

## Scope

**In scope**: CFP form/submission/participant schema and types; builder settings; public CFP and portal draft/edit UI; submit/update/materialize functions; agenda tray conversion; tests.

**Out of scope**: reviewer scorecards beyond participant display, public widget redesign, content file lifecycle, CRM.

## Steps

1. Add form open/close timestamps and a pure timezone-aware window helper used by SSR, submit, draft, and edit paths. Render deadline and stable upcoming/open/closed states; direct closed URLs must show closed, not 404.
2. Add authenticated owner-scoped draft create/update/resume after magic-code authentication, with minimal title and explicit final validation. Browser-local input is permitted before auth, but no durable server draft exists; never key ownership by email, invite token, guest id, or browser storage.
3. Add pending participant invitations and immutable finalized participant snapshots with role labels. Claim requires verified exact identity plus an unconsumed/unexpired invite. Display participants through organizer access and Plan 003's assignment-gated reviewer projection.
4. Add organizer-owned per-form format/track mappings and a legacy mapping UI. Centralize one submission-to-session materializer for UI and agent paths, copying title, description, participants, format, and track. Refuse or visibly report unresolved mappings instead of dropping them.
5. Enforce close-boundary locking server-side for new submissions, draft finalization, and edits. Add exact-boundary tests in event timezone.
6. Add HTTP/component tests for deadline display, past-close denial, closed edit lock, draft reload/resume/finalize, participant roles, and lossless agenda handoff.

## Done criteria

- [ ] CFP-03/04/07/15/16 and ABS-11 have automated coverage.
- [ ] One shared window helper controls every submit/edit/draft gate.
- [ ] Draft ownership cannot be claimed by knowing an email address.
- [ ] Invitation send/token possession alone never changes verification or claim state.
- [ ] Every legacy answer remains readable; unresolved handoff values are visible and never silently converted.
- [ ] UI and copilot agenda paths produce identical sessions.
- [ ] Verification commands pass; scope clean.

## STOP conditions

- STOP if secure draft ownership requires changing built-in auth semantics.
- STOP before guessing or destructively backfilling a legacy track/format answer. Preserve it and require organizer mapping; other plan work may proceed.
- STOP if participant invites would auto-verify email ownership.

## Maintenance notes

Store instants in UTC and evaluate/display with the event timezone. Keep submission status, review disposition, and draft lifecycle distinct.
