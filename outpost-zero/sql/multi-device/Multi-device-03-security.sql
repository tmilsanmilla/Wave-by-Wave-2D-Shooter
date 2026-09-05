-- MULTI DEVICE 03 SECURITY. Run after 01 and 02.
-- Only authenticated RPCs write registration or ratings. The one per-account
-- Realtime row merely asks that account to refetch its authorized assignment.
begin;
do $$ declare table_name text; policy_row record; begin
  foreach table_name in array array['outpost_zero_duel_matches','outpost_zero_duel_members','outpost_zero_duel_queue',
    'outpost_zero_duel_wakeups','outpost_zero_ranked_ratings','outpost_zero_ranked_reports','outpost_zero_ranked_rating_changes'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated',table_name);
    for policy_row in select policyname from pg_policies where schemaname='public' and tablename=table_name loop
      execute format('drop policy %I on public.%I',policy_row.policyname,table_name);
    end loop;
  end loop;
end $$;
create policy outpost_zero_duel_own_wakeup on public.outpost_zero_duel_wakeups
for select to authenticated using(user_id=(select auth.uid()));
grant select on public.outpost_zero_duel_wakeups to authenticated;
alter table public.outpost_zero_duel_wakeups replica identity full;
do $$ declare table_name text; begin
  foreach table_name in array array['outpost_zero_duel_matches','outpost_zero_duel_members','outpost_zero_duel_queue',
    'outpost_zero_ranked_ratings','outpost_zero_ranked_reports','outpost_zero_ranked_rating_changes'] loop
    if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
      execute format('alter publication supabase_realtime drop table public.%I',table_name);
    end if;
  end loop;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='outpost_zero_duel_wakeups') then
    alter publication supabase_realtime add table public.outpost_zero_duel_wakeups;
  end if;
end $$;

create or replace function public._outpost_zero_duel_channel_member(p_topic text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select auth.uid() is not null and p_topic ~ '^oz-duel:[0-9a-f-]{36}$' and exists(
    select 1 from public.outpost_zero_duel_members d join public.outpost_zero_duel_matches m using(match_id)
    where d.user_id=auth.uid() and d.accepted_at is not null and d.released_at is null
      and m.match_id::text=split_part(p_topic,':',2) and m.status in ('pending','active') and m.expires_at>statement_timestamp())
$$;
revoke all on function public._outpost_zero_duel_channel_member(text) from public,anon,authenticated;
grant execute on function public._outpost_zero_duel_channel_member(text) to authenticated;

-- Private-channel authorization identifies permitted room members. It does
-- NOT authenticate a member's claimed sender field inside a combat packet.
-- The restrictive policy also prevents a pre-existing broad authenticated
-- policy from accidentally opening this new topic namespace to nonmembers.
drop policy if exists outpost_zero_duel_channel_read on realtime.messages;
drop policy if exists outpost_zero_duel_channel_write on realtime.messages;
drop policy if exists outpost_zero_duel_channel_boundary on realtime.messages;
create policy outpost_zero_duel_channel_read on realtime.messages for select to authenticated
using(public._outpost_zero_duel_channel_member((select realtime.topic())));
create policy outpost_zero_duel_channel_write on realtime.messages for insert to authenticated
with check(public._outpost_zero_duel_channel_member((select realtime.topic())));
create policy outpost_zero_duel_channel_boundary on realtime.messages as restrictive for all to authenticated
using(coalesce((select realtime.topic()),'') not like 'oz-duel:%' or public._outpost_zero_duel_channel_member((select realtime.topic())))
with check(coalesce((select realtime.topic()),'') not like 'oz-duel:%' or public._outpost_zero_duel_channel_member((select realtime.topic())));

grant execute on function public.join_outpost_zero_duel_queue(text,boolean,jsonb),
  public.get_outpost_zero_duel_assignment(),public.leave_outpost_zero_duel_queue(),
  public.create_outpost_zero_party_duel(text,uuid[],jsonb),public.accept_outpost_zero_party_duel(uuid,jsonb),
  public.acknowledge_outpost_zero_duel_start(uuid),public.abort_outpost_zero_duel_setup(uuid),
  public.get_outpost_zero_duel(uuid),public.release_outpost_zero_duel(uuid),
  public.submit_outpost_zero_ranked_result(uuid,text,integer,integer),public.get_outpost_zero_ranked_profile()
to authenticated;
grant execute on function public.list_outpost_zero_ranked_leaderboard(text,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
