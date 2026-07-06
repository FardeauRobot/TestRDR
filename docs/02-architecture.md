# 2 · Architecture

## The central idea: one store, two implementations

Everything that reads or mutates crew state routes through a single interface,
**`CrewStore`** (`src/store/store.ts`). There are two concrete implementations:

- `DemoStore` (`src/store/demoStore.ts`) — `localStorage`, single device, seeded.
- `SupabaseStore` (`src/store/supabaseStore.ts`) — Postgres + realtime.

The implementation is chosen **once at startup** in `src/store/context.tsx`,
based on whether Supabase env vars are present (`SYNC_ENABLED` in
`src/lib/supabase.ts`):

```ts
const store: CrewStore =
  SYNC_ENABLED && supabase ? new SupabaseStore(supabase) : new DemoStore()
```

Because screens only ever see the `CrewStore` interface, **no UI code knows or
cares which mode it's in.** That is the whole point of the seam.

## Data flow

```
main.tsx
 └─ ErrorBoundary                         ← renders a message instead of a blank page on crash
     └─ StoreProvider (store/context.tsx) ← picks Demo or Supabase store once
         └─ App.tsx                       ← gating + bottom tab bar + overlay
             └─ screens/* + components/*  ← read via useCrew()/useMe(), act via useStore()
```

### The React hooks (`src/store/context.tsx`)

| Hook | Returns | Notes |
|------|---------|-------|
| `useStore()` | the `CrewStore` instance | call actions on it (`store.checkIn()`) |
| `useCrew()` | live `CrewState` snapshot | via `useSyncExternalStore` |
| `useMe()` | this device's `Member` (or `undefined`) | replaces the old `members.find(m => m.id === meId)` boilerplate |
| `useMember(id)` | a member by id (or `undefined`) | used by the member-detail overlay |

`useNow(ms)` (`src/lib/useNow.ts`) is a separate hook that re-renders on an
interval so elapsed timers tick live **without re-fetching** — the timer math in
`lib/status.ts` is pure (a function of `events` + `now`), so the clock alone
keeps it correct as time passes.

## `BaseStore` — the shared machinery

Both stores extend `BaseStore` (`src/store/store.ts`), which owns everything
mode-agnostic:

- the immutable `CrewState` snapshot and the `subscribe`/listener set,
- `protected set(partial)` — merge + notify all listeners,
- `protected get me()` — the current member,
- `protected pendingAdmin` — the transient "creator becomes admin on their first
  profile" flag (see [Backend](05-backend-supabase.md#admin-model)).

Persistence helpers shared by both stores live in `src/store/persist.ts`
(`CREW_KEY`, `meKey(crewId)`, `loadCrew()`), so the localStorage key names exist
in exactly one place.

## Adding a state-mutating feature

This is the recurring task, so it has a checklist:

1. Add the method to the **`CrewStore` interface** + its `abstract` declaration
   in `BaseStore`.
2. Implement it in **`DemoStore`**.
3. Implement it in **`SupabaseStore`**.
4. If it touches synced data, update **`supabase-schema.sql`** (and re-run it in
   the Supabase SQL editor — the schema is idempotent).
5. Wire the UI to it via `useStore()`.

Both stores now share a `patchMe(Partial<Member>)` helper that takes a
**camelCase domain patch**. In `SupabaseStore` that patch is turned into a
snake_case row by a single `toRow()` mapper (the inverse of `toMember()`), so
column-name knowledge lives in one place and a profile field added to `Member`
is mostly "add the column + extend `toRow`/`toMember`." See
[Data model](03-data-model.md) and the [tech-debt review](09-tech-debt-and-review.md)
for the rationale and the deferred "generic `updateMe`" idea.
