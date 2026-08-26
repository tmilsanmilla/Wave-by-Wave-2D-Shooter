-- OUTPOST ZERO / SOCIAL / 03: API PRIVILEGES
-- Requires 01 and 02. Safe to run again; privileges are refreshed.

-- Public boolean-only availability check for signup. It reveals neither an
-- account UUID nor email; usernames themselves are already public identities.
create or replace function public.outpost_zero_username_available(p_username text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    btrim(p_username) ~ '^[A-Za-z0-9_]{3,32}$'
    and not exists (
      select 1 from public.social_profiles sp
      where sp.handle_key = lower(btrim(p_username))
    ), false
  )
$$;

revoke all on public.social_profiles, public.friendships, public.private_messages from anon;
revoke all on public.social_profiles, public.friendships, public.private_messages from authenticated;
grant select on public.social_profiles to authenticated;
grant insert (user_id, handle, handle_key, display_name) on public.social_profiles to authenticated;
grant update (handle, handle_key, display_name) on public.social_profiles to authenticated;
grant select, delete on public.friendships to authenticated;
grant insert (requester_id, addressee_id, status) on public.friendships to authenticated;
grant update (status, blocked_by) on public.friendships to authenticated;
grant select on public.private_messages to authenticated;
grant insert (sender_id, recipient_id, body) on public.private_messages to authenticated;
grant update (read_at) on public.private_messages to authenticated;
revoke all on sequence public.friendships_id_seq, public.private_messages_id_seq from anon;
revoke all on sequence public.friendships_id_seq, public.private_messages_id_seq from authenticated;
grant usage on sequence public.friendships_id_seq, public.private_messages_id_seq to authenticated;

revoke all on function public.outpost_zero_username_available(text) from public, anon, authenticated;
grant execute on function public.outpost_zero_username_available(text) to anon, authenticated;
