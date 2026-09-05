-- OUTPOST ZERO / ADMIN 04: SECURITY
-- Owns this section's RLS policies, browser grants, RPC access, and RPC elevation.
-- No player records are copied, moved, or deleted by this file.
-- Install this file FIRST, then the Admin feature files in their existing dependency order.
-- Existing installations apply immediately; a fresh feature applies its boundary before commit.
-- Business authorization, validation, and privacy checks must stay inside their feature RPCs.
-- The installer is SECURITY INVOKER and cannot be called by browser/service roles.

begin;
create or replace function public._outpost_zero_apply_admin_security(p_required text default null)
returns void language plpgsql security invoker set search_path=pg_catalog,public
as $section_security$
declare v_applied text[]:=array[]::text[];
begin
  -- Admin 01: apply only after this feature's complete API exists.
  if to_regclass('public.admins') is not null
     and to_regclass('public.outpost_zero_admin_config') is not null
     and to_regclass('public.bans') is not null
     and to_regclass('public.player_requests') is not null
     and to_regclass('public.ban_appeals') is not null
     and to_regclass('public.outpost_zero_weapon_grants') is not null
     and to_regclass('public.outpost_zero_admin_audit') is not null
     and to_regclass('public.outpost_zero_admin_audit_event_id_seq') is not null
     and to_regprocedure('public._outpost_zero_creator_user_id()') is not null
     and to_regprocedure('public._outpost_zero_admin_role()') is not null
     and to_regprocedure('public._outpost_zero_is_admin_main()') is not null
     and to_regprocedure('public._outpost_zero_write_admin_audit(uuid, text, text, jsonb, uuid)') is not null
     and to_regprocedure('public.admin_role()') is not null
     and to_regprocedure('public.admin_get_player(text)') is not null
     and to_regprocedure('public.admin_edit_player(text,jsonb)') is not null
     and to_regprocedure('public._outpost_zero_validate_admin_patch(jsonb)') is not null
     and to_regprocedure('public.get_my_outpost_zero_weapon_grants()') is not null
     and to_regprocedure('public.admin_list_outpost_zero_weapon_grants(text)') is not null
     and to_regprocedure('public.admin_set_outpost_zero_weapon_grant(text, text, integer, text, uuid)') is not null
     and to_regprocedure('public.admin_revoke_outpost_zero_weapon_grant(text, text, text, uuid)') is not null
     and to_regprocedure('public.outpost_zero_admin_edit_player(text, jsonb, uuid)') is not null
     and to_regprocedure('public.submit_outpost_zero_player_request(text, jsonb, uuid)') is not null
     and to_regprocedure('public.list_outpost_zero_player_requests(integer)') is not null
     and to_regprocedure('public.resolve_outpost_zero_player_request(bigint, text, uuid)') is not null
     and to_regprocedure('public.get_my_outpost_zero_ban(text)') is not null
     and to_regprocedure('public.list_outpost_zero_bans(integer)') is not null
     and to_regprocedure('public.submit_outpost_zero_ban_appeal(text, uuid)') is not null
     and to_regprocedure('public.list_outpost_zero_ban_appeals(integer)') is not null
     and to_regprocedure('public.resolve_outpost_zero_ban_appeal(bigint, text, uuid)') is not null
     and to_regprocedure('public.list_outpost_zero_admin_audit(bigint, integer)') is not null
     and to_regprocedure('public._outpost_zero_admin_identity_label(uuid)') is not null
     and to_regprocedure('public._outpost_zero_admin_identity_kind(uuid)') is not null
     and to_regprocedure('public.list_outpost_zero_admin_identity_labels(uuid[])') is not null
     and to_regprocedure('public._outpost_zero_target_email_for_username(text)') is not null
     and to_regprocedure('public.outpost_zero_admin_get_player_by_username(text)') is not null
     and to_regprocedure('public.admin_list_outpost_zero_weapon_grants_by_username(text)') is not null
     and to_regprocedure('public.admin_set_outpost_zero_weapon_grant_by_username(text,text,integer,text,uuid)') is not null
     and to_regprocedure('public.admin_revoke_outpost_zero_weapon_grant_by_username(text,text,text,uuid)') is not null
     and to_regprocedure('public.outpost_zero_admin_edit_player_by_username(text,jsonb,uuid)') is not null
     and to_regprocedure('public.submit_outpost_zero_player_request_by_username(text,jsonb,uuid)') is not null
     and to_regprocedure('public.list_outpost_zero_player_requests_by_username(integer)') is not null
     and to_regprocedure('public.admin_set_outpost_zero_weapon_grant(text,text,integer,text,uuid)') is not null
     and to_regprocedure('public.admin_revoke_outpost_zero_weapon_grant(text,text,text,uuid)') is not null
     and to_regprocedure('public.outpost_zero_admin_edit_player(text,jsonb,uuid)') is not null
     and to_regprocedure('public.submit_outpost_zero_player_request(text,jsonb,uuid)') is not null
     and to_regprocedure('public.list_outpost_zero_admin_audit(bigint,integer)') is not null
     and to_regprocedure('public._outpost_zero_public_username(uuid)') is not null
     and to_regprocedure('public._outpost_zero_scrub_private_admin_json(jsonb)') is not null
     and to_regprocedure('public.list_outpost_zero_bans_by_username(integer)') is not null
     and to_regprocedure('public.unban_outpost_zero_ban(bigint,uuid)') is not null
     and to_regprocedure('public.list_outpost_zero_ban_appeals_by_username(integer)') is not null
     and to_regprocedure('public.list_outpost_zero_admin_audit_by_username(bigint,integer)') is not null then
    execute $security_admin_01$
-- BEGIN MOVED Admin-01-admin-menu.sql
alter table public.admins enable row level security;
alter table public.admins force row level security;
revoke all on table public.admins from public,anon,authenticated;
alter table public.outpost_zero_admin_config enable row level security;
alter table public.outpost_zero_admin_config force row level security;
revoke all on table public.outpost_zero_admin_config from public,anon,authenticated;
revoke all on function public._outpost_zero_creator_user_id()
  from public,anon,authenticated;

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

revoke all on function public._outpost_zero_admin_role()
  from public, anon, authenticated;
revoke all on function public._outpost_zero_is_admin_main()
  from public, anon, authenticated;
revoke all on function public._outpost_zero_write_admin_audit(uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;

revoke all on function public.admin_role() from public,anon;
grant execute on function public.admin_role() to authenticated;
revoke all on function public.admin_get_player(text) from public,anon,authenticated;
revoke all on function public.admin_edit_player(text,jsonb) from public,anon,authenticated;

revoke all on function public._outpost_zero_validate_admin_patch(jsonb)
  from public, anon, authenticated;

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
    execute 'alter table public.player_log enable row level security';
    execute 'alter table public.player_log force row level security';
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

revoke all on function public._outpost_zero_admin_identity_label(uuid) from public,anon,authenticated;
revoke all on function public._outpost_zero_admin_identity_kind(uuid) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_admin_identity_labels(uuid[]) from public,anon,authenticated;
grant execute on function public.list_outpost_zero_admin_identity_labels(uuid[]) to authenticated;

revoke all on function public._outpost_zero_target_email_for_username(text)
  from public, anon, authenticated;

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
revoke all on function public._outpost_zero_admin_identity_label(uuid) from public,anon,authenticated;
revoke all on function public._outpost_zero_admin_identity_kind(uuid) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_admin_identity_labels(uuid[]) from public,anon,authenticated;
revoke all on function public._outpost_zero_scrub_private_admin_json(jsonb) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_bans_by_username(integer) from public,anon,authenticated;
revoke all on function public.unban_outpost_zero_ban(bigint,uuid) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_ban_appeals_by_username(integer) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_admin_audit_by_username(bigint,integer) from public,anon,authenticated;

grant execute on function public.list_outpost_zero_bans_by_username(integer) to authenticated;
grant execute on function public.unban_outpost_zero_ban(bigint,uuid) to authenticated;
grant execute on function public.list_outpost_zero_ban_appeals_by_username(integer) to authenticated;
grant execute on function public.list_outpost_zero_admin_audit_by_username(bigint,integer) to authenticated;
grant execute on function public.list_outpost_zero_admin_identity_labels(uuid[]) to authenticated;
-- END MOVED Admin-01-admin-menu.sql
$security_admin_01$;
    v_applied:=array_append(v_applied,'Admin 01');
  end if;
  -- Admin 02: apply only after this feature's complete API exists.
  if to_regclass('public.admins') is not null
     and to_regclass('public.banners') is not null
     and to_regclass('public.outpost_zero_weapon_suggestions') is not null
     and to_regclass('public.promo_codes') is not null
     and to_regclass('public.promo_redemptions') is not null
     and to_regclass('public.outpost_zero_promo_attempts') is not null
     and to_regprocedure('public._outpost_zero_update_role()') is not null
     and to_regprocedure('public.list_outpost_zero_admin_roster()') is not null
     and to_regprocedure('public.promote_outpost_zero_admin(text)') is not null
     and to_regprocedure('public.demote_outpost_zero_admin(text)') is not null
     and to_regprocedure('public.remove_outpost_zero_admin(text)') is not null
     and to_regprocedure('public.post_outpost_zero_update(text)') is not null
     and to_regprocedure('public.post_outpost_zero_update_v2(text,text)') is not null
     and to_regprocedure('public.approve_outpost_zero_update(bigint)') is not null
     and to_regprocedure('public.reject_outpost_zero_update(bigint)') is not null
     and to_regprocedure('public.delete_outpost_zero_update(bigint)') is not null
     and to_regprocedure('public.list_outpost_zero_updates(boolean, bigint, integer)') is not null
     and to_regprocedure('public.list_outpost_zero_updates_v2(boolean,bigint,integer)') is not null
     and to_regprocedure('public._outpost_zero_staff_role()') is not null
     and to_regprocedure('public._outpost_zero_staff_email()') is not null
     and to_regprocedure('public.add_outpost_zero_admin(text,text)') is not null
     and to_regprocedure('public.submit_outpost_zero_weapon_suggestion(text,text)') is not null
     and to_regprocedure('public.list_outpost_zero_weapon_suggestions(integer,text)') is not null
     and to_regprocedure('public.review_outpost_zero_weapon_suggestion(bigint,text,text)') is not null
     and to_regprocedure('public.save_outpost_zero_weapon_definition(text,jsonb,integer,boolean)') is not null
     and to_regprocedure('public._outpost_zero_staff_target_email_for_username(text)') is not null
     and to_regprocedure('public.list_outpost_zero_admin_roster_by_username()') is not null
     and to_regprocedure('public.add_outpost_zero_admin_by_username(text,text)') is not null
     and to_regprocedure('public.promote_outpost_zero_admin_by_username(text)') is not null
     and to_regprocedure('public.demote_outpost_zero_admin_by_username(text)') is not null
     and to_regprocedure('public.remove_outpost_zero_admin_by_username(text)') is not null
     and to_regprocedure('public.list_outpost_zero_weapon_suggestions_by_username(integer,text)') is not null
     and to_regprocedure('public._outpost_zero_admin_role()') is not null
     and to_regprocedure('public.list_outpost_zero_promo_codes()') is not null
     and to_regprocedure('public.save_outpost_zero_promo_code(text,integer,integer,integer,timestamptz)') is not null
     and to_regprocedure('public.set_outpost_zero_promo_active(text,boolean)') is not null
     and to_regprocedure('public.delete_outpost_zero_promo_code(text)') is not null
     and to_regprocedure('public.redeem_promo(text)') is not null then
    execute $security_admin_02$
-- BEGIN MOVED Admin-02-admins.sql
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
alter table public.outpost_zero_weapon_suggestions enable row level security;
alter table public.outpost_zero_weapon_suggestions force row level security;
revoke all on table public.outpost_zero_weapon_suggestions from public,anon,authenticated;

-- Existing projects may still have the former weapon query's direct-write policy
-- and column grants. Tighten those tables now when present, while preserving
-- Admin 02's ability to be repaired while Player 02 is temporarily unavailable.
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
    -- The legacy weapon query used column-level INSERT/UPDATE grants; a table-level
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
-- END MOVED Admin-02-admins.sql
$security_admin_02$;
    v_applied:=array_append(v_applied,'Admin 02');
  end if;
  -- Admin 03: apply only after this feature's complete API exists.
  if to_regclass('public.outpost_zero_admin_msg_wakeups') is not null
     and to_regclass('public.outpost_zero_notifications') is not null
     and to_regclass('public.outpost_zero_notification_reads') is not null
     and to_regclass('public.outpost_zero_notifications_notification_id_seq') is not null
     and to_regclass('public.admin_msgs') is not null
     and to_regclass('public.reports') is not null
     and to_regclass('public.outpost_zero_report_wakeups') is not null
     and to_regprocedure('public._outpost_zero_wake_admin_message_participants()') is not null
     and to_regprocedure('public._outpost_zero_admin_target_user_id(text,boolean)') is not null
     and to_regprocedure('public._outpost_zero_notification_id(text)') is not null
     and to_regprocedure('public._outpost_zero_notification_handle(uuid)') is not null
     and to_regprocedure('public._outpost_zero_notify_admin_audit()') is not null
     and to_regprocedure('public._outpost_zero_notify_banner()') is not null
     and to_regprocedure('public._outpost_zero_notify_friendship()') is not null
     and to_regprocedure('public.send_outpost_zero_admin_notification(text, text, text, uuid)') is not null
     and to_regprocedure('public.list_my_outpost_zero_notifications(text, integer)') is not null
     and to_regprocedure('public.get_my_outpost_zero_notification_summary()') is not null
     and to_regprocedure('public.mark_my_outpost_zero_notifications_read(text[])') is not null
     and to_regprocedure('public._outpost_zero_admin_message_username(uuid)') is not null
     and to_regprocedure('public._outpost_zero_admin_message_identity_label(uuid)') is not null
     and to_regprocedure('public.list_my_outpost_zero_admin_messages(integer)') is not null
     and to_regprocedure('public.send_outpost_zero_admin_message(text,text,uuid)') is not null
     and to_regprocedure('public.mark_my_outpost_zero_admin_messages_read(bigint[])') is not null
     and to_regprocedure('public.archive_my_outpost_zero_admin_message(bigint)') is not null
     and to_regprocedure('public._outpost_zero_redact_report_text(text)') is not null
     and to_regprocedure('public._outpost_zero_report_public_name(text,uuid)') is not null
     and to_regprocedure('public._outpost_zero_sanitized_report_meta(jsonb)') is not null
     and to_regprocedure('public.submit_outpost_zero_report(text,jsonb,text)') is not null
     and to_regprocedure('public.list_outpost_zero_reports(boolean,bigint,integer)') is not null
     and to_regprocedure('public.resolve_outpost_zero_report(bigint)') is not null
     and to_regprocedure('public.resolve_outpost_zero_reports(integer)') is not null
     and to_regprocedure('public.export_outpost_zero_reports(integer)') is not null
     and to_regprocedure('public._outpost_zero_wake_report_reviewers()') is not null then
    execute $security_admin_03$
-- BEGIN MOVED Admin-03-inbox.sql
alter table public.outpost_zero_admin_msg_wakeups enable row level security;
alter table public.outpost_zero_admin_msg_wakeups force row level security;
do $wake_policies$
declare item record;
begin
  for item in select policyname from pg_policies
    where schemaname='public' and tablename='outpost_zero_admin_msg_wakeups'
  loop execute format('drop policy %I on public.outpost_zero_admin_msg_wakeups',item.policyname);end loop;
end;
$wake_policies$;
create policy outpost_zero_admin_msg_wakeups_own_read
  on public.outpost_zero_admin_msg_wakeups for select to authenticated
  using(auth.uid()=recipient_id);
revoke all on table public.outpost_zero_admin_msg_wakeups from public,anon,authenticated;
grant select(recipient_id,revision,updated_at) on public.outpost_zero_admin_msg_wakeups to authenticated;
revoke all on function public._outpost_zero_wake_admin_message_participants() from public,anon,authenticated;

-- Neither table has a browser policy. FORCE RLS plus zero raw grants means a
-- modified client cannot enumerate recipients, forge an author, insert an
-- event, or mark another account's row.
alter table public.outpost_zero_notifications enable row level security;
alter table public.outpost_zero_notifications force row level security;
alter table public.outpost_zero_notification_reads enable row level security;
alter table public.outpost_zero_notification_reads force row level security;

do $block$
declare v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('outpost_zero_notifications', 'outpost_zero_notification_reads')
  loop
    execute format('drop policy %I on %I.%I',
      v_policy.policyname, v_policy.schemaname, v_policy.tablename);
  end loop;
end;
$block$;

revoke all on table public.outpost_zero_notifications
  from public, anon, authenticated;
revoke all on table public.outpost_zero_notification_reads
  from public, anon, authenticated;
revoke all on sequence public.outpost_zero_notifications_notification_id_seq
  from public, anon, authenticated;

revoke all on function public._outpost_zero_admin_target_user_id(text,boolean)
  from public,anon,authenticated;

-- Creating/replacing functions grants PUBLIC execute by default. Close all
-- helpers/triggers and expose only the four authenticated Inbox RPCs.
revoke all on function public._outpost_zero_notification_id(text)
  from public, anon, authenticated;
revoke all on function public._outpost_zero_notification_handle(uuid)
  from public, anon, authenticated;
revoke all on function public._outpost_zero_notify_admin_audit()
  from public, anon, authenticated;
revoke all on function public._outpost_zero_notify_banner()
  from public, anon, authenticated;
revoke all on function public._outpost_zero_notify_friendship()
  from public, anon, authenticated;
revoke all on function public.send_outpost_zero_admin_notification(text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.list_my_outpost_zero_notifications(text, integer)
  from public, anon, authenticated;
revoke all on function public.get_my_outpost_zero_notification_summary()
  from public, anon, authenticated;
revoke all on function public.mark_my_outpost_zero_notifications_read(text[])
  from public, anon, authenticated;

grant execute on function public.send_outpost_zero_admin_notification(text, text, text, uuid)
  to authenticated;
grant execute on function public.list_my_outpost_zero_notifications(text, integer)
  to authenticated;
grant execute on function public.get_my_outpost_zero_notification_summary()
  to authenticated;
grant execute on function public.mark_my_outpost_zero_notifications_read(text[])
  to authenticated;

-- Staff Inbox and Reports are separate protected tables inside this one Inbox
-- module. Admin messages are RPC-only: even a modified staff client cannot
-- select the internal from_email/to_email columns or receive them over
-- Realtime. Visible email fallbacks are resolved per viewer inside the RPC.
alter table public.admin_msgs enable row level security;
alter table public.admin_msgs force row level security;
do $policies$
declare item record;
begin
  for item in select policyname from pg_policies where schemaname='public' and tablename='admin_msgs'
  loop execute format('drop policy %I on public.admin_msgs',item.policyname);end loop;
end;
$policies$;
revoke all on table public.admin_msgs from public,anon,authenticated;
do $sequences$
declare sequence_name text;
begin
  sequence_name:=pg_get_serial_sequence('public.admin_msgs','id');
  if sequence_name is not null then execute format('revoke all on sequence %s from public,anon,authenticated',sequence_name);end if;
end;
$sequences$;

revoke all on function public._outpost_zero_admin_message_username(uuid) from public,anon,authenticated;
revoke all on function public._outpost_zero_admin_message_identity_label(uuid) from public,anon,authenticated;
revoke all on function public._outpost_zero_admin_target_user_id(text,boolean) from public,anon,authenticated;
revoke all on function public.list_my_outpost_zero_admin_messages(integer) from public,anon,authenticated;
revoke all on function public.send_outpost_zero_admin_message(text,text,uuid) from public,anon,authenticated;
revoke all on function public.mark_my_outpost_zero_admin_messages_read(bigint[]) from public,anon,authenticated;
revoke all on function public.archive_my_outpost_zero_admin_message(bigint) from public,anon,authenticated;
grant execute on function public.list_my_outpost_zero_admin_messages(integer) to authenticated;
grant execute on function public.send_outpost_zero_admin_message(text,text,uuid) to authenticated;
grant execute on function public.mark_my_outpost_zero_admin_messages_read(bigint[]) to authenticated;
grant execute on function public.archive_my_outpost_zero_admin_message(bigint) to authenticated;

-- Reports are RPC-only. The browser cannot choose a reporter name, user ID,
-- staff flag, timestamp, or resolved state, and cannot read the raw legacy
-- rows. SECURITY DEFINER functions below derive identity from auth.uid().
alter table public.reports enable row level security;
alter table public.reports force row level security;
do $report_policies$
declare item record;
begin
  for item in select policyname from pg_policies where schemaname='public' and tablename='reports'
  loop execute format('drop policy %I on public.reports',item.policyname);end loop;
end;
$report_policies$;
revoke all on table public.reports from public,anon,authenticated;
do $report_sequence$
declare sequence_name text;
begin
  sequence_name:=pg_get_serial_sequence('public.reports','id');
  if sequence_name is not null then
    execute format('revoke all on sequence %s from public,anon,authenticated',sequence_name);
  end if;
end;
$report_sequence$;

revoke all on function public._outpost_zero_redact_report_text(text) from public,anon,authenticated;
revoke all on function public._outpost_zero_report_public_name(text,uuid) from public,anon,authenticated;
revoke all on function public._outpost_zero_sanitized_report_meta(jsonb) from public,anon,authenticated;
revoke all on function public.submit_outpost_zero_report(text,jsonb,text) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_reports(boolean,bigint,integer) from public,anon,authenticated;
revoke all on function public.resolve_outpost_zero_report(bigint) from public,anon,authenticated;
revoke all on function public.resolve_outpost_zero_reports(integer) from public,anon,authenticated;
revoke all on function public.export_outpost_zero_reports(integer) from public,anon,authenticated;
grant execute on function public.submit_outpost_zero_report(text,jsonb,text) to authenticated;
grant execute on function public.list_outpost_zero_reports(boolean,bigint,integer) to authenticated;
grant execute on function public.resolve_outpost_zero_report(bigint) to authenticated;
grant execute on function public.resolve_outpost_zero_reports(integer) to authenticated;
grant execute on function public.export_outpost_zero_reports(integer) to authenticated;
alter table public.outpost_zero_report_wakeups enable row level security;
alter table public.outpost_zero_report_wakeups force row level security;
do $report_wakeup_policies$
declare item record;
begin
  for item in select policyname from pg_policies where schemaname='public' and tablename='outpost_zero_report_wakeups'
  loop execute format('drop policy %I on public.outpost_zero_report_wakeups',item.policyname);end loop;
end;
$report_wakeup_policies$;
create policy outpost_zero_report_wakeups_own_read on public.outpost_zero_report_wakeups
  for select to authenticated using(auth.uid()=recipient_id);
revoke all on table public.outpost_zero_report_wakeups from public,anon,authenticated;
grant select(recipient_id,revision,updated_at) on public.outpost_zero_report_wakeups to authenticated;
revoke all on function public._outpost_zero_wake_report_reviewers() from public,anon,authenticated;
-- END MOVED Admin-03-inbox.sql
$security_admin_03$;
    v_applied:=array_append(v_applied,'Admin 03');
  end if;
  if p_required is not null and not p_required=any(v_applied) then
    raise exception '% security prerequisites are incomplete; transaction rolled back',p_required;
  end if;
end;
$section_security$;
revoke all on function public._outpost_zero_apply_admin_security(text) from public,anon,authenticated,service_role;
select public._outpost_zero_apply_admin_security();
commit;
