-- OUTPOST ZERO / ADMINISTRATION / 02: SECURE UPDATES + WEAPON ENFORCEMENT
-- Requires Administration 01, the game's existing public.banners,
-- public.admins, public.profiles, and public.weapon_defs tables, plus Supabase
-- Auth. Paste this whole file into the Supabase SQL Editor as one query. It is
-- safe to rerun and preserves updates, profiles, ownership, and audit history.
--
-- One approved banners row is the canonical update shown on both Home and in
-- every player's Inbox. There is no per-player fan-out table. Creator/main
-- posts go live immediately; co-admin posts remain private drafts until a
-- creator/main approval. All mutation authority is derived from auth.uid(),
-- auth.users, and public.admins inside fixed-search-path SECURITY DEFINER RPCs.

begin;

-- Fail early with a useful instruction instead of leaving a half-installed
-- API when the merged migration is run before the legacy admin tables.
do $block$
declare
  v_missing text;
begin
  if to_regclass('public.banners') is null then
    raise exception 'Administration 02 requires the existing public.banners table';
  end if;
  if to_regclass('public.admins') is null then
    raise exception 'Administration 02 requires the existing public.admins table';
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
    into v_missing
  from (values ('email'), ('role')) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns as c
    where c.table_schema = 'public'
      and c.table_name = 'admins'
      and c.column_name = required.column_name
  );
  if v_missing is not null then
    raise exception 'public.admins is missing required column(s): %', v_missing;
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
    into v_missing
  from (
    values ('id'), ('author'), ('message'), ('approved'), ('created_at')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns as c
    where c.table_schema = 'public'
      and c.table_name = 'banners'
      and c.column_name = required.column_name
  );
  if v_missing is not null then
    raise exception 'public.banners is missing required column(s): %', v_missing;
  end if;

  -- The table is intentionally readable for Realtime after RLS filtering. Do
  -- not grant a raw table read if an installation added an unknown column that
  -- might contain private data; extend this migration deliberately instead.
  select string_agg(c.column_name, ', ' order by c.ordinal_position)
    into v_missing
  from information_schema.columns as c
  where c.table_schema = 'public'
    and c.table_name = 'banners'
    and c.column_name not in ('id', 'author', 'message', 'approved', 'created_at');
  if v_missing is not null then
    raise exception 'public.banners has unreviewed column(s): %. Review them before granting the safe update feed', v_missing;
  end if;
end;
$block$;

-- Resolve the caller from the signed Supabase session. The browser never
-- supplies an actor email or role. This helper follows Administration 01's
-- creator/main/co role semantics; the merged weapon half also requires 01.
create or replace function public._outpost_zero_update_role()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
begin
  if v_user_id is null then
    return '';
  end if;

  select lower(btrim(u.email))
    into v_email
  from auth.users as u
  where u.id = v_user_id;

  if v_email is null or v_email = '' then
    return '';
  end if;
  if v_email = 'tmilsanmilla@gmail.com' then
    return 'creator';
  end if;

  select lower(btrim(coalesce(a.role, '')))
    into v_role
  from public.admins as a
  where lower(btrim(a.email)) = v_email
  order by case lower(btrim(coalesce(a.role, '')))
    when 'main' then 0 when 'co' then 1 else 2 end
  limit 1;

  if v_role in ('main', 'co') then
    return v_role;
  end if;
  return '';
exception
  -- An unexpected legacy admins shape must fail closed, never promote a user.
  when others then return '';
end;
$function$;

alter table public.admins enable row level security;
alter table public.admins force row level security;

do $block$
declare
  v_policy record;
begin
  for v_policy in
    select p.policyname
    from pg_policies as p
    where p.schemaname = 'public' and p.tablename = 'admins'
  loop
    execute format('drop policy %I on public.admins', v_policy.policyname);
  end loop;
end;
$block$;

-- No direct policy is intentional. The bounded roster RPC below is the only
-- browser read and returns just email/role to the caller's permitted scope.
-- This also prevents a future private admins column from becoming readable.
revoke all on table public.admins from public, anon, authenticated;

create or replace function public.list_outpost_zero_admin_roster()
returns table (
  email text,
  role text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_role text := public._outpost_zero_update_role();
  v_email text;
begin
  if v_role = '' then
    return;
  end if;
  select lower(btrim(u.email)) into v_email
  from auth.users as u where u.id = auth.uid();

  return query
  select lower(btrim(a.email))::text,
         case when bool_or(lower(btrim(coalesce(a.role, ''))) = 'main')
              then 'main' else 'co' end::text
  from public.admins as a
  where lower(btrim(coalesce(a.role, ''))) in ('main', 'co')
    and (
      v_role in ('creator', 'main')
      or (v_role = 'co' and lower(btrim(a.email)) = v_email)
    )
  group by lower(btrim(a.email))
  order by lower(btrim(a.email));
end;
$function$;

create or replace function public.add_outpost_zero_co_admin(p_email text)
returns table (
  email text,
  role text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text := public._outpost_zero_update_role();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_existing_role text;
begin
  if v_actor_role not in ('creator', 'main') then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if char_length(v_email) not between 3 and 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'valid admin email required' using errcode = '22023';
  end if;
  if v_email = 'tmilsanmilla@gmail.com' then
    raise exception 'creator role is fixed' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-admin:' || v_email, 0));
  select lower(btrim(coalesce(a.role, '')))
    into v_existing_role
  from public.admins as a
  where lower(btrim(a.email)) = v_email
  order by case lower(btrim(coalesce(a.role, ''))) when 'main' then 0 else 1 end
  limit 1
  for update;

  if v_existing_role is null then
    insert into public.admins(email, role) values (v_email, 'co');
    v_existing_role := 'co';
  elsif v_existing_role <> 'main' then
    update public.admins as a set role = 'co'
    where lower(btrim(a.email)) = v_email;
    v_existing_role := 'co';
  end if;

  return query select v_email, v_existing_role;
end;
$function$;

create or replace function public.promote_outpost_zero_admin(p_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text := public._outpost_zero_update_role();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_changed bigint;
begin
  if v_actor_role not in ('creator', 'main') then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if v_email = '' or v_email = 'tmilsanmilla@gmail.com' then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-admin:' || v_email, 0));
  update public.admins as a set role = 'main'
  where lower(btrim(a.email)) = v_email
    and lower(btrim(coalesce(a.role, ''))) = 'co';
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$function$;

-- Demotion changes a main-admin, so it is deliberately creator-only. There is
-- no current browser button, but the narrow RPC makes the hierarchy complete
-- without reopening direct table writes for a future roster UI.
create or replace function public.demote_outpost_zero_admin(p_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_changed bigint;
begin
  if public._outpost_zero_update_role() <> 'creator' then
    raise exception 'creator access required' using errcode = '42501';
  end if;
  if v_email = '' or v_email = 'tmilsanmilla@gmail.com' then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-admin:' || v_email, 0));
  update public.admins as a set role = 'co'
  where lower(btrim(a.email)) = v_email
    and lower(btrim(coalesce(a.role, ''))) = 'main';
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$function$;

create or replace function public.remove_outpost_zero_admin(p_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text := public._outpost_zero_update_role();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_target_role text;
  v_changed bigint;
begin
  if v_actor_role not in ('creator', 'main') then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if v_email = '' or v_email = 'tmilsanmilla@gmail.com' then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-admin:' || v_email, 0));
  select lower(btrim(coalesce(a.role, '')))
    into v_target_role
  from public.admins as a
  where lower(btrim(a.email)) = v_email
  order by case lower(btrim(coalesce(a.role, ''))) when 'main' then 0 else 1 end
  limit 1
  for update;

  if v_target_role is null then
    return false;
  end if;
  if v_target_role = 'main' and v_actor_role <> 'creator' then
    return false;
  end if;

  delete from public.admins as a where lower(btrim(a.email)) = v_email;
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$function$;

-- Historical rows stored browser-supplied emails in author. The UI never needs
-- an email, so replace every legacy value with a non-identifying role label.
-- Known current admins retain a useful label; removed/unknown staff become the
-- generic ADMIN UPDATE label. Messages, timestamps, IDs, and approval state are
-- unchanged.
update public.banners as b
set author = case
  when lower(btrim(coalesce(b.author, ''))) in ('creator', 'tmilsanmilla@gmail.com')
    then 'CREATOR'
  when lower(btrim(coalesce(b.author, ''))) in ('main', 'main admin', 'main-admin')
    then 'MAIN ADMIN'
  when lower(btrim(coalesce(b.author, ''))) in ('co', 'co admin', 'co-admin')
    then 'CO-ADMIN'
  when exists (
    select 1 from public.admins as a
    where lower(btrim(a.email)) = lower(btrim(coalesce(b.author, '')))
      and lower(btrim(coalesce(a.role, ''))) = 'main'
  ) then 'MAIN ADMIN'
  when exists (
    select 1 from public.admins as a
    where lower(btrim(a.email)) = lower(btrim(coalesce(b.author, '')))
      and lower(btrim(coalesce(a.role, ''))) = 'co'
  ) then 'CO-ADMIN'
  else 'ADMIN UPDATE'
end
where b.author is distinct from case
  when lower(btrim(coalesce(b.author, ''))) in ('creator', 'tmilsanmilla@gmail.com')
    then 'CREATOR'
  when lower(btrim(coalesce(b.author, ''))) in ('main', 'main admin', 'main-admin')
    then 'MAIN ADMIN'
  when lower(btrim(coalesce(b.author, ''))) in ('co', 'co admin', 'co-admin')
    then 'CO-ADMIN'
  when exists (
    select 1 from public.admins as a
    where lower(btrim(a.email)) = lower(btrim(coalesce(b.author, '')))
      and lower(btrim(coalesce(a.role, ''))) = 'main'
  ) then 'MAIN ADMIN'
  when exists (
    select 1 from public.admins as a
    where lower(btrim(a.email)) = lower(btrim(coalesce(b.author, '')))
      and lower(btrim(coalesce(a.role, ''))) = 'co'
  ) then 'CO-ADMIN'
  else 'ADMIN UPDATE'
end;

alter table public.banners
  drop constraint if exists outpost_zero_banners_safe_author;
alter table public.banners
  add constraint outpost_zero_banners_safe_author
  check (author in ('CREATOR', 'MAIN ADMIN', 'CO-ADMIN', 'ADMIN UPDATE'));

alter table public.banners enable row level security;
alter table public.banners force row level security;

-- Policies combine with OR. Remove legacy policies first so an old permissive
-- SELECT/INSERT/UPDATE/DELETE policy cannot silently bypass this migration.
do $block$
declare
  v_policy record;
begin
  for v_policy in
    select p.policyname
    from pg_policies as p
    where p.schemaname = 'public' and p.tablename = 'banners'
  loop
    execute format('drop policy %I on public.banners', v_policy.policyname);
  end loop;
end;
$block$;

-- Realtime needs SELECT visibility on the underlying row. Every banners column
-- was checked above and author is now a safe role label. Players/guests see only
-- approved rows; creator/main reviewers may also see pending co-admin drafts.
create policy outpost_zero_updates_approved_read
on public.banners
for select
to anon, authenticated
using (approved is true);

create policy outpost_zero_updates_reviewer_draft_read
on public.banners
for select
to authenticated
using (
  approved is false
  and public._outpost_zero_update_role() in ('creator', 'main')
);

revoke all on table public.banners from public, anon, authenticated;
grant select on table public.banners to anon, authenticated;

-- Sequence access is unnecessary because all inserts run as the definer.
do $block$
declare
  v_sequence text := pg_get_serial_sequence('public.banners', 'id');
begin
  if v_sequence is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', v_sequence);
  end if;
end;
$block$;

-- Creator/main posts are approved immediately. A co-admin receives a private
-- pending row that only a creator/main reviewer can approve. The stored author
-- is derived from the verified server role and never contains an email.
create or replace function public.post_outpost_zero_update(p_message text)
returns table (
  id bigint,
  author text,
  message text,
  approved boolean,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_role text := public._outpost_zero_update_role();
  v_author text;
  v_message text;
begin
  if v_role not in ('creator', 'main', 'co') then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  v_message := regexp_replace(coalesce(p_message, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if v_message = '' or char_length(v_message) > 300 then
    raise exception 'update must be between 1 and 300 characters' using errcode = '22023';
  end if;

  v_author := case v_role
    when 'creator' then 'CREATOR'
    when 'main' then 'MAIN ADMIN'
    else 'CO-ADMIN'
  end;

  return query
  insert into public.banners as b (author, message, approved, created_at)
  values (v_author, v_message, v_role in ('creator', 'main'), clock_timestamp())
  returning b.id::bigint, b.author::text, b.message::text,
            b.approved::boolean, b.created_at::timestamptz;
end;
$function$;

create or replace function public.approve_outpost_zero_update(p_banner_id bigint)
returns table (
  id bigint,
  author text,
  message text,
  approved boolean,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
begin
  if public._outpost_zero_update_role() not in ('creator', 'main') then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if p_banner_id is null or p_banner_id <= 0 then
    raise exception 'valid update id required' using errcode = '22023';
  end if;

  return query
  update public.banners as b
  set approved = true
  where b.id = p_banner_id
  returning b.id::bigint, b.author::text, b.message::text,
            b.approved::boolean, b.created_at::timestamptz;

  if not found then
    raise exception 'update not found' using errcode = 'P0002';
  end if;
end;
$function$;

create or replace function public.reject_outpost_zero_update(p_banner_id bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_deleted bigint;
begin
  if public._outpost_zero_update_role() not in ('creator', 'main') then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if p_banner_id is null or p_banner_id <= 0 then
    raise exception 'valid update id required' using errcode = '22023';
  end if;

  delete from public.banners as b
  where b.id = p_banner_id and b.approved is false;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$function$;

create or replace function public.delete_outpost_zero_update(p_banner_id bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_deleted bigint;
begin
  if public._outpost_zero_update_role() not in ('creator', 'main') then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if p_banner_id is null or p_banner_id <= 0 then
    raise exception 'valid update id required' using errcode = '22023';
  end if;

  delete from public.banners as b where b.id = p_banner_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$function$;

-- Approved and pending feeds are intentionally requested separately. This
-- prevents any number of newer drafts from consuming the limit and hiding a
-- public update. Draft listing is creator/main-only even though co-admins may
-- submit their own draft.
create or replace function public.list_outpost_zero_updates(
  p_approved boolean,
  p_before_id bigint default null,
  p_limit integer default 10
)
returns table (
  id bigint,
  author text,
  message text,
  approved boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  if p_approved is null then
    raise exception 'approval state required' using errcode = '22023';
  end if;
  if not p_approved
     and public._outpost_zero_update_role() not in ('creator', 'main') then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;

  return query
  select b.id::bigint, b.author::text, b.message::text,
         b.approved::boolean, b.created_at::timestamptz
  from public.banners as b
  where b.approved = p_approved
    and (p_before_id is null or b.id < p_before_id)
  order by b.id desc
  limit v_limit;
end;
$function$;

revoke all on function public._outpost_zero_update_role()
  from public, anon, authenticated;
revoke all on function public.list_outpost_zero_admin_roster()
  from public, anon, authenticated;
revoke all on function public.add_outpost_zero_co_admin(text)
  from public, anon, authenticated;
revoke all on function public.promote_outpost_zero_admin(text)
  from public, anon, authenticated;
revoke all on function public.demote_outpost_zero_admin(text)
  from public, anon, authenticated;
revoke all on function public.remove_outpost_zero_admin(text)
  from public, anon, authenticated;
revoke all on function public.post_outpost_zero_update(text)
  from public, anon, authenticated;
revoke all on function public.approve_outpost_zero_update(bigint)
  from public, anon, authenticated;
revoke all on function public.reject_outpost_zero_update(bigint)
  from public, anon, authenticated;
revoke all on function public.delete_outpost_zero_update(bigint)
  from public, anon, authenticated;
revoke all on function public.list_outpost_zero_updates(boolean, bigint, integer)
  from public, anon, authenticated;

-- The role helper is callable only by authenticated sessions because the RLS
-- draft policy evaluates it for that role. It returns only the caller's own
-- role and accepts no identity. Mutation RPCs remain authenticated-only.
grant execute on function public._outpost_zero_update_role()
  to authenticated;
grant execute on function public.list_outpost_zero_admin_roster()
  to authenticated;
grant execute on function public.add_outpost_zero_co_admin(text)
  to authenticated;
grant execute on function public.promote_outpost_zero_admin(text)
  to authenticated;
grant execute on function public.demote_outpost_zero_admin(text)
  to authenticated;
grant execute on function public.remove_outpost_zero_admin(text)
  to authenticated;
grant execute on function public.post_outpost_zero_update(text)
  to authenticated;
grant execute on function public.approve_outpost_zero_update(bigint)
  to authenticated;
grant execute on function public.reject_outpost_zero_update(bigint)
  to authenticated;
grant execute on function public.delete_outpost_zero_update(bigint)
  to authenticated;
grant execute on function public.list_outpost_zero_updates(boolean, bigint, integer)
  to anon, authenticated;

-- Existing projects already publish banners, but make a fresh/partially
-- configured installation Realtime-ready without duplicating membership.
do $block$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'banners'
  ) then
    alter publication supabase_realtime add table public.banners;
  end if;
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admins'
  ) then
    -- Admin rows can have no primary key/replica identity on legacy projects,
    -- and raw logical changes would bypass the narrow roster RPC. The client
    -- uses an auth/admin-open/three-minute safety refresh instead.
    alter publication supabase_realtime drop table public.admins;
  end if;
end;
$block$;

-- ---------------------------------------------------------------------------
-- UNPUBLISHED WEAPON ENFORCEMENT (MERGED INTO ADMINISTRATION 02)
-- ---------------------------------------------------------------------------
-- This second half makes publication status authoritative everywhere:
--   * ARC Railgun and future vault weapons stay private until explicitly
--     published in public.weapon_defs.
--   * Existing permanent ownership and temporary grants are removed when a
--     weapon is unpublished.
--   * Stale browser/profile writes cannot restore an unpublished weapon.
--   * Unpublishing a weapon immediately performs the same cleanup.
-- Base Gem Shop weapons without a weapon_defs row retain their public defaults.
-- Cleanup removes access without refunding currency.

-- Fail with a useful message instead of partially installing against an older
-- database. Administration 01 owns profiles/grants; the existing weapon editor
-- owns weapon_defs.
do $preflight$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Administration 02 requires public.profiles';
  end if;
  if to_regclass('public.weapon_defs') is null then
    raise exception 'Administration 02 requires public.weapon_defs';
  end if;
  if to_regclass('public.outpost_zero_weapon_grants') is null then
    raise exception 'Run Administration 01 before Administration 02';
  end if;
  if to_regprocedure('public._outpost_zero_validate_admin_patch(jsonb)') is null then
    raise exception 'Run Administration 01 before Administration 02 (admin patch validator missing)';
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
    raise exception 'Administration 02 requires profiles(user_id, data)';
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
    raise exception 'Administration 02 requires weapon_defs(key, published)';
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
