# Crew Watch — build recap (for future development)

This is an internal orientation doc for whoever (likely Claude) picks the project
up next. It records **what exists, how it fits together, and the decisions
behind it** so new features can slot in without re-discovering everything.
User-facing docs are `README.md` / `SETUP-SUPABASE.md`.

---

## 1. What the app is

A private, install-to-home-screen **harm-reduction buddy PWA** for a small crew
(~10–20 people, mixed iPhone/Android). Members log what/when they consumed; the
app shows live per-substance timers, check-ins, status notes ("back at camp"),
an SOS, a map, and a TripSit drug-interaction chart.

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
    MemberCard.tsx         crew-list card; exports DoseChips (per-substance timer chips); shows status
    StatusEditor.tsx       "Share a status" — preset chips + free text (self panel)
    ErrorBoundary.tsx      catches render errors → message + reload/reset (wraps App in main.tsx)

  screens/
    CrewGate.tsx           create/join a crew (name + password); invite prefill
    Onboarding.tsx         set up your profile within the crew
    CrewScreen.tsx         crew list, self panel (check-in/SOS/status), attention banner, demo-mode notice
    LogScreen.tsx          pick substance + dose/note; redose + interaction disclaimer
    MapScreen.tsx          Leaflet map; share/live location; SOS
    InteractionsScreen.tsx the "Combos" reference chart
    MemberDetail.tsx       tap-through: status, all timers, full history, admin actions
    SettingsScreen.tsx     profile edit, Safety toggle, crew info/invite, leave, admin delete-crew

root:
  supabase-schema.sql      tables + RPCs + RLS (idempotent, safe to re-run)
  SETUP-SUPABASE.md        user setup walkthrough
  DEPLOY.md                Vercel/Netlify auto-deploy-from-GitHub guide
  README.md                user-facing overview
  .env.example             VITE_SUPABASE_URL / _ANON_KEY only
  vercel.json / netlify.toml / .nvmrc   host build config (Node 20, SPA fallback)
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
  lastCheckIn: number,     // ms epoch; updated by check-in, log, SOS, status
  status?: string,         // current thought/whereabouts note (presets or free text)
  statusAt?: number,       // when status was set (ms epoch)
  sos: boolean,
  location?: GeoPoint,     // {lat,lng,accuracy?,at}
  updatedAt: number,
}
ConsumptionEvent { id, memberId, substanceId, dose?, note?, at }   // full history is just all events
Crew { id, name }
CrewState { crew: Crew|null, members: Member[], events: ConsumptionEvent[], meId: ID|null, ready: boolean }
```

`CrewStore` actions: `createCrew, joinCrew, leaveCrew, deleteCrew (admin, re-checks
password), createProfile, updateProfile, logConsumption, checkIn, setSos,
updateLocation, setStatus, setMixWarnings, removeMember (admin), clearMemberSos (admin)`.

**localStorage keys:** `crewwatch.crew.v1` (current crew), `crewwatch.me.<crewId>`
(this device's profile id per crew), `crewwatch.demo.v2` (demo data bucket — bumped
to v2 when seed users were hidden in prod). Demo seed (`DemoStore`) only runs under
`import.meta.env.DEV`; deployed builds start empty.

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
  `profiles` (crew_id FK, …, is_admin, mix_warnings, status, status_at, location cols),
  `events` (crew_id, member_id FK, substance_id, dose, note, at).
- **Security-definer RPCs** `create_crew` / `join_crew` / `delete_crew` (admin,
  re-checks password) do password hashing & checking server-side; the `crews`
  table is RLS-locked (clients can't read it). **Gotcha:** these functions must
  set `search_path = public, extensions` so `crypt`/`gen_salt` (pgcrypto, which
  Supabase installs in the `extensions` schema) resolve — otherwise you get
  `function gen_salt(...) does not exist` at call time.
- `profiles` / `events` have **permissive RLS** (`using(true)`, incl. delete), scoped
  in queries by `crew_id` (an unguessable UUID you only get by joining). This is the
  deliberate "trusted small crew" trade-off — admin powers are UI-gated, not
  DB-enforced. Hardening path (Supabase Auth + membership RLS) is noted in
  SETUP-SUPABASE.md.
- Schema is **fully idempotent** (`if not exists`, `add column if not exists`,
  `create or replace`, `drop policy if exists`, guarded realtime-publication DO
  block) — safe to paste the whole file again. **Re-run it after pulling new
  features that add columns/RPCs** (e.g. status, delete_crew).
- Admin model: creating a crew sets a transient `pendingAdmin` flag in the store;
  the creator's first `createProfile` inserts `is_admin = true`.
- `SupabaseStore.refetch` clears `meId` if the member's own profile is gone (kicked
  by admin / crew deleted) → app bounces them back to onboarding/gate cleanly.

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
  can read/write that crew, and the anon key ships in the public bundle so data is
  readable by anyone with the deployed URL. Fine for an unlisted private link;
  Supabase Auth (or RPC-gated reads) is the upgrade before a wide launch.
- **iPhone background location** not possible in a PWA (only while open).
- Admin powers are UI-gated only (see §9).
- Interaction chart covers only the 14 listed substances; RCs/others show "no data".
- Status messages are a single current note per member (no history feed yet).
- Ideas discussed but not built: promote a second admin, rotating invite codes /
  creator-approval to join, push/auto-alert on SOS or danger-mix, status history
  feed, broader substance list, scheduled wipe of stale locations (SQL stub in schema).

## 12. Deployment

**Live** on Vercel (repo `github.com/FardeauRobot/TestRDR`, branch `master`),
auto-deploying on push. Config in `vercel.json`, `netlify.toml`, `.nvmrc` (Node 20).
Build `npm run build` → `dist`; root base path (no subpath). Supabase env vars go
in the host dashboard (build-time, `VITE_*`). Full guide: `DEPLOY.md`.

**Deploy gotchas hit so far (watch for these):**
- **Production branch must be `master`** in Vercel settings (it defaults to `main`);
  a mismatch means pushes never trigger a production deploy.
- **PWA service worker caches per-origin.** After a deploy, the new build only
  activates once the app/tab is fully closed & reopened (or site data cleared).
  "I pushed but nothing changed" is almost always this or the branch setting.
- Each Vercel alias (`rdronline.vercel.app` vs `rdronline-…-projects.vercel.app`)
  is a separate origin with its own service worker — prefer one canonical URL.
- Env-var changes need a rebuild to take effect (they're inlined at build time).

**Public-deploy caveat:** anon key ships in the public bundle + permissive RLS
(`using(true)`) means crew data is readable by anyone with the URL. Fine for a
private link; harden via security-definer RPCs or Supabase Auth before a wide
launch (see §9 / DEPLOY.md security note).

## 13. Status

Builds clean (strict TS), serves 200, deployed to Vercel in **Synced mode** (user
created the Supabase project). An `ErrorBoundary` now wraps `App` so runtime errors
show a message + reload/reset instead of a blank page.

**Reminder when shipping schema-touching features:** re-run `supabase-schema.sql`
in Supabase, then `git push` to redeploy — the UI may appear from the deploy alone,
but DB-backed actions error until the schema is updated.
