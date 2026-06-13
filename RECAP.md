# Crew Watch — build recap (for future development)

This is an internal orientation doc for whoever (likely Claude) picks the project
up next. It records **what exists, how it fits together, and the decisions
behind it** so new features can slot in without re-discovering everything.
User-facing docs are `README.md` / `SETUP-SUPABASE.md`.

---

## 1. What the app is

A private, install-to-home-screen **harm-reduction buddy PWA** for a small crew
(~10–20 people, mixed iPhone/Android). Members log what/when they consumed; the
app shows live per-substance timers, check-ins, an SOS, a map, and a TripSit
drug-interaction chart.

**Hard product constraints (don't break these):**
- **Free to distribute, no app-store fees** → it's a PWA, never native. (Only
  iPhone *background* location would justify going native.)
- Works offline-ish and on mobile first.
- It's a *safety* tool: warnings are guidance, never presented as guarantees;
  never block someone from logging, just make sure they were informed.

## 2. Stack & commands

Vite 6 + React 18 + TypeScript (strict) · Leaflet/react-leaflet · Supabase JS ·
vite-plugin-pwa · Leaflet map tiles from CARTO dark (no API key).

```bash
npm run dev        # local dev (vite --host)
npm run build      # tsc -b && vite build  → ./dist   (run this to typecheck)
npm run preview    # serve the built app
npm run gen-icons  # regenerate PNG icons from public/favicon.svg (uses sharp)
```

Node 24 in this env. There is **no test suite** — `npm run build` (strict TS) is
the correctness gate. After any change, run it.

## 3. Two runtime modes (important mental model)

The app auto-selects a store at startup based on env vars (`src/lib/supabase.ts`):

- **Demo mode** (default, no env): `DemoStore`, everything in `localStorage`,
  single device, pre-seeded with sample crew mates so the UI is alive. Crews
  aren't truly separated (any name/password "works"). For previewing UI only.
- **Synced mode** (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set):
  `SupabaseStore`, real cross-device crews via Postgres + realtime.

Both implement the same `CrewStore` interface, so **screens/components never know
which mode they're in** — always go through the store. When adding a feature
that touches data, implement it in *both* stores + the interface + (if synced)
the SQL schema.

## 4. Architecture / data flow

```
main.tsx
 └─ StoreProvider (store/context.tsx)   ← picks Demo or Supabase store once
     └─ App.tsx                         ← routing + bottom tab bar
         └─ screens/* + components/*    ← read state via useCrew(), act via useStore()
```

- `useCrew()` → reactive snapshot of `CrewState` (via `useSyncExternalStore`).
- `useStore()` → the store instance to call actions on.
- `useNow(ms)` (`lib/useNow.ts`) → ticking clock so elapsed timers re-render live.
- Stores extend `BaseStore` (`store/store.ts`) which handles
  subscription + immutable snapshot. Mutate via `this.set({...})`.

## 5. File map (what lives where)

```
src/
  main.tsx                 entry; mounts App in StoreProvider; imports leaflet css
  App.tsx                  ready/crew/profile gating; tab state; MemberDetail overlay (openId)
  index.css                ALL styling (dark design system, mobile-first, CSS vars)
  types.ts                 Member, ConsumptionEvent, GeoPoint, ID
  vite-env.d.ts            env var types

  lib/
    util.ts                uid, cx, formatElapsed, formatAgo, minutesSince
    useNow.ts              live clock hook
    substances.ts          SUBSTANCES catalogue (id, name, emoji, category, durationMins,
                           redoseWaitMins, caution), getSubstance(), DISCLAIMER
    status.ts              member status + timers + mix logic (see §7)
    interactions.ts        TripSit interaction chart + RISK_META (see §8)
    supabase.ts            creates client if env present; exports SYNC_ENABLED

  store/
    store.ts               CrewState, Crew, NewProfile, NewConsumption,
                           CrewStore interface, BaseStore
    demoStore.ts           localStorage impl, seeded
    supabaseStore.ts       Supabase impl (RPC crews, realtime, CRUD)
    context.tsx            StoreProvider, useStore, useCrew

  components/
    Avatar.tsx             emoji+colour avatar
    MemberCard.tsx         crew-list card; exports DoseChips (per-substance timer chips)

  screens/
    CrewGate.tsx           create/join a crew (name + password); invite prefill
    Onboarding.tsx         set up your profile within the crew
    CrewScreen.tsx         crew list, self panel (check-in/SOS), attention banner
    LogScreen.tsx          pick substance + dose/note; redose + interaction disclaimer
    MapScreen.tsx          Leaflet map; share/live location; SOS
    InteractionsScreen.tsx the "Combos" reference chart
    MemberDetail.tsx       tap-through: all timers, full history, admin actions
    SettingsScreen.tsx     profile edit, Safety toggle, crew info/invite, leave

root:
  supabase-schema.sql      tables + RPCs + RLS (idempotent, safe to re-run)
  SETUP-SUPABASE.md        user setup walkthrough
  README.md                user-facing overview
  .env.example             VITE_SUPABASE_URL / _ANON_KEY only
  scripts/gen-icons.mjs    SVG → PNG icons
  public/favicon.svg, icon-192.png, icon-512.png
  vite.config.ts           PWA manifest + map-tile runtime caching
```

## 6. Data model

```ts
Member {
  id, name, emoji, color,
  isAdmin: boolean,        // crew creator
  mixWarnings: boolean,    // show interaction disclaimer before logging (default true)
  lastCheckIn: number,     // ms epoch; updated by check-in, log, SOS
  sos: boolean,
  location?: GeoPoint,     // {lat,lng,accuracy?,at}
  updatedAt: number,
}
ConsumptionEvent { id, memberId, substanceId, dose?, note?, at }   // full history is just all events
Crew { id, name }
CrewState { crew: Crew|null, members: Member[], events: ConsumptionEvent[], meId: ID|null, ready: boolean }
```

`CrewStore` actions: `createCrew, joinCrew, leaveCrew, createProfile,
updateProfile, logConsumption, checkIn, setSos, updateLocation, setMixWarnings,
removeMember (admin), clearMemberSos (admin)`.

**localStorage keys:** `crewwatch.crew.v1` (current crew), `crewwatch.me.<crewId>`
(this device's profile id per crew), `crewwatch.demo.v1` (demo data bucket).

## 7. Status & timer logic (`lib/status.ts`)

- `doseTimers(memberId, events, now)` → one `DoseTimer` per distinct substance
  (lastAt, count, `active` = elapsed < substance.durationMins). Newest first.
- `activeDoses(...)` → only the active ones (the mixing-relevant set).
- `memberStatus(...)` → `{ tone, label, lastEvent, active }`. Tones (priority
  order, also drives crew-list sorting): `sos > alert > active > ok > idle`.
  Escalates to `alert` if a danger mix is active or if active-but-quiet
  (`QUIET_MIN 45` / `SILENT_MIN 90` minutes since check-in).
- `mixAlert(active)` → worst interaction among active substances (for card flags).
- `comboRisks(substanceId, active)` → caution-or-worse combos vs what's active
  (for the pre-log disclaimer).
- `checkRedose(...)` → early re-dose check using `substance.redoseWaitMins`.

## 8. Interaction chart (`lib/interactions.ts`)

- Ratings transcribed from **TripSit `combos.json`** (CC BY-NC-SA). Levels:
  `dangerous, unsafe, caution, synergy, neutral, decrease, unknown`.
- `RISK_META[level]` = `{ label, short, color, gate, severity, blurb }`.
  `gate: true` (dangerous + unsafe only) → forces an "I understand" checkbox
  before logging. Caution warns but doesn't gate.
- `KEY` maps our substance ids → TripSit keys; only 14 substances are charted
  (`CHARTED`). `nicotine` / `other` → `unknown`. `MATRIX` is symmetric.
- API: `interaction(aId,bId)`, `interactionReason(aId,bId,level)` (uses `NOTES`
  for the deadliest pairs, else the level blurb), `chartFor(id)` (sorted list for
  the Combos tab).
- **To add a substance to the chart:** add it in `substances.ts`, add a `KEY`
  entry, and add a `MATRIX` row (+ reciprocal values) from the TripSit data.

## 9. Backend (Supabase) — `supabase-schema.sql`

- Tables: `crews` (id, name, **bcrypt** password_hash, created_at),
  `profiles` (crew_id FK, …, is_admin, mix_warnings, location cols),
  `events` (crew_id, member_id FK, substance_id, dose, note, at).
- **Security-definer RPCs** `create_crew` / `join_crew` do password hashing &
  checking server-side; the `crews` table is RLS-locked (clients can't read it).
- `profiles` / `events` have **permissive RLS** (`using(true)`), scoped in
  queries by `crew_id` (an unguessable UUID you only get by joining). This is the
  deliberate "trusted small crew" trade-off — admin powers are UI-gated, not
  DB-enforced. Hardening path (Supabase Auth + membership RLS) is noted in
  SETUP-SUPABASE.md.
- Schema is **idempotent** (`if not exists`, `add column if not exists`) — safe to
  paste again after adding columns.
- Admin model: creating a crew sets a transient `pendingAdmin` flag in the store;
  the creator's first `createProfile` inserts `is_admin = true`.

## 10. Conventions & gotchas

- **Mobile-first, dark theme.** All styles in `index.css` using CSS variables and
  semantic classes (`.card`, `.btn`, `.banner`, `.tchip`, `.risk-pill`, tone
  classes `tone-*`/`fill-*`). Prefer reusing these over inline styles.
- Money/safety copy: keep it factual, non-judgemental, harm-reduction tone.
- Geolocation needs **HTTPS** (works on localhost; on phones requires a deployed
  https link). Map tiles: CARTO dark, cached via the service worker.
- Leaflet markers use `L.divIcon` (HTML) to avoid bundler image issues.
- PWA: `registerType: autoUpdate`. Manifest + icons in `vite.config.ts` / `public`.
- When adding a screen: add a `Tab` in `App.tsx` (tabs: crew, log, map, combos,
  you) or render it via the `openId` overlay pattern like `MemberDetail`.

## 11. Known limitations / candidate next steps

- **No real auth** — anyone with crew name+password (or a crew UUID + anon key)
  can read/write that crew. Fine for the use case; Supabase Auth is the upgrade.
- **iPhone background location** not possible in a PWA (only while open).
- Admin powers are UI-gated only (see §9).
- Interaction chart covers only the 14 listed substances; RCs/others show "no data".
- Ideas discussed but not built: promote a second admin, rotating invite codes /
  creator-approval to join, push/auto-alert on SOS or danger-mix, broader
  substance list, scheduled wipe of stale locations (SQL stub is in the schema).

## 12. Deployment

Auto-deploy from GitHub is set up for **Vercel / Netlify** (connect repo →
build on push). Config in `vercel.json`, `netlify.toml`, `.nvmrc` (Node 20).
Build `npm run build` → `dist`; root base path (no subpath). Supabase env vars
go in the host dashboard (build-time, `VITE_*`). Full guide: `DEPLOY.md`.

**Public-deploy caveat:** anon key ships in the public bundle + permissive RLS
(`using(true)`) means crew data is readable by anyone with the URL. Fine for a
private link; harden via security-definer RPCs or Supabase Auth before a wide
launch (see §9 / DEPLOY.md security note).

## 13. Status

Builds clean (strict TS), serves 200. Not yet deployed and Supabase project not
yet created by the user — still runs in Demo mode until env vars are set.
Deploy scaffolding (configs + DEPLOY.md) is in place; repo not yet `git init`'d.
