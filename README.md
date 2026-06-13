# Crew Watch 👥⏱️

A private, install-to-home-screen **harm-reduction buddy app** for a small crew.
Everyone logs what they took and when; the app shows live timers since each
person's last dose, flags anyone who goes quiet, and has a map so you can find
each other fast if something goes wrong.

> ⚠️ Crew Watch helps you look out for each other. It does **not** make drugs
> safe, replace test kits / naloxone, or replace calling emergency services.
> Timers and nudges are rough averages, never medical advice.

## Features

- **Crews** — create a crew with a name + password, or join one. Invite people
  with a share link (prefills the crew name; password shared separately). One
  deployment hosts many independent crews.
- **Profiles** — name, avatar, colour, set per crew.
- **Log consumption** — preset substances with rough duration + re-dose caution
  windows, optional dose & note. Warns on early re-dosing.
- **Per-substance timers** — each member shows a live timer *per product* since
  they last took it, plus a tap-through full **history** timeline.
- **Interaction chart** — a full **Combos** tab with TripSit-based ratings
  (Dangerous / Unsafe / Caution / Low-risk) for every substance pair. Before you
  log something risky with what you've already got active, a disclaimer explains
  why and (for Unsafe/Dangerous) asks you to confirm. Toggle it in **You → Safety**.
- **Mixing flags** — cards auto-flag the worst active combination (e.g. "Dangerous:
  Alcohol + Ketamine") using the same chart, and colour-code accordingly.
- **Admin** — the crew creator is admin: can remove members and mark someone
  safe (clear their SOS) from the member detail screen.
- **Check-ins** — one tap "I'm OK". Anyone active who goes quiet gets flagged.
- **SOS** — broadcast that you need help; your card and map pin go red & pulse.
- **Map** — Leaflet + free dark tiles. Share location once or live; SOS shares too.
- **Installable PWA** — works on iPhone & Android, no app store, no fees.

## Run it locally

```bash
npm install
npm run gen-icons   # one-time: builds the PNG app icons from the SVG
npm run dev         # open the printed URL
```

Out of the box it runs in **Demo mode**: data lives on this one device and the
crew list is pre-seeded with sample mates so you can see it working immediately.

## Make it real (cross-phone sync) — free

Synced mode uses [Supabase](https://supabase.com) (free tier). See
**[SETUP-SUPABASE.md](./SETUP-SUPABASE.md)** — it takes ~10 minutes. In short:

1. Create a free Supabase project.
2. Run `supabase-schema.sql` in its SQL editor.
3. Copy `.env.example` → `.env`, fill in the project URL + anon key.
4. `npm run dev` — it auto-switches to Synced mode. Create/join crews in-app.

## Put it on your crew's phones — free

Easiest path: connect the GitHub repo to **Vercel** or **Netlify** and it
auto-deploys on every push (config files included). Full walkthrough in
**[DEPLOY.md](./DEPLOY.md)**. Or build and host `./dist` yourself on any static
host with **HTTPS** (required for the map's location features):

1. ```bash
   npm run build      # outputs ./dist
   ```
2. Share the link.
   - **Android (Chrome):** tap the "Install app" prompt → home screen.
   - **iPhone (Safari):** Share → "Add to Home Screen".

No Apple ($99/yr) or Google Play ($25) developer account needed.

## Tech

Vite · React · TypeScript · Leaflet · Supabase · vite-plugin-pwa.

Drug interaction ratings in `src/lib/interactions.ts` are transcribed from
[TripSit's drug combinations chart](https://github.com/TripSit/drugs)
(`combos.json`, community-maintained, CC BY-NC-SA) — guidance, not medical advice.

## Notes & limits

- **iPhone background location:** a PWA can read location while open, but iOS
  won't track it in the background. For your "find each other in trouble" use
  (open app → see / share location now) that's fine. True always-on background
  tracking would require a native app + the Apple fee.
- **Privacy:** locations are shared only with your crew and only while you opt in;
  "live" stops when you leave the map. The Supabase setup is secured by an
  unguessable crew code + anon key — keep them private.
