# 5 · Backend (Supabase)

Active only in **synced mode** (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
set). All schema lives in [`supabase-schema.sql`](../supabase-schema.sql), pasted
into the Supabase SQL editor. The file is **idempotent** — safe to re-run whole.

## Tables

| Table | Columns (shape) |
|-------|-----------------|
| `crews` | `id`, `name`, **`password_hash` (bcrypt)**, `created_at` |
| `profiles` | `crew_id` FK, name/emoji/color, `is_admin`, `mix_warnings`, `status`, `status_at`, `last_check_in`, `sos`, `lat`/`lng`/`accuracy`/`loc_at`, `updated_at` |
| `events` | `crew_id`, `member_id` FK, `substance_id`, `dose`, `note`, `at` |

Rows are snake_case; `toMember` / `toEvent` (read) and `toRow` (write) in
`supabaseStore.ts` map them to/from the camelCase domain types.

## Auth model: security-definer RPCs

Crew create/join/delete go through Postgres functions, **not** table writes:

- `create_crew(p_name, p_password)` / `join_crew(...)` / `delete_crew(...)`
  hash and check passwords **server-side** with bcrypt.
- The `crews` table is **RLS-locked** — clients can't read it. A client only ever
  holds a crew's **UUID** (returned after a correct name + password) plus the
  anon key.
- `humanize()` in the store strips Postgres prefixes from RPC errors for display.

> **Gotcha:** these functions must set `search_path = public, extensions` so
> `crypt`/`gen_salt` (pgcrypto, which Supabase installs in the `extensions`
> schema) resolve. Otherwise you get `function gen_salt(...) does not exist` at
> call time.

## RLS on `profiles` / `events`

Permissive: `using (true)` (including delete). Access is scoped by **`crew_id`**
in every query — and `crew_id` is an unguessable UUID you only obtain by joining.
This is the deliberate **"trusted small crew"** trade-off:

- Admin powers (`removeMember`, `clearMemberSos`, `deleteCrew`) are **UI-gated**,
  not DB-enforced.
- The anon key ships in the public bundle, so anyone with the deployed URL **and**
  a crew UUID could read/write that crew. Fine for an unlisted private link;
  the hardening path (Supabase Auth + membership-based RLS, or RPC-gated reads)
  is the upgrade before any wide launch.

## Realtime

`SupabaseStore` subscribes to `postgres_changes` on both `profiles` and `events`
(filtered by `crew_id`). **Any change → a full `refetch`** of both tables. This is
the simplest thing that works and is correct for 10–20 people.

Two boundaries to know (see [tech-debt](09-tech-debt-and-review.md)):

- No debounce — a burst of activity causes refetch storms.
- The events query is capped at **500** (`.limit(500)`). A long-lived crew that
  exceeds it will silently drop its oldest logs from timers/history. There's a
  code comment flagging this; raise/scope-by-time/paginate when it bites.

`refetch` also clears `meId` if this device's own profile has vanished (kicked by
an admin, or crew deleted) → the app bounces cleanly back to onboarding/gate.

## <a name="admin-model"></a>Admin model

Creating a crew sets a transient `pendingAdmin = true` on the store instance; the
creator's **first `createProfile`** inserts `is_admin = true`, then resets the
flag. It lives in `BaseStore` so both stores share the lifecycle.

> **Latent edge:** the flag is in-memory only. A reload/crash between `createCrew`
> and the first `createProfile` loses admin with no recovery path (there's no
> method to grant admin to anyone else yet). Address this when building
> "promote a second admin" — likely a server-side "first profile in a crew is
> admin" guarantee plus a `setMemberAdmin` action.

## When you ship a schema-touching feature

Re-run `supabase-schema.sql` in Supabase **and** push to redeploy. The UI may
appear from the deploy alone, but DB-backed actions error until the schema is
updated.
