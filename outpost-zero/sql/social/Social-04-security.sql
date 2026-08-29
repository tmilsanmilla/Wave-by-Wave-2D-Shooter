-- OUTPOST ZERO / SOCIAL / 04: ALL SOCIAL SECURITY + REALTIME ACCESS
-- File: Social-04-security.sql
-- Run last, after Social 01, 02, and 03. Safe to rerun.
-- This is the single perimeter-security file for usernames, friendships,
-- messages, Parties, and the Private Inbox. Feature-specific validation remains
-- inside each RPC so callers cannot bypass identity, block, or rate-limit rules.

begin;

do $preflight$
begin
  if to_regclass('public.social_profiles') is null
     or to_regclass('public.friendships') is null
     or to_regclass('public.private_messages') is null
     or to_regclass('public.outpost_zero_party_invite_targets') is null
     or to_regclass('public.outpost_zero_party_invites') is null
     or to_regclass('public.outpost_zero_public_parties') is null
     or to_regclass('public.outpost_zero_public_party_requests') is null
     or to_regclass('public.private_conversation_states') is null then
    raise exception 'Social Security requires Social 01, 02, and 03 first';
  end if;
end;
$preflight$;

-- ROW-LEVEL SECURITY
alter table public.social_profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.private_messages enable row level security;
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

-- REALTIME PUBLICATION
-- These are refresh hints only. The policies above still decide which rows a
-- signed-in player may receive.
do $realtime$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
  ) then alter publication supabase_realtime add table public.friendships; end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'private_messages'
  ) then alter publication supabase_realtime add table public.private_messages; end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'private_conversation_states'
  ) then alter publication supabase_realtime add table public.private_conversation_states; end if;
end;
$realtime$;

commit;
