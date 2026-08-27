-- OUTPOST ZERO / ADMINISTRATION / 02: SECURE GLOBAL UPDATES
-- Requires the game's existing public.banners and public.admins tables plus
-- Supabase Auth. Administration 01 is NOT required. Paste this whole file into
-- the Supabase SQL Editor. It is safe to run again and preserves every update.
--
-- One approved banners row is the canonical update shown on both Home and in
-- every player's Inbox. There is no per-player fan-out table. Creator/main
-- posts go live immediately; co-admin posts remain private drafts until a
-- creator/main approval. All mutation authority is derived from auth.uid(),
-- auth.users, and public.admins inside fixed-search-path SECURITY DEFINER RPCs.

begin;

-- Fail early with a useful instruction instead of leaving a half-installed
-- API when this independent migration is run before the legacy admin tables.
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
-- supplies an actor email or role. This helper is independent of Administration
-- 01, but deliberately follows its creator/main/co role semantics.
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

commit;
