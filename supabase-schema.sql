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
  -- App-wide moderator: can list & delete ANY crew (see admin_* functions below).
  is_operator   boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index if not exists accounts_nick_lower_idx on public.accounts (lower(nickname));
-- Safe to re-run on an existing database.
alter table public.accounts add column if not exists is_operator boolean not null default false;

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

-- One row per "You good?" check-in request (directed member → member).
-- Pending while resolved_at is null; the recipient answers 'ok' or 'help'.
create table if not exists public.check_requests (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews(id)    on delete cascade,
  from_id     uuid not null references public.profiles(id) on delete cascade,
  to_id       uuid not null references public.profiles(id) on delete cascade,
  at          timestamptz not null default now(),
  resolved_at timestamptz,
  outcome     text
);
create index if not exists check_requests_crew_idx on public.check_requests(crew_id);

-- One row per device push subscription (Web Push). Used to reach crewmates on
-- their lock screen when someone broadcasts SOS, even with the app closed.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references public.crews(id)    on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
-- One row per browser push endpoint; re-subscribing upserts on this.
create unique index if not exists push_subs_endpoint_idx on public.push_subscriptions(endpoint);
create index        if not exists push_subs_crew_idx     on public.push_subscriptions(crew_id);

-- One row per custom map marker a crew member drops (campsite, meeting point, etc).
create table if not exists public.map_pins (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references public.crews(id)    on delete cascade,
  label      text not null,
  emoji      text not null default '📍',
  lat        double precision not null,
  lng        double precision not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists map_pins_crew_idx on public.map_pins(crew_id);

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
-- Dropped-then-created because the return shape gained is_operator (create or
-- replace can't change a function's OUT columns).
drop function if exists public.signup(text, text, text, text);
create function public.signup(p_nickname text, p_password text, p_emoji text, p_color text)
returns table(id uuid, nickname text, emoji text, color text, is_operator boolean)
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
  return query select a.id, a.nickname, a.emoji, a.color, a.is_operator from public.accounts a where a.id = new_id;
end; $$;

drop function if exists public.login(text, text);
create function public.login(p_nickname text, p_password text)
returns table(id uuid, nickname text, emoji text, color text, is_operator boolean)
language plpgsql security definer set search_path = public, extensions as $$
begin
  return query
    select a.id, a.nickname, a.emoji, a.color, a.is_operator from public.accounts a
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
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'check_requests') then
    alter publication supabase_realtime add table public.check_requests;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'map_pins') then
    alter publication supabase_realtime add table public.map_pins;
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
alter table public.check_requests      enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.map_pins            enable row level security;

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

-- check_requests: same permissive, crew-scoped trust model. Recipients update
-- their own row to answer (resolved_at + outcome).
drop policy if exists "read checks"   on public.check_requests;
drop policy if exists "write checks"  on public.check_requests;
drop policy if exists "update checks" on public.check_requests;
drop policy if exists "delete checks" on public.check_requests;
create policy "read checks"   on public.check_requests for select using (true);
create policy "write checks"  on public.check_requests for insert with check (true);
create policy "update checks" on public.check_requests for update using (true) with check (true);
create policy "delete checks" on public.check_requests for delete using (true);

-- map_pins: same permissive, crew-scoped trust model. Anyone in the crew can
-- drop or remove a pin (e.g. campsite, meeting point).
drop policy if exists "read pins"   on public.map_pins;
drop policy if exists "write pins"  on public.map_pins;
drop policy if exists "delete pins" on public.map_pins;
create policy "read pins"   on public.map_pins for select using (true);
create policy "write pins"  on public.map_pins for insert with check (true);
create policy "delete pins" on public.map_pins for delete using (true);

-- push_subscriptions: same permissive, crew-scoped trust model. Endpoints are
-- unguessable, and the send-sos edge function reads them via the service role.
drop policy if exists "read push"   on public.push_subscriptions;
drop policy if exists "write push"  on public.push_subscriptions;
drop policy if exists "update push" on public.push_subscriptions;
drop policy if exists "delete push" on public.push_subscriptions;
create policy "read push"   on public.push_subscriptions for select using (true);
create policy "write push"  on public.push_subscriptions for insert with check (true);
create policy "update push" on public.push_subscriptions for update using (true) with check (true);
create policy "delete push" on public.push_subscriptions for delete using (true);

-- ---------------------------------------------------------------------------
-- Operator console (cross-crew moderation).
-- An app-wide operator can list/delete ANY crew. Crews are otherwise unreadable
-- (RLS-locked), so this goes through security-definer RPCs. Authorisation is the
-- caller's own account: the RPC checks `accounts.is_operator` for the account id
-- the client holds after login (the same soft-trust model as the rest of the app
-- — that id is only handed out by `login` on the correct password).
--
-- Grant operator rights to an account (run once, e.g. for FardAdmin):
--   update public.accounts set is_operator = true where lower(nickname) = 'fardadmin';
-- ---------------------------------------------------------------------------
-- Retire the old secret-gated variant if a previous schema version created it.
drop function if exists public.admin_list_crews(text);
drop function if exists public.admin_delete_crew_by_id(text, uuid);
drop table if exists public.app_admin;

create or replace function public.is_operator(p_account_id uuid)
returns boolean
language sql security definer set search_path = public, extensions as $$
  select coalesce((select a.is_operator from public.accounts a where a.id = p_account_id), false);
$$;

-- List every crew with rollup counts + last activity. Raises unless the caller
-- is an operator account.
create or replace function public.admin_list_crews(p_account_id uuid)
returns table(id uuid, name text, created_at timestamptz,
              member_count bigint, event_count bigint, last_activity timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_operator(p_account_id) then
    raise exception 'Not authorised';
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

-- Delete any crew by id (cascades to profiles + events). Operator-only.
create or replace function public.admin_delete_crew_by_id(p_account_id uuid, p_crew_id uuid)
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare deleted integer;
begin
  if not public.is_operator(p_account_id) then
    raise exception 'Not authorised';
  end if;
  delete from public.crews where id = p_crew_id;
  get diagnostics deleted = row_count;
  return deleted;  -- 0 → no such crew
end; $$;

revoke all on function public.admin_list_crews(uuid)          from public;
revoke all on function public.admin_delete_crew_by_id(uuid, uuid) from public;
grant execute on function public.admin_list_crews(uuid)          to anon, authenticated;
grant execute on function public.admin_delete_crew_by_id(uuid, uuid) to anon, authenticated;

-- Optional housekeeping: forget locations older than a day (run manually or via cron).
-- update public.profiles set lat = null, lng = null, loc_at = null
--   where loc_at < now() - interval '1 day';
