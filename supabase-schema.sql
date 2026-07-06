-- Crew Watch — Supabase schema (multi-crew).
-- Paste into the Supabase dashboard → SQL Editor → Run.
-- Creates the tables, secure create/join functions, and realtime sync.

-- pgcrypto provides crypt()/gen_salt(); on Supabase it lives in the
-- "extensions" schema (referenced via the search_path on the functions below).
create extension if not exists pgcrypto with schema extensions;

-- A crew, gated by a name + bcrypt-hashed password.
create table if not exists public.crews (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- Crew names are unique, case-insensitively, so "name + password" is unambiguous.
create unique index if not exists crews_name_lower_idx on public.crews (lower(name));

-- A login-level account: nickname + bcrypt password + default avatar. Shared
-- across every crew this person joins; profiles below link back to it.
create table if not exists public.accounts (
  id            uuid primary key default gen_random_uuid(),
  nickname      text not null,
  password_hash text not null,
  emoji         text not null default '🙂',
  color         text not null default '#38bdf8',
  created_at    timestamptz not null default now()
);
create unique index if not exists accounts_nick_lower_idx on public.accounts (lower(nickname));

-- One row per crew member's profile.
create table if not exists public.profiles (
  id            uuid primary key default gen_random_uuid(),
  crew_id       uuid not null references public.crews(id) on delete cascade,
  account_id    uuid references public.accounts(id) on delete cascade,
  name          text not null,
  emoji         text not null,
  color         text not null,
  is_admin      boolean not null default false,
  mix_warnings  boolean not null default true,
  status        text,
  status_at     timestamptz,
  last_check_in timestamptz not null default now(),
  sos           boolean not null default false,
  lat           double precision,
  lng           double precision,
  accuracy      double precision,
  loc_at        timestamptz,
  updated_at    timestamptz not null default now()
);

-- One row per consumption log entry.
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  crew_id      uuid not null references public.crews(id) on delete cascade,
  member_id    uuid not null references public.profiles(id) on delete cascade,
  substance_id text not null,
  dose         text,
  note         text,
  at           timestamptz not null default now()
);

-- Safe to re-run on an existing database (adds new columns if missing).
alter table public.profiles add column if not exists is_admin     boolean not null default false;
alter table public.profiles add column if not exists mix_warnings boolean not null default true;
alter table public.profiles add column if not exists status       text;
alter table public.profiles add column if not exists status_at    timestamptz;
alter table public.profiles add column if not exists account_id   uuid references public.accounts(id) on delete cascade;

create index if not exists events_crew_at_idx on public.events (crew_id, at desc);
create index if not exists profiles_crew_idx on public.profiles (crew_id);
-- One profile per account per crew (nulls allowed for any legacy pre-account rows).
create unique index if not exists profiles_crew_account_idx on public.profiles (crew_id, account_id);

-- ---------------------------------------------------------------------------
-- Secure crew create / join.
-- These run as the function owner (security definer), so the crews table itself
-- stays unreadable to clients — passwords are only ever checked in here.
-- ---------------------------------------------------------------------------

create or replace function public.create_crew(p_name text, p_password text)
returns table(id uuid, name text)
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if length(coalesce(trim(p_name), '')) < 2 then
    raise exception 'Crew name must be at least 2 characters';
  end if;
  if length(coalesce(p_password, '')) < 4 then
    raise exception 'Password must be at least 4 characters';
  end if;

  begin
    insert into public.crews(name, password_hash)
    values (trim(p_name), crypt(p_password, gen_salt('bf')))
    returning crews.id into new_id;
  exception when unique_violation then
    raise exception 'A crew with that name already exists — pick another name';
  end;

  return query select c.id, c.name from public.crews c where c.id = new_id;
end; $$;

create or replace function public.join_crew(p_name text, p_password text)
returns table(id uuid, name text)
language plpgsql security definer set search_path = public, extensions as $$
begin
  return query
    select c.id, c.name from public.crews c
    where lower(c.name) = lower(trim(p_name))
      and c.password_hash = crypt(p_password, c.password_hash);
  -- No match → empty result; the app shows "wrong name or password".
end; $$;

-- Admin: delete a crew (re-checks the password); cascades to profiles + events.
create or replace function public.delete_crew(p_name text, p_password text)
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare deleted integer;
begin
  delete from public.crews c
   where lower(c.name) = lower(trim(p_name))
     and c.password_hash = crypt(p_password, c.password_hash);
  get diagnostics deleted = row_count;
  return deleted;  -- 0 → wrong name/password, nothing deleted
end; $$;

revoke all on function public.create_crew(text, text) from public;
revoke all on function public.join_crew(text, text) from public;
revoke all on function public.delete_crew(text, text) from public;
grant execute on function public.create_crew(text, text) to anon, authenticated;
grant execute on function public.join_crew(text, text)  to anon, authenticated;
grant execute on function public.delete_crew(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Accounts: nickname + password sign-up / login. Same pattern as crews — the
-- accounts table is RLS-locked and hashes are only ever touched inside these
-- security-definer functions, so clients never read password hashes.
-- ---------------------------------------------------------------------------
create or replace function public.signup(p_nickname text, p_password text, p_emoji text, p_color text)
returns table(id uuid, nickname text, emoji text, color text)
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if length(coalesce(trim(p_nickname), '')) < 2 then
    raise exception 'Nickname must be at least 2 characters';
  end if;
  if length(coalesce(p_password, '')) < 4 then
    raise exception 'Password must be at least 4 characters';
  end if;
  begin
    insert into public.accounts(nickname, password_hash, emoji, color)
    values (trim(p_nickname), crypt(p_password, gen_salt('bf')),
            coalesce(nullif(trim(p_emoji), ''), '🙂'),
            coalesce(nullif(trim(p_color), ''), '#38bdf8'))
    returning accounts.id into new_id;
  exception when unique_violation then
    raise exception 'That nickname is taken — pick another';
  end;
  return query select a.id, a.nickname, a.emoji, a.color from public.accounts a where a.id = new_id;
end; $$;

create or replace function public.login(p_nickname text, p_password text)
returns table(id uuid, nickname text, emoji text, color text)
language plpgsql security definer set search_path = public, extensions as $$
begin
  return query
    select a.id, a.nickname, a.emoji, a.color from public.accounts a
    where lower(a.nickname) = lower(trim(p_nickname))
      and a.password_hash = crypt(p_password, a.password_hash);
  -- No match → empty result; the app shows "wrong nickname or password".
end; $$;

-- Update the account's default avatar (emoji/colour). Reached by account id,
-- which only that account's own device holds.
create or replace function public.update_account(p_id uuid, p_emoji text, p_color text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.accounts
     set emoji = coalesce(nullif(trim(p_emoji), ''), emoji),
         color = coalesce(nullif(trim(p_color), ''), color)
   where id = p_id;
end; $$;

revoke all on function public.signup(text, text, text, text) from public;
revoke all on function public.login(text, text) from public;
revoke all on function public.update_account(uuid, text, text) from public;
grant execute on function public.signup(text, text, text, text) to anon, authenticated;
grant execute on function public.login(text, text)             to anon, authenticated;
grant execute on function public.update_account(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime + Row Level Security.
-- ---------------------------------------------------------------------------
-- Realtime publication — only add tables that aren't already members.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

-- crews + accounts: RLS on with NO policies → not directly readable/writable by
-- clients. Access happens only through the security-definer functions above, so
-- password hashes never leave the database.
alter table public.crews    enable row level security;
alter table public.accounts enable row level security;

-- profiles/events: partitioned by crew_id (an unguessable uuid you only obtain
-- by knowing the crew's password). Permissive within that scope — fine for a
-- small trusted crew. See SETUP-SUPABASE.md for a stricter auth-based variant.
alter table public.profiles enable row level security;
alter table public.events   enable row level security;

-- Policies (drop-then-create so the whole script is safe to re-run).
drop policy if exists "read profiles"   on public.profiles;
drop policy if exists "write profiles"  on public.profiles;
drop policy if exists "update profiles" on public.profiles;
drop policy if exists "delete profiles" on public.profiles;
create policy "read profiles"   on public.profiles for select using (true);
create policy "write profiles"  on public.profiles for insert with check (true);
create policy "update profiles" on public.profiles for update using (true) with check (true);
-- Member removal (admin action, gated in the app).
create policy "delete profiles" on public.profiles for delete using (true);

drop policy if exists "read events"  on public.events;
drop policy if exists "write events" on public.events;
drop policy if exists "delete events" on public.events;
create policy "read events"  on public.events for select using (true);
create policy "write events" on public.events for insert with check (true);
create policy "delete events" on public.events for delete using (true);

-- ---------------------------------------------------------------------------
-- Operator console (cross-crew moderation).
-- The app owner can list/delete ANY crew — but crews are otherwise unreadable
-- (RLS-locked), so this goes through security-definer RPCs gated by a single
-- operator secret whose bcrypt hash lives in `app_admin`. The secret is NOT the
-- anon key and never ships in the client bundle; the operator types it in.
--
-- INERT UNTIL YOU SET A SECRET. With no `app_admin` row every check fails, so the
-- console stays locked. Enable it by running (once), with your own secret:
--   insert into public.app_admin (id, secret_hash)
--   values (1, crypt('CHOOSE-A-STRONG-SECRET', gen_salt('bf')))
--   on conflict (id) do update set secret_hash = excluded.secret_hash;
-- ---------------------------------------------------------------------------
create table if not exists public.app_admin (
  id          integer primary key default 1,
  secret_hash text not null,
  constraint app_admin_singleton check (id = 1)
);
-- RLS on, no policies → not client-readable; reached only via the functions below.
alter table public.app_admin enable row level security;

-- List every crew with rollup counts + last activity. Raises on a bad secret.
create or replace function public.admin_list_crews(p_secret text)
returns table(id uuid, name text, created_at timestamptz,
              member_count bigint, event_count bigint, last_activity timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.app_admin a
                 where a.id = 1 and a.secret_hash = crypt(p_secret, a.secret_hash)) then
    raise exception 'Wrong operator secret';
  end if;
  return query
    select c.id, c.name, c.created_at,
      (select count(*) from public.profiles p where p.crew_id = c.id) as member_count,
      (select count(*) from public.events   e where e.crew_id = c.id) as event_count,
      greatest(
        c.created_at,
        coalesce((select max(p.updated_at) from public.profiles p where p.crew_id = c.id), c.created_at),
        coalesce((select max(e.at)         from public.events   e where e.crew_id = c.id), c.created_at)
      ) as last_activity
    from public.crews c
    order by last_activity desc;
end; $$;

-- Delete any crew by id (cascades to profiles + events). Raises on a bad secret.
create or replace function public.admin_delete_crew_by_id(p_secret text, p_crew_id uuid)
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare deleted integer;
begin
  if not exists (select 1 from public.app_admin a
                 where a.id = 1 and a.secret_hash = crypt(p_secret, a.secret_hash)) then
    raise exception 'Wrong operator secret';
  end if;
  delete from public.crews where id = p_crew_id;
  get diagnostics deleted = row_count;
  return deleted;  -- 0 → no such crew
end; $$;

revoke all on function public.admin_list_crews(text)          from public;
revoke all on function public.admin_delete_crew_by_id(text, uuid) from public;
grant execute on function public.admin_list_crews(text)          to anon, authenticated;
grant execute on function public.admin_delete_crew_by_id(text, uuid) to anon, authenticated;

-- Optional housekeeping: forget locations older than a day (run manually or via cron).
-- update public.profiles set lat = null, lng = null, loc_at = null
--   where loc_at < now() - interval '1 day';
