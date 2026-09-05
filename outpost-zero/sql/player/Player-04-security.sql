-- OUTPOST ZERO / PLAYER 04: SECURITY
-- Owns this section's RLS policies, browser grants, RPC access, and RPC elevation.
-- No player records are copied, moved, or deleted by this file.
-- Install this file FIRST, then the Player feature files in their existing dependency order.
-- Existing installations apply immediately; a fresh feature applies its boundary before commit.
-- Business authorization, validation, and privacy checks must stay inside their feature RPCs.
-- The installer is SECURITY INVOKER and cannot be called by browser/service roles.

begin;
create or replace function public._outpost_zero_apply_player_security(p_required text default null)
returns void language plpgsql security invoker set search_path=pg_catalog,public
as $section_security$
declare v_applied text[]:=array[]::text[];
begin
  -- Player 01: apply only after this feature's complete API exists.
  if to_regclass('public.scores') is not null
     and to_regclass('public.outpost_zero_arena_win_receipts') is not null
     and to_regclass('public.outpost_zero_bot_ladder') is not null
     and to_regclass('public.outpost_zero_bot_ladder_matches') is not null
     and to_regprocedure('public.outpost_zero_reject_legacy_profile_score()') is not null
     and to_regprocedure('public.get_outpost_zero_leaderboard(text, integer)') is not null
     and to_regprocedure('public.get_outpost_zero_public_player(text)') is not null
     and to_regprocedure('public.record_outpost_zero_arena_win(text, uuid)') is not null
     and to_regprocedure('public.get_outpost_zero_bot_ladder()') is not null
     and to_regprocedure('public.submit_outpost_zero_bot_ladder(uuid, boolean, integer)') is not null then
    execute $security_player_01$
-- BEGIN MOVED Player-01-stats.sql
alter table public.scores enable row level security;
alter table public.scores force row level security;
alter table public.outpost_zero_arena_win_receipts enable row level security;
alter table public.outpost_zero_arena_win_receipts force row level security;

-- A trigger does not require browser roles to execute its helper directly.
-- Clear legacy direct grants as well as the default PUBLIC grant.
revoke all on function public.outpost_zero_reject_legacy_profile_score()
  from public, anon, authenticated;

revoke all on function public.get_outpost_zero_leaderboard(text, integer) from public;
grant execute on function public.get_outpost_zero_leaderboard(text, integer) to anon, authenticated;

revoke all on function public.get_outpost_zero_public_player(text) from public;
grant execute on function public.get_outpost_zero_public_player(text) to anon, authenticated;

-- Signed-out boards use the narrow RPCs above. Signed-in game code sees only
-- its own rows, the two intentionally public boards, and referral claims that
-- target that signed-in account. Rows for another game sharing this table stay
-- outside Outpost Zero's browser perimeter.
drop policy if exists "read all" on public.scores;
drop policy if exists "write self" on public.scores;
drop policy if exists "update self" on public.scores;
drop policy if exists outpost_zero_scores_authenticated_read on public.scores;
drop policy if exists outpost_zero_scores_self_insert on public.scores;
drop policy if exists outpost_zero_scores_self_update on public.scores;

create policy outpost_zero_scores_authenticated_read
on public.scores for select to authenticated
using (
  auth.uid()=user_id
  or game in ('outpost-zero','outpost-zero-arena-wins')
  or game='outpost-zero-referral:'||auth.uid()::text
);

create policy outpost_zero_scores_self_insert
on public.scores for insert to authenticated
with check (auth.uid() = user_id and game <> 'outpost-zero-arena-wins');

create policy outpost_zero_scores_self_update
on public.scores for update to authenticated
using (auth.uid() = user_id and game <> 'outpost-zero-arena-wins')
with check (auth.uid() = user_id and game <> 'outpost-zero-arena-wins');

revoke all on table public.scores from public, anon, authenticated;
revoke all on table public.outpost_zero_arena_win_receipts from public, anon, authenticated;
grant select on table public.scores to authenticated;
grant insert(user_id, game, name, score) on table public.scores to authenticated;
grant update(name, score, updated_at) on table public.scores to authenticated;

revoke all on function public.record_outpost_zero_arena_win(text, uuid) from public, anon;
grant execute on function public.record_outpost_zero_arena_win(text, uuid) to authenticated;

alter table public.outpost_zero_bot_ladder enable row level security;
alter table public.outpost_zero_bot_ladder force row level security;
alter table public.outpost_zero_bot_ladder_matches enable row level security;
alter table public.outpost_zero_bot_ladder_matches force row level security;

-- No direct table policy is intentional. Narrow SECURITY DEFINER RPCs are the
-- only API boundary, so another signed-in player cannot enumerate ladder rows
-- or forge progress through a REST table write.
revoke all on table public.outpost_zero_bot_ladder from public, anon, authenticated;
revoke all on table public.outpost_zero_bot_ladder_matches from public, anon, authenticated;

revoke all on function public.get_outpost_zero_bot_ladder() from public, anon, authenticated;
revoke all on function public.submit_outpost_zero_bot_ladder(uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.get_outpost_zero_bot_ladder() to anon, authenticated;
grant execute on function public.submit_outpost_zero_bot_ladder(uuid, boolean, integer) to authenticated;

-- Retire the previous shared-XP API if AI 01 was installed from an older copy.
-- Data is deliberately left in place: rerunning this migration never drops or
-- rewrites an older table, but no browser role can keep using the obsolete API.
do $block$
begin
  if to_regprocedure('public.get_outpost_zero_bot_training()') is not null then
    execute 'revoke all on function public.get_outpost_zero_bot_training() from public, anon, authenticated';
  end if;
  if to_regprocedure('public.submit_outpost_zero_bot_training(uuid,boolean)') is not null then
    execute 'revoke all on function public.submit_outpost_zero_bot_training(uuid, boolean) from public, anon, authenticated';
  end if;
  if to_regclass('public.global_bot_training') is not null then
    execute 'revoke all on table public.global_bot_training from public, anon, authenticated';
  end if;
  if to_regclass('public.global_bot_training_contributions') is not null then
    execute 'revoke all on table public.global_bot_training_contributions from public, anon, authenticated';
  end if;
end;
$block$;
-- END MOVED Player-01-stats.sql
$security_player_01$;
    v_applied:=array_append(v_applied,'Player 01');
  end if;
  -- Player 02: apply only after this feature's complete API exists.
  if to_regclass('public.weapon_prices') is not null
     and to_regclass('public.weapon_defs') is not null then
    execute $security_player_02$
-- BEGIN MOVED Player-02-weapons-and-cosmetics.sql
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
-- END MOVED Player-02-weapons-and-cosmetics.sql
$security_player_02$;
    v_applied:=array_append(v_applied,'Player 02');
  end if;
  -- Player 03: apply only after this feature's complete API exists.
  if to_regclass('public.profiles') is not null
     and to_regclass('public.social_profiles') is not null
     and to_regclass('public.friendships') is not null
     and to_regclass('public.private_messages') is not null
     and to_regclass('public.outpost_zero_party_invite_targets') is not null
     and to_regclass('public.outpost_zero_party_invites') is not null
     and to_regclass('public.outpost_zero_public_parties') is not null
     and to_regclass('public.outpost_zero_public_party_requests') is not null
     and to_regclass('public.private_conversation_states') is not null
     and to_regclass('public.friendships_id_seq') is not null
     and to_regclass('public.private_messages_id_seq') is not null
     and to_regprocedure('public.social_create_profile_for_user()') is not null
     and to_regprocedure('public.social_profiles_username_clock()') is not null
     and to_regprocedure('public.outpost_zero_set_username(text)') is not null
     and to_regprocedure('public.outpost_zero_username_available(text)') is not null
     and to_regprocedure('public.list_outpost_zero_party_invite_targets(integer, text[])') is not null
     and to_regprocedure('public.send_outpost_zero_party_invite(uuid, text, text, text, uuid)') is not null
     and to_regprocedure('public.list_outpost_zero_party_invites(integer)') is not null
     and to_regprocedure('public.claim_outpost_zero_party_invite(uuid)') is not null
     and to_regprocedure('public.dismiss_outpost_zero_party_invite(uuid)') is not null
     and to_regprocedure('public.publish_outpost_zero_public_party(text, text, integer, integer)') is not null
     and to_regprocedure('public.close_outpost_zero_public_party(uuid)') is not null
     and to_regprocedure('public.list_outpost_zero_public_parties(integer, text)') is not null
     and to_regprocedure('public.request_outpost_zero_public_party(uuid, uuid)') is not null
     and to_regprocedure('public.list_outpost_zero_public_party_host_requests(integer)') is not null
     and to_regprocedure('public.decide_outpost_zero_public_party_request(uuid, boolean, text)') is not null
     and to_regprocedure('public.list_my_outpost_zero_public_party_requests(integer)') is not null
     and to_regprocedure('public.list_my_outpost_zero_private_conversation_states()') is not null
     and to_regprocedure('public.set_my_outpost_zero_private_conversation_state(uuid, text)') is not null
     and to_regprocedure('public.archive_my_outpost_zero_private_conversation_overflow()') is not null
     and to_regprocedure('public.send_outpost_zero_private_message(text, text)') is not null
     and to_regprocedure('public.set_outpost_zero_player_block(text, boolean)') is not null
     and to_regprocedure('public.social_profiles_normalize()') is not null
     and to_regprocedure('public.friendships_validate_change()') is not null
     and to_regprocedure('public.private_messages_immutable()') is not null then
    execute $security_player_03$
-- BEGIN MOVED Player-03-social-menu.sql
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Profiles is Outpost Zero-owned, so replace every legacy policy with one
-- exact own-row perimeter instead of leaving permissive policies additive.
do $policies$
declare p record;
begin
  for p in select policyname from pg_catalog.pg_policies where schemaname='public' and tablename='profiles'
  loop execute format('drop policy %I on public.profiles',p.policyname); end loop;
end;
$policies$;

create policy outpost_zero_profiles_own_read
on public.profiles for select to authenticated
using ((select auth.uid())=user_id);
create policy outpost_zero_profiles_own_insert
on public.profiles for insert to authenticated
with check ((select auth.uid())=user_id);
create policy outpost_zero_profiles_own_update
on public.profiles for update to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

revoke all on table public.profiles from public, anon, authenticated;
-- Table revokes do not remove old column ACLs. Clear them before granting the
-- exact three-column browser interface used by persistence.js.
do $column_acl$
declare p record;
begin
  for p in
    select distinct grantee,privilege_type,column_name
    from information_schema.column_privileges
    where table_schema='public' and table_name='profiles'
      and grantee in ('PUBLIC','anon','authenticated')
  loop
    execute format(
      'revoke %s (%I) on table public.profiles from %s',
      p.privilege_type,
      p.column_name,
      case when p.grantee='PUBLIC' then 'PUBLIC' else quote_ident(p.grantee) end
    );
  end loop;
end;
$column_acl$;
grant select(user_id,data,updated_at),insert(user_id,data,updated_at),update(user_id,data,updated_at)
on public.profiles to authenticated;

-- ROW-LEVEL SECURITY
alter table public.social_profiles enable row level security;
alter table public.social_profiles force row level security;
alter table public.friendships enable row level security;
alter table public.friendships force row level security;
alter table public.private_messages enable row level security;
alter table public.private_messages force row level security;
alter table public.outpost_zero_party_invite_targets enable row level security;
alter table public.outpost_zero_party_invite_targets force row level security;
alter table public.outpost_zero_party_invites enable row level security;
alter table public.outpost_zero_party_invites force row level security;
alter table public.outpost_zero_public_parties enable row level security;
alter table public.outpost_zero_public_parties force row level security;
alter table public.outpost_zero_public_party_requests enable row level security;
alter table public.outpost_zero_public_party_requests force row level security;
alter table public.private_conversation_states enable row level security;
alter table public.private_conversation_states force row level security;

-- PUBLIC USERNAME PROFILES
drop policy if exists social_profiles_authenticated_read on public.social_profiles;
create policy social_profiles_authenticated_read on public.social_profiles
for select to authenticated using (true);

drop policy if exists social_profiles_own_insert on public.social_profiles;
create policy social_profiles_own_insert on public.social_profiles
for insert to authenticated with check (user_id = auth.uid());

-- Username updates must use outpost_zero_set_username so the 21-day clock
-- cannot be bypassed by a direct table update.
drop policy if exists social_profiles_own_update on public.social_profiles;

-- FRIENDSHIPS
drop policy if exists friendships_participant_read on public.friendships;
create policy friendships_participant_read on public.friendships
for select to authenticated
using (auth.uid() in (requester_id, addressee_id));

drop policy if exists friendships_requester_insert on public.friendships;
create policy friendships_requester_insert on public.friendships
for insert to authenticated
with check (requester_id = auth.uid() and status = 'pending' and blocked_by is null);

drop policy if exists friendships_participant_update on public.friendships;
create policy friendships_participant_update on public.friendships
for update to authenticated
using (auth.uid() in (requester_id, addressee_id))
with check (auth.uid() in (requester_id, addressee_id));

drop policy if exists friendships_safe_delete on public.friendships;
create policy friendships_safe_delete on public.friendships
for delete to authenticated
using (
  (status in ('pending', 'accepted') and auth.uid() in (requester_id, addressee_id))
  or (status = 'blocked' and auth.uid() = blocked_by)
);

-- PRIVATE MESSAGES
drop policy if exists private_messages_participant_read on public.private_messages;
create policy private_messages_participant_read on public.private_messages
for select to authenticated
using (auth.uid() in (sender_id, recipient_id));

-- Direct inserts remain accepted-friend-only for legacy machine invitation
-- envelopes. Human messages to any username use the rate-limited RPC.
drop policy if exists private_messages_friends_insert on public.private_messages;
create policy private_messages_friends_insert on public.private_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = sender_id and f.addressee_id = recipient_id)
        or (f.requester_id = recipient_id and f.addressee_id = sender_id))
  )
);

drop policy if exists private_messages_recipient_update on public.private_messages;
create policy private_messages_recipient_update on public.private_messages
for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

drop policy if exists private_messages_participant_delete on public.private_messages;

-- PRIVATE CONVERSATION STATE
drop policy if exists private_conversation_states_owner_read on public.private_conversation_states;
create policy private_conversation_states_owner_read on public.private_conversation_states
for select to authenticated
using (owner_id = auth.uid());

-- Raw Party rows contain capability material and intentionally have no browser
-- policy. Remove obsolete policy names if an older migration created them.
drop policy if exists outpost_zero_party_invite_targets_browser on public.outpost_zero_party_invite_targets;
drop policy if exists outpost_zero_party_invites_browser on public.outpost_zero_party_invites;

-- TABLE + SEQUENCE PRIVILEGES
revoke all on table public.social_profiles, public.friendships, public.private_messages
  from public, anon, authenticated;
grant select on table public.social_profiles to authenticated;
grant insert (user_id, handle, handle_key, display_name)
  on table public.social_profiles to authenticated;
grant select, delete on table public.friendships to authenticated;
grant insert (requester_id, addressee_id, status)
  on table public.friendships to authenticated;
grant update (status, blocked_by) on table public.friendships to authenticated;
grant select on table public.private_messages to authenticated;
grant insert (sender_id, recipient_id, body)
  on table public.private_messages to authenticated;
grant update (read_at) on table public.private_messages to authenticated;

revoke all on sequence public.friendships_id_seq, public.private_messages_id_seq
  from public, anon, authenticated;
grant usage on sequence public.friendships_id_seq, public.private_messages_id_seq
  to authenticated;

revoke all on table
  public.outpost_zero_party_invite_targets,
  public.outpost_zero_party_invites,
  public.outpost_zero_public_parties,
  public.outpost_zero_public_party_requests
from public, anon, authenticated;

revoke all on table public.private_conversation_states
  from public, anon, authenticated;
grant select on table public.private_conversation_states to authenticated;

-- TRIGGER + RPC PRIVILEGES
-- Feature migrations create these functions as SECURITY INVOKER. Only this
-- final security migration elevates the narrow, reviewed entry points.
alter function public.social_create_profile_for_user() security definer;
alter function public.social_profiles_username_clock() security definer;
alter function public.outpost_zero_set_username(text) security definer;
alter function public.outpost_zero_username_available(text) security definer;

alter function public.list_outpost_zero_party_invite_targets(integer, text[]) security definer;
alter function public.send_outpost_zero_party_invite(uuid, text, text, text, uuid) security definer;
alter function public.list_outpost_zero_party_invites(integer) security definer;
alter function public.claim_outpost_zero_party_invite(uuid) security definer;
alter function public.dismiss_outpost_zero_party_invite(uuid) security definer;
alter function public.publish_outpost_zero_public_party(text, text, integer, integer) security definer;
alter function public.close_outpost_zero_public_party(uuid) security definer;
alter function public.list_outpost_zero_public_parties(integer, text) security definer;
alter function public.request_outpost_zero_public_party(uuid, uuid) security definer;
alter function public.list_outpost_zero_public_party_host_requests(integer) security definer;
alter function public.decide_outpost_zero_public_party_request(uuid, boolean, text) security definer;
alter function public.list_my_outpost_zero_public_party_requests(integer) security definer;

alter function public.list_my_outpost_zero_private_conversation_states() security definer;
alter function public.set_my_outpost_zero_private_conversation_state(uuid, text) security definer;
alter function public.archive_my_outpost_zero_private_conversation_overflow() security definer;
alter function public.send_outpost_zero_private_message(text, text) security definer;
alter function public.set_outpost_zero_player_block(text, boolean) security definer;

revoke all on function public.social_profiles_normalize() from public, anon, authenticated;
revoke all on function public.social_create_profile_for_user() from public, anon, authenticated;
revoke all on function public.friendships_validate_change() from public, anon, authenticated;
revoke all on function public.private_messages_immutable() from public, anon, authenticated;
revoke all on function public.social_profiles_username_clock() from public, anon, authenticated;

revoke all on function public.outpost_zero_set_username(text) from public, anon, authenticated;
revoke all on function public.outpost_zero_username_available(text) from public, anon, authenticated;
grant execute on function public.outpost_zero_set_username(text) to authenticated;
grant execute on function public.outpost_zero_username_available(text) to anon, authenticated;

revoke all on function public.list_outpost_zero_party_invite_targets(integer, text[]) from public, anon, authenticated;
revoke all on function public.send_outpost_zero_party_invite(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.list_outpost_zero_party_invites(integer) from public, anon, authenticated;
revoke all on function public.claim_outpost_zero_party_invite(uuid) from public, anon, authenticated;
revoke all on function public.dismiss_outpost_zero_party_invite(uuid) from public, anon, authenticated;
grant execute on function public.list_outpost_zero_party_invite_targets(integer, text[]) to authenticated;
grant execute on function public.send_outpost_zero_party_invite(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.list_outpost_zero_party_invites(integer) to authenticated;
grant execute on function public.claim_outpost_zero_party_invite(uuid) to authenticated;
grant execute on function public.dismiss_outpost_zero_party_invite(uuid) to authenticated;

revoke all on function public.publish_outpost_zero_public_party(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.close_outpost_zero_public_party(uuid) from public, anon, authenticated;
revoke all on function public.list_outpost_zero_public_parties(integer, text) from public, anon, authenticated;
revoke all on function public.request_outpost_zero_public_party(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_outpost_zero_public_party_host_requests(integer) from public, anon, authenticated;
revoke all on function public.decide_outpost_zero_public_party_request(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.list_my_outpost_zero_public_party_requests(integer) from public, anon, authenticated;
grant execute on function public.publish_outpost_zero_public_party(text, text, integer, integer) to authenticated;
grant execute on function public.close_outpost_zero_public_party(uuid) to authenticated;
grant execute on function public.list_outpost_zero_public_parties(integer, text) to authenticated;
grant execute on function public.request_outpost_zero_public_party(uuid, uuid) to authenticated;
grant execute on function public.list_outpost_zero_public_party_host_requests(integer) to authenticated;
grant execute on function public.decide_outpost_zero_public_party_request(uuid, boolean, text) to authenticated;
grant execute on function public.list_my_outpost_zero_public_party_requests(integer) to authenticated;

revoke all on function public.list_my_outpost_zero_private_conversation_states() from public, anon, authenticated;
revoke all on function public.set_my_outpost_zero_private_conversation_state(uuid, text) from public, anon, authenticated;
revoke all on function public.archive_my_outpost_zero_private_conversation_overflow() from public, anon, authenticated;
revoke all on function public.send_outpost_zero_private_message(text, text) from public, anon, authenticated;
revoke all on function public.set_outpost_zero_player_block(text, boolean) from public, anon, authenticated;
grant execute on function public.list_my_outpost_zero_private_conversation_states() to authenticated;
grant execute on function public.set_my_outpost_zero_private_conversation_state(uuid, text) to authenticated;
grant execute on function public.archive_my_outpost_zero_private_conversation_overflow() to authenticated;
grant execute on function public.send_outpost_zero_private_message(text, text) to authenticated;
grant execute on function public.set_outpost_zero_player_block(text, boolean) to authenticated;
-- END MOVED Player-03-social-menu.sql
$security_player_03$;
    v_applied:=array_append(v_applied,'Player 03');
  end if;
  if p_required is not null and not p_required=any(v_applied) then
    raise exception '% security prerequisites are incomplete; transaction rolled back',p_required;
  end if;
end;
$section_security$;
revoke all on function public._outpost_zero_apply_player_security(text) from public,anon,authenticated,service_role;
select public._outpost_zero_apply_player_security();
commit;
