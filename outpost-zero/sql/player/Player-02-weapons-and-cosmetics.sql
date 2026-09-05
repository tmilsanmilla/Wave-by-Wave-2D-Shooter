-- OUTPOST ZERO / PLAYER 02: WEAPONS + COSMETICS
-- One rerunnable owner for the shared weapon price/definition catalogs,
-- publication state, RLS, browser privileges, and Realtime refresh feeds.
--
-- Color and equip-animation catalogs remain shipped game constants. Per-player
-- cosmetic ownership/equipment stays in Player 03's owner-only profiles.data
-- snapshot so this consolidation does not introduce a second source of truth.
-- Admin 02 owns the validated Creator/Main write RPC for these shared tables.

begin;

-- Fail closed: policy setup lives in Player 04 Security. Install it first.
do $section_security_required$
begin
  if to_regprocedure('public._outpost_zero_apply_player_security(text)') is null then
    raise exception 'Run Player 04 Security first; this transaction made no changes';
  end if;
end;
$section_security_required$;

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

notify pgrst, 'reload schema';

-- Apply this section's complete boundary atomically before anything is visible.
select public._outpost_zero_apply_player_security('Player 02');

commit;
