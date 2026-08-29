-- OUTPOST ZERO / ADMIN 01: ADMIN MENU
-- Self-contained Admin Menu storage, audited actions, username tools, grants,
-- bans, appeals, requests, and the permanent creator/main audit LOG.
-- Run after Social 01 and the base profiles/scores tables. Safe to rerun.

begin;

-- Core rows required by the Admin Menu. Existing rows are never replaced.
create table if not exists public.admins(
  email text primary key,
  role text not null check(lower(btrim(role)) in ('main','co','tester')),
  created_at timestamptz default now()
);
alter table public.admins enable row level security;
alter table public.admins force row level security;
revoke all on table public.admins from public,anon,authenticated;

-- The creator is pinned to an Auth UUID, not an email. On the first run only,
-- resolve that UUID from the creator's public username. The saved UUID remains
-- authoritative if the creator later changes either username or login email.
create table if not exists public.outpost_zero_admin_config(
  singleton boolean primary key default true check(singleton),
  creator_user_id uuid not null unique references auth.users(id) on delete restrict,
  seeded_at timestamptz not null default clock_timestamp()
);
alter table public.outpost_zero_admin_config enable row level security;
alter table public.outpost_zero_admin_config force row level security;
revoke all on table public.outpost_zero_admin_config from public,anon,authenticated;

do $creator_seed$
declare v_creator uuid;
begin
  if not exists(select 1 from public.outpost_zero_admin_config where singleton) then
    select sp.user_id into v_creator
    from public.social_profiles sp
    where sp.handle_key='tmilsanmilla'
      and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
    order by sp.created_at asc limit 1;
    if v_creator is null then
      raise exception 'Set the creator public username to tmilsanmilla, then rerun Admin 01'
        using errcode='P0001';
    end if;
    insert into public.outpost_zero_admin_config(singleton,creator_user_id)
    values(true,v_creator) on conflict(singleton) do nothing;
  end if;
end;
$creator_seed$;

create or replace function public._outpost_zero_creator_user_id()
returns uuid
language sql
stable
security definer
set search_path=pg_catalog,public
as $function$
  select c.creator_user_id from public.outpost_zero_admin_config c
  where c.singleton limit 1
$function$;
revoke all on function public._outpost_zero_creator_user_id()
  from public,anon,authenticated;

create table if not exists public.bans(
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  device_id text,
  until timestamptz,
  note text,
  scopes jsonb not null default '["account"]'::jsonb,
  banned_by text,
  created_at timestamptz default now(),
  user_email text,
  check(jsonb_typeof(scopes)='array'),
  check(note is null or char_length(note)<=600)
);

create table if not exists public.player_requests(
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  requested_by text not null,
  target_email text not null,
  patch jsonb not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected','failed')),
  decided_by text,
  decided_at timestamptz,
  operation_id uuid,
  requester_user_id uuid references auth.users(id) on delete set null
);

-- Older installs created PostgreSQL's default constraint without `failed`,
-- which made a rejected permanent edit roll back the intended failure record.
alter table public.player_requests drop constraint if exists player_requests_status_check;
alter table public.player_requests add constraint player_requests_status_check
  check(status in ('pending','approved','rejected','failed'));

create table if not exists public.ban_appeals(
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  player_email text not null,
  message text not null check(char_length(message) between 1 and 600),
  status text not null default 'open' check(status in ('open','lifted','denied')),
  decided_by text,
  operation_id uuid,
  requester_user_id uuid references auth.users(id) on delete set null
);

alter table public.bans add column if not exists user_email text;
update public.bans b set user_email=lower(btrim(u.email))
from auth.users u where b.user_id=u.id and b.user_email is null;

alter table public.bans enable row level security;
alter table public.bans force row level security;
alter table public.player_requests enable row level security;
alter table public.player_requests force row level security;
alter table public.ban_appeals enable row level security;
alter table public.ban_appeals force row level security;

-- Remove every legacy direct policy. Narrow SECURITY DEFINER RPCs below are
-- the only supported browser boundary for bans, requests, and appeals.
do $policies$
declare item record;
begin
  for item in select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('bans','player_requests','ban_appeals')
  loop execute format('drop policy %I on %I.%I',item.policyname,item.schemaname,item.tablename);end loop;
end;
$policies$;
revoke all on table public.bans,public.player_requests,public.ban_appeals from public,anon,authenticated;

-- Active rows grant temporary access. Expired rows intentionally remain as
-- harmless history until they are replaced by a later grant. Every effective
-- read uses the database clock, so no cleanup job is required for expiry.
create table if not exists public.outpost_zero_weapon_grants (
  target_user_id uuid not null references auth.users(id) on delete cascade,
  weapon_key text not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_by_email text not null,
  granted_at timestamptz not null,
  expires_at timestamptz not null,
  note text not null default '',
  updated_at timestamptz not null,
  primary key (target_user_id, weapon_key),
  constraint outpost_zero_weapon_grants_weapon_allowlist check (
    weapon_key in (
      'ar', 'volt', 'dart', 'hammer', 'twinsai',
      'railgun', 'medkit', 'grenade', 'freezer'
    )
  ),
  constraint outpost_zero_weapon_grants_time_order
    check (expires_at > granted_at),
  constraint outpost_zero_weapon_grants_note_length
    check (char_length(note) <= 200),
  constraint outpost_zero_weapon_grants_actor_email_length
    check (char_length(granted_by_email) between 3 and 320)
);

create index if not exists outpost_zero_weapon_grants_active_target_idx
  on public.outpost_zero_weapon_grants (target_user_id, expires_at desc);

-- This is a new append-only log. The old player_log table, if installed, is
-- retained but retired below because its browser-readable actor/detail fields
-- were not a sufficiently narrow security boundary.
create table if not exists public.outpost_zero_admin_audit (
  event_id bigint generated always as identity primary key,
  operation_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text not null,
  actor_role text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text,
  action text not null,
  result text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint outpost_zero_admin_audit_actor_email_length
    check (char_length(actor_email) between 3 and 320),
  constraint outpost_zero_admin_audit_target_email_length
    check (target_email is null or char_length(target_email) between 3 and 320),
  constraint outpost_zero_admin_audit_actor_role
    check (actor_role in ('creator', 'main', 'co', 'player')),
  constraint outpost_zero_admin_audit_action_length
    check (char_length(action) between 3 and 64),
  constraint outpost_zero_admin_audit_result_length
    check (char_length(result) between 2 and 32),
  constraint outpost_zero_admin_audit_details_object
    check (jsonb_typeof(details) = 'object'),
  constraint outpost_zero_admin_audit_details_size
    check (pg_column_size(details) <= 4096)
);

-- Reruns upgrade the preview constraint without touching audit rows.
alter table public.outpost_zero_admin_audit
  drop constraint if exists outpost_zero_admin_audit_actor_role;
alter table public.outpost_zero_admin_audit
  add constraint outpost_zero_admin_audit_actor_role
  check (actor_role in ('creator', 'main', 'co', 'player'));

-- One operation id is admitted once per actor. The partial unique index keeps
-- non-retry audit events unrestricted while making ambiguous HTTP retries
-- exact-once for temporary grant/revoke operations.
create unique index if not exists outpost_zero_admin_audit_actor_operation_uidx
  on public.outpost_zero_admin_audit (actor_user_id, operation_id)
  where operation_id is not null;

create index if not exists outpost_zero_admin_audit_event_desc_idx
  on public.outpost_zero_admin_audit (event_id desc);

create index if not exists outpost_zero_admin_audit_target_event_idx
  on public.outpost_zero_admin_audit (target_user_id, event_id desc);

-- Retry receipts on the existing moderation queues. These nullable additions
-- preserve every old request/appeal row while letting the new RPCs admit one
-- browser operation exactly once.
alter table public.player_requests
  add column if not exists operation_id uuid,
  add column if not exists requester_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists player_requests_requester_operation_uidx
  on public.player_requests (requester_user_id, operation_id)
  where requester_user_id is not null and operation_id is not null;

alter table public.ban_appeals
  add column if not exists operation_id uuid,
  add column if not exists requester_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists ban_appeals_requester_operation_uidx
  on public.ban_appeals (requester_user_id, operation_id)
  where requester_user_id is not null and operation_id is not null;

alter table public.outpost_zero_weapon_grants enable row level security;
alter table public.outpost_zero_weapon_grants force row level security;
alter table public.outpost_zero_admin_audit enable row level security;
alter table public.outpost_zero_admin_audit force row level security;
alter table public.player_requests enable row level security;
alter table public.ban_appeals enable row level security;

-- No direct policies are intentional. SECURITY DEFINER functions below own
-- all allowed access and always reduce it to auth.uid() or a verified admin.
revoke all on table public.outpost_zero_weapon_grants
  from public, anon, authenticated;
revoke all on table public.outpost_zero_admin_audit
  from public, anon, authenticated;
revoke all on sequence public.outpost_zero_admin_audit_event_id_seq
  from public, anon, authenticated;

-- Resolve the role entirely from server-owned state. The signed JWT supplies
-- auth.uid(), but the email itself is reread from auth.users. A stale or
-- caller-edited browser value can never grant authority.
create or replace function public._outpost_zero_admin_role()
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

  if v_user_id = public._outpost_zero_creator_user_id() then
    return 'creator';
  end if;

  if to_regclass('public.admins') is null then
    return '';
  end if;

  execute
    'select lower(btrim(coalesce(a.role, '''')))
       from public.admins as a
      where lower(btrim(a.email)) = $1
      order by case lower(btrim(coalesce(a.role, '''')))
        when ''main'' then 0 when ''co'' then 1 else 2 end
      limit 1'
    into v_role
    using v_email;

  if v_role in ('main', 'co') then
    return v_role;
  end if;
  return '';
exception
  -- A missing/differently shaped admins table must fail closed.
  when others then return '';
end;
$function$;

create or replace function public._outpost_zero_is_admin_main()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select public._outpost_zero_admin_role() in ('creator', 'main')
$function$;

-- Internal append helper. Actor and target emails are always canonical Auth
-- values. Oversized internal detail is replaced, never truncated into invalid
-- JSON. No browser role can execute this helper directly.
create or replace function public._outpost_zero_write_admin_audit(
  p_target_user_id uuid,
  p_action text,
  p_result text,
  p_details jsonb default '{}'::jsonb,
  p_operation_id uuid default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_email text;
  v_actor_role text := public._outpost_zero_admin_role();
  v_target_email text;
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_event_id bigint;
begin
  if v_actor_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- The helper itself is not browser-executable. Allowing the server-owned
  -- appeal RPC to record its signed-in player does not grant that player any
  -- ability to choose actor, role, action, or details.
  if v_actor_role = '' then
    v_actor_role := 'player';
  end if;
  if p_action is null or char_length(p_action) not between 3 and 64
     or p_result is null or char_length(p_result) not between 2 and 32 then
    raise exception 'invalid audit action/result' using errcode = '22023';
  end if;
  if jsonb_typeof(v_details) <> 'object' then
    raise exception 'audit details must be an object' using errcode = '22023';
  end if;

  select lower(btrim(u.email)) into strict v_actor_email
  from auth.users as u where u.id = v_actor_user_id;

  if p_target_user_id is not null then
    select lower(btrim(u.email)) into v_target_email
    from auth.users as u where u.id = p_target_user_id;
  end if;

  if pg_column_size(v_details) > 4096 then
    v_details := jsonb_build_object(
      'summary', 'details omitted because they exceeded the 4 KB audit limit',
      'original_bytes', pg_column_size(v_details)
    );
  end if;

  insert into public.outpost_zero_admin_audit (
    operation_id, actor_user_id, actor_email, actor_role,
    target_user_id, target_email, action, result, details
  ) values (
    p_operation_id, v_actor_user_id, v_actor_email, v_actor_role,
    p_target_user_id, v_target_email, p_action, p_result, v_details
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$function$;

revoke all on function public._outpost_zero_admin_role()
  from public, anon, authenticated;
revoke all on function public._outpost_zero_is_admin_main()
  from public, anon, authenticated;
revoke all on function public._outpost_zero_write_admin_audit(uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;

-- Compatibility implementations used only by the audited Admin 01 wrapper.
-- They independently check the caller and are never browser-executable.
create or replace function public.admin_role()
returns text language sql stable security definer set search_path=pg_catalog,public
as $function$ select public._outpost_zero_admin_role() $function$;

create or replace function public.admin_get_player(target_email text)
returns table(score int,gems int,coins int,owned jsonb,pow jsonb,ban jsonb)
language plpgsql stable security definer set search_path=pg_catalog,public
as $function$
declare uid uuid;profile_data jsonb;
begin
  if public._outpost_zero_admin_role() not in ('creator','main','co') then
    raise exception using errcode='42501',message='ADMIN_ACCESS_REQUIRED';
  end if;
  select u.id into uid from auth.users u where lower(btrim(u.email))=lower(btrim(target_email)) limit 1;
  if uid is null then return;end if;
  select coalesce(p.data,'{}'::jsonb) into profile_data from public.profiles p where p.user_id=uid;
  profile_data:=coalesce(profile_data,'{}'::jsonb);
  return query select
    coalesce((select s.score from public.scores s where s.user_id=uid and s.game='outpost-zero'),0)::int,
    case when coalesce(profile_data->>'gems','') ~ '^[0-9]+$' then (profile_data->>'gems')::int else 0 end,
    case when coalesce(profile_data->>'coins','') ~ '^[0-9]+$' then (profile_data->>'coins')::int else 0 end,
    case when jsonb_typeof(profile_data->'owned')='object' then profile_data->'owned' else '{}'::jsonb end,
    case when jsonb_typeof(profile_data->'pow')='object' then profile_data->'pow' else '{}'::jsonb end,
    (select jsonb_build_object('until',b.until,'note',b.note,'scopes',b.scopes,'created_at',b.created_at)
       from public.bans b where b.user_id=uid and (b.until is null or b.until>statement_timestamp()) order by b.id desc limit 1);
end;
$function$;

create or replace function public.admin_edit_player(target_email text,patch jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare uid uuid;profile_data jsonb;item text;ban_value text;scope_value jsonb;device_value text;actor_role text:=public._outpost_zero_admin_role();
begin
  if actor_role not in ('creator','main') then raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';end if;
  if jsonb_typeof(coalesce(patch,'{}'::jsonb))<>'object' then raise exception using errcode='22023',message='PATCH_OBJECT_REQUIRED';end if;
  select u.id into uid from auth.users u where lower(btrim(u.email))=lower(btrim(target_email)) limit 1;
  if uid is null then return false;end if;
  if uid=auth.uid() and patch ? 'ban' and coalesce(patch->>'ban','')<>'unban' then
    raise exception using errcode='22023',message='SELF_BAN_FORBIDDEN';
  end if;
  if patch ? 'score' then
    insert into public.scores(user_id,game,name,score) values(uid,'outpost-zero','PLAYER',greatest(0,least(99999999,(patch->>'score')::int)))
    on conflict(user_id,game) do update set score=excluded.score,updated_at=now();
  end if;
  if patch ?| array['gems','coins','grant','revoke','pow'] then
    insert into public.profiles(user_id,data) values(uid,'{}'::jsonb) on conflict(user_id) do nothing;
    select coalesce(p.data,'{}'::jsonb) into profile_data from public.profiles p where p.user_id=uid for update;
    if patch ? 'gems' then profile_data:=jsonb_set(profile_data,'{gems}',to_jsonb(greatest(0,(patch->>'gems')::int)));end if;
    if patch ? 'coins' then profile_data:=jsonb_set(profile_data,'{coins}',to_jsonb(greatest(0,(patch->>'coins')::int)));end if;
    if patch ? 'pow' then profile_data:=jsonb_set(profile_data,'{pow}',patch->'pow');end if;
    if jsonb_typeof(profile_data->'owned')<>'object' then profile_data:=jsonb_set(profile_data,'{owned}','{}'::jsonb);end if;
    for item in select jsonb_array_elements_text(coalesce(patch->'grant','[]'::jsonb)) loop
      profile_data:=jsonb_set(profile_data,array['owned',item],'true'::jsonb);
    end loop;
    for item in select jsonb_array_elements_text(coalesce(patch->'revoke','[]'::jsonb)) loop
      profile_data:=jsonb_set(profile_data,'{owned}',(profile_data->'owned')-item);
    end loop;
    update public.profiles set data=profile_data,updated_at=now() where user_id=uid;
  end if;
  ban_value:=patch->>'ban';
  if ban_value is not null then
    scope_value:=coalesce(patch->'scopes','["account"]'::jsonb);
    if jsonb_typeof(scope_value)<>'array' then raise exception using errcode='22023',message='BAN_SCOPES_ARRAY_REQUIRED';end if;
    select p.data->>'device' into device_value from public.profiles p where p.user_id=uid;
    delete from public.bans b where b.user_id=uid or (device_value is not null and b.device_id=device_value);
    if ban_value<>'unban' then
      insert into public.bans(user_id,user_email,device_id,until,note,scopes,banned_by)
      values(case when scope_value ? 'device' and not(scope_value ? 'account') and not(scope_value ? 'leaderboard') then null else uid end,
        lower(btrim(target_email)),case when scope_value ? 'device' then device_value end,
        case when ban_value='perm' then null else statement_timestamp()+((ban_value)::int||' days')::interval end,
        nullif(btrim(coalesce(patch->>'note','')),''),scope_value,
        (select lower(btrim(u.email)) from auth.users u where u.id=auth.uid()));
    end if;
  end if;
  return true;
end;
$function$;

revoke all on function public.admin_role() from public,anon;
grant execute on function public.admin_role() to authenticated;
revoke all on function public.admin_get_player(text) from public,anon,authenticated;
revoke all on function public.admin_edit_player(text,jsonb) from public,anon,authenticated;

-- Signed-in players can read only their own active temporary grants. Returning
-- server_now lets the client build a monotonic in-session countdown without
-- trusting a device wall clock.
create or replace function public.get_my_outpost_zero_weapon_grants()
returns table (
  weapon_key text,
  expires_at timestamptz,
  server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  select g.weapon_key, g.expires_at, v_now
  from public.outpost_zero_weapon_grants as g
  where g.target_user_id = v_user_id
    and g.expires_at > v_now
  order by g.expires_at, g.weapon_key;
end;
$function$;

-- Admin player lookup calls this separately from admin_get_player. Temporary
-- grants deliberately are not folded into profiles.data.owned.
create or replace function public.admin_list_outpost_zero_weapon_grants(
  p_target_email text
)
returns table (
  weapon_key text,
  granted_at timestamptz,
  expires_at timestamptz,
  granted_by_email text,
  server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_target_user_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public._outpost_zero_is_admin_main() then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;

  select u.id into v_target_user_id
  from auth.users as u
  where lower(btrim(u.email)) = lower(btrim(coalesce(p_target_email, '')))
  limit 1;

  if v_target_user_id is null then
    return;
  end if;

  return query
  select g.weapon_key, g.granted_at, g.expires_at, g.granted_by_email, v_now
  from public.outpost_zero_weapon_grants as g
  where g.target_user_id = v_target_user_id
    and g.expires_at > v_now
  order by g.expires_at, g.weapon_key;
end;
$function$;

-- Create or extend a temporary weapon grant. It never shortens an active
-- grant. The required operation UUID makes retries exact-once: a repeated
-- request returns the first result and cannot move expiry a second time.
create or replace function public.admin_set_outpost_zero_weapon_grant(
  p_target_email text,
  p_weapon_key text,
  p_duration_minutes integer,
  p_note text,
  p_operation_id uuid
)
returns table (
  accepted boolean,
  reason text,
  weapon_key text,
  expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_email text;
  v_target_user_id uuid;
  v_weapon_key text := lower(btrim(coalesce(p_weapon_key, '')));
  v_note text := btrim(coalesce(p_note, ''));
  v_now timestamptz := clock_timestamp();
  v_requested_expiry timestamptz;
  v_previous_expiry timestamptz;
  v_final_expiry timestamptz;
  v_action text;
  v_reason text;
  v_target_key text := md5(lower(btrim(coalesce(p_target_email, ''))));
  v_request_fingerprint text := md5(
    lower(btrim(coalesce(p_target_email, ''))) || E'\n' ||
    lower(btrim(coalesce(p_weapon_key, ''))) || E'\n' ||
    coalesce(p_duration_minutes::text, '') || E'\n' ||
    btrim(coalesce(p_note, ''))
  );
  v_prior public.outpost_zero_admin_audit%rowtype;
begin
  if not public._outpost_zero_is_admin_main() then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'operation id is required' using errcode = '22004';
  end if;

  select a.* into v_prior
  from public.outpost_zero_admin_audit as a
  where a.actor_user_id = v_actor_user_id
    and a.operation_id = p_operation_id;

  if found then
    if v_prior.details ->> 'operation' = 'set'
       and v_prior.details ->> 'request_fingerprint' = v_request_fingerprint then
      return query select
        coalesce((v_prior.details ->> 'accepted')::boolean, false),
        coalesce(v_prior.details ->> 'reason', v_prior.result),
        v_weapon_key,
        nullif(v_prior.details ->> 'expires_at', '')::timestamptz;
      return;
    end if;
    return query select false, 'operation_conflict'::text, v_weapon_key, null::timestamptz;
    return;
  end if;

  if v_weapon_key not in (
    'ar', 'volt', 'dart', 'hammer', 'twinsai',
    'railgun', 'medkit', 'grenade', 'freezer'
  ) then
    raise exception 'unknown weapon key' using errcode = '22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 5
     or p_duration_minutes > 525600 then
    raise exception 'duration must be between 5 and 525600 minutes'
      using errcode = '22023';
  end if;
  if char_length(v_note) > 200 then
    raise exception 'note must be at most 200 characters' using errcode = '22023';
  end if;

  select u.id into v_target_user_id
  from auth.users as u
  where lower(btrim(u.email)) = lower(btrim(coalesce(p_target_email, '')))
  limit 1;

  if v_target_user_id is null then
    perform public._outpost_zero_write_admin_audit(
      null, 'temporary_weapon.grant', 'rejected',
      jsonb_build_object(
        'operation', 'set', 'target_key', v_target_key,
        'request_fingerprint', v_request_fingerprint,
        'accepted', false, 'weapon_key', v_weapon_key,
        'duration_minutes', p_duration_minutes, 'reason', 'target_not_found'
      ), p_operation_id
    );
    return query select false, 'target_not_found'::text, v_weapon_key, null::timestamptz;
    return;
  end if;

  select lower(btrim(u.email)) into strict v_actor_email
  from auth.users as u where u.id = v_actor_user_id;

  -- SELECT FOR UPDATE cannot lock a missing row. This lock serializes both
  -- first grants and later changes for precisely this target + weapon.
  perform pg_advisory_xact_lock(
    hashtextextended(v_target_user_id::text || ':' || v_weapon_key, 0)
  );
  v_now := clock_timestamp();

  -- A retry may have waited while the first operation committed.
  select a.* into v_prior
  from public.outpost_zero_admin_audit as a
  where a.actor_user_id = v_actor_user_id
    and a.operation_id = p_operation_id;
  if found then
    if v_prior.details ->> 'operation' = 'set'
       and v_prior.details ->> 'request_fingerprint' = v_request_fingerprint then
      return query select
        coalesce((v_prior.details ->> 'accepted')::boolean, false),
        coalesce(v_prior.details ->> 'reason', v_prior.result),
        v_weapon_key,
        nullif(v_prior.details ->> 'expires_at', '')::timestamptz;
      return;
    end if;
    return query select false, 'operation_conflict'::text, v_weapon_key, null::timestamptz;
    return;
  end if;

  select g.expires_at into v_previous_expiry
  from public.outpost_zero_weapon_grants as g
  where g.target_user_id = v_target_user_id
    and g.weapon_key = v_weapon_key
  for update;

  v_requested_expiry := v_now + make_interval(mins => p_duration_minutes);

  if v_previous_expiry is null or v_previous_expiry <= v_now then
    v_final_expiry := v_requested_expiry;
    v_action := 'temporary_weapon.grant';
    v_reason := 'granted';
  elsif v_requested_expiry > v_previous_expiry then
    v_final_expiry := v_requested_expiry;
    v_action := 'temporary_weapon.extend';
    v_reason := 'extended';
  else
    v_final_expiry := v_previous_expiry;
    v_action := 'temporary_weapon.extend';
    v_reason := 'not_extended';
  end if;

  if v_reason <> 'not_extended' then
    insert into public.outpost_zero_weapon_grants as g (
      target_user_id, weapon_key, granted_by, granted_by_email,
      granted_at, expires_at, note, updated_at
    ) values (
      v_target_user_id, v_weapon_key, v_actor_user_id, v_actor_email,
      v_now, v_final_expiry, v_note, v_now
    )
    on conflict on constraint outpost_zero_weapon_grants_pkey do update
    set granted_by = excluded.granted_by,
        granted_by_email = excluded.granted_by_email,
        granted_at = excluded.granted_at,
        expires_at = greatest(g.expires_at, excluded.expires_at),
        note = excluded.note,
        updated_at = excluded.updated_at
    returning g.expires_at into v_final_expiry;
  end if;

  perform public._outpost_zero_write_admin_audit(
    v_target_user_id, v_action,
    case when v_reason = 'not_extended' then 'no_change' else 'applied' end,
    jsonb_strip_nulls(jsonb_build_object(
      'operation', 'set',
      'target_key', v_target_key,
      'request_fingerprint', v_request_fingerprint,
      'accepted', true,
      'weapon_key', v_weapon_key,
      'duration_minutes', p_duration_minutes,
      'previous_expires_at', v_previous_expiry,
      'expires_at', v_final_expiry,
      'note', nullif(v_note, ''),
      'reason', v_reason
    )),
    p_operation_id
  );

  return query select true, v_reason,
    v_weapon_key, v_final_expiry;
exception
  -- Two first grants can race before either row exists. Let the transaction
  -- retry report a deterministic conflict instead of silently duplicating an
  -- audit entry. A normal HTTP retry with the same operation id then resolves
  -- through the receipt branch above.
  when unique_violation then
    return query select false, 'operation_in_progress'::text,
      v_weapon_key, null::timestamptz;
end;
$function$;

-- Revoke an active temporary grant immediately. A missing/expired grant is an
-- idempotent no-change result and is still auditable once per operation UUID.
create or replace function public.admin_revoke_outpost_zero_weapon_grant(
  p_target_email text,
  p_weapon_key text,
  p_note text,
  p_operation_id uuid
)
returns table (
  accepted boolean,
  reason text,
  weapon_key text,
  expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_target_user_id uuid;
  v_weapon_key text := lower(btrim(coalesce(p_weapon_key, '')));
  v_note text := btrim(coalesce(p_note, ''));
  v_now timestamptz := clock_timestamp();
  v_previous_expiry timestamptz;
  v_reason text;
  v_target_key text := md5(lower(btrim(coalesce(p_target_email, ''))));
  v_request_fingerprint text := md5(
    lower(btrim(coalesce(p_target_email, ''))) || E'\n' ||
    lower(btrim(coalesce(p_weapon_key, ''))) || E'\n' ||
    btrim(coalesce(p_note, ''))
  );
  v_prior public.outpost_zero_admin_audit%rowtype;
begin
  if not public._outpost_zero_is_admin_main() then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'operation id is required' using errcode = '22004';
  end if;

  select a.* into v_prior
  from public.outpost_zero_admin_audit as a
  where a.actor_user_id = v_actor_user_id
    and a.operation_id = p_operation_id;

  if found then
    if v_prior.details ->> 'operation' = 'revoke'
       and v_prior.details ->> 'request_fingerprint' = v_request_fingerprint then
      return query select
        coalesce((v_prior.details ->> 'accepted')::boolean, false),
        coalesce(v_prior.details ->> 'reason', v_prior.result),
        v_weapon_key,
        null::timestamptz;
      return;
    end if;
    return query select false, 'operation_conflict'::text, v_weapon_key, null::timestamptz;
    return;
  end if;

  if v_weapon_key not in (
    'ar', 'volt', 'dart', 'hammer', 'twinsai',
    'railgun', 'medkit', 'grenade', 'freezer'
  ) then
    raise exception 'unknown weapon key' using errcode = '22023';
  end if;
  if char_length(v_note) > 200 then
    raise exception 'note must be at most 200 characters' using errcode = '22023';
  end if;

  select u.id into v_target_user_id
  from auth.users as u
  where lower(btrim(u.email)) = lower(btrim(coalesce(p_target_email, '')))
  limit 1;

  if v_target_user_id is null then
    perform public._outpost_zero_write_admin_audit(
      null, 'temporary_weapon.revoke', 'rejected',
      jsonb_build_object(
        'operation', 'revoke', 'target_key', v_target_key,
        'request_fingerprint', v_request_fingerprint,
        'accepted', false, 'weapon_key', v_weapon_key,
        'reason', 'target_not_found'
      ), p_operation_id
    );
    return query select false, 'target_not_found'::text, v_weapon_key, null::timestamptz;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_target_user_id::text || ':' || v_weapon_key, 0)
  );
  v_now := clock_timestamp();

  select a.* into v_prior
  from public.outpost_zero_admin_audit as a
  where a.actor_user_id = v_actor_user_id
    and a.operation_id = p_operation_id;
  if found then
    if v_prior.details ->> 'operation' = 'revoke'
       and v_prior.details ->> 'request_fingerprint' = v_request_fingerprint then
      return query select
        coalesce((v_prior.details ->> 'accepted')::boolean, false),
        coalesce(v_prior.details ->> 'reason', v_prior.result),
        v_weapon_key,
        null::timestamptz;
      return;
    end if;
    return query select false, 'operation_conflict'::text, v_weapon_key, null::timestamptz;
    return;
  end if;

  select g.expires_at into v_previous_expiry
  from public.outpost_zero_weapon_grants as g
  where g.target_user_id = v_target_user_id
    and g.weapon_key = v_weapon_key
  for update;

  if v_previous_expiry is not null and v_previous_expiry > v_now then
    delete from public.outpost_zero_weapon_grants as g
    where g.target_user_id = v_target_user_id
      and g.weapon_key = v_weapon_key;
    v_reason := 'revoked';
  else
    v_reason := 'not_active';
  end if;

  perform public._outpost_zero_write_admin_audit(
    v_target_user_id, 'temporary_weapon.revoke',
    case when v_reason = 'revoked' then 'applied' else 'no_change' end,
    jsonb_strip_nulls(jsonb_build_object(
      'operation', 'revoke',
      'target_key', v_target_key,
      'request_fingerprint', v_request_fingerprint,
      'accepted', true,
      'weapon_key', v_weapon_key,
      'previous_expires_at', v_previous_expiry,
      'note', nullif(v_note, ''),
      'reason', v_reason
    )),
    p_operation_id
  );

  return query select true, v_reason,
    v_weapon_key, null::timestamptz;
end;
$function$;

-- One validation routine is shared by direct edits and queued requests. A
-- malformed request can never enter the approval queue only to fail later.
create or replace function public._outpost_zero_validate_admin_patch(p_patch jsonb)
returns void
language plpgsql
immutable
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
        select 1 from jsonb_array_elements(p_patch -> v_key) as e(value)
        where jsonb_typeof(e.value) <> 'string'
           or trim(both '"' from e.value::text) not in (
             'ar', 'volt', 'dart', 'hammer', 'twinsai',
             'railgun', 'medkit', 'grenade', 'freezer'
           )
      ) then
        raise exception '% contains an unknown weapon key', v_key using errcode = '22023';
      end if;
    end if;
  end loop;
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

-- The new player-edit boundary validates a small patch, calls the already
-- installed admin_edit_player RPC, compares actual before/after rows, and
-- writes category-specific audit events in the same transaction. It does not
-- trust patch text as proof that a mutation occurred.
-- Remove the short-lived two-argument preview signature if it was installed;
-- every mutation now carries an exact-once operation receipt.
drop function if exists public.outpost_zero_admin_edit_player(text, jsonb);

create or replace function public.outpost_zero_admin_edit_player(
  p_target_email text,
  p_patch jsonb,
  p_operation_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_target_user_id uuid;
  v_target_email text;
  v_before_profile jsonb := '{}'::jsonb;
  v_after_profile jsonb := '{}'::jsonb;
  v_before_score bigint;
  v_after_score bigint;
  v_before_bans jsonb := '[]'::jsonb;
  v_after_bans jsonb := '[]'::jsonb;
  v_legacy_ok boolean := false;
  v_changed boolean := false;
  v_granted text[] := array[]::text[];
  v_revoked text[] := array[]::text[];
  v_weapon text;
  v_unknown_key text;
  v_patch_keys text[];
  v_request_fingerprint text;
  v_prior public.outpost_zero_admin_audit%rowtype;
  v_actor_role text := public._outpost_zero_admin_role();
begin
  if v_actor_role not in ('creator', 'main') then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'operation id is required' using errcode = '22004';
  end if;
  perform public._outpost_zero_validate_admin_patch(p_patch);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or pg_column_size(p_patch) > 4096 then
    raise exception 'patch must be a JSON object no larger than 4 KB'
      using errcode = '22023';
  end if;

  select k into v_unknown_key
  from jsonb_object_keys(p_patch) as keys(k)
  where k not in ('score', 'gems', 'coins', 'pow', 'grant', 'revoke',
                  'ban', 'scopes', 'note')
  limit 1;
  if v_unknown_key is not null then
    raise exception 'unsupported player-edit field: %', v_unknown_key
      using errcode = '22023';
  end if;

  select coalesce(array_agg(k order by k), array[]::text[])
    into v_patch_keys
  from jsonb_object_keys(p_patch) as keys(k);
  v_request_fingerprint := md5(
    lower(btrim(coalesce(p_target_email, ''))) || E'\n' || p_patch::text
  );

  select a.* into v_prior
  from public.outpost_zero_admin_audit as a
  where a.actor_user_id = auth.uid()
    and a.operation_id = p_operation_id;
  if found then
    if v_prior.details ->> 'operation' = 'player_edit'
       and v_prior.details ->> 'request_fingerprint' = v_request_fingerprint then
      return coalesce((v_prior.details ->> 'accepted')::boolean, false);
    end if;
    return false;
  end if;

  if cardinality(v_patch_keys) = 0
     or (cardinality(v_patch_keys) = 1 and v_patch_keys[1] = 'note') then
    raise exception 'nothing to change' using errcode = '22023';
  end if;

  -- Bounds mirror the game editor; they are rechecked here before invoking
  -- legacy mutation code.
  if p_patch ? 'score' and (
      jsonb_typeof(p_patch -> 'score') <> 'number'
      or (p_patch ->> 'score')::numeric <> trunc((p_patch ->> 'score')::numeric)
      or (p_patch ->> 'score')::numeric not between 0 and 99999999) then
    raise exception 'score must be an integer between 0 and 99999999' using errcode = '22023';
  end if;
  if p_patch ? 'gems' and (
      jsonb_typeof(p_patch -> 'gems') <> 'number'
      or (p_patch ->> 'gems')::numeric <> trunc((p_patch ->> 'gems')::numeric)
      or (p_patch ->> 'gems')::numeric not between 0 and 9999999) then
    raise exception 'gems must be an integer between 0 and 9999999' using errcode = '22023';
  end if;
  if p_patch ? 'coins' and (
      jsonb_typeof(p_patch -> 'coins') <> 'number'
      or (p_patch ->> 'coins')::numeric <> trunc((p_patch ->> 'coins')::numeric)
      or (p_patch ->> 'coins')::numeric not between 0 and 9999999) then
    raise exception 'coins must be an integer between 0 and 9999999' using errcode = '22023';
  end if;

  if p_patch ? 'note' and (
      jsonb_typeof(p_patch -> 'note') <> 'string'
      or char_length(p_patch ->> 'note') > 200) then
    raise exception 'note must be a string no longer than 200 characters' using errcode = '22023';
  end if;

  if p_patch ? 'grant' then
    if jsonb_typeof(p_patch -> 'grant') <> 'array'
       or jsonb_array_length(p_patch -> 'grant') > 20 then
      raise exception 'grant must be an array of at most 20 weapon keys' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_patch -> 'grant') as e(value)
      where jsonb_typeof(e.value) <> 'string'
         or trim(both '"' from e.value::text) not in (
           'ar', 'volt', 'dart', 'hammer', 'twinsai',
           'railgun', 'medkit', 'grenade', 'freezer'
         )
    ) then
      raise exception 'grant contains an unknown weapon key' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'revoke' then
    if jsonb_typeof(p_patch -> 'revoke') <> 'array'
       or jsonb_array_length(p_patch -> 'revoke') > 20 then
      raise exception 'revoke must be an array of at most 20 weapon keys' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_patch -> 'revoke') as e(value)
      where jsonb_typeof(e.value) <> 'string'
         or trim(both '"' from e.value::text) not in (
           'ar', 'volt', 'dart', 'hammer', 'twinsai',
           'railgun', 'medkit', 'grenade', 'freezer'
         )
    ) then
      raise exception 'revoke contains an unknown weapon key' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'grant' and p_patch ? 'revoke' and exists (
    select 1
    from jsonb_array_elements_text(p_patch -> 'grant') as g(key)
    join jsonb_array_elements_text(p_patch -> 'revoke') as r(key) using (key)
  ) then
    raise exception 'the same weapon cannot be granted and revoked together' using errcode = '22023';
  end if;

  if p_patch ? 'pow' then
    if jsonb_typeof(p_patch -> 'pow') <> 'object'
       or (select count(*) from jsonb_object_keys(p_patch -> 'pow')) > 5
       or exists (
         select 1 from jsonb_each(p_patch -> 'pow') as e(key, value)
         where e.key not in ('respawn', 'quickmed', 'invinc', 'waveskip', 'airdrop')
            or jsonb_typeof(e.value) <> 'number'
            or (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
            or (e.value #>> '{}')::numeric not between 0 and 99
       ) then
      raise exception 'pow must contain only bounded Outpost Zero upgrade counts'
        using errcode = '22023';
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

  select u.id, lower(btrim(u.email))
    into v_target_user_id, v_target_email
  from auth.users as u
  where lower(btrim(u.email)) = lower(btrim(coalesce(p_target_email, '')))
  limit 1;

  if v_target_user_id is null then
    perform public._outpost_zero_write_admin_audit(
      null, 'player.edit', 'rejected',
      jsonb_build_object(
        'operation', 'player_edit',
        'request_fingerprint', v_request_fingerprint,
        'accepted', false,
        'fields', to_jsonb(v_patch_keys),
        'reason', 'target_not_found'
      ),
      p_operation_id
    );
    return false;
  end if;

  -- Creator and Main admins share permanent edit authority. The protected
  -- creator UUID still cannot be banned by either role.
  if v_target_user_id = public._outpost_zero_creator_user_id()
     and p_patch ? 'ban' and p_patch ->> 'ban' <> 'unban' then
    perform public._outpost_zero_write_admin_audit(
      v_target_user_id, 'ban.apply', 'rejected',
      jsonb_build_object(
        'operation', 'player_edit',
        'request_fingerprint', v_request_fingerprint,
        'accepted', false,
        'fields', to_jsonb(v_patch_keys),
        'reason', 'creator_protected'
      ),
      p_operation_id
    );
    return false;
  end if;

  -- Serialize every permanent edit/ban for this account. Operation receipts
  -- prevent duplicate retries; this lock also gives distinct concurrent edits
  -- a deterministic before/after order.
  perform pg_advisory_xact_lock(
    hashtextextended('player-edit:' || v_target_user_id::text, 0)
  );

  -- Snapshot actual state. The wrapper requires the same existing game tables
  -- as legacy admin_edit_player and deliberately does not create replacements.
  execute 'select coalesce(data, ''{}''::jsonb) from public.profiles where user_id = $1 for update'
    into v_before_profile using v_target_user_id;
  v_before_profile := coalesce(v_before_profile, '{}'::jsonb);

  execute 'select score::bigint from public.scores where user_id = $1 and game = ''outpost-zero'' for update'
    into v_before_score using v_target_user_id;

  execute
    'select coalesce(jsonb_agg(x.row_data order by x.created_at), ''[]''::jsonb)
       from (
         select jsonb_build_object(
           ''until'', b.until, ''note'', b.note, ''scopes'', b.scopes
         ) as row_data, b.created_at
         from public.bans as b
         where lower(btrim(b.user_email)) = $1
         order by b.created_at desc
         limit 20
       ) as x'
    into v_before_bans using v_target_email;

  begin
    if to_regprocedure('public.admin_edit_player(text,jsonb)') is not null then
      execute 'select public.admin_edit_player($1, $2)::boolean'
        into v_legacy_ok using v_target_email, p_patch;
    elsif to_regprocedure('public.admin_edit_player(text,json)') is not null then
      execute 'select public.admin_edit_player($1, $2::json)::boolean'
        into v_legacy_ok using v_target_email, p_patch;
    else
      raise exception 'required admin_edit_player RPC is not installed'
        using errcode = '42883';
    end if;
  exception
    when others then
      perform public._outpost_zero_write_admin_audit(
        v_target_user_id,
        case when p_patch ? 'ban' then
          case when p_patch ->> 'ban' = 'unban' then 'ban.unban' else 'ban.apply' end
        else 'player.edit' end,
        'rejected',
        jsonb_build_object(
          'operation', 'player_edit',
          'request_fingerprint', v_request_fingerprint,
          'accepted', false,
          'fields', to_jsonb(v_patch_keys),
          'reason', 'legacy_edit_rejected',
          'sqlstate', sqlstate
        ),
        p_operation_id
      );
      return false;
  end;

  if not coalesce(v_legacy_ok, false) then
    perform public._outpost_zero_write_admin_audit(
      v_target_user_id, 'player.edit', 'rejected',
      jsonb_build_object(
        'operation', 'player_edit',
        'request_fingerprint', v_request_fingerprint,
        'accepted', false,
        'fields', to_jsonb(v_patch_keys),
        'reason', 'edit_rejected'
      ),
      p_operation_id
    );
    return false;
  end if;

  execute 'select coalesce(data, ''{}''::jsonb) from public.profiles where user_id = $1'
    into v_after_profile using v_target_user_id;
  v_after_profile := coalesce(v_after_profile, '{}'::jsonb);

  execute 'select score::bigint from public.scores where user_id = $1 and game = ''outpost-zero'''
    into v_after_score using v_target_user_id;

  execute
    'select coalesce(jsonb_agg(x.row_data order by x.created_at), ''[]''::jsonb)
       from (
         select jsonb_build_object(
           ''until'', b.until, ''note'', b.note, ''scopes'', b.scopes
         ) as row_data, b.created_at
         from public.bans as b
         where lower(btrim(b.user_email)) = $1
         order by b.created_at desc
         limit 20
       ) as x'
    into v_after_bans using v_target_email;

  if v_before_score is distinct from v_after_score then
    perform public._outpost_zero_write_admin_audit(
      v_target_user_id, 'score.edit', 'applied',
      jsonb_build_object('before', v_before_score, 'after', v_after_score)
    );
    v_changed := true;
  end if;

  if (v_before_profile -> 'owned') is distinct from (v_after_profile -> 'owned') then
    foreach v_weapon in array array[
      'ar', 'volt', 'dart', 'hammer', 'twinsai',
      'railgun', 'medkit', 'grenade', 'freezer'
    ] loop
      if coalesce(v_after_profile -> 'owned' -> v_weapon, 'false'::jsonb) = 'true'::jsonb
         and coalesce(v_before_profile -> 'owned' -> v_weapon, 'false'::jsonb) <> 'true'::jsonb then
        v_granted := array_append(v_granted, v_weapon);
      elsif coalesce(v_before_profile -> 'owned' -> v_weapon, 'false'::jsonb) = 'true'::jsonb
         and coalesce(v_after_profile -> 'owned' -> v_weapon, 'false'::jsonb) <> 'true'::jsonb then
        v_revoked := array_append(v_revoked, v_weapon);
      end if;
    end loop;
    if cardinality(v_granted) > 0 then
      perform public._outpost_zero_write_admin_audit(
        v_target_user_id, 'permanent_weapon.grant', 'applied',
        jsonb_build_object('weapon_keys', to_jsonb(v_granted))
      );
      v_changed := true;
    end if;
    if cardinality(v_revoked) > 0 then
      perform public._outpost_zero_write_admin_audit(
        v_target_user_id, 'permanent_weapon.revoke', 'applied',
        jsonb_build_object('weapon_keys', to_jsonb(v_revoked))
      );
      v_changed := true;
    end if;
  end if;

  if (v_before_profile -> 'gems') is distinct from (v_after_profile -> 'gems')
     or (v_before_profile -> 'coins') is distinct from (v_after_profile -> 'coins') then
    perform public._outpost_zero_write_admin_audit(
      v_target_user_id, 'currency.edit', 'applied',
      jsonb_build_object(
        'gems_before', v_before_profile -> 'gems',
        'gems_after', v_after_profile -> 'gems',
        'coins_before', v_before_profile -> 'coins',
        'coins_after', v_after_profile -> 'coins'
      )
    );
    v_changed := true;
  end if;

  if (v_before_profile -> 'pow') is distinct from (v_after_profile -> 'pow') then
    perform public._outpost_zero_write_admin_audit(
      v_target_user_id, 'upgrades.edit', 'applied',
      jsonb_build_object(
        'before', coalesce(v_before_profile -> 'pow', '{}'::jsonb),
        'after', coalesce(v_after_profile -> 'pow', '{}'::jsonb)
      )
    );
    v_changed := true;
  end if;

  if v_before_bans is distinct from v_after_bans then
    perform public._outpost_zero_write_admin_audit(
      v_target_user_id,
      case when p_patch ->> 'ban' = 'unban' then 'ban.unban' else 'ban.apply' end,
      'applied',
      jsonb_build_object('before', v_before_bans, 'after', v_after_bans)
    );
    v_changed := true;
  end if;

  if not v_changed then
    perform public._outpost_zero_write_admin_audit(
      v_target_user_id, 'player.edit', 'no_change',
      jsonb_build_object('fields', to_jsonb(v_patch_keys), 'reason', 'already_at_requested_values')
    );
  end if;

  -- Exactly one receipt carries the operation id. Category rows above keep a
  -- null operation id so one edit may truthfully log score + gifts + currency
  -- without colliding with the exact-once unique index.
  perform public._outpost_zero_write_admin_audit(
    v_target_user_id, 'player.edit.receipt', 'applied',
    jsonb_build_object(
      'operation', 'player_edit',
      'request_fingerprint', v_request_fingerprint,
      'accepted', true,
      'fields', to_jsonb(v_patch_keys),
      'changed', v_changed
    ),
    p_operation_id
  );

  return true;
end;
$function$;

-- Main admins submit proposed permanent edits without forging requested_by.
-- Creator and Main admins may review legacy pending requests.
create or replace function public.submit_outpost_zero_player_request(
  p_target_email text,
  p_patch jsonb,
  p_operation_id uuid
)
returns table (
  accepted boolean,
  request_id bigint,
  status text,
  reason text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_email text;
  v_target_user_id uuid;
  v_target_email text;
  v_request_id bigint;
  v_existing public.player_requests%rowtype;
  v_prior public.outpost_zero_admin_audit%rowtype;
  v_fields text[];
begin
  if not public._outpost_zero_is_admin_main() then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'operation id is required' using errcode = '22004';
  end if;
  perform public._outpost_zero_validate_admin_patch(p_patch);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or pg_column_size(p_patch) > 4096 then
    raise exception 'patch must be a JSON object no larger than 4 KB'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_patch) as keys(k)
    where k not in ('score', 'gems', 'coins', 'pow', 'grant', 'revoke',
                    'ban', 'scopes', 'note')
  ) then
    raise exception 'patch contains an unsupported field' using errcode = '22023';
  end if;

  select r.* into v_existing
  from public.player_requests as r
  where r.requester_user_id = v_actor_user_id
    and r.operation_id = p_operation_id;
  if found then
    if lower(btrim(v_existing.target_email)) = lower(btrim(coalesce(p_target_email, '')))
       and v_existing.patch::jsonb = p_patch then
      return query select true, v_existing.id::bigint,
        v_existing.status::text, 'duplicate'::text;
    else
      return query select false, v_existing.id::bigint,
        v_existing.status::text, 'operation_conflict'::text;
    end if;
    return;
  end if;

  -- Operation ids share one per-actor namespace across every admin action.
  -- A UUID already used by a grant/edit cannot create a queue row and then
  -- fail forever on the audit receipt's unique index.
  select a.* into v_prior
  from public.outpost_zero_admin_audit as a
  where a.actor_user_id = v_actor_user_id
    and a.operation_id = p_operation_id;
  if found then
    return query select false, null::bigint, 'rejected'::text,
      'operation_conflict'::text;
    return;
  end if;

  select lower(btrim(u.email)) into strict v_actor_email
  from auth.users as u where u.id = v_actor_user_id;

  select u.id, lower(btrim(u.email))
    into v_target_user_id, v_target_email
  from auth.users as u
  where lower(btrim(u.email)) = lower(btrim(coalesce(p_target_email, '')))
  limit 1;

  select coalesce(array_agg(k order by k), array[]::text[])
    into v_fields from jsonb_object_keys(p_patch) as keys(k);

  if v_target_user_id is null then
    perform public._outpost_zero_write_admin_audit(
      null, 'player_request.submit', 'rejected',
      jsonb_build_object(
        'operation', 'player_request_submit', 'accepted', false,
        'fields', to_jsonb(v_fields), 'reason', 'target_not_found'
      ), p_operation_id
    );
    return query select false, null::bigint, 'rejected'::text, 'target_not_found'::text;
    return;
  end if;

  insert into public.player_requests (
    requested_by, target_email, patch, status,
    operation_id, requester_user_id
  ) values (
    v_actor_email, v_target_email, p_patch, 'pending',
    p_operation_id, v_actor_user_id
  ) returning id::bigint into v_request_id;

  perform public._outpost_zero_write_admin_audit(
    v_target_user_id, 'player_request.submit', 'submitted',
    jsonb_build_object(
      'operation', 'player_request_submit', 'accepted', true,
      'request_id', v_request_id, 'fields', to_jsonb(v_fields),
      'reason', 'submitted'
    ), p_operation_id
  );

  return query select true, v_request_id, 'pending'::text, 'submitted'::text;
exception
  when unique_violation then
    select r.* into v_existing
    from public.player_requests as r
    where r.requester_user_id = v_actor_user_id
      and r.operation_id = p_operation_id;
    return query select (v_existing.id is not null), v_existing.id::bigint,
      coalesce(v_existing.status::text, 'unknown'),
      case when v_existing.id is null then 'operation_in_progress' else 'duplicate' end;
end;
$function$;

create or replace function public.list_outpost_zero_player_requests(
  p_limit integer default 20
)
returns table (
  id bigint,
  requested_by text,
  target_email text,
  patch jsonb,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if not public._outpost_zero_is_admin_main() then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  return query
  select r.id::bigint, r.requested_by::text, r.target_email::text,
         r.patch::jsonb, r.status::text, r.created_at
  from public.player_requests as r
  where r.status = 'pending'
  order by r.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$function$;

create or replace function public.resolve_outpost_zero_player_request(
  p_request_id bigint,
  p_decision text,
  p_operation_id uuid
)
returns table (
  accepted boolean,
  request_id bigint,
  status text,
  reason text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_email text;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_request public.player_requests%rowtype;
  v_target_user_id uuid;
  v_edit_operation_id uuid;
  v_edit_ok boolean;
  v_prior public.outpost_zero_admin_audit%rowtype;
  v_final_status text;
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'operation id is required' using errcode = '22004';
  end if;
  if p_request_id is null or v_decision not in ('approve', 'reject') then
    raise exception 'request id and approve/reject decision are required'
      using errcode = '22023';
  end if;

  select a.* into v_prior
  from public.outpost_zero_admin_audit as a
  where a.actor_user_id = v_actor_user_id
    and a.operation_id = p_operation_id;
  if found then
    if v_prior.details ->> 'operation' = 'player_request_resolve'
       and (v_prior.details ->> 'request_id')::bigint = p_request_id
       and v_prior.details ->> 'decision' = v_decision then
      return query select
        coalesce((v_prior.details ->> 'accepted')::boolean, false),
        p_request_id, coalesce(v_prior.details ->> 'status', 'unknown'),
        coalesce(v_prior.details ->> 'reason', v_prior.result);
      return;
    end if;
    return query select false, p_request_id, 'unknown'::text, 'operation_conflict'::text;
    return;
  end if;

  select r.* into v_request
  from public.player_requests as r
  where r.id = p_request_id
  for update;

  if not found then
    perform public._outpost_zero_write_admin_audit(
      null, 'player_request.resolve', 'rejected',
      jsonb_build_object(
        'operation', 'player_request_resolve', 'accepted', false,
        'request_id', p_request_id, 'decision', v_decision,
        'status', 'missing', 'reason', 'request_not_found'
      ), p_operation_id
    );
    return query select false, p_request_id, 'missing'::text, 'request_not_found'::text;
    return;
  end if;

  -- The first copy of this exact retry may have committed while we waited for
  -- the request-row lock.
  select a.* into v_prior
  from public.outpost_zero_admin_audit as a
  where a.actor_user_id = v_actor_user_id
    and a.operation_id = p_operation_id;
  if found then
    if v_prior.details ->> 'operation' = 'player_request_resolve'
       and (v_prior.details ->> 'request_id')::bigint = p_request_id
       and v_prior.details ->> 'decision' = v_decision then
      return query select
        coalesce((v_prior.details ->> 'accepted')::boolean, false),
        p_request_id, coalesce(v_prior.details ->> 'status', 'unknown'),
        coalesce(v_prior.details ->> 'reason', v_prior.result);
      return;
    end if;
    return query select false, p_request_id, 'unknown'::text, 'operation_conflict'::text;
    return;
  end if;

  select u.id into v_target_user_id from auth.users as u
  where lower(btrim(u.email)) = lower(btrim(v_request.target_email)) limit 1;
  select lower(btrim(u.email)) into strict v_actor_email
  from auth.users as u where u.id = v_actor_user_id;

  v_final_status := case when v_decision = 'approve' then 'approved' else 'rejected' end;
  if v_request.status <> 'pending' then
    perform public._outpost_zero_write_admin_audit(
      v_target_user_id, 'player_request.resolve', 'no_change',
      jsonb_build_object(
        'operation', 'player_request_resolve',
        'accepted', v_request.status = v_final_status,
        'request_id', p_request_id, 'decision', v_decision,
        'status', v_request.status, 'reason', 'already_decided'
      ), p_operation_id
    );
    return query select (v_request.status = v_final_status), p_request_id,
      v_request.status::text, 'already_decided'::text;
    return;
  end if;

  if v_decision = 'approve' then
    -- A deterministic child operation gives the edit its own exact-once
    -- receipt while the original operation id receipts the decision itself.
    v_edit_operation_id := md5(p_operation_id::text || ':player-request-edit')::uuid;
    v_edit_ok := public.outpost_zero_admin_edit_player(
      v_request.target_email, v_request.patch::jsonb, v_edit_operation_id
    );
    if not v_edit_ok then
      update public.player_requests
      set status = 'failed', decided_by = v_actor_email
      where id = p_request_id;
      perform public._outpost_zero_write_admin_audit(
        v_target_user_id, 'player_request.approve', 'failed',
        jsonb_build_object(
          'operation', 'player_request_resolve', 'accepted', false,
          'request_id', p_request_id, 'decision', v_decision,
          'status', 'failed', 'reason', 'edit_rejected'
        ), p_operation_id
      );
      return query select false, p_request_id, 'failed'::text, 'edit_rejected'::text;
      return;
    end if;
  end if;

  update public.player_requests
  set status = v_final_status, decided_by = v_actor_email
  where id = p_request_id;

  perform public._outpost_zero_write_admin_audit(
    v_target_user_id, 'player_request.' || v_decision, 'applied',
    jsonb_build_object(
      'operation', 'player_request_resolve', 'accepted', true,
      'request_id', p_request_id, 'decision', v_decision,
      'status', v_final_status, 'reason', v_final_status
    ), p_operation_id
  );

  return query select true, p_request_id, v_final_status, v_final_status;
end;
$function$;

-- Co-admins may retain the existing view-only moderation screens, but every
-- row comes through a server role check instead of raw table SELECT.
-- Player/guest ban enforcement after raw bans-table access is retired. Account
-- identity comes from auth.uid(); the only caller value is the bounded local
-- installation id already used for device bans.
create or replace function public.get_my_outpost_zero_ban(p_device text)
returns table (
  until timestamptz,
  note text,
  scopes text[]
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_device text := btrim(coalesce(p_device, ''));
begin
  if v_device <> '' and (
      char_length(v_device) > 128
      or v_device !~ '^[A-Za-z0-9._:-]+$') then
    raise exception 'invalid device id' using errcode = '22023';
  end if;

  if v_user_id is not null then
    select lower(btrim(u.email)) into v_email
    from auth.users as u where u.id = v_user_id;
  end if;

  -- The fixed creator account is not bannable even if an obsolete device row
  -- happens to reference the same installation id.
  if v_user_id = public._outpost_zero_creator_user_id() then
    return;
  end if;
  if v_email is null and v_device = '' then
    return;
  end if;

  return query
  select b.until, b.note::text,
         coalesce(array(select jsonb_array_elements_text(b.scopes)),array['account']::text[])
  from public.bans as b
  where (b.until is null or b.until > clock_timestamp())
    and (
      (v_email is not null and lower(btrim(b.user_email)) = v_email)
      or (v_device <> '' and b.device_id::text = v_device)
    )
  order by
    case when v_email is not null and lower(btrim(b.user_email)) = v_email
      then 0 else 1 end,
    b.created_at desc
  limit 1;
end;
$function$;

create or replace function public.list_outpost_zero_bans(
  p_limit integer default 40
)
returns table (
  user_email text,
  device_id text,
  until timestamptz,
  note text,
  scopes text[],
  banned_by text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if public._outpost_zero_admin_role() = '' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query
  select b.user_email::text, b.device_id::text, b.until, b.note::text,
         coalesce(array(select jsonb_array_elements_text(b.scopes)),array['account']::text[]),
         b.banned_by::text, b.created_at
  from public.bans as b
  where b.until is null or b.until > clock_timestamp()
  order by b.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
end;
$function$;

create or replace function public.submit_outpost_zero_ban_appeal(
  p_message text,
  p_operation_id uuid
)
returns table (
  accepted boolean,
  appeal_id bigint,
  status text,
  reason text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_message text := btrim(coalesce(p_message, ''));
  v_existing public.ban_appeals%rowtype;
  v_prior public.outpost_zero_admin_audit%rowtype;
  v_appeal_id bigint;
  v_recent_count bigint;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'operation id is required' using errcode = '22004';
  end if;
  if char_length(v_message) not between 1 and 600 then
    raise exception 'appeal must be between 1 and 600 characters' using errcode = '22023';
  end if;

  select a.* into v_existing
  from public.ban_appeals as a
  where a.requester_user_id = v_user_id and a.operation_id = p_operation_id;
  if found then
    return query select (v_existing.message = v_message), v_existing.id::bigint,
      v_existing.status::text,
      case when v_existing.message = v_message then 'duplicate' else 'operation_conflict' end;
    return;
  end if;

  select a.* into v_prior from public.outpost_zero_admin_audit as a
  where a.actor_user_id = v_user_id and a.operation_id = p_operation_id;
  if found then
    return query select false, null::bigint, 'rejected'::text,
      'operation_conflict'::text;
    return;
  end if;

  select lower(btrim(u.email)) into strict v_email
  from auth.users as u where u.id = v_user_id;

  -- Direct table inserts are revoked below, so this per-account lock fully
  -- serializes the only appeal-creation API. Keep one open appeal and at most
  -- three submissions per rolling day to prevent table/LOG flooding with new
  -- operation UUIDs.
  perform pg_advisory_xact_lock(
    hashtextextended('ban-appeal-submit:' || v_user_id::text, 0)
  );

  select a.* into v_existing
  from public.ban_appeals as a
  where a.requester_user_id = v_user_id and a.operation_id = p_operation_id;
  if found then
    return query select (v_existing.message = v_message), v_existing.id::bigint,
      v_existing.status::text,
      case when v_existing.message = v_message then 'duplicate' else 'operation_conflict' end;
    return;
  end if;

  select a.* into v_existing
  from public.ban_appeals as a
  where a.requester_user_id = v_user_id and a.status = 'open'
  order by a.id desc limit 1;
  if found then
    return query select false, v_existing.id::bigint, 'open'::text,
      'open_appeal_exists'::text;
    return;
  end if;

  select count(*) into v_recent_count
  from public.ban_appeals as a
  where a.requester_user_id = v_user_id
    and a.created_at >= clock_timestamp() - interval '1 day';
  if v_recent_count >= 3 then
    return query select false, null::bigint, 'rejected'::text,
      'rate_limited'::text;
    return;
  end if;

  insert into public.ban_appeals (
    player_email, message, status, operation_id, requester_user_id
  ) values (
    v_email, v_message, 'open', p_operation_id, v_user_id
  ) returning id::bigint into v_appeal_id;

  perform public._outpost_zero_write_admin_audit(
    v_user_id, 'ban_appeal.submit', 'submitted',
    jsonb_build_object(
      'operation', 'ban_appeal_submit', 'accepted', true,
      'appeal_id', v_appeal_id, 'reason', 'submitted'
    ), p_operation_id
  );

  return query select true, v_appeal_id, 'open'::text, 'submitted'::text;
exception
  when unique_violation then
    select a.* into v_existing from public.ban_appeals as a
    where a.requester_user_id = v_user_id and a.operation_id = p_operation_id;
    return query select (v_existing.id is not null), v_existing.id::bigint,
      coalesce(v_existing.status::text, 'unknown'),
      case when v_existing.id is null then 'operation_in_progress' else 'duplicate' end;
end;
$function$;

create or replace function public.list_outpost_zero_ban_appeals(
  p_limit integer default 40
)
returns table (
  id bigint,
  player_email text,
  message text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if public._outpost_zero_admin_role() = '' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query
  select a.id::bigint, a.player_email::text, a.message::text,
         a.status::text, a.created_at
  from public.ban_appeals as a
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
end;
$function$;

create or replace function public.resolve_outpost_zero_ban_appeal(
  p_appeal_id bigint,
  p_decision text,
  p_operation_id uuid
)
returns table (
  accepted boolean,
  appeal_id bigint,
  status text,
  reason text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_email text;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_appeal public.ban_appeals%rowtype;
  v_target_user_id uuid;
  v_edit_operation_id uuid;
  v_edit_ok boolean;
  v_prior public.outpost_zero_admin_audit%rowtype;
  v_final_status text;
begin
  if not public._outpost_zero_is_admin_main() then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'operation id is required' using errcode = '22004';
  end if;
  if p_appeal_id is null or v_decision not in ('lift', 'deny') then
    raise exception 'appeal id and lift/deny decision are required' using errcode = '22023';
  end if;

  select a.* into v_prior from public.outpost_zero_admin_audit as a
  where a.actor_user_id = v_actor_user_id and a.operation_id = p_operation_id;
  if found then
    if v_prior.details ->> 'operation' = 'ban_appeal_resolve'
       and (v_prior.details ->> 'appeal_id')::bigint = p_appeal_id
       and v_prior.details ->> 'decision' = v_decision then
      return query select
        coalesce((v_prior.details ->> 'accepted')::boolean, false),
        p_appeal_id, coalesce(v_prior.details ->> 'status', 'unknown'),
        coalesce(v_prior.details ->> 'reason', v_prior.result);
      return;
    end if;
    return query select false, p_appeal_id, 'unknown'::text, 'operation_conflict'::text;
    return;
  end if;

  select a.* into v_appeal from public.ban_appeals as a
  where a.id = p_appeal_id for update;
  if not found then
    perform public._outpost_zero_write_admin_audit(
      null, 'ban_appeal.resolve', 'rejected',
      jsonb_build_object(
        'operation', 'ban_appeal_resolve', 'accepted', false,
        'appeal_id', p_appeal_id, 'decision', v_decision,
        'status', 'missing', 'reason', 'appeal_not_found'
      ), p_operation_id
    );
    return query select false, p_appeal_id, 'missing'::text, 'appeal_not_found'::text;
    return;
  end if;

  select a.* into v_prior from public.outpost_zero_admin_audit as a
  where a.actor_user_id = v_actor_user_id and a.operation_id = p_operation_id;
  if found then
    if v_prior.details ->> 'operation' = 'ban_appeal_resolve'
       and (v_prior.details ->> 'appeal_id')::bigint = p_appeal_id
       and v_prior.details ->> 'decision' = v_decision then
      return query select
        coalesce((v_prior.details ->> 'accepted')::boolean, false),
        p_appeal_id, coalesce(v_prior.details ->> 'status', 'unknown'),
        coalesce(v_prior.details ->> 'reason', v_prior.result);
      return;
    end if;
    return query select false, p_appeal_id, 'unknown'::text, 'operation_conflict'::text;
    return;
  end if;

  select u.id into v_target_user_id from auth.users as u
  where lower(btrim(u.email)) = lower(btrim(v_appeal.player_email)) limit 1;
  select lower(btrim(u.email)) into strict v_actor_email
  from auth.users as u where u.id = v_actor_user_id;

  v_final_status := case when v_decision = 'lift' then 'lifted' else 'denied' end;
  if v_appeal.status <> 'open' then
    perform public._outpost_zero_write_admin_audit(
      v_target_user_id, 'ban_appeal.resolve', 'no_change',
      jsonb_build_object(
        'operation', 'ban_appeal_resolve',
        'accepted', v_appeal.status = v_final_status,
        'appeal_id', p_appeal_id, 'decision', v_decision,
        'status', v_appeal.status, 'reason', 'already_decided'
      ), p_operation_id
    );
    return query select (v_appeal.status = v_final_status), p_appeal_id,
      v_appeal.status::text, 'already_decided'::text;
    return;
  end if;

  if v_decision = 'lift' then
    v_edit_operation_id := md5(p_operation_id::text || ':ban-appeal-unban')::uuid;
    v_edit_ok := public.outpost_zero_admin_edit_player(
      v_appeal.player_email, jsonb_build_object('ban', 'unban'), v_edit_operation_id
    );
    if not v_edit_ok then
      perform public._outpost_zero_write_admin_audit(
        v_target_user_id, 'ban_appeal.lift', 'failed',
        jsonb_build_object(
          'operation', 'ban_appeal_resolve', 'accepted', false,
          'appeal_id', p_appeal_id, 'decision', v_decision,
          'status', 'open', 'reason', 'unban_rejected'
        ), p_operation_id
      );
      return query select false, p_appeal_id, 'open'::text, 'unban_rejected'::text;
      return;
    end if;
  end if;

  update public.ban_appeals
  set status = v_final_status, decided_by = v_actor_email
  where id = p_appeal_id;

  perform public._outpost_zero_write_admin_audit(
    v_target_user_id, 'ban_appeal.' || v_decision, 'applied',
    jsonb_build_object(
      'operation', 'ban_appeal_resolve', 'accepted', true,
      'appeal_id', p_appeal_id, 'decision', v_decision,
      'status', v_final_status, 'reason', v_final_status
    ), p_operation_id
  );

  return query select true, p_appeal_id, v_final_status, v_final_status;
end;
$function$;

-- Creator/main-only, newest-first keyset pagination. event_id is stable and
-- monotonic, unlike offset pagination while new events arrive.
create or replace function public.list_outpost_zero_admin_audit(
  p_before_event_id bigint default null,
  p_limit integer default 25
)
returns table (
  event_id bigint,
  actor_email text,
  target_email text,
  action text,
  result text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
  if not public._outpost_zero_is_admin_main() then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;

  return query
  select a.event_id, a.actor_email, a.target_email, a.action,
         a.result, a.details, a.created_at
  from public.outpost_zero_admin_audit as a
  where p_before_event_id is null or a.event_id < p_before_event_id
  order by a.event_id desc
  limit v_limit;
end;
$function$;

revoke all on function public.get_my_outpost_zero_weapon_grants()
  from public, anon, authenticated;
revoke all on function public.admin_list_outpost_zero_weapon_grants(text)
  from public, anon, authenticated;
revoke all on function public.admin_set_outpost_zero_weapon_grant(text, text, integer, text, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_revoke_outpost_zero_weapon_grant(text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.outpost_zero_admin_edit_player(text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_outpost_zero_player_request(text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.list_outpost_zero_player_requests(integer)
  from public, anon, authenticated;
revoke all on function public.resolve_outpost_zero_player_request(bigint, text, uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_outpost_zero_ban(text)
  from public, anon, authenticated;
revoke all on function public.list_outpost_zero_bans(integer)
  from public, anon, authenticated;
revoke all on function public.submit_outpost_zero_ban_appeal(text, uuid)
  from public, anon, authenticated;
revoke all on function public.list_outpost_zero_ban_appeals(integer)
  from public, anon, authenticated;
revoke all on function public.resolve_outpost_zero_ban_appeal(bigint, text, uuid)
  from public, anon, authenticated;
revoke all on function public.list_outpost_zero_admin_audit(bigint, integer)
  from public, anon, authenticated;

grant execute on function public.get_my_outpost_zero_weapon_grants()
  to authenticated;
grant execute on function public.resolve_outpost_zero_player_request(bigint, text, uuid)
  to authenticated;
grant execute on function public.get_my_outpost_zero_ban(text)
  to anon, authenticated;
grant execute on function public.submit_outpost_zero_ban_appeal(text, uuid)
  to authenticated;
grant execute on function public.resolve_outpost_zero_ban_appeal(bigint, text, uuid)
  to authenticated;

-- Close the bypass after the audited wrapper exists. The wrapper owner can
-- still call the legacy implementation; browser roles cannot call it directly.
do $block$
begin
  if to_regprocedure('public.admin_edit_player(text,jsonb)') is not null then
    execute 'revoke all on function public.admin_edit_player(text, jsonb) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.admin_edit_player(text,json)') is not null then
    execute 'revoke all on function public.admin_edit_player(text, json) from public, anon, authenticated';
  end if;
  if to_regclass('public.player_log') is not null then
    execute 'revoke all on table public.player_log from public, anon, authenticated';
  end if;
  revoke all on table public.player_requests from public, anon, authenticated;
  revoke all on table public.ban_appeals from public, anon, authenticated;
  revoke all on table public.bans from public, anon, authenticated;

  -- Serial/identity sequences are not stable API names across old installs.
  -- Resolve them from the actual tables, then retire browser use if present.
  if pg_get_serial_sequence('public.player_requests', 'id') is not null then
    execute format(
      'revoke all on sequence %s from public, anon, authenticated',
      pg_get_serial_sequence('public.player_requests', 'id')
    );
  end if;
  if pg_get_serial_sequence('public.ban_appeals', 'id') is not null then
    execute format(
      'revoke all on sequence %s from public, anon, authenticated',
      pg_get_serial_sequence('public.ban_appeals', 'id')
    );
  end if;
end;
$block$;

-- Username-addressed wrappers: private Auth emails never cross the browser boundary.
do $preflight$
begin
  if to_regclass('public.social_profiles') is null then
    raise exception 'Admin 01 requires Social 01 (social_profiles)';
  end if;
  if to_regprocedure('public.admin_get_player(text)') is null
     or to_regprocedure('public.outpost_zero_admin_edit_player(text,jsonb,uuid)') is null
     or to_regprocedure('public.admin_list_outpost_zero_weapon_grants(text)') is null
     or to_regprocedure('public.admin_set_outpost_zero_weapon_grant(text,text,integer,text,uuid)') is null
     or to_regprocedure('public.admin_revoke_outpost_zero_weapon_grant(text,text,text,uuid)') is null
     or to_regprocedure('public.submit_outpost_zero_player_request(text,jsonb,uuid)') is null then
    raise exception 'Admin 01 base installation failed';
  end if;
end;
$preflight$;

create or replace function public._outpost_zero_target_email_for_username(
  p_target_username text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_key text := lower(btrim(coalesce(p_target_username, '')));
  v_email text;
begin
  if public._outpost_zero_admin_role() not in ('creator', 'main', 'co') then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if v_key !~ '^[a-z0-9_]{3,32}$' then
    return null;
  end if;
  select lower(btrim(u.email))
    into v_email
  from public.social_profiles as sp
  join auth.users as u on u.id = sp.user_id
  where sp.handle_key = v_key
  limit 1;
  return v_email;
end;
$function$;

revoke all on function public._outpost_zero_target_email_for_username(text)
  from public, anon, authenticated;

create or replace function public.outpost_zero_admin_get_player_by_username(
  p_target_username text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_email text := public._outpost_zero_target_email_for_username(p_target_username);
  v_result jsonb;
begin
  if v_email is null then return null; end if;
  select to_jsonb(row_value) into v_result
  from public.admin_get_player(v_email) as row_value
  limit 1;
  -- Older admin_get_player versions may include their lookup key. Strip every
  -- common email field before PostgREST serializes the private player record.
  return coalesce(v_result,'{}'::jsonb)-'email'-'target_email'-'user_email';
end;
$function$;

-- The first preview returned granted_by_email from the private compatibility
-- function. Drop that browser signature before replacing it with a username-
-- only result; Postgres cannot rename a TABLE return column in-place.
drop function if exists public.admin_list_outpost_zero_weapon_grants_by_username(text);
create function public.admin_list_outpost_zero_weapon_grants_by_username(
  p_target_username text
)
returns table (
  weapon_key text,
  granted_at timestamptz,
  expires_at timestamptz,
  granted_by_username text,
  server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_email text := public._outpost_zero_target_email_for_username(p_target_username);
  v_target_user_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public._outpost_zero_is_admin_main() then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if v_email is null then return; end if;
  select u.id into v_target_user_id from auth.users u
  where lower(btrim(u.email))=v_email limit 1;
  return query
  select g.weapon_key,g.granted_at,g.expires_at,
         coalesce(sp.handle,'STAFF')::text,v_now
  from public.outpost_zero_weapon_grants g
  left join public.social_profiles sp on sp.user_id=g.granted_by
    and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
    and sp.handle_key not in ('username_not_set','usernamenotset')
    and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),20)
    and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),8)
  where g.target_user_id=v_target_user_id and g.expires_at>v_now
  order by g.expires_at,g.weapon_key;
end;
$function$;

create or replace function public.admin_set_outpost_zero_weapon_grant_by_username(
  p_target_username text,
  p_weapon_key text,
  p_duration_minutes integer,
  p_note text,
  p_operation_id uuid
)
returns table (accepted boolean, reason text, weapon_key text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_email text := public._outpost_zero_target_email_for_username(p_target_username);
begin
  if v_email is null then
    return query select false, 'target_not_found'::text, lower(btrim(coalesce(p_weapon_key,''))), null::timestamptz;
    return;
  end if;
  return query select * from public.admin_set_outpost_zero_weapon_grant(
    v_email,p_weapon_key,p_duration_minutes,p_note,p_operation_id
  );
end;
$function$;

create or replace function public.admin_revoke_outpost_zero_weapon_grant_by_username(
  p_target_username text,
  p_weapon_key text,
  p_note text,
  p_operation_id uuid
)
returns table (accepted boolean, reason text, weapon_key text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_email text := public._outpost_zero_target_email_for_username(p_target_username);
begin
  if v_email is null then
    return query select false, 'target_not_found'::text, lower(btrim(coalesce(p_weapon_key,''))), null::timestamptz;
    return;
  end if;
  return query select * from public.admin_revoke_outpost_zero_weapon_grant(
    v_email,p_weapon_key,p_note,p_operation_id
  );
end;
$function$;

create or replace function public.outpost_zero_admin_edit_player_by_username(
  p_target_username text,
  p_patch jsonb,
  p_operation_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_email text := public._outpost_zero_target_email_for_username(p_target_username);
begin
  if v_email is null then return false; end if;
  return public.outpost_zero_admin_edit_player(v_email,p_patch,p_operation_id);
end;
$function$;

create or replace function public.submit_outpost_zero_player_request_by_username(
  p_target_username text,
  p_patch jsonb,
  p_operation_id uuid
)
returns table (accepted boolean, request_id bigint, status text, reason text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_email text := public._outpost_zero_target_email_for_username(p_target_username);
begin
  if v_email is null then
    return query select false, null::bigint, 'rejected'::text, 'target_not_found'::text;
    return;
  end if;
  return query select * from public.submit_outpost_zero_player_request(v_email,p_patch,p_operation_id);
end;
$function$;

create or replace function public.list_outpost_zero_player_requests_by_username(
  p_limit integer default 20
)
returns table (
  id bigint,
  requested_by text,
  target_username text,
  patch jsonb,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if not public._outpost_zero_is_admin_main() then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  return query
  select r.id::bigint,
         coalesce(requester.handle, 'STAFF')::text,
         coalesce(target.handle, 'UNKNOWN PLAYER')::text,
         r.patch::jsonb, r.status::text, r.created_at
  from public.player_requests as r
  left join auth.users as target_user
    on lower(btrim(target_user.email)) = lower(btrim(r.target_email))
  left join public.social_profiles as target on target.user_id = target_user.id
    and target.handle ~ '^[A-Za-z0-9_]{3,32}$'
    and target.handle_key not in ('username_not_set','usernamenotset')
    and target.handle_key <> 'op_'||left(replace(target.user_id::text,'-',''),20)
    and target.handle_key <> 'op_'||left(replace(target.user_id::text,'-',''),8)
  left join public.social_profiles as requester on requester.user_id = r.requester_user_id
    and requester.handle ~ '^[A-Za-z0-9_]{3,32}$'
    and requester.handle_key not in ('username_not_set','usernamenotset')
    and requester.handle_key <> 'op_'||left(replace(requester.user_id::text,'-',''),20)
    and requester.handle_key <> 'op_'||left(replace(requester.user_id::text,'-',''),8)
  where r.status = 'pending'
  order by r.id desc
  limit least(greatest(coalesce(p_limit,20),1),50);
end;
$function$;

revoke all on function public.outpost_zero_admin_get_player_by_username(text) from public, anon, authenticated;
revoke all on function public.admin_list_outpost_zero_weapon_grants_by_username(text) from public, anon, authenticated;
revoke all on function public.admin_set_outpost_zero_weapon_grant_by_username(text,text,integer,text,uuid) from public, anon, authenticated;
revoke all on function public.admin_revoke_outpost_zero_weapon_grant_by_username(text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.outpost_zero_admin_edit_player_by_username(text,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.submit_outpost_zero_player_request_by_username(text,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.list_outpost_zero_player_requests_by_username(integer) from public, anon, authenticated;

grant execute on function public.outpost_zero_admin_get_player_by_username(text) to authenticated;
grant execute on function public.admin_list_outpost_zero_weapon_grants_by_username(text) to authenticated;
grant execute on function public.admin_set_outpost_zero_weapon_grant_by_username(text,text,integer,text,uuid) to authenticated;
grant execute on function public.admin_revoke_outpost_zero_weapon_grant_by_username(text,text,text,uuid) to authenticated;
grant execute on function public.outpost_zero_admin_edit_player_by_username(text,jsonb,uuid) to authenticated;
grant execute on function public.submit_outpost_zero_player_request_by_username(text,jsonb,uuid) to authenticated;
grant execute on function public.list_outpost_zero_player_requests_by_username(integer) to authenticated;

-- Browser-safe moderation feeds. Private Auth emails remain useful internal
-- compatibility keys, but neither an admin RPC nor Realtime may serialize
-- them. Public usernames are resolved on the server and opaque row IDs are
-- used for exact actions when a historical account has no username.
create or replace function public._outpost_zero_public_username(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select sp.handle::text from public.social_profiles sp
  where sp.user_id=p_user_id
    and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
    and sp.handle_key not in ('username_not_set','usernamenotset')
    and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),20)
    and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),8)
  limit 1
$function$;

create or replace function public.list_outpost_zero_bans_by_username(p_limit integer default 40)
returns table(
  ban_id bigint,target_username text,until timestamptz,note text,scopes text[],
  banned_by_username text,created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then
    raise exception 'creator or main-admin access required' using errcode='42501';
  end if;
  return query
  select b.id::bigint,
         coalesce(public._outpost_zero_public_username(coalesce(b.user_id,target_user.id)),'UNKNOWN PLAYER')::text,
         b.until,b.note::text,
         coalesce(array(select jsonb_array_elements_text(b.scopes)),array['account']::text[]),
         coalesce(public._outpost_zero_public_username(actor_user.id),'STAFF')::text,
         b.created_at
  from public.bans b
  left join auth.users target_user on lower(btrim(target_user.email))=lower(btrim(b.user_email))
  left join auth.users actor_user on lower(btrim(actor_user.email))=lower(btrim(b.banned_by))
  where b.until is null or b.until>clock_timestamp()
  order by b.created_at desc
  limit least(greatest(coalesce(p_limit,40),1),100);
end;
$function$;

create or replace function public.unban_outpost_zero_ban(
  p_ban_id bigint,p_operation_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid:=auth.uid();v_ban public.bans%rowtype;v_target uuid;
  v_prior public.outpost_zero_admin_audit%rowtype;
begin
  if not public._outpost_zero_is_admin_main() then
    raise exception 'creator or main-admin access required' using errcode='42501';
  end if;
  if p_ban_id is null or p_ban_id<=0 or p_operation_id is null then
    raise exception 'ban id and operation id are required' using errcode='22023';
  end if;
  select a.* into v_prior from public.outpost_zero_admin_audit a
  where a.actor_user_id=v_actor and a.operation_id=p_operation_id;
  if found then
    return v_prior.action='ban.unban'
      and coalesce(v_prior.details->>'ban_id','')=p_ban_id::text
      and v_prior.result in ('applied','no_change');
  end if;
  select b.* into v_ban from public.bans b where b.id=p_ban_id for update;
  if found then
    v_target:=v_ban.user_id;
    if v_target is null then
      select u.id into v_target from auth.users u
      where lower(btrim(u.email))=lower(btrim(v_ban.user_email)) limit 1;
    end if;
    delete from public.bans b where b.id=p_ban_id;
    perform public._outpost_zero_write_admin_audit(
      v_target,'ban.unban','applied',
      jsonb_build_object('ban_id',p_ban_id,'reason','revoked'),p_operation_id
    );
    return true;
  end if;
  perform public._outpost_zero_write_admin_audit(
    null,'ban.unban','no_change',
    jsonb_build_object('ban_id',p_ban_id,'reason','not_active'),p_operation_id
  );
  return true;
end;
$function$;

create or replace function public.list_outpost_zero_ban_appeals_by_username(p_limit integer default 40)
returns table(id bigint,player_username text,message text,status text,created_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then
    raise exception 'creator or main-admin access required' using errcode='42501';
  end if;
  return query
  select a.id::bigint,
         coalesce(public._outpost_zero_public_username(coalesce(a.requester_user_id,u.id)),'UNKNOWN PLAYER')::text,
         a.message::text,a.status::text,a.created_at
  from public.ban_appeals a
  left join auth.users u on lower(btrim(u.email))=lower(btrim(a.player_email))
  order by a.id desc
  limit least(greatest(coalesce(p_limit,40),1),100);
end;
$function$;

-- Recursively remove legacy email-shaped detail keys before the LOG crosses
-- PostgREST. This protects old audit rows as well as current actions.
create or replace function public._outpost_zero_scrub_private_admin_json(p_value jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare v_result jsonb;
begin
  if p_value is null then return null;end if;
  if jsonb_typeof(p_value)='object' then
    select coalesce(jsonb_object_agg(e.key,public._outpost_zero_scrub_private_admin_json(e.value)),'{}'::jsonb)
      into v_result from jsonb_each(p_value) e
      where lower(e.key) not like '%email%';
    return v_result;
  elsif jsonb_typeof(p_value)='array' then
    select coalesce(jsonb_agg(public._outpost_zero_scrub_private_admin_json(e.value)),'[]'::jsonb)
      into v_result from jsonb_array_elements(p_value) e(value);
    return v_result;
  end if;
  return p_value;
end;
$function$;

create or replace function public.list_outpost_zero_admin_audit_by_username(
  p_before_event_id bigint default null,p_limit integer default 25
)
returns table(
  event_id bigint,actor_username text,actor_role text,target_username text,
  action text,result text,details jsonb,created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare v_limit integer:=least(greatest(coalesce(p_limit,25),1),50);
begin
  if not public._outpost_zero_is_admin_main() then
    raise exception 'creator or main-admin access required' using errcode='42501';
  end if;
  return query
  select a.event_id,
         coalesce(public._outpost_zero_public_username(a.actor_user_id),
           case a.actor_role when 'creator' then 'CREATOR' when 'main' then 'MAIN ADMIN'
             when 'co' then 'CO-ADMIN' else 'PLAYER' end)::text,
         a.actor_role::text,
         case when a.target_user_id is null then 'SYSTEM'
           else coalesce(public._outpost_zero_public_username(a.target_user_id),'UNKNOWN PLAYER') end::text,
         a.action::text,a.result::text,
         public._outpost_zero_scrub_private_admin_json(a.details),a.created_at
  from public.outpost_zero_admin_audit a
  where p_before_event_id is null or a.event_id<p_before_event_id
  order by a.event_id desc limit v_limit;
end;
$function$;

-- Retire every email-addressed/listing boundary. The username wrappers above
-- remain SECURITY DEFINER so they can call these internal implementations,
-- but modified clients cannot call them directly or enumerate private keys.
revoke all on function public.admin_list_outpost_zero_weapon_grants(text) from public,anon,authenticated;
revoke all on function public.admin_set_outpost_zero_weapon_grant(text,text,integer,text,uuid) from public,anon,authenticated;
revoke all on function public.admin_revoke_outpost_zero_weapon_grant(text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.outpost_zero_admin_edit_player(text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.submit_outpost_zero_player_request(text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_player_requests(integer) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_bans(integer) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_ban_appeals(integer) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_admin_audit(bigint,integer) from public,anon,authenticated;
revoke all on function public._outpost_zero_public_username(uuid) from public,anon,authenticated;
revoke all on function public._outpost_zero_scrub_private_admin_json(jsonb) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_bans_by_username(integer) from public,anon,authenticated;
revoke all on function public.unban_outpost_zero_ban(bigint,uuid) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_ban_appeals_by_username(integer) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_admin_audit_by_username(bigint,integer) from public,anon,authenticated;

grant execute on function public.list_outpost_zero_bans_by_username(integer) to authenticated;
grant execute on function public.unban_outpost_zero_ban(bigint,uuid) to authenticated;
grant execute on function public.list_outpost_zero_ban_appeals_by_username(integer) to authenticated;
grant execute on function public.list_outpost_zero_admin_audit_by_username(bigint,integer) to authenticated;

-- REALTIME OWNERSHIP
-- Admin Menu storage is private RPC-only state. Explicitly remove every table
-- owned by this section from the publication in case the legacy miscellaneous
-- Realtime query exposed one of them. Admin 02 separately publishes only the
-- public banner feed; Admin 03 owns the protected Inbox/Reports feeds.
do $realtime$
declare relation_name text;
begin
  foreach relation_name in array array[
    'admins',
    'bans',
    'player_requests',
    'ban_appeals',
    'outpost_zero_weapon_grants',
    'outpost_zero_admin_audit'
  ] loop
    if exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = relation_name
    ) then
      execute format(
        'alter publication supabase_realtime drop table public.%I',
        relation_name
      );
    end if;
  end loop;
end;
$realtime$;

commit;
