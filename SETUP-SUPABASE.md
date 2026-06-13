# Turning on Synced mode (free, ~10 min)

Demo mode keeps data on one device. To let your whole crew see each other's
timers and locations live, point the app at a free Supabase project.

## 1. Create the project

1. Go to <https://supabase.com> → sign up → **New project**.
2. Pick a name and a database password (you won't need the password in the app).
3. Choose the region closest to your crew. Wait ~2 min for it to provision.

## 2. Create the tables

1. In the project, open **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase-schema.sql`](./supabase-schema.sql).
3. Click **Run**. You should see "Success".

## 3. Get your keys

In **Project Settings → API**, copy:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key → `VITE_SUPABASE_ANON_KEY`

> Use the **anon public** key, never the `service_role` key.

## 4. Configure the app

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...           # the anon public key
```

That's all the deployer configures. **Crews are created and joined inside the
app** — each person picks a crew name + password, or taps an invite link. One
deployment can host many independent crews (yours, your friends' other crews…).

Restart the dev server (`npm run dev`). The pill in the header should now read
**🔗 Synced**, and the first screen lets you create or join a crew.

## 5. Deploy so phones can use it

Build and host the `dist/` folder on any free static host with HTTPS:

- **Netlify / Vercel / Cloudflare Pages:** connect the repo (or drag-and-drop
  `dist/`), and add the two `VITE_…` variables in the host's environment
  settings so they're baked into the build.

Then share the URL. Everyone adds it to their home screen, and the first person
**creates the crew** (name + password) while the rest **join** with that name +
password — or tap an invite link from the in-app *Invite someone* button (the
link prefills the crew name; you share the password separately).

## Security model (read this)

This is a **private app for trusted crews**, deliberately kept simple:

- Crew passwords are **bcrypt-hashed** and only ever checked inside the
  `create_crew` / `join_crew` database functions. The `crews` table (and the
  hashes) is **not** readable by the app — clients can't list crews or see
  hashes.
- A crew's profiles/events are scoped by its `crew_id`, an unguessable UUID you
  only receive after joining with the right name + password. Anyone holding a
  crew's UUID *and* the anon key could read that one crew, so don't paste
  internal links/keys publicly, and don't commit `.env` (it's git-ignored).

### Optional hardening (if you want stronger guarantees later)

- Turn on **Supabase Auth** (e.g. magic-link email), record crew membership in a
  table, and rewrite the `profiles` / `events` RLS policies to check
  `auth.uid()` membership instead of `using (true)`.
- Add a scheduled job (Supabase cron) to wipe stale locations — the commented
  query at the bottom of the schema file does this.
