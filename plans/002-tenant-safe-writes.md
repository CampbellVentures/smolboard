# Plan 002: Enforce tenant-safe cross-entity writes

> **Executor instructions**: Follow each step and verification gate. Touch only in-scope files. STOP on a listed condition. The reviewer maintains the index.
>
> **Drift check**: `git diff --stat e61df7e..HEAD -- app.ts functions app/dashboard app/portal tests/http`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-http-characterization-tests.md`
- **Category**: security
- **Planned at**: commit `e61df7e`, 2026-08-09

## Why this matters

Several direct inserts authorize only a caller-supplied `orgId` or `userId`; they do not prove that referenced `eventId`, form, round, submission, or task belongs to the same tenant. A member can therefore create attacker-controlled child rows under another public event. The installed SDK supports `.owner()` and correlated `exists(...)`, and server functions can derive anchors after `ctx.requireMember`.

## Current state

- `app.ts:519-522`: `SubmissionForm` writes check only `auth.tenantId == data.orgId`.
- `app.ts:550-556`: `SpeakerFile` insert checks only `auth.userId == data.userId`.
- `app.ts:559-601`: review rounds, reviews, rooms, tracks, and sessions use flat tenant checks.
- `.readonly()` is settable on insert; it does not validate a foreign-key relationship.

## Commands

`bun run check`, `bun test`, `bun run app.ts`, and `./node_modules/.bin/pylon lint --strict`; all must exit 0 except an explicitly documented pre-existing `PYL001` if still unresolved.

## Scope

**In scope**: `app.ts`; new or existing write functions for SubmissionForm, SpeakerFile, ReviewRound, Review, Room, Track, Session, TaskTemplate, SpeakerTask; their dashboard/portal callers; `tests/http/**`; focused pure tests.

**Out of scope**: redesigning reviewer UX, deliverable versioning, public widgets, billing, CRM.

## Steps

1. Inventory every entity carrying both `orgId` and a parent foreign key. For each direct insert/update, either add a deny-safe correlated `exists(...)` invariant or move the write into a mutation that loads the parent, calls `requireMember`, and derives immutable anchors. Use `.owner()` where the authenticated user must be stamped.
2. Make `SubmissionForm` create/update derive organization from `Event`; make `submitCfp` reject mismatched legacy form/event organizations.
3. Deny direct `SpeakerFile` inserts. Add a speaker-owned attachment mutation that validates the owned profile/task and derives org/event/user; update the portal caller.
4. Validate review/session/task relation consistency on all remaining write paths without implementing plan 003/005 features.
5. Flip/add HTTP adversarial tests: forged org/event/form/round/submission/task references must deny; valid same-tenant and own-speaker operations must pass.

## Done criteria

- [ ] `bun run check` and `bun test` pass.
- [ ] Manifest builds via `bun run app.ts`.
- [ ] Two-org forged-anchor tests deny for forms, files, reviews, and sessions.
- [ ] Valid organizer and speaker flows still pass.
- [ ] No new unconditional write policy exists.
- [ ] Only in-scope files changed.

## STOP conditions

- STOP if an `exists(...)` expression needed here is not accepted by the installed runtime; use a function only if already within scope and report the deviation.
- STOP if migration requires dropping or rewriting production rows.
- STOP if a required caller cannot be identified.

## Maintenance notes

Every future child entity must derive or validate tenant anchors. Review both policy expressions and function bypasses; functions bypass policies.
