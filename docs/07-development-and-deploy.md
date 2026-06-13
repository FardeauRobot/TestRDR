# 7 · Development & deploy

## Commands

```bash
npm install
npm run gen-icons   # one-time: PNG app icons from public/favicon.svg (uses sharp)
npm run dev         # Vite dev server, --host so phones on the LAN can reach it
npm run build       # tsc -b && vite build → ./dist  (PWA assets emitted here)
npm run typecheck   # tsc -b --noEmit   ← the only automated gate; run after changes
npm run preview     # serve the built ./dist over the network
```

Node 20 in CI/host (`.nvmrc`); Node 24 works locally. **No test runner, no
linter** — strict TypeScript is the correctness gate.

## Conventions

- **Two-store rule.** Any state-mutating action goes on the `CrewStore` interface
  and into **both** stores (+ SQL schema if synced). See
  [Architecture](02-architecture.md).
- **Domain logic stays pure** and lives in `src/lib/` (`status.ts`,
  `substances.ts`, `interactions.ts`). Don't put timing/mixing rules in
  components or the store — key off the `category` and minute fields in
  `substances.ts`.
- **Mobile-first dark theme**, styles in `index.css` via CSS vars + semantic
  classes — reuse them over inline styles.
- **Copy stays harm-reduction**: factual, non-judgemental, never a safety
  guarantee. Preserve the `DISCLAIMER`.
- Read state via `useCrew()` / `useMe()` / `useMember()`; act via `useStore()`.

## Environment

- Copy `.env.example` → `.env` to enable synced mode. Use the **anon** key, never
  `service_role`. **Never commit `.env`.**
- `VITE_*` vars are **inlined at build time** — changing them needs a rebuild.

## Hosting & deploy

**Live on Vercel** (repo `github.com/FardeauRobot/TestRDR`, branch `master`),
auto-deploying on push. Build `npm run build` → `dist`, root base path. Config in
`vercel.json` / `netlify.toml` / `.nvmrc`. Supabase env vars go in the host
dashboard. Full walkthrough: [`DEPLOY.md`](../DEPLOY.md).

### Deploy gotchas (hit these before, watch for them)

- **Production branch must be `master`** in Vercel settings (it defaults to
  `main`). A mismatch means pushes never trigger a production deploy.
- **The PWA service worker caches per-origin.** After a deploy, the new build only
  activates once the app/tab is fully closed and reopened (or site data cleared).
  "I pushed but nothing changed" is almost always this or the branch setting.
- Each Vercel alias is a separate origin with its own service worker — prefer one
  canonical URL.

### HTTPS requirement

Geolocation needs **HTTPS** (or `localhost`). Testing location from a phone over
`--host` on a LAN IP will **not** work — deploy `dist/` to an HTTPS host
(Vercel/Netlify/Cloudflare Pages) to test the map and live location.
