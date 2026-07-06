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

## 6. Push notifications (lock-screen SOS alerts) — optional

Lets an **SOS (and "You good?" pings) reach crewmates' lock screens even when the
app is closed**. Needs a VAPID key pair and a small edge function. Skip this and
everything else still works (the "Emergency alerts" toggle just stays hidden, and
pings only surface when the recipient's app is open).

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli) (`supabase login`,
`supabase link --project-ref YOUR-REF`).

1. **Generate a VAPID key pair:**
   ```bash
   npx web-push generate-vapid-keys
   ```
   Copy the **Public Key** and **Private Key** it prints.

2. **Give the app the public key.** Add to `.env` (and your host's env vars) and
   rebuild:
   ```
   VITE_VAPID_PUBLIC_KEY=<public key>
   ```

3. **Add the `push_subscriptions` table.** It's already in `supabase-schema.sql`,
   so if you re-run that script (safe to re-run) it's created for you.

4. **Deploy the edge function and set its secrets:**
   ```bash
   supabase functions deploy send-push --no-verify-jwt
   supabase secrets set \
     VAPID_PUBLIC_KEY=<public key> \
     VAPID_PRIVATE_KEY=<private key> \
     VAPID_SUBJECT=mailto:you@example.com
   ```
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the function
   automatically — don't set them.)

Each person then enables **Settings → Emergency alerts** on their device.
**iPhone:** works only for a PWA **added to the Home Screen** (iOS 16.4+); open
it from the Home Screen icon before toggling. Push also requires HTTPS (or
localhost) — it won't work over a plain `--host` LAN address.

## Security model (read this)

This is a **private app for trusted crews**, deliberately kept simple:

- **Accounts** (nickname + password) work exactly like crews: the password is
  **bcrypt-hashed** and only checked inside the `signup` / `login` functions; the
  `accounts` table is RLS-locked so hashes never reach the client. Sign in once,
  then join crews. (After upgrading an existing deployment, **re-run
  `supabase-schema.sql`** to add the `accounts` table + `account_id` column;
  members created before this change keep working but aren't linked to an account
  until they sign up and rejoin.)
- Crew passwords are **bcrypt-hashed** and only ever checked inside the
  `create_crew` / `join_crew` database functions. The `crews` table (and the
  hashes) is **not** readable by the app — clients can't list crews or see
  hashes.
- A crew's profiles/events are scoped by its `crew_id`, an unguessable UUID you
  only receive after joining with the right name + password. Anyone holding a
  crew's UUID *and* the anon key could read that one crew, so don't paste
  internal links/keys publicly, and don't commit `.env` (it's git-ignored).

### Operator console (moderate every crew)

An **operator** account can list and delete *any* crew from inside the app —
**Settings → 🛡️ Manage all crews**. There's no hidden URL or separate secret;
the power is tied to a flag on the account itself (`accounts.is_operator`).

Grant it to an account by running this once in the SQL Editor (the account must
already exist — i.e. sign up in the app first):

```sql
update public.accounts set is_operator = true where lower(nickname) = 'fardadmin';
```

Then **log out and back in** as that account (the operator flag is read at login),
open Settings, and you'll see the "Manage all crews" button → every crew with
member/log counts and a delete button. Deletions cascade to all profiles and logs
and can't be undone.

To revoke, set `is_operator = false` for that nickname. Note the gating RPCs are
reachable with the public anon key and authorise on the account id (an unguessable
UUID handed out only by `login` on the correct password) — the same soft-trust
model as crews. Fine for a private deploy; use Supabase Auth to harden before a
wide launch.

### Optional hardening (if you want stronger guarantees later)

- Turn on **Supabase Auth** (e.g. magic-link email), record crew membership in a
  table, and rewrite the `profiles` / `events` RLS policies to check
  `auth.uid()` membership instead of `using (true)`.
- Add a scheduled job (Supabase cron) to wipe stale locations — the commented
  query at the bottom of the schema file does this.
