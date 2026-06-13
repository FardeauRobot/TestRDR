# Deploying Crew Watch (auto-deploy from GitHub)

Connect the GitHub repo to **Vercel** or **Netlify** once, and every push to
`main` rebuilds and publishes automatically. Both are free, give HTTPS (required
for the map's location features), and let you set the Supabase env vars in their
dashboard. Config files (`vercel.json`, `netlify.toml`, `.nvmrc`) are already in
the repo, so the build settings are auto-filled.

---

## Step 1 — Get the code on GitHub

This folder isn't a git repo yet. From the project root:

```bash
git init
git add -A
git commit -m "Crew Watch"

# Create the GitHub repo and push (needs the GitHub CLI, `gh auth login` once):
gh repo create crew-watch --private --source=. --push
# …or create an empty repo on github.com and:
#   git remote add origin git@github.com:<you>/crew-watch.git
#   git branch -M main && git push -u origin main
```

> `.env` is git-ignored, so your keys are not committed — you'll set them in the
> host's dashboard instead (Step 3).

## Step 2 — Connect the host

### Option A — Vercel
1. <https://vercel.com> → **Add New… → Project** → import the GitHub repo.
2. It auto-detects Vite (build `npm run build`, output `dist`). Leave as-is.
3. Add the env vars (Step 3) → **Deploy**.

### Option B — Netlify
1. <https://app.netlify.com> → **Add new site → Import an existing project** →
   pick the GitHub repo.
2. Build command `npm run build`, publish directory `dist` (auto-filled from
   `netlify.toml`).
3. Add the env vars (Step 3) → **Deploy site**.

Either way: after the first deploy, every `git push` to `main` redeploys, and
pull requests get their own preview URL.

## Step 3 — Environment variables

In the host's project settings → Environment Variables, add:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase **anon public** key |

These are read at **build time** (Vite inlines `VITE_*`), so after changing them
trigger a redeploy. Leave them unset to ship a Demo-mode build.

> The anon key is a *public* client key — it's embedded in the shipped JavaScript
> on any static deploy. That's expected. **Read the security note below before a
> truly public launch.**

## Step 4 — Custom domain (optional)

Both hosts give a free subdomain (`your-site.vercel.app` / `.netlify.app`). You
can add a custom domain in the dashboard; HTTPS is provisioned automatically.
The app builds at the domain root, so no base-path config is needed.

## Step 5 — Install on phones

Share the URL. **Android/Chrome:** "Install app" prompt. **iPhone/Safari:**
Share → "Add to Home Screen".

---

## ⚠️ Security note — read before going public

The current Supabase setup is tuned for a **small, trusted, semi-private** crew
(see `SETUP-SUPABASE.md`). Because the app is client-only, the anon key ships in
the public bundle, and the `profiles`/`events` tables use permissive RLS
(`using(true)`). That means **someone who finds the deployed URL could, in
principle, read crew data without knowing a crew password** by querying with the
public anon key.

For sharing a private link among friends this is a calculated trade-off. Before
promoting it widely (or hosting many unrelated crews), harden it — options, in
order of effort:

1. **Lock reads/writes behind security-definer RPCs** that require a per-crew
   secret returned at join (tables get *no* anon policies, so they can't be
   queried directly). No user accounts needed.
2. **Add Supabase Auth** (magic-link) + membership-based RLS — the most robust.

Both are noted in `SETUP-SUPABASE.md` / `RECAP.md §9`. Ask and this can be
implemented as a focused follow-up.
