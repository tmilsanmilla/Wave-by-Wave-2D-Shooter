-- OUTPOST ZERO / LEADERBOARDS 03: SECURITY + REALTIME
-- Owns the scores-table perimeter and the live leaderboard refresh feed.
-- Run after the base scores table and Leaderboards 01. Safe to rerun.

begin;

create table if not exists public.scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  name text not null,
  score integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);

alter table public.scores enable row level security;
alter table public.scores force row level security;

-- Retire the permissive legacy policy names before installing this section's
-- explicit authenticated boundary. Signed-out leaderboards use the narrow
-- SECURITY DEFINER RPC in Leaderboards 01, never raw score rows.
drop policy if exists "read all" on public.scores;
drop policy if exists "write self" on public.scores;
drop policy if exists "update self" on public.scores;
drop policy if exists outpost_zero_scores_authenticated_read on public.scores;
drop policy if exists outpost_zero_scores_self_insert on public.scores;
drop policy if exists outpost_zero_scores_self_update on public.scores;

create policy outpost_zero_scores_authenticated_read
on public.scores for select to authenticated
using (true);

create policy outpost_zero_scores_self_insert
on public.scores for insert to authenticated
with check (auth.uid() = user_id);

create policy outpost_zero_scores_self_update
on public.scores for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on table public.scores from public, anon, authenticated;
grant select on table public.scores to authenticated;
grant insert(user_id, game, name, score) on table public.scores to authenticated;
grant update(name, score, updated_at) on table public.scores to authenticated;

-- Realtime is a refresh hint for live boards and referral claims. The forced
-- RLS policies above remain the authority for every subscriber and write.
alter table public.scores replica identity full;
do $realtime$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scores'
  ) then
    alter publication supabase_realtime add table public.scores;
  end if;
end;
$realtime$;

commit;
