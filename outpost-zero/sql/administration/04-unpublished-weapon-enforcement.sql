-- OUTPOST ZERO / ADMINISTRATION / 04: UNPUBLISHED WEAPON ENFORCEMENT
-- Run after Administration 01, 02, and 03 in the Supabase SQL Editor.
-- Paste and run this entire file as one statement batch. It is safe to rerun.
--
-- What this migration enforces:
--   * ARC Railgun is private unless public.weapon_defs says published = true.
--   * Existing permanent ownership and temporary grants are removed whenever
--     an ownable weapon is unpublished.
--   * New profile writes and temporary-grant writes cannot restore an
--     unpublished weapon, including writes from stale browser tabs.
--   * Changing weapon_defs.published to false performs the same cleanup
--     immediately. Changing it to true permits later purchases/admin grants.
--   * Existing base Gem Shop items stay published when they have no
--     weapon_defs row. An explicit weapon_defs row remains authoritative.
--
-- Publication defaults used when weapon_defs has no row:
--   published base items: ar, volt, dart, hammer, twinsai, medkit, grenade,
--                         freezer
--   private-by-default:   railgun and every future/non-base weapon key
--
-- This migration deliberately removes access instead of refunding currency.
-- Refund policy, if desired, should be handled as a separate audited action.

begin;

-- Fail with a useful message instead of partially installing against an older
-- database. Administration 01 owns profiles/grants; the existing weapon editor
-- owns weapon_defs.
do $preflight$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Administration 04 requires public.profiles';
  end if;
  if to_regclass('public.weapon_defs') is null then
    raise exception 'Administration 04 requires public.weapon_defs';
  end if;
  if to_regclass('public.outpost_zero_weapon_grants') is null then
    raise exception 'Run Administration 01 before Administration 04';
  end if;
  if to_regprocedure('public._outpost_zero_validate_admin_patch(jsonb)') is null then
    raise exception 'Run Administration 01 before Administration 04 (admin patch validator missing)';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'user_id'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'data'
  ) then
    raise exception 'Administration 04 requires profiles(user_id, data)';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'weapon_defs'
      and column_name = 'key'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'weapon_defs'
      and column_name = 'published'
  ) then
    raise exception 'Administration 04 requires weapon_defs(key, published)';
  end if;
end;
$preflight$;

-- Serialize this installation/cleanup with any enforcement triggers already
-- present from an earlier run.
select pg_advisory_xact_lock(
  hashtextextended('outpost-zero-weapon-publication', 0)
);

-- One server-owned publication decision is reused by RPC validation, profile
-- sanitation, temporary grants, and the unpublish cleanup trigger. A saved
-- weapon_defs row wins. Missing base rows default to public; missing vault rows
-- default to private, so a new vault weapon fails closed until explicitly
-- published.
create or replace function public._outpost_zero_weapon_is_published(
  p_weapon_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_key text := lower(btrim(coalesce(p_weapon_key, '')));
  v_published boolean;
begin
  if v_key = '' or v_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    return false;
  end if;

  select coalesce(w.published, false)
    into v_published
  from public.weapon_defs as w
  where lower(btrim(w.key)) = v_key
  order by w.key
  limit 1;

  if found then
    return v_published;
  end if;

  return v_key in (
    'ar', 'volt', 'dart', 'hammer', 'twinsai',
    'medkit', 'grenade', 'freezer'
  );
end;
$function$;

revoke all on function public._outpost_zero_weapon_is_published(text)
  from public, anon, authenticated;

-- Statement-level locks run before PostgreSQL locks individual rows. Normal
-- ownership/grant writes share the lock, so players do not block one another;
-- weapon definition changes take it exclusively. This provides one lock order
-- and avoids a profile-row/publication-lock deadlock.
create or replace function public._outpost_zero_lock_weapon_publication()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
begin
  if tg_table_schema = 'public' and tg_table_name = 'weapon_defs' then
    perform pg_advisory_xact_lock(
      hashtextextended('outpost-zero-weapon-publication', 0)
    );
  else
    perform pg_advisory_xact_lock_shared(
      hashtextextended('outpost-zero-weapon-publication', 0)
    );
  end if;
  return null;
end;
$function$;

revoke all on function public._outpost_zero_lock_weapon_publication()
  from public, anon, authenticated;

drop trigger if exists outpost_zero_profiles_lock_weapon_publication
  on public.profiles;
create trigger outpost_zero_profiles_lock_weapon_publication
before insert or update on public.profiles
for each statement execute function public._outpost_zero_lock_weapon_publication();

drop trigger if exists outpost_zero_grants_lock_weapon_publication
  on public.outpost_zero_weapon_grants;
create trigger outpost_zero_grants_lock_weapon_publication
before insert or update on public.outpost_zero_weapon_grants
for each statement execute function public._outpost_zero_lock_weapon_publication();

drop trigger if exists outpost_zero_weapon_defs_lock_publication
  on public.weapon_defs;
create trigger outpost_zero_weapon_defs_lock_publication
before insert or update or delete on public.weapon_defs
for each statement execute function public._outpost_zero_lock_weapon_publication();

-- Strip every private/unknown key from profiles.data.owned while preserving the
-- rest of the profile JSON exactly. One transaction-scoped publication lock
-- serializes profile ownership, temporary grants, and publication changes so
-- those operations cannot cross in flight and leave access behind.
create or replace function public._outpost_zero_strip_unpublished_owned(
  p_data jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_owned jsonb;
  v_key text;
begin
  if p_data is null
     or jsonb_typeof(p_data) <> 'object'
     or jsonb_typeof(p_data -> 'owned') is distinct from 'object' then
    return p_data;
  end if;

  perform pg_advisory_xact_lock_shared(
    hashtextextended('outpost-zero-weapon-publication', 0)
  );
  v_owned := p_data -> 'owned';
  for v_key in
    select e.key
    from jsonb_each(v_owned) as e(key, value)
    order by e.key
  loop
    if not public._outpost_zero_weapon_is_published(v_key) then
      v_owned := v_owned - v_key;
    end if;
  end loop;

  return jsonb_set(p_data, '{owned}', v_owned, false);
end;
$function$;

revoke all on function public._outpost_zero_strip_unpublished_owned(jsonb)
  from public, anon, authenticated;

create or replace function public._outpost_zero_profiles_enforce_published()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
begin
  new.data := public._outpost_zero_strip_unpublished_owned(new.data);
  return new;
end;
$function$;

revoke all on function public._outpost_zero_profiles_enforce_published()
  from public, anon, authenticated;

drop trigger if exists outpost_zero_profiles_enforce_published
  on public.profiles;
create trigger outpost_zero_profiles_enforce_published
before insert or update of data on public.profiles
for each row execute function public._outpost_zero_profiles_enforce_published();

-- Administration 01 originally used a fixed SQL CHECK allowlist. Replace only
-- that key check with a bounded identifier check; the publication trigger below
-- is the live authority. This keeps the table ready for future published vault
-- weapons without weakening publication enforcement.
alter table public.outpost_zero_weapon_grants
  drop constraint if exists outpost_zero_weapon_grants_weapon_allowlist;
alter table public.outpost_zero_weapon_grants
  add constraint outpost_zero_weapon_grants_weapon_allowlist
  check (weapon_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$');

create or replace function public._outpost_zero_grants_enforce_published()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
begin
  new.weapon_key := lower(btrim(coalesce(new.weapon_key, '')));
  perform pg_advisory_xact_lock_shared(
    hashtextextended('outpost-zero-weapon-publication', 0)
  );
  if not public._outpost_zero_weapon_is_published(new.weapon_key) then
    raise exception 'weapon % is not published', new.weapon_key
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function public._outpost_zero_grants_enforce_published()
  from public, anon, authenticated;

drop trigger if exists outpost_zero_grants_enforce_published
  on public.outpost_zero_weapon_grants;
create trigger outpost_zero_grants_enforce_published
before insert or update on public.outpost_zero_weapon_grants
for each row execute function public._outpost_zero_grants_enforce_published();

-- Preserve all Administration 01 shape/bounds checks and add publication as a
-- second server-side rule for permanent grant patches. Revokes remain allowed
-- for unpublished weapons so an admin can always remove stale access.
create or replace function public._outpost_zero_validate_admin_patch(p_patch jsonb)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_key text;
  v_number numeric;
  v_keys text[];
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or pg_column_size(p_patch) > 4096 then
    raise exception 'patch must be a JSON object no larger than 4 KB'
      using errcode = '22023';
  end if;

  select k into v_key from jsonb_object_keys(p_patch) as keys(k)
  where k not in ('score', 'gems', 'coins', 'pow', 'grant', 'revoke',
                  'ban', 'scopes', 'note') limit 1;
  if v_key is not null then
    raise exception 'unsupported player-edit field: %', v_key using errcode = '22023';
  end if;

  select coalesce(array_agg(k), array[]::text[]) into v_keys
  from jsonb_object_keys(p_patch) as keys(k);
  if cardinality(v_keys) = 0
     or (cardinality(v_keys) = 1 and v_keys[1] = 'note') then
    raise exception 'nothing to change' using errcode = '22023';
  end if;

  if p_patch ? 'score' then
    if jsonb_typeof(p_patch -> 'score') <> 'number' then
      raise exception 'score must be numeric' using errcode = '22023';
    end if;
    v_number := (p_patch ->> 'score')::numeric;
    if v_number <> trunc(v_number) or v_number not between 0 and 99999999 then
      raise exception 'score must be an integer between 0 and 99999999' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'gems' then
    if jsonb_typeof(p_patch -> 'gems') <> 'number' then
      raise exception 'gems must be numeric' using errcode = '22023';
    end if;
    v_number := (p_patch ->> 'gems')::numeric;
    if v_number <> trunc(v_number) or v_number not between 0 and 9999999 then
      raise exception 'gems must be an integer between 0 and 9999999' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'coins' then
    if jsonb_typeof(p_patch -> 'coins') <> 'number' then
      raise exception 'coins must be numeric' using errcode = '22023';
    end if;
    v_number := (p_patch ->> 'coins')::numeric;
    if v_number <> trunc(v_number) or v_number not between 0 and 9999999 then
      raise exception 'coins must be an integer between 0 and 9999999' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'note' and (
      jsonb_typeof(p_patch -> 'note') <> 'string'
      or char_length(p_patch ->> 'note') > 200) then
    raise exception 'note must be a string no longer than 200 characters' using errcode = '22023';
  end if;

  foreach v_key in array array['grant', 'revoke'] loop
    if p_patch ? v_key then
      if jsonb_typeof(p_patch -> v_key) <> 'array'
         or jsonb_array_length(p_patch -> v_key) not between 1 and 20 then
        raise exception '% must be a nonempty array of at most 20 weapon keys', v_key
          using errcode = '22023';
      end if;
      if exists (
        select 1
        from jsonb_array_elements(p_patch -> v_key) as e(value)
        where jsonb_typeof(e.value) <> 'string'
           or trim(both '"' from e.value::text)
              !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
      ) then
        raise exception '% contains an invalid weapon key', v_key using errcode = '22023';
      end if;
    end if;
  end loop;

  if p_patch ? 'grant' and exists (
    select 1
    from jsonb_array_elements_text(p_patch -> 'grant') as g(key)
    where not public._outpost_zero_weapon_is_published(g.key)
  ) then
    raise exception 'grant contains an unpublished weapon' using errcode = '23514';
  end if;

  if p_patch ? 'grant' and p_patch ? 'revoke' and exists (
    select 1 from jsonb_array_elements_text(p_patch -> 'grant') as g(key)
    join jsonb_array_elements_text(p_patch -> 'revoke') as r(key) using (key)
  ) then
    raise exception 'the same weapon cannot be granted and revoked together' using errcode = '22023';
  end if;

  if p_patch ? 'pow' then
    if jsonb_typeof(p_patch -> 'pow') <> 'object'
       or (select count(*) from jsonb_object_keys(p_patch -> 'pow')) > 5 then
      raise exception 'pow must be a bounded upgrade object' using errcode = '22023';
    end if;
    for v_key, v_number in
      select e.key, (e.value #>> '{}')::numeric
      from jsonb_each(p_patch -> 'pow') as e(key, value)
      where jsonb_typeof(e.value) = 'number'
    loop
      if v_key not in ('respawn', 'quickmed', 'invinc', 'waveskip', 'airdrop')
         or v_number <> trunc(v_number) or v_number not between 0 and 99 then
        raise exception 'pow contains an invalid upgrade/count' using errcode = '22023';
      end if;
    end loop;
    if exists (
      select 1 from jsonb_each(p_patch -> 'pow') as e(key, value)
      where jsonb_typeof(e.value) <> 'number'
         or e.key not in ('respawn', 'quickmed', 'invinc', 'waveskip', 'airdrop')
    ) then
      raise exception 'pow contains an invalid upgrade/count' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'ban' then
    if jsonb_typeof(p_patch -> 'ban') <> 'string'
       or not (
         p_patch ->> 'ban' in ('perm', 'unban')
         or ((p_patch ->> 'ban') ~ '^[0-9]{1,4}$'
             and (p_patch ->> 'ban')::integer between 1 and 3650)
       ) then
      raise exception 'ban must be unban, perm, or 1-3650 days' using errcode = '22023';
    end if;
    if p_patch ->> 'ban' <> 'unban' and (
        not (p_patch ? 'note') or btrim(p_patch ->> 'note') = '') then
      raise exception 'a ban needs a note' using errcode = '22023';
    end if;
    if p_patch ->> 'ban' <> 'unban' and not (p_patch ? 'scopes') then
      raise exception 'a ban needs at least one scope' using errcode = '22023';
    end if;
  elsif p_patch ? 'scopes' then
    raise exception 'scopes require a ban action' using errcode = '22023';
  end if;

  if p_patch ? 'scopes' and (
      jsonb_typeof(p_patch -> 'scopes') <> 'array'
      or jsonb_array_length(p_patch -> 'scopes') not between 1 and 3
      or exists (
        select 1 from jsonb_array_elements(p_patch -> 'scopes') as e(value)
        where jsonb_typeof(e.value) <> 'string'
           or trim(both '"' from e.value::text) not in ('account', 'device', 'leaderboard')
      )) then
    raise exception 'invalid ban scopes' using errcode = '22023';
  end if;
end;
$function$;

revoke all on function public._outpost_zero_validate_admin_patch(jsonb)
  from public, anon, authenticated;

-- Clean both stores when a definition becomes private (or a private definition
-- is inserted). The same advisory lock is used by write-time enforcement.
create or replace function public._outpost_zero_cleanup_weapon_access(
  p_weapon_key text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_key text := lower(btrim(coalesce(p_weapon_key, '')));
begin
  if v_key = '' then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('outpost-zero-weapon-publication', 0)
  );

  if public._outpost_zero_weapon_is_published(v_key) then
    return;
  end if;

  delete from public.outpost_zero_weapon_grants as g
  where lower(btrim(g.weapon_key)) = v_key;

  update public.profiles as p
  set data = public._outpost_zero_strip_unpublished_owned(p.data)
  where jsonb_typeof(p.data -> 'owned') = 'object'
    and exists (
      select 1
      from jsonb_object_keys(p.data -> 'owned') as owned(key)
      where lower(btrim(owned.key)) = v_key
    );
end;
$function$;

revoke all on function public._outpost_zero_cleanup_weapon_access(text)
  from public, anon, authenticated;

create or replace function public._outpost_zero_weapon_defs_cleanup_access()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_key text;
begin
  -- ORDER BY keeps key-renames deadlock-safe, even though key changes are rare.
  for v_key in
    select distinct x.key
    from unnest(array[
      case when tg_op in ('UPDATE', 'DELETE') then old.key else null end,
      case when tg_op in ('INSERT', 'UPDATE') then new.key else null end
    ]) as x(key)
    where x.key is not null
    order by x.key
  loop
    perform public._outpost_zero_cleanup_weapon_access(v_key);
  end loop;
  return null;
end;
$function$;

revoke all on function public._outpost_zero_weapon_defs_cleanup_access()
  from public, anon, authenticated;

drop trigger if exists outpost_zero_weapon_defs_cleanup_access
  on public.weapon_defs;
create trigger outpost_zero_weapon_defs_cleanup_access
after insert or delete or update of key, published on public.weapon_defs
for each row execute function public._outpost_zero_weapon_defs_cleanup_access();

-- One-time generic cleanup. Railgun is removed here whenever it has no explicit
-- published=true row. Any future private/unknown owned key is cleaned too.
delete from public.outpost_zero_weapon_grants as g
where not public._outpost_zero_weapon_is_published(g.weapon_key);

update public.profiles as p
set data = public._outpost_zero_strip_unpublished_owned(p.data)
where jsonb_typeof(p.data -> 'owned') = 'object'
  and exists (
    select 1
    from jsonb_object_keys(p.data -> 'owned') as owned(key)
    where not public._outpost_zero_weapon_is_published(owned.key)
  );

-- The client subscribes to weapon_defs changes so already-open games can drop
-- a weapon as soon as it is unpublished. Make that table a Realtime member
-- without failing or duplicating membership when this migration is rerun.
do $realtime$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'weapon_defs'
  ) then
    alter publication supabase_realtime add table public.weapon_defs;
  end if;
end;
$realtime$;

commit;

-- Optional read-only verification after COMMIT:
--
-- select public._outpost_zero_weapon_is_published('railgun') as railgun_live;
--
-- select count(*) as unpublished_temp_grants
-- from public.outpost_zero_weapon_grants as g
-- where not public._outpost_zero_weapon_is_published(g.weapon_key);
--
-- select count(*) as profiles_with_unpublished_owned_keys
-- from public.profiles as p
-- where jsonb_typeof(p.data -> 'owned') = 'object'
--   and exists (
--     select 1
--     from jsonb_object_keys(p.data -> 'owned') as owned(key)
--     where not public._outpost_zero_weapon_is_published(owned.key)
--   );
