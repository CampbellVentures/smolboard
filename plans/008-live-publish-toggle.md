# Plan 008: Make schedule publishing live and reversible

> **Executor instructions**: Execute exactly, verify, and touch only scope. Reviewer maintains the index.
>
> **Drift check**: `git diff --stat e61df7e..HEAD -- app/dashboard/events/[id]/agenda tests`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plan 001
- **Category**: bug
- **Planned at**: commit `e61df7e`, 2026-08-09

## Why this matters

The first publish persists, but `PublishToggle` keeps reading the server-rendered `event` prop. The button remains “Publish schedule,” the live link does not appear, and subsequent clicks write `true` again, so unpublish is impossible until reload.

## Current state

`app/dashboard/events/[id]/agenda/agenda-client.tsx:732-760` computes text, next value, toast, and link from stale `event.schedulePublished`:

```tsx
await db.update("Event", event.id, { schedulePublished: !event.schedulePublished });
```

The surrounding agenda already uses live queries for Session, Room, and Track.

## Commands

`bun run check`; `bun test`.

## Scope

**In scope**: `app/dashboard/events/[id]/agenda/agenda-client.tsx`; one focused component test under `tests/`.

**Out of scope**: public widget redesign, content approval, schema, feed response shapes.

## Steps

1. Make publish state live using a scoped Event subscription or local optimistic state reconciled with the mutation result. Use that single state for next value, button style/text, toast, and live link.
2. Handle write failure by preserving/reverting truthful state and showing the existing toast error pattern.
3. Add a component test that publishes, observes “Unpublish” and the live link, unpublishes without reload, and verifies the values written were `true` then `false`.

## Done criteria

- [ ] `bun run check` and `bun test` pass.
- [ ] Publish→unpublish works without reload.
- [ ] Failed mutation cannot leave false success UI.
- [ ] Only two in-scope files changed.

## STOP conditions

- STOP if testing requires broad agenda refactoring or new dependencies.
- STOP if the Event live-query API is unavailable; local state is permitted and must be tested.

## Maintenance notes

Plan 005 later adds content approval; schedule publication must remain a separate event-level switch.
