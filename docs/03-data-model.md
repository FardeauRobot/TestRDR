# 3 · Data model

## Domain types (`src/types.ts`)

These are the camelCase types the whole app speaks. The Supabase layer maps its
snake_case rows to/from these (see [Backend](05-backend-supabase.md)).

```ts
type ID = string

interface Member {
  id: ID
  name: string
  emoji: string
  color: string
  isAdmin: boolean        // crew creator
  mixWarnings: boolean    // show the pre-log interaction disclaimer (default true)
  lastCheckIn: number     // ms epoch; bumped by check-in, log, SOS, status
  status?: string         // current thought / whereabouts note
  statusAt?: number       // when the status was set (ms epoch)
  sos: boolean
  location?: GeoPoint     // last known position, if sharing
  updatedAt: number       // ms epoch
}

interface GeoPoint { lat: number; lng: number; accuracy?: number; at: number }

interface ConsumptionEvent {
  id: ID
  memberId: ID
  substanceId: string     // key into the SUBSTANCES catalogue, or "other"
  note?: string           // free-text override / detail
  dose?: string           // e.g. "100mg", "2 beers"
  at: number              // ms epoch
}
```

Full history is simply **all the `ConsumptionEvent`s** for a member — there is no
separate history structure. Timers are derived from this list on the fly.

## Store-level types (`src/store/store.ts`)

```ts
interface Crew { id: string; name: string }

interface CrewState {
  crew: Crew | null       // the crew this device is in
  members: Member[]
  events: ConsumptionEvent[]
  meId: ID | null         // this device's own profile id
  ready: boolean          // store finished its first load
}

interface NewProfile     { name: string; emoji: string; color: string }
interface NewConsumption { substanceId: string; dose?: string; note?: string }
```

## The `CrewStore` interface

The full action surface (each must exist in both stores):

| Action | Purpose |
|--------|---------|
| `createCrew(name, password)` | create + enter a new crew (sets `pendingAdmin`) |
| `joinCrew(name, password)` | enter an existing crew |
| `leaveCrew()` | forget crew + profile on this device |
| `deleteCrew(password)` | **admin** — delete the whole crew (re-checks password) |
| `createProfile(input)` | create this device's profile, become `meId` |
| `updateProfile(patch)` | edit name/emoji/color |
| `logConsumption(input)` | add an event (also counts as a check-in) |
| `checkIn()` | "I'm OK" — bumps `lastCheckIn`, clears own SOS |
| `setSos(on)` | raise / clear own SOS |
| `updateLocation(point\|null)` | share / stop sharing location |
| `setStatus(text)` | set a status note (empty string clears it) |
| `setMixWarnings(on)` | toggle the pre-log disclaimer for self |
| `removeMember(id)` | **admin** — remove a member + their logs |
| `clearMemberSos(id)` | **admin** — mark another member safe |

Admin actions are **gated in the UI** by `me.isAdmin`, not enforced by the
database (see the trust model in [Backend](05-backend-supabase.md)).

### Internal patch helpers (not on the interface)

Both stores implement a private `patchMe(patch: Partial<Member>)` that merges a
camelCase patch into the current member. `SupabaseStore` also has
`patchMember(id, patch)` for admin writes; both convert the patch through
`toRow()` before hitting Postgres. Most of the simple actions above
(`checkIn`, `setSos`, `setStatus`, `setMixWarnings`, `updateLocation`) are now
one-line calls to these helpers, so their *rules* (e.g. "SOS bumps check-in",
"empty status clears `statusAt`") read identically in both stores.

## Storage keys (`src/store/persist.ts` + demo bucket)

| Key | Holds |
|-----|-------|
| `crewwatch.crew.v1` | the current `Crew` (both modes) |
| `crewwatch.me.<crewId>` | this device's profile id for that crew |
| `crewwatch.demo.v2` | the demo data bucket (`members` + `events`) |

The demo seed only runs under `import.meta.env.DEV`; deployed demo builds start
empty. The `v2` suffix was bumped when seed users were hidden from production.
