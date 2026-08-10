# Plan 004: Add organizer-owned speaker lifecycle

> **Executor instructions**: Follow steps, run every gate, respect scope, STOP on mismatch. Reviewer maintains the index.
>
> **Drift check**: `git diff --stat 2d7a2f8..HEAD -- app.ts app/dashboard/events functions lib tests`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans 001 and 002
- **Category**: direction
- **Planned at**: commit `2d7a2f8`, 2026-08-09

## Why this matters

Organizers cannot add, import, edit, invite, status, or inspect a speaker; profiles exist only after CFP submission. This blocks most speaker-management scenarios and makes files, session assignments, general communications, and logistics invisible.

## Current state

- `functions/submitCfp.ts:97-111`: CFP submission is the only profile creation path.
- `app/dashboard/events/[id]/speakers/speakers-client.tsx:82-171`: read-only searchable roster.
- `app.ts:179-203`: event profile lacks workflow status, logistics, tags/custom metadata.
- `app/dashboard/events/[id]/emails/emails-client.tsx`: templates/test-send exist, but no selected-recipient campaign.

## Framework compatibility decisions

- Organizer creation provisions an unclaimed speaker record only. Add
  `User.emailVerified`; a speaker claims the provisional identity only after
  Pylon magic-code verification proves control of the exact normalized email.
  Never mint a session or password for an organizer-created speaker.
- Implement CSV parsing in scoped pure code with no dependency. Support BOM,
  CRLF/LF, quoted commas/newlines, escaped quotes, deterministic errors, and
  strict byte/row/column/cell limits; reparse and revalidate on the server.
- Pylon `0.3.385` private files are readable only by the confirming user and
  have no share/transfer API. Model a public `headshotUrl` as the shared
  organizer/speaker image source. Existing private `headshotFileId` and speaker
  file metadata may remain owner-scoped, but this plan must not imply that an
  organizer can read another user's private file bytes. Do not use the stale
  `/api/files/upload` convenience component.

## Commands

`bun run check`; `bun test`; `bun run app.ts`; Pylon policy lint.

## Scope

**In scope**: speaker profile/schema/types; event speaker page and detail overlay; organizer speaker functions; CSV parser/import; portal invitation/general bulk email functions and log UI; task assignment selection/progress; tests.

**Out of scope**: org-wide CRM, pipelines/segments, deliverable versioning, public widgets, reviewer assignments.

## Steps

1. Add `User.emailVerified`. Extend event speaker records with claim state, validated workflow status, public `headshotUrl`, logistics/custom metadata, and timestamps. Normalize identity by email without merging unrelated accounts silently.
2. Add owner/admin-gated create/update/invite mutations that provision an unclaimed `User` only when needed, derive org/event anchors, and send a magic-code portal invitation. Add a claim mutation that requires the caller's persisted `emailVerified`, exact normalized email, and expected provisional user id before marking the profile claimed.
3. Build speaker detail UI supporting profile/public-headshot-URL edit, status/filter, sessions, tasks, and owner-scoped file metadata. Add multi-row CSV import with preview, bounded pure parsing, server-side reparsing/validation, duplicate reporting, and idempotent behavior.
4. Add explicit multi-speaker task assignment while keeping all/accepted audiences. Show per-speaker × per-task due/status progress with filters.
5. Add selected/filtered general email composition, real-recipient merge preview, confirmation, queued per-recipient delivery, and `EmailLog` results; add portal invitation action.
6. Add component and HTTP tests for add/edit/import/invite/status, portal linkage, task assignment/progress, and bulk email authorization/logging.

## Done criteria

- [ ] SPK-01 through SPK-16 each have a working surface and test/manual boundary.
- [ ] CSV duplicate imports are deterministic and do not duplicate event profiles.
- [ ] Speaker and organizer see the same profile/session/task data after edits.
- [ ] Outbound group sends require confirmation and log one result per recipient.
- [ ] All verification commands pass; scope is clean.

## STOP conditions

- STOP if Pylon magic-code verification cannot persist `User.emailVerified` or the claim mutation cannot prove the caller owns the provisional email.
- STOP before adding a CSV dependency; the amended design requires scoped pure parsing.
- STOP before exposing private Pylon file bytes across users. Shared headshots must use validated public URLs until Pylon provides file ACL/share support.

## Maintenance notes

This is event-scoped speaker management, not the optional org CRM. Keep identity linking conservative and make email retries idempotent.
