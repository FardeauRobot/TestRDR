# 9 · Tech-debt review & cleanup

Two independent reviews were run over `src/` — one focused on **duplication &
clarity**, one on **architecture & scalability**. Both concluded the codebase is
in good shape for its size; the findings are about lowering the cost of *future*
features, not fixing breakage. This doc records what was found, **what was fixed
in the cleanup pass**, and **what was deliberately deferred** (and why).

## ✅ Fixed in this pass

### Store layer (the biggest source of two-place edits)
- **Shared persistence** — `CREW_KEY`, `meKey`, and `loadCrew()` were byte-
  identical in both stores; moved to `src/store/persist.ts`.
- **`pendingAdmin`** was declared and managed independently in each store; lifted
  to `BaseStore` so the "creator → admin" lifecycle lives in one place.
- **Typed write path** — `SupabaseStore` hand-wrote snake_case object literals
  (`{ last_check_in, mix_warnings, … }`) across ~8 call sites with no type
  checking; a typo'd column would fail silently at runtime. Added `toRow()` (the
  inverse of `toMember()`) and retyped `patchMe`/`patchMember` to take
  `Partial<Member>`. Now mutations speak camelCase domain types and column names
  live in exactly one function.
- **Shared patch shape** — both stores' `patchMe` now take a `Partial<Member>`, so
  the *rules* (`SOS bumps check-in`, `empty status clears statusAt`, `logging is a
  check-in`) read identically in demo and synced and can't silently drift.
- **Typed Bucket** — the demo bucket's inline event type is now `ConsumptionEvent[]`.

### React boilerplate
- **`useMe()` / `useMember()` hooks** (`store/context.tsx`) replaced six copies of
  `members.find(m => m.id === meId)` across CrewScreen, LogScreen, MemberDetail,
  SettingsScreen (×2), and MapScreen — including a non-null-assertion in
  `EditProfile`.
- **`eventsFor(memberId, events)`** in `status.ts` replaced four hand-rolled
  "filter by member, sort by `at` desc" blocks (MemberDetail, SettingsScreen,
  `memberStatus`, `checkRedose`).

### Scattered domain constants & a real bug
- **`DOWNER_CATEGORIES` / `isDowner()`** in `substances.ts` replaced the
  "downer category" set that was defined three times (a `Set` in MemberCard, an
  inline array in MemberDetail).
- **`TONE_PRIORITY`** moved to `status.ts` (it was duplicated as `PRIORITY` in
  CrewScreen while `status.ts` already owned the tone order).
- **Mislabel fixed** — `memberStatus` returned the label **"Mixing depressants"**
  for *any* danger mix, which mislabels non-depressant danger combos (e.g. the
  cocaine + opioid "speedball"). Now reads **"Dangerous mix"**.
- **`doseTimers` computed once** in `memberStatus` and `MemberCard` (it was being
  recomputed 3–4× per card via `activeDoses` + `doseTimers` + `memberStatus`).

### Dead code / small clarity
- Removed the unused `export { getSubstance }` re-export from `interactions.ts`.
- Removed an identical-branch ternary in CrewScreen (`x === 1 ? 'might need' :
  'might need'`).
- De-duplicated the avatar palette into `src/lib/avatar.ts` (`AVATAR_EMOJIS` /
  `AVATAR_COLORS`), used by Onboarding and the profile editor.
- Exported `MIN` from `util.ts` and reused it in the demo seed (was a re-declared
  local `min = 60_000`).

## ⏳ Deferred — and why

### Watch-later (fine at current scale)
- **Realtime "any change → full refetch"** and the **500-event cap** — correct and
  appropriately simple for 10–20 people. Trigger a debounce / incremental apply /
  pagination when burst load or a multi-day crew actually hits it. (A code comment
  now flags the 500 cap.) See [Backend](05-backend-supabase.md#realtime).
- **`App.tsx` router** (tab + single overlay via `useState`) — breaks on a second
  overlay level, hardware **back**, and deep links. **Push notifications** are the
  natural trigger to adopt a tiny router. See [UI](06-ui-and-navigation.md).
- **No store/contract test** — there's no test runner. If one is ever added, the
  highest-value test is "run the same action sequence against both stores, assert
  equal `CrewState`" to catch demo/synced drift.

### Deferred to the interface pass (intentional)
Leaf-component extraction was held back so the upcoming UI rework doesn't collide
with a half-done refactor:
- `StatusNote` (the `📣 / text / ago` line) — duplicated in MemberCard + MemberDetail.
- `EventRow` (the history row) — duplicated in MemberDetail + SettingsScreen.
- `MemberHeading` (name + admin badge + "you" tag) — in three places.
- `SosButton` (SOS / Clear-SOS toggle) — in CrewScreen + MapScreen.
- `MemberDetail`'s `TONE_VAR` could fold into a single tone-metadata table with
  `TONE_PRIORITY`.

### Open product decisions (not code debt)
- **Should `Dissociative` be a "downer"** for the chip cue? Excluded today to
  preserve behaviour, but the danger logic already flags it — so the tint and the
  warning can disagree for ketamine. See [Domain logic](04-domain-logic.md).
- **`pendingAdmin` is transient** — a reload between crew-create and first-profile
  loses admin. Fix alongside "second admin" with a server-side guarantee + a
  `setMemberAdmin` action. See [Backend](05-backend-supabase.md#admin-model).

## Toward the RECAP §11 roadmap

The deferred items map onto the planned features:

| Planned feature | What it will need (and which deferral it hits) |
|-----------------|-----------------------------------------------|
| Push / auto-alert on SOS | a real router + deep-linking (App.tsx item) |
| Promote a second admin | `setMemberAdmin` + the transient-flag fix (admin model) |
| Status-history feed | likely a new `status_events` table mapped like `events` |
| Broader substance list | easiest — `substances.ts` + a `KEY` + a `MATRIX` row |

A note on the "fix now" verdict from both reviews: **none were urgent for current
scale.** This pass took the cheap, high-leverage half (store + hooks + constants)
and left the rest documented so it's a decision, not a surprise.
