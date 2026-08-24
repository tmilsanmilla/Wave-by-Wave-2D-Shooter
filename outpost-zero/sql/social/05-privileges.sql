-- OUTPOST ZERO / SOCIAL / 05: API PRIVILEGES
-- Requires 01 through 04. Safe to run again; privileges are refreshed.

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
