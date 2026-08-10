# Plan 001: Establish HTTP security and workflow characterization tests

> **Executor instructions**: Follow each step and verification gate. Touch only in-scope files. STOP on a listed condition. The reviewer maintains `plans/README.md`.
>
> **Drift check**: `git diff --stat 2cef7d9..HEAD -- tests package.json bunfig.toml`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `2cef7d9`, 2026-08-09

## Why this matters

The current 80-test suite covers pure form, agenda, email, and task logic, but not Pylon policies or cross-role HTTP behavior. Every remaining plan changes authorization or multi-step workflows; a two-org HTTP harness must characterize current behavior before those changes land.

## Current state

- `tests/cfp-security.test.ts:1-16` tests only `canClaimCfpEmail` as a pure helper.
- `tests/reviews.test.ts:1-11` tests only round selection.
- `AGENTS.md` documents Tier-3 tests using a running `pylon dev`, `fetch`, and `resetDb()`.
- Existing tests use Bun (`import { test, expect } from "bun:test"`) and happy-dom via `tests/setup.ts`.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `bun run check` | exit 0 |
| Unit tests | `bun test` | all pass |
| App tests | `bun run test` | all pass |

## Scope

**In scope**: `tests/http/**` (create), `tests/setup.ts`, `bunfig.toml`, `package.json`, and a minimal `tests/helpers/**` fixture layer.

**Out of scope**: application source, schema, policies, existing business logic, external email delivery, evaluator dependencies.

## Git workflow

- Branch: `codex/eval-rubric-completion`
- Commit: `Add HTTP characterization test harness`
- Do not push or open a PR.

## Steps

1. Create a deterministic helper that starts or targets a disposable Pylon dev server on a free port, waits for `/health`, exposes authenticated organizer/speaker requests, and tears down cleanly. Never use production URLs or existing `.pylon` state. Verify with a health test.
2. Add two-organization fixtures with organizer, member/reviewer, and speaker identities. Prefer supported auth test helpers or HTTP auth endpoints; do not forge runtime internals.
3. Add characterization tests for: anonymous CFP submit gate, speaker own-vs-other submission/task access, org-member own-vs-foreign entity reads/writes, public unpublished/published schedule, and current reviewer visibility. Mark known-vulnerable expectations explicitly so plan 002 can flip them.
4. Keep the default `bun test` deterministic and non-production-safe; a missing server dependency must produce a clear skip or setup failure, never target a live app.

## Test plan and done criteria

- [ ] `bun run check` passes.
- [ ] `bun test` passes with new HTTP/helper tests.
- [ ] Tests prove two distinct orgs and two distinct speaker identities.
- [ ] No network host outside loopback appears under `tests/http`.
- [ ] `git diff --name-only` contains only in-scope files.

## STOP conditions

- STOP if supported local auth cannot create deterministic identities without modifying application code.
- STOP if tests would need real email delivery or production credentials.
- STOP after two failed attempts to boot an isolated test server.

## Maintenance notes

Later plans should extend these fixtures instead of adding bespoke server startup. Review teardown, database isolation, and the absence of production hostnames carefully.

