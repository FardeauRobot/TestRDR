# 1 · Overview

## What it is

A private, install-to-home-screen **harm-reduction buddy PWA** for a small crew
(~10–20 people, mixed iPhone/Android). Members log what and when they consumed;
the app then shows:

- **Live per-substance timers** since each person's last dose,
- **Status flags** for people who go quiet or silent,
- **Check-ins**, a **status note** ("back at camp"), and an **SOS**,
- A **map** to find each other in an emergency,
- A **TripSit drug-interaction chart** and pre-log mixing warnings.

It is a *safety* tool, not a medical device. Warnings are guidance, never
guarantees, and the app **never blocks** someone from logging — it just makes
sure they were informed first.

## Hard constraints (do not break these)

1. **Free to distribute, no app-store fees.** It stays a PWA forever — no Apple
   $99/yr, no Play $25 account. The *only* feature that would justify going
   native is true iOS background location, and we deliberately live without it.
2. **Mobile-first and works offline-ish.** Installable, dark, thumb-reachable.
3. **Harm-reduction tone.** Copy is factual and non-judgemental. The
   `DISCLAIMER` and "guidance, not medical advice" framing must survive any copy
   edit.

## Stack

- **Vite 6 + React 18 + TypeScript (strict)** — the app shell.
- **Leaflet + react-leaflet** — the map, with free CARTO dark tiles (no API key).
- **Supabase JS** — Postgres + realtime, when synced mode is enabled.
- **vite-plugin-pwa** — manifest, service worker, runtime tile caching.

There is **no test runner and no linter**. `npm run typecheck` (strict `tsc`) is
the only automated correctness gate — run it after every change.

## Two ways to run

| Mode | When | Storage | Crews |
|------|------|---------|-------|
| **Demo** (default) | no Supabase env vars | `localStorage`, one device | not isolated; seeded sample mates (Paris) |
| **Synced** | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set | Postgres + realtime | real, cross-device |

The header pill ("🔗 Synced" / "📴 Demo") reflects which is active. The choice is
made **once at startup**. Details in [Architecture](02-architecture.md).
