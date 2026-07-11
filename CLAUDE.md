# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Keeping this file current (do this without being asked)

**Treat CLAUDE.md as part of the change, not an afterthought.** Whenever a change alters something this file documents, update the relevant section **in the same change / commit**. Triggers:

- the **`CrewStore` interface** or a store method (add/remove/rename) → update the two-mode + subsystems sections;
- **schema** tables/columns/RPCs, or the tables list → update the Supabase specifics;
- **screens/navigation** (new screen, tab, or overlay) → update the UI shape section;
- **domain logic** (`status.ts` / `interactions.ts` / `substances.ts` behavior, thresholds) → update the domain-logic section;
- **commands** (`package.json` scripts), the **legal guardrail**, or any hard constraint.

Keep it high-level and current — durable architecture and the "one rule" invariants, **not** a changelog (transient work goes in `RECAP.md` / `docs/`). When you notice drift (a claim that no longer matches the code), fix it in passing and mention it. If unsure whether something belongs here vs. `docs/`, prefer a one-line pointer here and the detail in `docs/`.

## What this is

**Crew Watch** is a private, installable PWA for a small harm-reduction "buddy" crew. Members log what/when they consumed; the app shows live per-substance timers since each person's last dose, flags people who go quiet, supports check-ins/SOS, and has a map to find each other in an emergency. **Hard constraint: stays a PWA so it costs nothing to distribute** (no Apple $99/yr or Play $25 account). True iOS background location is the one feature that would force going native.

## ⚖️ Legal guardrail (read before certain changes)

This app handles **drug-use logs + live location** — legally sensitive data under GDPR and French drug law. **Before adding or changing anything that touches personal data, drug-use logging, location, public/stranger distribution, or monetisation, consult [`docs/11-legal-compliance.md`](docs/11-legal-compliance.md) and surface any conflict to the user *before* implementing.** In particular, refuse/flag features that **gamify or glamorise consumption**, recommend substances/doses/sources/combos, or help users **obtain/sell/share** substances (these cross French drug-law lines), and flag anything that widens who can read crew data or weakens the disclaimer / emergency-number messaging. The doc's §10 has the full trigger list.

## Commands

```bash
npm install
npm run gen-icons   # one-time: generate PNG app icons from public/favicon.svg (uses sharp)
npm run dev         # Vite dev server, --host so phones on the LAN can reach it
npm run build       # tsc -b && vite build → ./dist (PWA assets emitted here)
npm run typecheck   # tsc -b --noEmit
npm run preview     # serve the built ./dist over the network
```

There is **no test runner and no linter** configured — `typecheck` is the only automated gate. Run it after changes.

## Two-mode architecture (the central design)

Everything routes through a single `CrewStore` interface (`src/store/store.ts`). The concrete implementation is chosen **once at startup** in `src/store/context.tsx` based on whether Supabase env vars are present:

- **Demo mode** (`DemoStore`, default): localStorage-backed, single device, pre-seeded with sample mates (centered on Paris). Crews are not truly isolated — every demo crew shows the same seed so the flow is previewable with no backend.
- **Synced mode** (`SupabaseStore`): activated when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set (copy `.env.example` → `.env`). Postgres + realtime; crews are real and cross-device.

`SYNC_ENABLED` / `supabase` in `src/lib/supabase.ts` gate the choice. The header pill ("🔗 Synced" / "📴 Demo") reflects it.

When adding any user action that mutates crew state, **add it to the `CrewStore` interface in `store.ts` and implement it in BOTH `demoStore.ts` and `supabaseStore.ts`.** Both extend `BaseStore`, which provides the subscribe/snapshot machinery. React reads state via `useCrew()` (a `useSyncExternalStore` wrapper) and gets the store via `useStore()`.

**Accounts:** users sign up / log in with a **nickname + password** (their global identity, carrying nickname + avatar) *before* joining a crew — `signup`/`login`/`logout`/`updateAccount` on the store; the account is persisted on the device (`crewwatch.account.v1`) and gates the app (`account` → `crew` → shell). Joining/creating a crew **auto-creates your member from the account** (`profiles.account_id`), so there is no separate onboarding step. The crew creator's member is flagged `isAdmin` by passing an admin flag through to that auto-create (no more `pendingAdmin` flag).

**Two admin tiers:** a **crew admin** (`isAdmin`, managed in `ManageCrewScreen` via `setAdmin`/`removeMember`/`clearMemberSos`) acts within one crew; a global **operator** (`accounts.is_operator`, `OperatorConsole`) acts across all crews via `listAllCrews`/`deleteCrewById`/`setGlobalRetention`, gated by the security-definer `admin_*` RPCs.

**Feature subsystems** (each has store methods on the `CrewStore` interface implemented in both stores):
- **Live location** — `src/lib/liveLocation.ts` (`liveLocation` singleton + `useLiveLocation`) drives the "live" pill and calls `updateLocation`; the watch is owned at the `App.tsx` level so sharing survives tab switches. Powers the Map.
- **Map pins** — `addPin`/`removePin` (`map_pins` table, `NewPin`/`MapPin` types), rendered on the Map alongside members.
- **Check-in / SOS** — `setSos`, plus a request/resolve flow (`requestCheck`/`resolveCheck`, `check_requests` table, `CheckPrompt` component) for nudging someone to check in.
- **Location retention & panic wipe** — evidence-trail mitigation (see the legal guardrail): `wipeLocations` (immediate), `setLocationRetention` (per-crew, admin), `setGlobalRetention` (operator). Backed by `app_settings`/`crew_settings` + the `wipe_stale_locations()` pg_cron job; `DemoStore` sweeps client-side.
- **Web Push** — see the Supabase specifics above (`send-push` Edge Function + `src/lib/push.ts`).

### Supabase specifics
- Schema lives in `supabase-schema.sql` (run in the Supabase SQL editor). Tables: `crews`, `accounts`, `profiles`, `events`, `check_requests`, `map_pins`, `push_subscriptions`, plus the location-retention settings tables `app_settings` (global default) and `crew_settings` (per-crew override).
- Crew create/join go through Postgres RPC functions `create_crew` / `join_crew` — passwords are **bcrypt-hashed server-side**; the `crews` table is not client-readable. Clients only ever hold a crew's UUID (after a correct name+password) plus the anon key. `humanize()` strips Postgres prefixes from RPC errors for display.
- The crew-data tables (`profiles`, `events`, `check_requests`, `map_pins`, `crew_settings`, and read-only `app_settings`) carry permissive RLS (`using (true)`) — acceptable for a small trusted crew. `crews`/`accounts` have RLS on with **no** policies, so they're reachable only through the security-definer RPCs (password hashes never leave the DB). The store filters by `crew_id` on every query and subscribes to realtime `postgres_changes` on the crew-data tables (any change → `refetch`).
- Row shapes are snake_case in the DB; `toMember` / `toEvent` / `toPin` map them to the camelCase domain types in `src/types.ts`.
- Web Push runs through the `send-push` **Edge Function** (`supabase/functions/send-push`), which reads `push_subscriptions` via the service role; the client subscribes/unsubscribes via `src/lib/push.ts` (`savePushSubscription`/`removePushSubscription`).

## Domain logic lives in `src/lib/status.ts`

This is the heart of the app and where most behavior decisions are. It is **pure** (functions of `events` + `now`), so timers stay correct as time passes without re-fetching:

- `doseTimers` / `activeDoses` — per-substance aggregation; a dose is "active" while `minutesSince < substance.durationMins`.
- `memberStatus` — derives the card tone (`sos` > `silent` > `mixing danger` > `quiet` > `active`/`coming up` > `ok` > `idle`). Thresholds: `QUIET_MIN=45`, `SILENT_MIN=90`.
- `mixAlert` — the worst interaction among the substances a member currently has active. It does **pairwise** `interaction(a.id, b.id)` lookups over the active doses and picks the worst by `RISK_META[level].severity` (it no longer counts sedatives/stimulants by category).
- `comboRisks` — pre-log warnings shown before confirming a new log, driven by the same pairwise interaction matrix (includes the cocaethylene and "speedball" special cases).
- `checkRedose` — warns when re-logging the same substance sooner than its `redoseWaitMins`.

**The pairwise interaction engine is `src/lib/interactions.ts`** (`RISK_META`, `interaction(aId, bId)` → `RiskLevel`, `interactionReason(...)`, plus `CHARTED`/`chartFor` for the reference chart in `InteractionsScreen`). `status.ts` consumes it; the cocaethylene/speedball special cases live in `interactions.ts`, **not** `status.ts`.

The substance catalogue (durations, redose windows, cautions, categories) is `src/lib/substances.ts`. **Timing keys off the minute fields there; mixing risk keys off the interaction matrix in `interactions.ts`** — edit substance data / interaction pairs there, not in `status.ts`. Durations are deliberately rough population averages; the `DISCLAIMER` and harm-reduction-not-medical-advice framing must be preserved in any user-facing copy.

`useNow(intervalMs)` (`src/lib/useNow.ts`) drives the live ticking by re-rendering on an interval; pass `now` into the `status.ts` functions.

## UI shape

`src/App.tsx` is the whole router: a gate flow (`AuthScreen` → `CrewGate`, then the member is auto-created so `meId` is set) into a 4-tab shell (Crew / Log / Map / You) with **Embla-carousel swipe** between tabs, plus a stack of overlay screens opened from within it: `MemberDetail`, `SettingsScreen` (the "You" tab), `BulkLogScreen` (log for several members at once → `logConsumptionFor`), `InteractionsScreen` (the combo reference chart — reached from Log/Settings, deliberately not a tab), `ManageCrewScreen` (crew-admin), and `OperatorConsole` (global operator). No routing library; navigation is local `useState`. Invite links carry `?crew=Name` (prefills the name; password shared out-of-band), or `?crew=Name&pw=Password` for the QR code generated in Settings ("Show QR code") — scanning that auto-joins with no typing. `App.tsx`'s `readInvite()`/`scrubInviteFromUrl()` split is deliberate: the `useState` initializer that reads the query params must stay a pure read (React `StrictMode` double-invokes it in dev), while stripping `crew`/`pw` from the address bar/history is a separate, idempotent effect. Screens are in `src/screens/`, shared bits in `src/components/`.

Map uses Leaflet + react-leaflet with free CARTO dark tiles (no API key). The PWA service worker (`vite-plugin-pwa`, configured in `vite.config.ts`) runtime-caches those map tiles `CacheFirst`; it does **not** precache them.

## Things to keep in mind

- Location/geolocation requires HTTPS (or localhost) — deploy `dist/` to any static HTTPS host (Netlify/Vercel/Cloudflare Pages). Test location features over `--host` from a phone won't work without HTTPS.
- Never commit `.env`. Use the **anon** key, never `service_role`.
- See `README.md` (user-facing) and `SETUP-SUPABASE.md` (deploy/security model) for the full setup story.
- Look at the `RECAP.md` that explains what was done before
- For the full structured docs, see `docs/` (start at `docs/README.md`): architecture, data model, domain logic, backend, UI, deploy, a step-by-step build log, and `docs/09-tech-debt-and-review.md` (review findings + what's fixed/deferred).
