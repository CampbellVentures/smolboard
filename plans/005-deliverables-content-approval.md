# Plan 005: Build task-bound, versioned deliverables and content approval

> **Executor instructions**: Follow steps and gates; touch only scope; STOP on listed conditions. Reviewer maintains the index.
>
> **Drift check**: `git diff --stat 6d40c9a..HEAD -- app.ts app/portal app/dashboard/events functions lib tests`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 001, 002, and 004
- **Category**: migration
- **Planned at**: commit `6d40c9a`, 2026-08-09

## Why this matters

`SpeakerFile` is a generic event bucket: any file of the requested kind satisfies every same-kind task. There are no deliverable slots, versions, comments, central library/download, session content revisions, or approval gate, so most Content Management items fail and scheduled drafts publish immediately.

## Current state

- `app.ts:205-221`: files have event/user/kind/file/label only.
- `functions/completeTask.ts:28-36`: any same-kind file satisfies an upload task.
- `app/portal/portal-client.tsx:631-681`: generic upload section and filename list.
- `functions/getPublicSchedule.ts:60-101`: event publish exposes every scheduled session.

## Pylon 0.3.385 file-boundary amendment

Preflight triggered the first STOP condition. Pylon file bytes are readable only
by the uploader or a global Pylon admin. Organization membership grants no file
access, and functions expose no file stat/share/grant/stream primitive. Proceed
with Phase A below; defer Phase B until Pylon adds scoped file capabilities.

Do not use a global admin token, local filesystem paths, provider-specific URLs,
or public buckets as a workaround. Replace the deprecated `/api/files/upload`
transport with `/api/files/init` → direct PUT → `/api/files/confirm`.

## Commands

`bun run check`; `bun test`; `bun run app.ts`; Pylon policy lint.

## Scope

**In scope**: deliverable/file/comment/content-revision/session approval schema and types; portal task upload UI; speaker/task/session organizer UI; scoped file download/library/export functions; public feed approval filters; tests.

**Out of scope**: external object-storage migration, public widget redesign, reviewer scorecards, CRM.

## Steps

1. Model one deliverable slot per speaker task/session, immutable version metadata with server-assigned order, cross-role comments with author/timestamp, and session content revisions/approval status. Add compatibility for legacy `SpeakerFile` rows without deleting them.
2. Change portal upload to target a concrete task/session slot. Completion must derive from that slot’s current version, not file kind. Re-upload creates a new version and retains prior downloads.
3. Build organizer deliverables dashboard with per-speaker/per-task due/status filters, version metadata, comments, reminder selection, and a metadata-only central library. Present byte download only to the uploading speaker; never render a knowingly failing organizer download control.
4. Add organizer session title/description/speaker content editing, attributed history, restore, and explicit approval. Public schedule/speaker feeds must include only approved content once the event is published.
5. Add HTTP/component tests for task binding, cross-speaker denial, metadata version history, comments, restore, approval gate, dashboard filters, and legacy preservation.

### Phase B — deferred pending Pylon capability

- Organizer download of speaker-uploaded current or prior-version bytes.
- Server verification/claiming of a confirmed upload id.
- Multi-select ZIP generation and ZIP-content tests.

## Done criteria

- [ ] One upload cannot satisfy two distinct tasks unless explicitly linked to both.
- [ ] Version metadata is immutable/latest is deterministic; the uploader can download retained versions.
- [ ] Unapproved sessions never appear in public feeds.
- [ ] Version/comment operations enforce speaker or organizer scope server-side; organizer byte download and ZIP are truthfully marked unavailable.
- [ ] CNT-01 through CNT-13 have working tests or an explicit runtime-limitation assertion; CNT-14 remains Phase B until scoped byte access exists.
- [ ] All verification commands pass; scope clean.

## STOP conditions

- STOP before implementing organizer byte download or ZIP until Pylon provides scoped file grants/server streaming.
- STOP if the supported init/PUT/confirm upload flow cannot retain uploader access to prior versions.
- STOP if migration cannot preserve legacy files.

## Maintenance notes

Treat file versions as immutable. Content approval is distinct from schedule publication and submission acceptance.
