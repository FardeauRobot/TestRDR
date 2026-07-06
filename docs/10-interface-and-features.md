# 10 · Interface redesign & new features — design brief

Decisions for the next phase of work, captured during the design discussion
(2026-06-14). Status: **decisions locked, not yet built.** This is the spec the
build sessions should follow.

## Guiding principles

1. **Never put a safety-critical or friction-sensitive action behind a swipe or a
   menu.** Gestures are unreliable when someone is impaired or panicking (or when
   a buddy grabs the phone to help). Help and Log get dedicated, always-present,
   one-touch access.
2. **Clarity under altered states:** large targets, high contrast, one obvious
   primary action per screen, icon + label, minimal words.
3. **Logging must be near-zero friction** so laziness never wins — land on it, and
   make repeat logs one tap.
4. **Swipes are an enhancement for *browsing*** (crew / map / combos / settings),
   not for help or logging.

## Locked decisions

### Navigation
- **Smart landing:** open to **Log** by default; open to **Crew** instead when any
  crewmate is in an attention state (active SOS, silent/quiet, or dangerous mix on
  board). Reuses `memberStatus` + `TONE_PRIORITY`.
- **Swipe paging** between the main tabs, *plus* the bottom tab bar stays always
  visible (discoverability + escape hatch).
  - **Map conflict:** Leaflet uses horizontal drag to pan, so a pager wrapping the
    map can't be swiped off by dragging on the map. Use **edge-swipe zones**
    (gesture must start near the screen edge) and/or rely on the tab bar there.
  - Ignore pager gestures that start inside horizontal scrollers (chip rows,
    substance grid) via `touch-action` / library config.
- **PWA app shortcuts** (manifest `shortcuts`): long-press the installed icon →
  jump straight to **Log** or **SOS** before the app fully opens.

### Safety
- **SOS = hold-to-activate (~0.8s)** with a fill animation. No accidental pocket
  triggers; still a single gesture; the animation confirms it fired.
- SOS / Help control is **persistent on every screen** (recommended default;
  revisit if it clutters specific screens).

### "You good?" — directed check-in request (new feature)
Completes a three-signal model alongside **✅ I'm OK** (self) and **🆘 SOS** (self):

- Tap a crewmate → **"Ask if they're OK."**
- Recipient's phone shows a big, single-purpose prompt: **"<name> is checking on
  you"** with two buttons: **✅ I'm OK** and **🆘 I need help** (the latter fires
  their SOS).
- Recipient's response — or any next check-in/log — **resolves** the request; the
  asker then sees **"<name> checked in ✅."**
- **Unanswered → tell the asker only.** It stays private between asker and target;
  it does **not** raise a crew-wide alarm. For the **asker**, surface the pending
  /unanswered state (and it may pull *them* to Crew on smart-landing); for everyone
  else, nothing changes.
- Reuses the existing check-in under the hood; the new state is the *pending
  request* itself. Model it like `events` (a small `check_requests` table:
  from_id, to_id, at, resolved_at) → both stores + schema, mapped via
  `toRow`/`toMember`-style functions.

### Notifications — Web Push
- Build **Web Push** so pings and SOS reach phones **even when the app is closed**.
- Feasible in a PWA with no app-store fees: Android Chrome, and **iOS 16.4+ for
  PWAs installed to the home screen**.
- Setup required: a service-worker `push` handler, storing push subscriptions
  (Supabase table), and a **Supabase edge function** with **VAPID keys** to send.
- Without push, pings/SOS only appear when the app is open — push is what makes the
  "You good?" feature reliable.

## Frictionless logging — to design into the Log screen
- Land on Log (per smart landing).
- A **"recents" row**: the 3–4 substances you log most → one tap to log with sane
  defaults; dose/note stay optional.
- Keep the existing big-tile substance grid; keep the pre-log interaction
  disclaimer / gate logic intact.

## Open / to decide later
- Where **Combos** (the interaction chart) lives in a swipe order — own slot,
  folded into Log, or reached from Settings.
- Exact unanswered-ping timeout (a "few minutes" — pick a number).
- Whether `Dissociative` joins the "downer" visual cue (see
  [Domain logic](04-domain-logic.md)).
- Whether persistent SOS needs to be suppressed on any specific screen.
