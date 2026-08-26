-- OUTPOST ZERO / SOCIAL / 02: ROW LEVEL SECURITY
-- Requires 01-social-core.sql. Safe to run again; policies are refreshed.

alter table public.social_profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.private_messages enable row level security;

drop policy if exists social_profiles_authenticated_read on public.social_profiles;
create policy social_profiles_authenticated_read on public.social_profiles
for select to authenticated using (true);
drop policy if exists social_profiles_own_insert on public.social_profiles;
create policy social_profiles_own_insert on public.social_profiles
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists social_profiles_own_update on public.social_profiles;
create policy social_profiles_own_update on public.social_profiles
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

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
  (status = 'pending' and auth.uid() in (requester_id, addressee_id))
  or (status = 'accepted' and auth.uid() in (requester_id, addressee_id))
  or (status = 'blocked' and auth.uid() = blocked_by)
);

drop policy if exists private_messages_participant_read on public.private_messages;
create policy private_messages_participant_read on public.private_messages
for select to authenticated
using (auth.uid() in (sender_id, recipient_id));
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
