# Plan 006: Complete canonical public widget surfaces

> **Executor instructions**: Execute stepwise, verify, respect scope, STOP rather than improvise. Reviewer maintains the index.
>
> **Drift check**: `git diff --stat 2cef7d9..HEAD -- app/[orgSlug] components/public-shell.tsx functions/getPublic* lib tests`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans 004 and 005
- **Category**: direction
- **Planned at**: commit `2cef7d9`, 2026-08-09

## Why this matters

The evaluator expects five anonymous widget surfaces. The app currently exposes one schedule section and one static speaker grid, without session/speaker search, details, personal itinerary, embed controls, or canonical cross-surface data. The speaker feed derives titles from submissions while the schedule uses sessions, so retitles and co-speakers diverge.

## Current state

- `app/[orgSlug]/[eventSlug]/event-site-client.tsx:103-312`: schedule plus speaker sections only.
- `app/[orgSlug]/[eventSlug]/schedule/page.tsx:4-12` and speakers equivalent redirect to anchors.
- `functions/getPublicSchedule.ts:79-101`: session-based feed.
- `functions/getPublicSpeakers.ts:42-66`: accepted-submission-based feed, no headshot/session details, full-name sort.

## Pylon 0.3.385 public/embed compatibility decisions

- Public headshots come only from Plan 004's validated `headshotUrl`. Never
  expose, resolve, proxy, or transform a private Pylon file id/URL.
- Start only after Plan 005 Phase A approval exists. The canonical projection
  requires event schedule publication and explicit session content approval.
- SSR defaults to `X-Frame-Options: SAMEORIGIN`. Phase A delivers five anonymous
  routes, safe share URLs, same-origin previews, local itinerary persistence,
  and iCal export without weakening framing policy.
- Cross-origin iframe snippets are Phase B. They require a dedicated cookie-less
  read-only embed route with narrowly scoped framing support; never relax
  framing globally for authenticated pages.
- Configuration is typed and allowlisted; never accept raw HTML, CSS, JS,
  selectors, image markup, or arbitrary style strings.

## Commands

`bun run check`; `bun test`; `bun run app.ts`; Pylon policy lint.

## Scope

**In scope**: public event routes/components, public feed functions/types/helpers, organizer embed/share UI, personal itinerary local persistence/export, tests.

**Out of scope**: authentication, organizer agenda editor, CRM, new AI features.

## Steps

1. Create one safe canonical public event projection from approved published `Session` rows plus rooms/tracks/profiles/headshots. Build speaker-to-session details from the same graph. Parallelize independent reads and make SSR/prefetch avoid the client waterfall.
2. Implement five distinct SSR routes for Sessions List, Speakers List, Agenda, Schedule Itinerary, and Speaker Gallery. Each loads the same public query through `serverData.fn`; redirects to one combined page do not satisfy this step.
3. Add session keyword search over title/speaker, faceted track/format/location filters and result counts; add speaker surname sorting/search, headshots with graceful fallback, and detail panels including timed/roomed sessions.
4. Add day navigation and full session details to agenda/itinerary. Persist selected public session ids in event-scoped localStorage, reconcile them against the current approved graph, and generate a client-side iCal download.
5. Add organizer sharing with typed stable URLs, same-origin previews, configurable allowlisted colors/branding/filters/fields. Cross-origin iframe snippets remain Phase B under the framing decision above.
6. Add source-consistency tests covering session retitle, co-speaker, approval, fields across all surfaces, anonymous access, search/filter/detail, persistence/export, and embed configuration.

## Done criteria

- [ ] EMB-01 through EMB-14 and EMB-16 pass an automated component/HTTP test or explicit export check; EMB-15 cross-origin iframe output remains Phase B, while safe share URLs/previews pass.
- [ ] All five URLs render anonymously without redirecting to one undifferentiated surface.
- [ ] Retitles/co-speakers match everywhere without republishing.
- [ ] Public payloads contain no speaker email or private metadata.
- [ ] Verification commands pass; scope clean.

## STOP conditions

- STOP before reading a private Pylon file for a public headshot; use only validated `headshotUrl`.
- STOP before enabling third-party iframe rendering unless framing is scoped to a dedicated anonymous embed route and does not weaken application pages.
- STOP until Plan 005 approval state and approved-only public filtering are present.

## Maintenance notes

Public feeds are projections, not direct entity exposure. Keep one canonical graph and derive every widget from it.
