-- OUTPOST ZERO / WEAPONS 01: STORAGE + SECURITY + REALTIME
-- Owns weapon prices, live definitions, publication state, and refresh feeds.
-- Run after Admin 01 so public.admin_role() is available. Safe to rerun.

begin;

do $requirements$
begin
  if to_regprocedure('public.admin_role()') is null then
    raise exception 'Weapons 01 requires Admin 01 Admin Menu';
  end if;
end;
$requirements$;

create table if not exists public.weapon_prices (
  key text primary key,
  cost integer not null check (cost between 0 and 9999),
  updated_at timestamptz not null default now()
);

create table if not exists public.weapon_defs (
  key text primary key,
  stats jsonb not null default '{}'::jsonb,
  price integer,
  published boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.weapon_prices enable row level security;
alter table public.weapon_prices force row level security;
alter table public.weapon_defs enable row level security;
alter table public.weapon_defs force row level security;

-- This file is the complete Weapons security perimeter. Remove every legacy
-- policy first so rerunning an old miscellaneous query cannot leave a second,
-- more-permissive path active alongside these rules.
do $policies$
declare policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('weapon_prices', 'weapon_defs')
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end;
$policies$;

create policy outpost_zero_weapon_prices_read
on public.weapon_prices for select to anon, authenticated
using (true);

create policy outpost_zero_weapon_defs_read
on public.weapon_defs for select to anon, authenticated
using (true);

revoke all on table public.weapon_prices, public.weapon_defs
  from public, anon, authenticated;
grant select on table public.weapon_prices, public.weapon_defs
  to anon, authenticated;
-- Live edits are deliberately RPC-only. Admin 02's
-- save_outpost_zero_weapon_definition derives the actor, validates every
-- field, and atomically updates these two tables for Creator/Main.

-- Both tables have live client subscribers. Realtime only delivers rows that
-- the subscriber may SELECT under the forced RLS policies above.
alter table public.weapon_prices replica identity full;
alter table public.weapon_defs replica identity full;
do $realtime$
declare relation_name text;
begin
  foreach relation_name in array array['weapon_prices', 'weapon_defs'] loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = relation_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        relation_name
      );
    end if;
  end loop;
end;
$realtime$;

commit;
