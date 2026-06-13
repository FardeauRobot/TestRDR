# 8 · Build log — what was made, step by step

A chronological record of how Crew Watch came together, reconstructed from
[`RECAP.md`](../RECAP.md) and the git history. Newest work is at the bottom.

## Phase 1 — the frame & two-mode core

> commits `9994c2c` "main frame", `f44eade` "Add files"

- Scaffolded **Vite + React + TypeScript (strict)** with `vite-plugin-pwa`.
- Established the **central design**: a single `CrewStore` interface with two
  implementations (`DemoStore` on localStorage, `SupabaseStore` on Postgres),
  chosen once at startup. `BaseStore` provides subscribe/snapshot; React reads via
  `useCrew()` + `useSyncExternalStore`.
- Built the **domain core** in `src/lib/`: the `SUBSTANCES` catalogue, the pure
  `status.ts` timer/status logic, and `useNow` for live ticking.
- Built the **UI shell**: `App.tsx` gate flow + 4-tab layout, the crew list, the
  log screen, the Leaflet map (CARTO dark tiles), and the profile/settings screen.
- **Supabase backend**: `crews` / `profiles` / `events` tables, with crew
  create/join as **security-definer RPCs** that bcrypt-hash passwords server-side;
  permissive RLS on profiles/events scoped by `crew_id` (the trusted-crew model).

## Phase 2 — interaction chart

- Transcribed the **TripSit `combos.json`** ratings into `src/lib/interactions.ts`
  (`MATRIX` + `RISK_META` + `NOTES`).
- Wired **pre-log warnings** (`comboRisks`) that gate logging on unsafe/dangerous
  combos, and the **Combos** reference tab (`chartFor`).

## Phase 3 — production hardening

> commit `06731f6`

- **Hid the demo seed users in deployed builds** (seed only runs under
  `import.meta.env.DEV`; bumped the storage key to `crewwatch.demo.v2`).
- Added the **demo-mode notice** banner so a deployed demo build is obviously not
  syncing.

## Phase 4 — safety & resilience features

> commits `5937292`, `3eeb863`

- **Error boundary** (`src/components/ErrorBoundary.tsx`) wrapping `App` so a
  runtime crash shows a message + reload/reset instead of a blank page.
- **Status messages**: members can broadcast a short status / whereabouts note
  (preset chips + free text) via `StatusEditor` → `setStatus`; shown on cards and
  in member detail. Added `status` / `status_at` columns.
- **Admin delete-crew**: a `delete_crew` RPC that re-checks the crew password,
  surfaced as a guarded action in Settings for admins.

## Phase 5 — schema robustness & deploy

> commits `06949c7`, `ec38621`, `87e2910`

- Made `supabase-schema.sql` **fully idempotent** (`if not exists`,
  `create or replace`, `drop policy if exists`, guarded realtime-publication block)
  so the whole file can be re-pasted safely after pulling new features.
- Fixed the **pgcrypto `search_path`** in the crew RPCs (`public, extensions`) so
  `crypt`/`gen_salt` resolve on Supabase.
- Deployed to **Vercel** in synced mode; recorded the deploy gotchas (branch must
  be `master`, service-worker caching, env vars inlined at build time).

## Phase 6 — documentation & scalability cleanup *(this pass)*

- Ran two code reviews (duplication/clarity + architecture/scalability) and
  applied the high-leverage, low-risk fixes:
  - shared store persistence helpers (`store/persist.ts`) and a `BaseStore`-owned
    `pendingAdmin`;
  - a typed `toRow()` inverse mapper + `patchMe(Partial<Member>)` / `patchMember`
    in `SupabaseStore`, so mutations speak domain types and column names live in
    one place;
  - `useMe()` / `useMember()` hooks and an `eventsFor()` helper to kill repeated
    `members.find(...)` and event filter/sort boilerplate;
  - consolidated domain constants (`TONE_PRIORITY`, `DOWNER_CATEGORIES`/`isDowner`)
    and fixed the "Mixing depressants" mislabel → "Dangerous mix";
  - shared avatar palette (`lib/avatar.ts`); removed dead code.
- Wrote this `docs/` set. Full detail in
  [tech-debt review](09-tech-debt-and-review.md).

## What's deliberately not built yet

See [`RECAP.md` §11](../RECAP.md) and the
[tech-debt review](09-tech-debt-and-review.md): real auth, push/auto-alert on SOS,
second admin, status-history feed, a broader substance list, scheduled wipe of
stale locations, and iPhone background location (impossible in a PWA).
