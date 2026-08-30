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
alter table public.scores add column if not exists updated_at timestamptz not null default now();

-- One private receipt makes retries safe: the same completed match can be
-- submitted repeatedly, but it can increase a player's win total only once.
create table if not exists public.outpost_zero_arena_win_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, match_id),
  check (length(match_id) between 24 and 240),
  check (match_id ~ '^arena-win-v1:[A-Za-z0-9:_-]+$')
);

alter table public.scores enable row level security;
alter table public.scores force row level security;
alter table public.outpost_zero_arena_win_receipts enable row level security;
alter table public.outpost_zero_arena_win_receipts force row level security;

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

create or replace function public.record_outpost_zero_arena_win(
  p_match_id text,
  p_expected_user_id uuid
)
returns table(applied boolean, wins bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_match_id text := btrim(coalesce(p_match_id, ''));
  v_name text := 'USERNAME_NOT_SET';
  v_applied boolean := false;
  v_wins bigint := 0;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'ARENA_WIN_SIGN_IN_REQUIRED';
  end if;
  if p_expected_user_id is null or p_expected_user_id <> v_uid then
    raise exception using errcode = '42501', message = 'ARENA_WIN_ACCOUNT_CHANGED';
  end if;
  if length(v_match_id) not between 24 and 240
     or v_match_id !~ '^arena-win-v1:[A-Za-z0-9:_-]+$' then
    raise exception using errcode = '22023', message = 'ARENA_WIN_MATCH_ID_INVALID';
  end if;

  select case
           when nullif(btrim(sp.handle), '') is null
             or btrim(coalesce(sp.handle, '')) !~ '^[A-Za-z0-9_]{3,32}$'
             or lower(btrim(coalesce(sp.handle_key, ''))) in (
               'username_not_set',
               'usernamenotset',
               'op_' || left(replace(v_uid::text, '-', ''), 20),
               'op_' || left(replace(v_uid::text, '-', ''), 8)
             )
             or lower(btrim(coalesce(sp.handle, ''))) in (
               'username_not_set',
               'usernamenotset',
               'op_' || left(replace(v_uid::text, '-', ''), 20),
               'op_' || left(replace(v_uid::text, '-', ''), 8)
             ) then 'USERNAME_NOT_SET'
           else sp.handle
         end
  into v_name
  from public.social_profiles sp
  where sp.user_id = v_uid;
  v_name := coalesce(v_name, 'USERNAME_NOT_SET');

  insert into public.outpost_zero_arena_win_receipts(user_id, match_id)
  values (v_uid, v_match_id)
  on conflict do nothing
  returning true into v_applied;

  if coalesce(v_applied, false) then
    insert into public.scores as current_score(user_id, game, name, score, updated_at)
    values (v_uid, 'outpost-zero-arena-wins', v_name, 1, now())
    on conflict (user_id, game) do update
      set name = excluded.name,
          score = least(2147483647::bigint, current_score.score::bigint + 1)::integer,
          updated_at = now()
    returning current_score.score::bigint into v_wins;
  else
    select greatest(0, s.score)::bigint into v_wins
    from public.scores s
    where s.user_id = v_uid and s.game = 'outpost-zero-arena-wins';
  end if;

  return query select coalesce(v_applied, false), coalesce(v_wins, 0);
end;
$$;

revoke all on function public.record_outpost_zero_arena_win(text, uuid) from public, anon;
grant execute on function public.record_outpost_zero_arena_win(text, uuid) to authenticated;

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

notify pgrst, 'reload schema';

commit;
