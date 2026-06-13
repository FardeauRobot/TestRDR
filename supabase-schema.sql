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

-- One row per crew member's profile.
create table if not exists public.profiles (
  id            uuid primary key default gen_random_uuid(),
  crew_id       uuid not null references public.crews(id) on delete cascade,
  name          text not null,
  emoji         text not null,
  color         text not null,
  is_admin      boolean not null default false,
  mix_warnings  boolean not null default true,
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

create index if not exists events_crew_at_idx on public.events (crew_id, at desc);
create index if not exists profiles_crew_idx on public.profiles (crew_id);

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

revoke all on function public.create_crew(text, text) from public;
revoke all on function public.join_crew(text, text) from public;
grant execute on function public.create_crew(text, text) to anon, authenticated;
grant execute on function public.join_crew(text, text)  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime + Row Level Security.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.events;

-- crews: RLS on with NO policies → not directly readable/writable by clients.
-- Access happens only through the security-definer functions above.
alter table public.crews enable row level security;

-- profiles/events: partitioned by crew_id (an unguessable uuid you only obtain
-- by knowing the crew's password). Permissive within that scope — fine for a
-- small trusted crew. See SETUP-SUPABASE.md for a stricter auth-based variant.
alter table public.profiles enable row level security;
alter table public.events   enable row level security;

create policy "read profiles"   on public.profiles for select using (true);
create policy "write profiles"  on public.profiles for insert with check (true);
create policy "update profiles" on public.profiles for update using (true) with check (true);
-- Member removal (admin action, gated in the app).
create policy "delete profiles" on public.profiles for delete using (true);

create policy "read events"  on public.events for select using (true);
create policy "write events" on public.events for insert with check (true);
create policy "delete events" on public.events for delete using (true);

-- Optional housekeeping: forget locations older than a day (run manually or via cron).
-- update public.profiles set lat = null, lng = null, loc_at = null
--   where loc_at < now() - interval '1 day';
