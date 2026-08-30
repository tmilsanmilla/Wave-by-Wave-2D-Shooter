-- OUTPOST ZERO / ADMIN 02: ADMINS
-- Staff hierarchy, Tester suggestions, and secure global update publishing.
-- Run after Admin 01. Safe to rerun; rows and update history are preserved.

begin;

do $prerequisites$
begin
  if to_regprocedure('public._outpost_zero_creator_user_id()') is null then
    raise exception 'Run Admin 01 before Admin 02 so the creator UUID is pinned safely';
  end if;
  if to_regprocedure('public._outpost_zero_write_admin_audit(uuid,text,text,jsonb,uuid)') is null then
    raise exception 'Run the current Admin 01 before Admin 02 so staff changes are audited';
  end if;
end;
$prerequisites$;

create table if not exists public.admins(
  email text primary key,
  role text not null,
  created_at timestamptz default now()
);
create table if not exists public.banners(
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  author text,
  message text not null check(char_length(message) between 1 and 300),
  heading text,
  details text,
  approved boolean not null default false
);

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
    and c.column_name not in ('id', 'author', 'message', 'heading', 'details', 'approved', 'created_at');
  if v_missing is not null then
    raise exception 'public.banners has unreviewed column(s): %. Review them before granting the safe update feed', v_missing;
  end if;
end;
$block$;

-- Upgrade the one-text update format in place. `message` remains a compact
-- legacy mirror of heading so older clients keep working; new clients read the
-- complete details column. Existing posts retain their entire original text.
alter table public.banners
  add column if not exists heading text,
  add column if not exists details text;
update public.banners b
set details=coalesce(nullif(b.details,''),b.message),
    heading=coalesce(nullif(b.heading,''),
      case when char_length(b.message)<=120 then b.message
           else left(b.message,117)||'...' end);
update public.banners b set message=b.heading where b.message is distinct from b.heading;
alter table public.banners alter column heading set not null;
alter table public.banners alter column details set not null;
alter table public.banners drop constraint if exists outpost_zero_banners_heading_length;
alter table public.banners drop constraint if exists outpost_zero_banners_details_length;
alter table public.banners add constraint outpost_zero_banners_heading_length
  check(char_length(heading) between 1 and 120);
alter table public.banners add constraint outpost_zero_banners_details_length
  check(char_length(details) between 1 and 4000);

-- Replace only role-related CHECK constraints so the new lowest tier can be
-- stored. Unrelated admins-table constraints remain untouched.
do $constraints$
declare item record;
begin
  for item in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='admins' and c.contype='c'
      and pg_get_constraintdef(c.oid) ~* '\mrole\M'
  loop
    execute format('alter table public.admins drop constraint %I',item.conname);
  end loop;
end;
$constraints$;

alter table public.admins
  add constraint outpost_zero_admin_role_allowed
  check (lower(btrim(coalesce(role,''))) in ('main','co','tester'));

create or replace function public._outpost_zero_staff_role()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare actor uuid:=auth.uid();actor_email text;actor_role text;
begin
  if actor is null then return '';end if;
  select lower(btrim(u.email)) into actor_email from auth.users u where u.id=actor;
  if actor=public._outpost_zero_creator_user_id() then return 'creator';end if;
  select lower(btrim(coalesce(a.role,''))) into actor_role
  from public.admins a where lower(btrim(a.email))=actor_email
  order by case lower(btrim(coalesce(a.role,''))) when 'main' then 0 when 'co' then 1 when 'tester' then 2 else 3 end limit 1;
  if actor_role in ('main','co','tester') then return actor_role;end if;return '';
exception when others then return '';
end;
$function$;

-- Keep the older Administration 01 authority helper deliberately blind to
-- Testers. Every legacy player/audit/grant RPC therefore continues to deny
-- them even if they call the API directly instead of using the game UI.
create or replace function public._outpost_zero_admin_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select case public._outpost_zero_staff_role()
    when 'creator' then 'creator' when 'main' then 'main' when 'co' then 'co' else '' end
$function$;

create or replace function public._outpost_zero_update_role()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  return public._outpost_zero_admin_role();
end;
$function$;

create or replace function public.list_outpost_zero_admin_roster()
returns table(email text,role text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text:=public._outpost_zero_admin_role();actor_email text;
begin
  actor_role:=public._outpost_zero_staff_role();if actor_role='' then return;end if;
  select lower(btrim(u.email)) into actor_email from auth.users u where u.id=auth.uid();
  return query
  select lower(btrim(a.email))::text,
    case when bool_or(lower(btrim(coalesce(a.role,'')))='main') then 'main'
         when bool_or(lower(btrim(coalesce(a.role,'')))='co') then 'co' else 'tester' end::text
  from public.admins a
  where lower(btrim(coalesce(a.role,''))) in ('main','co','tester')
    and (actor_role in ('creator','main') or lower(btrim(a.email))=actor_email)
  group by lower(btrim(a.email))
  order by lower(btrim(a.email));
end;
$function$;

create or replace function public.add_outpost_zero_admin(p_email text,p_role text default 'tester')
returns table(email text,role text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text:=public._outpost_zero_staff_role();clean_email text:=lower(btrim(coalesce(p_email,'')));
  clean_role text:=lower(btrim(coalesce(p_role,'tester')));existing_role text;target_user_id uuid;changed boolean:=false;
begin
  if actor_role not in ('creator','main') then raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';end if;
  if clean_role not in ('tester','co') then raise exception using errcode='22023',message='INVALID_STARTING_ROLE';end if;
  if char_length(clean_email) not between 3 and 320 or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    then raise exception using errcode='22023',message='VALID_ADMIN_EMAIL_REQUIRED';end if;
  if clean_email=coalesce((select lower(btrim(u.email)) from auth.users u where u.id=public._outpost_zero_creator_user_id()),'')
    then raise exception using errcode='22023',message='CREATOR_ROLE_IS_FIXED';end if;
  select u.id into target_user_id from auth.users u where lower(btrim(u.email))=clean_email limit 1;
  if target_user_id is null then
    raise exception using errcode='22023',message='ACCOUNT_MUST_SIGN_IN_FIRST';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-admin:'||clean_email,0));
  select lower(btrim(coalesce(a.role,''))) into existing_role from public.admins a
    where lower(btrim(a.email))=clean_email
    order by case lower(btrim(coalesce(a.role,''))) when 'main' then 0 when 'co' then 1 else 2 end limit 1 for update;
  if existing_role is null then insert into public.admins(email,role) values(clean_email,clean_role);changed:=true;
  elsif existing_role='tester' and clean_role='co' then update public.admins a set role='co' where lower(btrim(a.email))=clean_email;changed:=true;
  else clean_role:=existing_role;end if;
  perform public._outpost_zero_write_admin_audit(target_user_id,'admin.add',case when changed then 'applied' else 'no_change' end,
    jsonb_build_object('before_role',coalesce(existing_role,'none'),'after_role',clean_role));
  return query select clean_email,clean_role;
end;
$function$;

create or replace function public.promote_outpost_zero_admin(p_email text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text:=public._outpost_zero_staff_role();clean_email text:=lower(btrim(coalesce(p_email,'')));
  target_role text;next_role text;affected bigint;target_user_id uuid;
begin
  if actor_role not in ('creator','main') then raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';end if;
  if clean_email='' or clean_email=coalesce((select lower(btrim(u.email)) from auth.users u where u.id=public._outpost_zero_creator_user_id()),'') then return false;end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-admin:'||clean_email,0));
  select lower(btrim(coalesce(a.role,''))) into target_role from public.admins a where lower(btrim(a.email))=clean_email
    order by case lower(btrim(coalesce(a.role,''))) when 'main' then 0 when 'co' then 1 else 2 end limit 1 for update;
  next_role:=case target_role when 'tester' then 'co' when 'co' then 'main' else null end;
  if next_role is null then return false;end if;
  select u.id into target_user_id from auth.users u where lower(btrim(u.email))=clean_email limit 1;
  if next_role='main' and actor_role<>'creator' then
    perform public._outpost_zero_write_admin_audit(target_user_id,'admin.promote','rejected',
      jsonb_build_object('before_role',target_role,'after_role',next_role,'reason','creator_required_for_main'));
    return false;
  end if;
  update public.admins a set role=next_role where lower(btrim(a.email))=clean_email;get diagnostics affected=row_count;
  perform public._outpost_zero_write_admin_audit(target_user_id,'admin.promote',case when affected>0 then 'applied' else 'no_change' end,
    jsonb_build_object('before_role',target_role,'after_role',next_role));
  return affected>0;
end;
$function$;

create or replace function public.demote_outpost_zero_admin(p_email text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text:=public._outpost_zero_staff_role();clean_email text:=lower(btrim(coalesce(p_email,'')));
  target_role text;next_role text;affected bigint;target_user_id uuid;
begin
  if actor_role not in ('creator','main') then raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';end if;
  if clean_email='' or clean_email=coalesce((select lower(btrim(u.email)) from auth.users u where u.id=public._outpost_zero_creator_user_id()),'') then return false;end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-admin:'||clean_email,0));
  select lower(btrim(coalesce(a.role,''))) into target_role from public.admins a where lower(btrim(a.email))=clean_email
    order by case lower(btrim(coalesce(a.role,''))) when 'main' then 0 when 'co' then 1 else 2 end limit 1 for update;
  select u.id into target_user_id from auth.users u where lower(btrim(u.email))=clean_email limit 1;
  if target_role='main' and actor_role<>'creator' then
    perform public._outpost_zero_write_admin_audit(target_user_id,'admin.demote','rejected',
      jsonb_build_object('before_role',target_role,'reason','creator_required_for_main'));
    return false;
  end if;
  next_role:=case target_role when 'main' then 'co' when 'co' then 'tester' else null end;
  if next_role is null then return false;end if;
  update public.admins a set role=next_role where lower(btrim(a.email))=clean_email;get diagnostics affected=row_count;
  perform public._outpost_zero_write_admin_audit(target_user_id,'admin.demote',case when affected>0 then 'applied' else 'no_change' end,
    jsonb_build_object('before_role',target_role,'after_role',next_role));
  return affected>0;
end;
$function$;

alter table public.admins enable row level security;
alter table public.admins force row level security;
do $admin_policies$
declare item record;
begin
  for item in select policyname from pg_policies where schemaname='public' and tablename='admins'
  loop execute format('drop policy %I on public.admins',item.policyname);end loop;
end;
$admin_policies$;
revoke all on table public.admins from public,anon,authenticated;

create or replace function public._outpost_zero_staff_email()
returns text language sql stable security definer set search_path=pg_catalog,public
as $function$ select lower(btrim(u.email)) from auth.users u where u.id=auth.uid() $function$;

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
  v_target_user_id uuid;
  v_changed bigint;
begin
  if v_actor_role not in ('creator', 'main') then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if v_email = '' or v_email=coalesce((select lower(btrim(u.email)) from auth.users u where u.id=public._outpost_zero_creator_user_id()),'') then
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
  select u.id into v_target_user_id from auth.users u where lower(btrim(u.email))=v_email limit 1;
  if v_target_role = 'main' and v_actor_role <> 'creator' then
    perform public._outpost_zero_write_admin_audit(v_target_user_id,'admin.remove','rejected',
      jsonb_build_object('before_role',v_target_role,'reason','creator_required_for_main'));
    return false;
  end if;

  delete from public.admins as a where lower(btrim(a.email)) = v_email;
  get diagnostics v_changed = row_count;
  perform public._outpost_zero_write_admin_audit(v_target_user_id,'admin.remove',case when v_changed>0 then 'applied' else 'no_change' end,
    jsonb_build_object('before_role',v_target_role,'after_role','none'));
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
  when lower(btrim(coalesce(b.author, ''))) = 'creator'
    or lower(btrim(coalesce(b.author, ''))) = coalesce((select lower(btrim(u.email)) from auth.users u where u.id=public._outpost_zero_creator_user_id()),'')
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
  when lower(btrim(coalesce(b.author, ''))) = 'creator'
    or lower(btrim(coalesce(b.author, ''))) = coalesce((select lower(btrim(u.email)) from auth.users u where u.id=public._outpost_zero_creator_user_id()),'')
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
  v_heading text;
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
  v_heading:=case when char_length(v_message)<=120 then v_message else left(v_message,117)||'...' end;

  return query
  insert into public.banners as b (author, message, heading, details, approved, created_at)
  values (v_author, v_heading, v_heading, v_message, v_role in ('creator', 'main'), clock_timestamp())
  returning b.id::bigint, b.author::text, b.message::text,
            b.approved::boolean, b.created_at::timestamptz;
end;
$function$;

-- Two-field update API. Kept beside the legacy one-argument function so an
-- already-deployed older client can continue posting during rollout.
create or replace function public.post_outpost_zero_update_v2(p_heading text,p_details text)
returns table(id bigint,author text,heading text,details text,approved boolean,created_at timestamptz)
language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare
  v_role text:=public._outpost_zero_update_role();
  v_author text;v_heading text;v_details text;
begin
  if v_role not in ('creator','main','co') then raise exception 'admin access required' using errcode='42501';end if;
  v_heading:=regexp_replace(btrim(coalesce(p_heading,'')),'[[:space:]]+',' ','g');
  v_details:=regexp_replace(btrim(coalesce(p_details,'')),E'\\r\\n?',E'\\n','g');
  if char_length(v_heading) not between 1 and 120 then raise exception 'heading must be between 1 and 120 characters' using errcode='22023';end if;
  if char_length(v_details) not between 1 and 4000 then raise exception 'details must be between 1 and 4000 characters' using errcode='22023';end if;
  v_author:=case v_role when 'creator' then 'CREATOR' when 'main' then 'MAIN ADMIN' else 'CO-ADMIN' end;
  return query insert into public.banners as b(author,message,heading,details,approved,created_at)
    values(v_author,v_heading,v_heading,v_details,v_role in ('creator','main'),clock_timestamp())
    returning b.id::bigint,b.author::text,b.heading::text,b.details::text,b.approved::boolean,b.created_at::timestamptz;
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

create or replace function public.list_outpost_zero_updates_v2(
  p_approved boolean,p_before_id bigint default null,p_limit integer default 10
)
returns table(id bigint,author text,heading text,details text,approved boolean,created_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public
as $function$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,10),50));
begin
  if p_approved is null then raise exception 'approval state required' using errcode='22023';end if;
  if not p_approved and public._outpost_zero_update_role() not in ('creator','main') then
    raise exception 'creator or main-admin access required' using errcode='42501';
  end if;
  return query select b.id::bigint,b.author::text,b.heading::text,b.details::text,b.approved::boolean,b.created_at::timestamptz
  from public.banners b where b.approved=p_approved and (p_before_id is null or b.id<p_before_id)
  order by b.id desc limit v_limit;
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
revoke all on function public.promote_outpost_zero_admin(text)
  from public, anon, authenticated;
revoke all on function public.demote_outpost_zero_admin(text)
  from public, anon, authenticated;
revoke all on function public.remove_outpost_zero_admin(text)
  from public, anon, authenticated;
revoke all on function public.post_outpost_zero_update(text)
  from public, anon, authenticated;
revoke all on function public.post_outpost_zero_update_v2(text,text)
  from public, anon, authenticated;
revoke all on function public.approve_outpost_zero_update(bigint)
  from public, anon, authenticated;
revoke all on function public.reject_outpost_zero_update(bigint)
  from public, anon, authenticated;
revoke all on function public.delete_outpost_zero_update(bigint)
  from public, anon, authenticated;
revoke all on function public.list_outpost_zero_updates(boolean, bigint, integer)
  from public, anon, authenticated;
revoke all on function public.list_outpost_zero_updates_v2(boolean,bigint,integer)
  from public, anon, authenticated;

-- The role helper is callable only by authenticated sessions because the RLS
-- draft policy evaluates it for that role. It returns only the caller's own
-- role and accepts no identity. Mutation RPCs remain authenticated-only.
grant execute on function public._outpost_zero_update_role()
  to authenticated;
grant execute on function public.post_outpost_zero_update(text)
  to authenticated;
grant execute on function public.post_outpost_zero_update_v2(text,text)
  to authenticated;
grant execute on function public.approve_outpost_zero_update(bigint)
  to authenticated;
grant execute on function public.reject_outpost_zero_update(bigint)
  to authenticated;
grant execute on function public.delete_outpost_zero_update(bigint)
  to authenticated;
grant execute on function public.list_outpost_zero_updates(boolean, bigint, integer)
  to anon, authenticated;
grant execute on function public.list_outpost_zero_updates_v2(boolean,bigint,integer)
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

-- Tester/Co-admin suggestion workflow. Approval records review only; it never
-- mutates live weapon definitions.
create table if not exists public.outpost_zero_weapon_suggestions(
  id bigint generated always as identity primary key,
  author_user_id uuid not null,
  author_email text not null,
  author_role text not null,
  weapon_key text not null,
  suggestion text not null,
  status text not null default 'pending',
  reviewer_user_id uuid,
  reviewer_note text,
  created_at timestamptz not null default statement_timestamp(),
  reviewed_at timestamptz,
  constraint outpost_zero_weapon_suggestion_author_role check(author_role in ('tester','co')),
  constraint outpost_zero_weapon_suggestion_key check(weapon_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint outpost_zero_weapon_suggestion_length check(char_length(suggestion) between 10 and 800),
  constraint outpost_zero_weapon_suggestion_status check(status in ('pending','approved','rejected')),
  constraint outpost_zero_weapon_suggestion_note check(reviewer_note is null or char_length(reviewer_note)<=500),
  constraint outpost_zero_weapon_suggestion_review_shape check((status='pending' and reviewer_user_id is null and reviewed_at is null) or (status<>'pending' and reviewer_user_id is not null and reviewed_at is not null))
);
create index if not exists outpost_zero_weapon_suggestions_pending_idx on public.outpost_zero_weapon_suggestions(status,created_at desc,id desc);
alter table public.outpost_zero_weapon_suggestions enable row level security;
alter table public.outpost_zero_weapon_suggestions force row level security;
revoke all on table public.outpost_zero_weapon_suggestions from public,anon,authenticated;

create or replace function public.submit_outpost_zero_weapon_suggestion(p_weapon_key text,p_suggestion text)
returns bigint language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare actor uuid:=auth.uid();actor_role text:=public._outpost_zero_staff_role();actor_email text:=public._outpost_zero_staff_email();
  clean_key text:=lower(btrim(coalesce(p_weapon_key,'')));clean_text text:=regexp_replace(btrim(coalesce(p_suggestion,'')),'[[:space:]]+',' ','g');result_id bigint;
begin
  if actor_role not in ('tester','co') then raise exception using errcode='42501',message='TESTER_OR_CO_ADMIN_REQUIRED';end if;
  if clean_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    then raise exception using errcode='22023',message='VALID_WEAPON_KEY_REQUIRED';end if;
  if char_length(clean_text) not between 10 and 800 then raise exception using errcode='22023',message='SUGGESTION_MUST_BE_10_TO_800_CHARACTERS';end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-weapon-suggestion:'||actor::text,0));
  if (select count(*) from public.outpost_zero_weapon_suggestions s where s.author_user_id=actor and s.created_at>statement_timestamp()-interval '1 day')>=20
    then raise exception using errcode='P0001',message='SUGGESTION_RATE_LIMIT';end if;
  select s.id into result_id from public.outpost_zero_weapon_suggestions s
    where s.author_user_id=actor and s.weapon_key=clean_key and s.suggestion=clean_text and s.status='pending' order by s.id desc limit 1;
  if result_id is null then
    insert into public.outpost_zero_weapon_suggestions(author_user_id,author_email,author_role,weapon_key,suggestion)
    values(actor,actor_email,actor_role,clean_key,clean_text) returning id into result_id;
  end if;return result_id;
end;
$function$;

create or replace function public.list_outpost_zero_weapon_suggestions(p_limit integer default 40,p_status text default 'pending')
returns table(id bigint,author_email text,author_role text,weapon_key text,suggestion text,status text,created_at timestamptz,reviewer_note text,reviewed_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public
as $function$
declare clean_status text:=lower(btrim(coalesce(p_status,'pending')));
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';end if;
  if clean_status not in ('pending','approved','rejected') then raise exception using errcode='22023',message='INVALID_STATUS';end if;
  return query select s.id,s.author_email,s.author_role,s.weapon_key,s.suggestion,s.status,s.created_at,s.reviewer_note,s.reviewed_at
    from public.outpost_zero_weapon_suggestions s where s.status=clean_status order by s.id desc limit least(greatest(coalesce(p_limit,40),1),100);
end;
$function$;

create or replace function public.review_outpost_zero_weapon_suggestion(p_suggestion_id bigint,p_decision text,p_reviewer_note text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare decision text:=lower(btrim(coalesce(p_decision,'')));note text:=nullif(btrim(coalesce(p_reviewer_note,'')),'');affected bigint;
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';end if;
  if decision not in ('approved','rejected') or char_length(coalesce(note,''))>500 then raise exception using errcode='22023',message='INVALID_REVIEW';end if;
  update public.outpost_zero_weapon_suggestions s set status=decision,reviewer_user_id=auth.uid(),reviewer_note=note,reviewed_at=statement_timestamp()
    where s.id=p_suggestion_id and s.status='pending';get diagnostics affected=row_count;return affected>0;
end;
$function$;

-- Creator/Main save live weapon edits directly. Dynamic relation access keeps
-- Admin 02 rerunnable before Weapons 01; calling this RPC produces one clear
-- setup error until that storage file has been run. The definition and legacy
-- unscaled shop cost are saved atomically in the caller's transaction.
create or replace function public.save_outpost_zero_weapon_definition(
  p_weapon_key text,p_stats jsonb,p_price integer,p_published boolean
)
returns table(weapon_key text,stats jsonb,price integer,published boolean,updated_by text,updated_at timestamptz)
language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare
  v_role text:=public._outpost_zero_admin_role();v_key text:=lower(btrim(coalesce(p_weapon_key,'')));
  v_stats jsonb:='{}'::jsonb;v_field text;v_json jsonb;v_number numeric;v_integer integer;
  v_actor_label text;v_saved_stats jsonb;v_saved_price integer;v_saved_published boolean;
  v_saved_by text;v_saved_at timestamptz;
begin
  if v_role not in ('creator','main') then
    raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';end if;
  if to_regclass('public.weapon_defs') is null or to_regclass('public.weapon_prices') is null then
    raise exception using errcode='55000',message='RUN_WEAPONS_01_BEFORE_SAVING_WEAPONS';end if;
  if v_key not in (
    'ar','smg','shotgun','sniper','solarrifle','fireworks','warpwave','railgun',
    'm9','revolver','g18','volt','dart','timeturner',
    'chainsaw','knife','scythe','hammer','twinsai','bdaggers','terafists',
    'medkit','grenade','freezer','redball','beachball','turret','portal','timecapsule'
  ) then raise exception using errcode='22023',message='VALID_WEAPON_KEY_REQUIRED';end if;
  if p_published is null then raise exception using errcode='22023',message='PUBLISHED_STATE_REQUIRED';end if;
  if p_published and v_key in ('warpwave','timeturner','terafists','portal') then
    raise exception using errcode='22023',message='NEXT_SEASON_WEAPONS_CANNOT_BE_PUBLISHED';end if;
  if p_price is not null and p_price not between 0 and 9999 then
    raise exception using errcode='22023',message='WEAPON_PRICE_MUST_BE_0_TO_9999';end if;
  if p_stats is null or jsonb_typeof(p_stats)<>'object' or pg_column_size(p_stats)>2048 then
    raise exception using errcode='22023',message='WEAPON_STATS_MUST_BE_A_SMALL_OBJECT';end if;

  for v_field,v_json in select e.key,e.value from jsonb_each(p_stats) e loop
    if v_field not in ('dmg','fireRate','mag','reload','range','pellets','pierce') then
      raise exception using errcode='22023',message='UNKNOWN_WEAPON_STAT';end if;
    if jsonb_typeof(v_json)<>'number' or v_json::text !~ '^[0-9]{1,6}$' then
      raise exception using errcode='22023',message='WEAPON_STATS_MUST_BE_INTEGERS';end if;
    v_number:=(v_json::text)::numeric;
    if (v_field='dmg' and v_number not between 1 and 9999)
       or (v_field='fireRate' and v_number not between 40 and 3000)
       or (v_field='mag' and v_number not between 1 and 500)
       or (v_field='reload' and v_number not between 0 and 6000)
       or (v_field='range' and v_number not between 20 and 99999)
       or (v_field='pellets' and v_number not between 1 and 20)
       or (v_field='pierce' and v_number not between 0 and 20) then
      raise exception using errcode='22023',message='WEAPON_STAT_OUT_OF_RANGE';end if;
    v_integer:=v_number::integer;
    v_stats:=v_stats||jsonb_build_object(v_field,v_integer);
  end loop;

  select p.handle into v_actor_label from public.social_profiles p where p.user_id=auth.uid();
  if v_actor_label is null or v_actor_label !~ '^[A-Za-z0-9_]{3,32}$' then v_actor_label:=upper(v_role);end if;
  execute $sql$
    insert into public.weapon_defs(key,stats,price,published,updated_by,updated_at)
    values($1,$2,null,$3,$4,clock_timestamp())
    on conflict(key) do update set stats=excluded.stats,price=null,published=excluded.published,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at
    returning stats,published,updated_by,updated_at
  $sql$ into v_saved_stats,v_saved_published,v_saved_by,v_saved_at
  using v_key,v_stats,p_published,v_actor_label;
  if p_price is not null then
    execute $sql$
      insert into public.weapon_prices(key,cost,updated_at) values($1,$2,clock_timestamp())
      on conflict(key) do update set cost=excluded.cost,updated_at=excluded.updated_at
    $sql$ using v_key,p_price;
  end if;
  execute 'select p.cost from public.weapon_prices p where p.key=$1' into v_saved_price using v_key;
  perform public._outpost_zero_write_admin_audit(null,'weapon.definition.edit','applied',
    jsonb_build_object('weapon_key',v_key,'stats',v_stats,'price_cost',v_saved_price,'published',v_saved_published),null);
  return query select v_key,v_saved_stats,v_saved_price,v_saved_published,v_saved_by,v_saved_at;
end;
$function$;

-- Existing projects may still have Weapons 01's former direct-write policy
-- and column grants. Tighten those tables now when present, while preserving
-- Admin 02's ability to install before Weapons 01 on a fresh project.
do $weapon_write_boundary$
declare v_table text;v_policy record;v_column_grant record;v_grantee_sql text;
begin
  foreach v_table in array array['weapon_defs','weapon_prices'] loop
    if to_regclass('public.'||v_table) is null then continue;end if;
    for v_policy in
      select p.policyname from pg_catalog.pg_policies p
      where p.schemaname='public' and p.tablename=v_table and p.cmd<>'SELECT'
    loop
      execute format('drop policy %I on public.%I',v_policy.policyname,v_table);
    end loop;
    execute format(
      'revoke insert,update,delete,truncate,references,trigger on table public.%I from public,anon,authenticated',
      v_table
    );
    -- Legacy Weapons 01 used column-level INSERT/UPDATE grants; a table-level
    -- REVOKE alone does not reliably remove those independent privileges.
    for v_column_grant in
      select cp.grantee,cp.privilege_type,cp.column_name
      from information_schema.column_privileges cp
      where cp.table_schema='public' and cp.table_name=v_table
        and cp.grantee in ('PUBLIC','anon','authenticated')
        and cp.privilege_type in ('INSERT','UPDATE','REFERENCES')
    loop
      v_grantee_sql:=case when v_column_grant.grantee='PUBLIC' then 'public'
                          else quote_ident(v_column_grant.grantee) end;
      execute format('revoke %s (%I) on table public.%I from %s',
        v_column_grant.privilege_type,v_column_grant.column_name,v_table,v_grantee_sql);
    end loop;
  end loop;
end;
$weapon_write_boundary$;

-- Public-username browser boundary. The admins table intentionally keeps its
-- private Auth email compatibility key, but no roster or management RPC below
-- returns or accepts that key.
create or replace function public._outpost_zero_staff_target_email_for_username(p_username text)
returns text
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $function$
declare v_key text:=lower(btrim(coalesce(p_username,'')));v_email text;
begin
  if public._outpost_zero_staff_role() not in ('creator','main') then
    raise exception 'creator or main-admin access required' using errcode='42501';
  end if;
  if v_key !~ '^[a-z0-9_]{3,32}$' then return null;end if;
  select lower(btrim(u.email)) into v_email
  from public.social_profiles sp join auth.users u on u.id=sp.user_id
  where sp.handle_key=v_key
    and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
    and sp.handle_key not in ('username_not_set','usernamenotset')
    and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),20)
    and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),8)
  limit 1;
  return v_email;
end;
$function$;

create or replace function public.list_outpost_zero_admin_roster_by_username()
returns table(username text,role text,is_self boolean)
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $function$
declare v_actor_role text:=public._outpost_zero_staff_role();
begin
  if v_actor_role='' then return;end if;
  return query
  select sp.handle::text,
         case when u.id=public._outpost_zero_creator_user_id() then 'creator'
              else lower(btrim(a.role)) end::text,
         (u.id=auth.uid())::boolean
  from auth.users u
  left join public.admins a on lower(btrim(a.email))=lower(btrim(u.email))
  left join public.social_profiles sp on sp.user_id=u.id
    and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
    and sp.handle_key not in ('username_not_set','usernamenotset')
    and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),20)
    and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),8)
  where (u.id=public._outpost_zero_creator_user_id()
         or lower(btrim(coalesce(a.role,''))) in ('main','co','tester'))
    and (v_actor_role in ('creator','main') or u.id=auth.uid())
  order by case when u.id=public._outpost_zero_creator_user_id() then 0
                when lower(btrim(a.role))='main' then 1
                when lower(btrim(a.role))='co' then 2 else 3 end,
           lower(coalesce(sp.handle,''));
end;
$function$;

create or replace function public.add_outpost_zero_admin_by_username(
  p_username text,p_role text default 'tester'
)
returns table(username text,role text)
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $function$
declare v_email text:=public._outpost_zero_staff_target_email_for_username(p_username);v_row record;
begin
  if v_email is null then
    raise exception 'chosen username was not found' using errcode='22023';
  end if;
  select * into v_row from public.add_outpost_zero_admin(v_email,p_role) limit 1;
  return query select btrim(p_username)::text,v_row.role::text;
end;
$function$;

create or replace function public.promote_outpost_zero_admin_by_username(p_username text)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare v_email text:=public._outpost_zero_staff_target_email_for_username(p_username);
begin return v_email is not null and public.promote_outpost_zero_admin(v_email);end;
$function$;

create or replace function public.demote_outpost_zero_admin_by_username(p_username text)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare v_email text:=public._outpost_zero_staff_target_email_for_username(p_username);
begin return v_email is not null and public.demote_outpost_zero_admin(v_email);end;
$function$;

create or replace function public.remove_outpost_zero_admin_by_username(p_username text)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare v_email text:=public._outpost_zero_staff_target_email_for_username(p_username);
begin return v_email is not null and public.remove_outpost_zero_admin(v_email);end;
$function$;

create or replace function public.list_outpost_zero_weapon_suggestions_by_username(
  p_limit integer default 40,p_status text default 'pending'
)
returns table(id bigint,author_username text,author_role text,weapon_key text,suggestion text,status text,created_at timestamptz,reviewer_note text,reviewed_at timestamptz)
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $function$
declare clean_status text:=lower(btrim(coalesce(p_status,'pending')));
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then
    raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';
  end if;
  if clean_status not in ('pending','approved','rejected') then
    raise exception using errcode='22023',message='INVALID_STATUS';
  end if;
  return query
  select s.id,coalesce(sp.handle,'STAFF')::text,s.author_role,s.weapon_key,
         s.suggestion,s.status,s.created_at,s.reviewer_note,s.reviewed_at
  from public.outpost_zero_weapon_suggestions s
  left join public.social_profiles sp on sp.user_id=s.author_user_id
    and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
    and sp.handle_key not in ('username_not_set','usernamenotset')
    and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),20)
    and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),8)
  where s.status=clean_status order by s.id desc
  limit least(greatest(coalesce(p_limit,40),1),100);
end;
$function$;

revoke all on function public._outpost_zero_staff_role() from public,anon,authenticated;
revoke all on function public._outpost_zero_staff_email() from public,anon,authenticated;
revoke all on function public.add_outpost_zero_admin(text,text) from public,anon,authenticated;
revoke all on function public.submit_outpost_zero_weapon_suggestion(text,text) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_weapon_suggestions(integer,text) from public,anon,authenticated;
revoke all on function public.review_outpost_zero_weapon_suggestion(bigint,text,text) from public,anon,authenticated;
revoke all on function public.save_outpost_zero_weapon_definition(text,jsonb,integer,boolean) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_admin_roster() from public,anon,authenticated;
revoke all on function public.add_outpost_zero_admin(text,text) from public,anon,authenticated;
revoke all on function public.promote_outpost_zero_admin(text) from public,anon,authenticated;
revoke all on function public.demote_outpost_zero_admin(text) from public,anon,authenticated;
revoke all on function public.remove_outpost_zero_admin(text) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_weapon_suggestions(integer,text) from public,anon,authenticated;
revoke all on function public._outpost_zero_staff_target_email_for_username(text) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_admin_roster_by_username() from public,anon,authenticated;
revoke all on function public.add_outpost_zero_admin_by_username(text,text) from public,anon,authenticated;
revoke all on function public.promote_outpost_zero_admin_by_username(text) from public,anon,authenticated;
revoke all on function public.demote_outpost_zero_admin_by_username(text) from public,anon,authenticated;
revoke all on function public.remove_outpost_zero_admin_by_username(text) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_weapon_suggestions_by_username(integer,text) from public,anon,authenticated;
grant execute on function public._outpost_zero_admin_role() to authenticated;
grant execute on function public._outpost_zero_staff_role() to authenticated;
grant execute on function public.submit_outpost_zero_weapon_suggestion(text,text) to authenticated;
grant execute on function public.review_outpost_zero_weapon_suggestion(bigint,text,text) to authenticated;
grant execute on function public.save_outpost_zero_weapon_definition(text,jsonb,integer,boolean) to authenticated;
grant execute on function public.list_outpost_zero_admin_roster_by_username() to authenticated;
grant execute on function public.add_outpost_zero_admin_by_username(text,text) to authenticated;
grant execute on function public.promote_outpost_zero_admin_by_username(text) to authenticated;
grant execute on function public.demote_outpost_zero_admin_by_username(text) to authenticated;
grant execute on function public.remove_outpost_zero_admin_by_username(text) to authenticated;
grant execute on function public.list_outpost_zero_weapon_suggestions_by_username(integer,text) to authenticated;
drop function if exists public.add_outpost_zero_co_admin(text);

-- Promo codes are guessed by the player and checked through one RPC; the code
-- catalog is never enumerable by players. One redemption row per account is
-- the only usage limit: every signed-in account may redeem a code once.
create table if not exists public.promo_codes(
  code text primary key,
  gems integer not null default 0 check(gems>=0),
  coins integer not null default 0 check(coins>=0),
  uses_max integer not null default 0 check(uses_max>=0),
  uses_count integer not null default 0 check(uses_count>=0),
  expires_at timestamptz,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.promo_redemptions(
  code text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default clock_timestamp(),
  primary key(code,user_id)
);
create table if not exists public.outpost_zero_promo_attempts(
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default clock_timestamp(),
  attempts smallint not null default 0 check(attempts between 0 and 12)
);
alter table public.promo_codes enable row level security;
alter table public.promo_codes force row level security;
alter table public.promo_redemptions enable row level security;
alter table public.promo_redemptions force row level security;
alter table public.outpost_zero_promo_attempts enable row level security;
alter table public.outpost_zero_promo_attempts force row level security;
do $promo_policies$ declare p record;begin
  for p in select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('promo_codes','promo_redemptions','outpost_zero_promo_attempts')
  loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);end loop;
end;$promo_policies$;
revoke all on table public.promo_codes,public.promo_redemptions,public.outpost_zero_promo_attempts from public,anon,authenticated;

-- Old promo snippets treated uses_max as one shared cap, so uses_max=1 let only
-- one person redeem. Retire those caps in place; the (code,user_id) key is the
-- exact per-account rule requested by the game.
update public.promo_codes set uses_max=0 where uses_max<>0;

create or replace function public.list_outpost_zero_promo_codes()
returns table(code text,gems integer,coins integer,uses_max integer,uses_count integer,expires_at timestamptz,active boolean)
language plpgsql stable security definer set search_path=pg_catalog,public
as $function$
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then raise exception 'main-admin access required' using errcode='42501';end if;
  return query select p.code,p.gems,p.coins,p.uses_max,p.uses_count,p.expires_at,p.active from public.promo_codes p order by p.code limit 100;
end;$function$;

create or replace function public.save_outpost_zero_promo_code(
  p_code text,p_gems integer,p_coins integer,p_uses_max integer,p_expires_at timestamptz
) returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare v_code text:=upper(btrim(coalesce(p_code,'')));v_role text:=public._outpost_zero_admin_role();
begin
  if v_role not in ('creator','main') then raise exception 'main-admin access required' using errcode='42501';end if;
  if v_code !~ '^[A-Z0-9_-]{3,24}$' then raise exception 'invalid promo code' using errcode='22023';end if;
  if char_length(v_code)<6 and not exists(select 1 from public.promo_codes p where p.code=v_code) then
    raise exception 'new promo codes need at least 6 characters' using errcode='22023';
  end if;
  if coalesce(p_gems,0) not between 0 and 99999 or coalesce(p_coins,0) not between 0 and 999999
     or coalesce(p_gems,0)+coalesce(p_coins,0)=0 then
    raise exception 'invalid promo rewards' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-promo:'||v_code,0));
  insert into public.promo_codes(code,gems,coins,uses_max,expires_at,active,created_by)
  values(v_code,p_gems,p_coins,0,p_expires_at,true,upper(v_role))
  on conflict(code) do update set gems=excluded.gems,coins=excluded.coins,uses_max=0,expires_at=excluded.expires_at;
  return true;
end;$function$;

create or replace function public.set_outpost_zero_promo_active(p_code text,p_active boolean)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare n bigint;v_code text:=upper(btrim(coalesce(p_code,'')));
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then raise exception 'main-admin access required' using errcode='42501';end if;
  update public.promo_codes set active=coalesce(p_active,false),expires_at=case when p_active then null else clock_timestamp() end where code=v_code;
  get diagnostics n=row_count;return n=1;
end;$function$;

create or replace function public.delete_outpost_zero_promo_code(p_code text)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare n bigint;v_code text:=upper(btrim(coalesce(p_code,'')));
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then raise exception 'main-admin access required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-promo:'||v_code,0));
  delete from public.promo_redemptions where code=v_code;
  delete from public.promo_codes where code=v_code;get diagnostics n=row_count;return n=1;
end;$function$;

create or replace function public.redeem_promo(p_code text)
returns table(ok boolean,gems integer,coins integer,reason text)
language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare c public.promo_codes%rowtype;uid uuid:=auth.uid();prof jsonb;inserted bigint;v_code text:=upper(btrim(coalesce(p_code,'')));
  attempt_row public.outpost_zero_promo_attempts%rowtype;attempt_now timestamptz:=clock_timestamp();
begin
  if uid is null then return query select false,0,0,'sign in to redeem a code'::text;return;end if;
  if v_code !~ '^[A-Z0-9_-]{3,24}$' then return query select false,0,0,'that code is not valid'::text;return;end if;
  insert into public.outpost_zero_promo_attempts(user_id) values(uid) on conflict(user_id) do nothing;
  select a.* into strict attempt_row from public.outpost_zero_promo_attempts a where a.user_id=uid for update;
  if attempt_row.window_started_at<=attempt_now-interval '5 minutes' then
    update public.outpost_zero_promo_attempts set window_started_at=attempt_now,attempts=1 where user_id=uid;
  elsif attempt_row.attempts>=12 then
    return query select false,0,0,'too many attempts — try again in a few minutes'::text;return;
  else
    update public.outpost_zero_promo_attempts set attempts=attempts+1 where user_id=uid;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-promo:'||v_code,0));
  select * into c from public.promo_codes p where p.code=v_code for update;
  if not found then return query select false,0,0,'that code is not available'::text;return;end if;
  if not c.active or (c.expires_at is not null and c.expires_at<=clock_timestamp()) then return query select false,0,0,'that code is not available'::text;return;end if;
  insert into public.promo_redemptions(code,user_id) values(c.code,uid) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted<>1 then return query select false,0,0,'you already used that code'::text;return;end if;
  update public.promo_codes set uses_count=uses_count+1 where code=c.code;
  insert into public.profiles(user_id,data) values(uid,'{}'::jsonb) on conflict(user_id) do nothing;
  select coalesce(p.data,'{}'::jsonb) into prof from public.profiles p where p.user_id=uid for update;
  prof:=jsonb_set(prof,'{gems}',to_jsonb((case when coalesce(prof->>'gems','')~'^[0-9]+$' then (prof->>'gems')::integer else 0 end)+c.gems));
  prof:=jsonb_set(prof,'{coins}',to_jsonb((case when coalesce(prof->>'coins','')~'^[0-9]+$' then (prof->>'coins')::integer else 0 end)+c.coins));
  update public.profiles set data=prof,updated_at=clock_timestamp() where user_id=uid;
  return query select true,c.gems,c.coins,null::text;
end;$function$;

revoke all on function public.list_outpost_zero_promo_codes() from public,anon,authenticated;
revoke all on function public.save_outpost_zero_promo_code(text,integer,integer,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.set_outpost_zero_promo_active(text,boolean) from public,anon,authenticated;
revoke all on function public.delete_outpost_zero_promo_code(text) from public,anon,authenticated;
revoke all on function public.redeem_promo(text) from public,anon,authenticated;
grant execute on function public.list_outpost_zero_promo_codes() to authenticated;
grant execute on function public.save_outpost_zero_promo_code(text,integer,integer,integer,timestamptz) to authenticated;
grant execute on function public.set_outpost_zero_promo_active(text,boolean) to authenticated;
grant execute on function public.delete_outpost_zero_promo_code(text) to authenticated;
grant execute on function public.redeem_promo(text) to authenticated;

commit;
