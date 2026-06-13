# 4 · Domain logic

All behaviour decisions live in three **pure** modules under `src/lib/`. Pure
means they take `events` + `now` and return a result — no I/O, no store, no React
— so timers stay correct as time passes just by passing a fresh `now`.

## Substance catalogue (`src/lib/substances.ts`)

The source of truth for everything timing- and category-related:

```ts
interface Substance {
  id, name, emoji,
  category: 'Depressant'|'Stimulant'|'Psychedelic'|'Dissociative'|'Empathogen'|'Opioid'|'Other'
  durationMins: number      // rough typical total duration
  redoseWaitMins?: number   // suggested minimum gap before a re-dose
  caution?: string          // short plain-language note shown when logging
}
```

- `SUBSTANCES` — the array; `SUBSTANCE_BY_ID` — a lookup; `getSubstance(id)` —
  safe lookup that falls back to `"other"`.
- `DISCLAIMER` — the harm-reduction disclaimer string (keep it intact).
- `DOWNER_CATEGORIES` / `isDowner(category)` — the **one** definition of which
  categories get the red "downer" cue on timer chips. Currently `Depressant` +
  `Opioid`.

> **Open product question:** should `Dissociative` (ketamine) count as a downer
> for the *visual* cue? It's sedating and is half of several `dangerous` pairs
> (e.g. alcohol + ketamine), but it's currently excluded from `DOWNER_CATEGORIES`
> to preserve existing behaviour. The mixing *danger* logic does flag it (it's
> driven by the interaction matrix, not categories), so the chip tint and the
> warning can currently disagree for ketamine. Decide this when revisiting the UI.

**Durations are deliberately rough population averages** — they power friendly
nudges, never a safe-dose promise.

## Status & timers (`src/lib/status.ts`)

| Function | Returns | Used for |
|----------|---------|----------|
| `doseTimers(memberId, events, now)` | one `DoseTimer` per distinct substance (lastAt, count, `active`), newest first | the timer chips / detail list |
| `activeDoses(...)` | only the active timers | the mixing-relevant set |
| `eventsFor(memberId, events)` | that member's events, newest first | history lists, last-event lookups |
| `memberStatus(member, events, now)` | `{ tone, label, lastEvent, active }` | card tone + crew-list sort |
| `mixAlert(active)` | the worst interaction among active substances | card / detail mix flag |
| `comboRisks(substanceId, active)` | caution-or-worse combos vs what's active | the **pre-log** disclaimer |
| `checkRedose(memberId, substanceId, events, now)` | early-redose check using `redoseWaitMins` | the "maybe wait" nudge |

A dose is **active** while `minutesSince(lastAt) < substance.durationMins`.

### Tone priority

`Tone = 'sos' | 'alert' | 'active' | 'ok' | 'idle'`, and `TONE_PRIORITY`
(exported from `status.ts`) ranks them (lowest = most urgent). The crew list
sorts by this, so a new tone is ranked in **one** place. `memberStatus` escalates
to `alert` when:

- the member is active but **silent** (`> SILENT_MIN = 90` min since check-in), or
- a **dangerous mix** is currently active (labelled "Dangerous mix"), or
- the member is active but **quiet** (`> QUIET_MIN = 45` min since check-in).

(The danger label used to read "Mixing depressants", which was wrong for non-
depressant danger combos like the cocaine + opioid "speedball"; it is now the
generic "Dangerous mix".)

## Interaction chart (`src/lib/interactions.ts`)

Ratings transcribed from **TripSit `combos.json`** (CC BY-NC-SA).

- `RiskLevel`: `dangerous | unsafe | caution | synergy | neutral | decrease | unknown`.
- `RISK_META[level]` = `{ label, short, color, gate, severity, blurb }`.
  `gate: true` (dangerous + unsafe only) forces an "I understand" checkbox before
  logging on top of that combo; `caution` warns but does not gate.
- `KEY` maps our substance ids → TripSit keys; only **14** substances are charted
  (`CHARTED`). `nicotine` / `other` resolve to `unknown`.
- `MATRIX` holds the pairwise ratings (treated as symmetric, with a `b→a`
  fallback). `NOTES` carries hand-written explanations for the deadliest pairs.
- API: `interaction(aId, bId)`, `interactionReason(aId, bId, level)`,
  `chartFor(id)` (sorted list for the Combos tab).

### Adding a substance to the chart

1. Add it to `SUBSTANCES` in `substances.ts`.
2. Add a `KEY` entry mapping our id → the TripSit key.
3. Add a `MATRIX` row (and the reciprocal values in the other rows) from the
   TripSit data.

That's it — `CHARTED`, the Combos tab, and the pre-log warnings all derive from
those three edits.
