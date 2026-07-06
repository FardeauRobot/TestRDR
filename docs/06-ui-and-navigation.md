# 6 · UI & navigation

## The router is `App.tsx`

There is **no routing library**. `src/App.tsx` is the whole router, driven by two
pieces of local state:

- `tab: 'crew' | 'log' | 'map' | 'combos' | 'you'` — the active bottom tab.
- `openId: string | null` — when set, the `MemberDetail` overlay covers the tabs.

The gate flow runs first, based on `CrewState`:

```
!ready            → spinner
!crew             → <CrewGate>      (create / join a crew)
!meId             → <Onboarding>    (set up your profile)
otherwise         → header + <main> (tab content or MemberDetail) + tab bar
```

Invite links carry `?crew=Name` (`invitedCrewName()` reads it) to prefill the
crew name; the password is shared out-of-band.

> **Scalability note:** this flat "tab + single overlay" model is right for the
> current size but breaks on a second overlay level, hardware/browser **back**,
> and deep links. Push notifications are the feature that will force a real
> (tiny) router. See [tech-debt](09-tech-debt-and-review.md) item #4.

## Screens (`src/screens/`)

| Screen | Role |
|--------|------|
| `CrewGate` | create / join a crew (name + password); invite prefill |
| `Onboarding` | set up your profile within the crew |
| `CrewScreen` | crew list (sorted by tone), self panel (check-in / SOS / status), attention banner, demo-mode notice |
| `LogScreen` | pick a substance + dose/note; redose + interaction disclaimer (gates on unsafe/dangerous) |
| `MapScreen` | Leaflet map; share-once / live location; SOS |
| `InteractionsScreen` | the "Combos" reference chart |
| `MemberDetail` | overlay: status, all timers, full history, admin actions |
| `SettingsScreen` | profile edit, Safety toggle, crew info/invite, leave, admin delete-crew |

## Shared components (`src/components/`)

| Component | Role |
|-----------|------|
| `Avatar` | emoji + colour avatar (`sm`/`lg` sizes) |
| `MemberCard` | crew-list card; also exports `DoseChips` (the per-substance timer chips) |
| `StatusEditor` | "Share a status" — preset chips + free text, for the self panel |
| `ErrorBoundary` | catches render errors → message + reload/reset; wraps `App` in `main.tsx` |

The avatar palette (`AVATAR_EMOJIS` / `AVATAR_COLORS`) is shared from
`src/lib/avatar.ts` so Onboarding and the profile editor never drift.

## Styling

- **All styles live in `src/index.css`** as a dark, mobile-first design system
  using CSS variables and semantic classes (`.card`, `.btn`, `.banner`, `.tchip`,
  `.risk-pill`, tone classes `tone-*` / `fill-*`). Prefer reusing these over
  inline styles.
- The map uses `L.divIcon` (HTML markers) to dodge bundler image issues, and free
  **CARTO dark** tiles (no API key). The service worker runtime-caches those tiles
  `CacheFirst`; it does **not** precache them.

## Adding a screen

Either add a `Tab` entry in `App.tsx` (the `TABS` array + the `tab === ...` render
switch + a `titleFor` case), or render it via the `openId` overlay pattern like
`MemberDetail`. Read state with `useCrew()` / `useMe()` and act with `useStore()`.

## Deferred UI cleanups (for the interface pass)

These are *known* duplications left in place intentionally, to be tackled when the
interface is reworked (so the redesign doesn't fight a half-done refactor):

- Extract leaf components reused across cards/detail/settings: a `StatusNote`
  (the `📣 / text / ago` line), an `EventRow` (the history row), a
  `MemberHeading` (name + admin badge + "you" tag), and a `SosButton`
  (the SOS / Clear-SOS toggle).
- `MemberDetail`'s `TONE_VAR` (tone → CSS variable) is a UI-local lookup; it could
  join a single tone-metadata table alongside `TONE_PRIORITY`.

See [tech-debt](09-tech-debt-and-review.md) for the full list.
