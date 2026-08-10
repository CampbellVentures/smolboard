# Plan 003: Build least-privilege reviewer workflows

> **Executor instructions**: Execute stepwise, verify each gate, touch only scope, and STOP rather than improvise. Reviewer maintains the index.
>
> **Drift check**: `git diff --stat 2d7a2f8..HEAD -- app.ts app/dashboard functions lib tests`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 001 and 002
- **Category**: security
- **Planned at**: commit `2d7a2f8`, 2026-08-09

## Why this matters

Abstract Management is nearly absent from the evaluator: reviewers are generic members with organizer navigation, every member sees every proposal and peer review, and rounds have fixed numeric criteria with no assignments, pools, dates, weights, anonymization, recusal, progress, reminders, or export. This plan creates one coherent least-privilege review subsystem rather than independent patches.

## Current state

- `app.ts:224-268`: `ReviewRound` has number/name/numeric criteria/status; `Review` has arbitrary JSON scores.
- `app/dashboard/events/[id]/abstracts/abstracts-client.tsx:640-840`: fixed star scorecard and lazy rounds.
- `app/dashboard/layout.tsx:67-88`: every tenant member receives full event navigation.
- `app/dashboard/events/[id]/overview-client.tsx:396-408`: progress divides raw review rows by submissions and can exceed its denominator.

## Framework compatibility decision

Pylon `0.3.385` retains only `owner`, `admin`, and `member` organization roles. A
`reviewer` invite is normalized to `member`, and member-role updates reject
`reviewer`. Keep reviewers as framework `member` records and model review
authority explicitly with app-owned membership and assignment entities. This is
an intentional plan amendment after the original STOP condition was exercised;
do not attempt to create a custom built-in organization role.

## Commands

`bun run check`; `bun test`; `bun run app.ts`; `./node_modules/.bin/pylon lint --strict`.

## Scope

**In scope**: `app.ts`, `lib/reviews.ts`, `lib/types.ts`, reviewer/abstract/overview/member UI under `app/dashboard`, `components/app-shell.tsx`, new review functions, email reminder/export functions, and tests.

**Out of scope**: CFP drafts/co-authors, speaker deliverables, public widgets, AI scoring.

## Steps

1. Add persisted `ReviewerMembership` (organization-level active designation), round configuration (open/close timestamps, anonymization, typed criteria with options/weight/required), round reviewer pools, assignments, and recusal state. Preserve interpretability of existing numeric reviews.
2. Add organizer-only mutations for reviewer designation, round CRUD, pool membership, manual and track-filtered/balanced bulk assignment. Every reviewer path must require both built-in organization membership and active app-level reviewer membership; enforce owner/admin roles for admin operations.
3. Add reviewer-specific projection queries/UI and navigation. A reviewer sees exactly assigned submissions for the active round, author identity only when unblinded, no organizer mutations, and no peer scores until policy permits. Remove generic member access to sensitive raw entities; do not rely on client-only hiding.
4. Add validated submit-review mutation: derive reviewer identity; enforce assignment, round window/status, criterion types/ranges/required values; distinguish complete and recused states.
5. Replace aggregate/progress math with pure assignment-based helpers. Add per-reviewer progress, weighted submission aggregates, interactive sorting, reminder selection, recusal, and CSV export.
6. Add HTTP tests for reviewer-only navigation/queue, round scoping, blind output, peer-review isolation, invalid scores, recusal, 0/2→2/2 progress, reminders, and export.

## Done criteria

- [ ] CFP-10/11 and ABS-01 through ABS-13 have an automated happy-path test or explicit manual side-effect assertion.
- [ ] Reviewer cannot read unassigned submissions or call organizer mutations.
- [ ] Numeric/select/text criteria and weights persist and aggregate deterministically.
- [ ] `bun run check`, `bun test`, manifest build, and policy lint pass subject only to documented pre-existing warning.
- [ ] Only in-scope files changed.

## STOP conditions

- STOP if an app-level reviewer designation cannot be checked server-side together with built-in organization membership; do not weaken this to client-only hiding.
- STOP if existing sessions lack role claims needed by server-side enforcement.
- STOP if migration would destroy existing reviews; design a compatibility read instead and report.

## Maintenance notes

Keep decision status separate from review recommendation. Snapshot scorecard definitions or maintain backward-compatible parsing so historical reviews never silently change meaning.
