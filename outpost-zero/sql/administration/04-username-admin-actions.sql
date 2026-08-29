-- OUTPOST ZERO / ADMINISTRATION / 04: USERNAME-BASED ADMIN ACTIONS
-- Run after Administration 01 and Social 01. Safe to rerun.
--
-- Admins enter a public username. These SECURITY DEFINER wrappers resolve the
-- matching Auth email inside Postgres and pass it to the audited Administration
-- 01 functions. The email is never returned to the browser.

begin;

do $preflight$
begin
  if to_regclass('public.social_profiles') is null then
    raise exception 'Administration 04 requires Social 01 (social_profiles)';
  end if;
  if to_regprocedure('public.admin_get_player(text)') is null
     or to_regprocedure('public.outpost_zero_admin_edit_player(text,jsonb,uuid)') is null
     or to_regprocedure('public.admin_list_outpost_zero_weapon_grants(text)') is null
     or to_regprocedure('public.admin_set_outpost_zero_weapon_grant(text,text,integer,text,uuid)') is null
     or to_regprocedure('public.admin_revoke_outpost_zero_weapon_grant(text,text,text,uuid)') is null
     or to_regprocedure('public.submit_outpost_zero_player_request(text,jsonb,uuid)') is null then
    raise exception 'Administration 04 requires Administration 01';
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

create or replace function public.admin_list_outpost_zero_weapon_grants_by_username(
  p_target_username text
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
  v_email text := public._outpost_zero_target_email_for_username(p_target_username);
begin
  if v_email is null then return; end if;
  return query select * from public.admin_list_outpost_zero_weapon_grants(v_email);
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
  select r.id::bigint, r.requested_by::text,
         coalesce(sp.handle, 'unknown')::text,
         r.patch::jsonb, r.status::text, r.created_at
  from public.player_requests as r
  left join auth.users as u
    on lower(btrim(u.email)) = lower(btrim(r.target_email))
  left join public.social_profiles as sp on sp.user_id = u.id
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

commit;
