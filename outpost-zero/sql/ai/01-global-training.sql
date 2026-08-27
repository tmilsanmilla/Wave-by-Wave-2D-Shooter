-- OUTPOST ZERO / AI / 01: PRIVATE CLOUD BOT LADDER
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- It is safe to run again. The historical filename is retained so players who
-- were previously told to run AI 01 still have one unambiguous next script.

-- The tactical bot brain is shipped with the game and shared by everyone.
-- This feature stores only each signed-in player's five-tier ladder:
--   0 BEGINNER · 1 EASY · 2 MEDIUM · 3 HARD · 4 IMPOSSIBLE
-- Guests use Beginner without creating a row. The browser never supplies a
-- user id; both RPCs derive the account from auth.uid().

begin;

create table if not exists public.outpost_zero_bot_ladder (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier smallint not null default 0 check (tier between 0 and 4),
  progress smallint not null default 0 check (progress between 0 and 10),
  win_streak smallint not null default 0 check (win_streak between 0 and 3),
  loss_streak smallint not null default 0 check (loss_streak between 0 and 3),
  wins bigint not null default 0 check (wins >= 0),
  losses bigint not null default 0 check (losses >= 0),
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint outpost_zero_bot_ladder_lower_tier_progress
    check (tier = 4 or progress <= 9)
);

-- Keep reruns compatible with an early preview of this same ladder table.
alter table public.outpost_zero_bot_ladder
  add column if not exists revision bigint not null default 0;
update public.outpost_zero_bot_ladder set revision = 0
where revision is null or revision < 0;
alter table public.outpost_zero_bot_ladder alter column revision set default 0;
alter table public.outpost_zero_bot_ladder alter column revision set not null;
do $block$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.outpost_zero_bot_ladder'::regclass
      and conname = 'outpost_zero_bot_ladder_revision_nonnegative'
  ) then
    alter table public.outpost_zero_bot_ladder
      add constraint outpost_zero_bot_ladder_revision_nonnegative check (revision >= 0);
  end if;
end;
$block$;

-- One private receipt per account + match UUID makes a lost-response retry
-- exact-once. Result and difficulty are retained so conflicting reuse of a UUID
-- can be rejected instead of silently changing the original match.
create table if not exists public.outpost_zero_bot_ladder_matches (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null,
  won boolean not null,
  difficulty smallint not null check (difficulty between 0 and 4),
  delta smallint not null check (delta between -1 and 1),
  promoted boolean not null default false,
  demoted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, match_id),
  check (not (promoted and demoted))
);

create index if not exists outpost_zero_bot_ladder_matches_user_time_idx
  on public.outpost_zero_bot_ladder_matches (user_id, created_at desc);

alter table public.outpost_zero_bot_ladder enable row level security;
alter table public.outpost_zero_bot_ladder force row level security;
alter table public.outpost_zero_bot_ladder_matches enable row level security;
alter table public.outpost_zero_bot_ladder_matches force row level security;

-- No direct table policy is intentional. Narrow SECURITY DEFINER RPCs are the
-- only API boundary, so another signed-in player cannot enumerate ladder rows
-- or forge progress through a REST table write.
revoke all on table public.outpost_zero_bot_ladder from public, anon, authenticated;
revoke all on table public.outpost_zero_bot_ladder_matches from public, anon, authenticated;

create or replace function public.get_outpost_zero_bot_ladder()
returns table (
  tier integer,
  progress integer,
  win_streak integer,
  loss_streak integer,
  wins bigint,
  losses bigint,
  revision bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select coalesce(l.tier, 0)::integer,
         coalesce(l.progress, 0)::integer,
         coalesce(l.win_streak, 0)::integer,
         coalesce(l.loss_streak, 0)::integer,
         coalesce(l.wins, 0)::bigint,
         coalesce(l.losses, 0)::bigint,
         coalesce(l.revision, 0)::bigint,
         coalesce(l.updated_at, now())::timestamptz
  from (select auth.uid() as user_id) as caller
  left join public.outpost_zero_bot_ladder as l
    on l.user_id = caller.user_id;
$function$;

create or replace function public.submit_outpost_zero_bot_ladder(
  p_match_id uuid,
  p_won boolean,
  p_difficulty integer
)
returns table (
  tier integer,
  progress integer,
  win_streak integer,
  loss_streak integer,
  wins bigint,
  losses bigint,
  revision bigint,
  updated_at timestamptz,
  accepted boolean,
  reason text,
  delta integer,
  promoted boolean,
  demoted boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_state public.outpost_zero_bot_ladder%rowtype;
  v_existing public.outpost_zero_bot_ladder_matches%rowtype;
  v_last_match timestamptz;
  v_hour_count bigint := 0;
  v_day_count bigint := 0;
  v_delta smallint := 0;
  v_promoted boolean := false;
  v_demoted boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_match_id is null or p_won is null or p_difficulty is null then
    raise exception 'match id, result, and difficulty are required' using errcode = '22004';
  end if;
  if p_difficulty < 0 or p_difficulty > 4 then
    raise exception 'difficulty must be between 0 and 4' using errcode = '22023';
  end if;

  -- This row is the per-user serialization lock. Concurrent tabs cannot both
  -- admit the same UUID or calculate from stale streak progress.
  insert into public.outpost_zero_bot_ladder (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select l.* into strict v_state
  from public.outpost_zero_bot_ladder as l
  where l.user_id = v_user_id
  for update;

  select m.* into v_existing
  from public.outpost_zero_bot_ladder_matches as m
  where m.user_id = v_user_id
    and m.match_id = p_match_id;

  if found then
    return query select v_state.tier::integer, v_state.progress::integer,
      v_state.win_streak::integer, v_state.loss_streak::integer,
      v_state.wins, v_state.losses, v_state.revision, v_state.updated_at,
      false,
      case when v_existing.won = p_won and v_existing.difficulty = p_difficulty
        then 'duplicate'::text else 'duplicate_conflict'::text end,
      0, false, false;
    return;
  end if;

  -- A match counts only at the tier it started on. This rejects a stale tab or
  -- caller-edited request before any ladder or receipt mutation.
  if p_difficulty <> v_state.tier then
    return query select v_state.tier::integer, v_state.progress::integer,
      v_state.win_streak::integer, v_state.loss_streak::integer,
      v_state.wins, v_state.losses, v_state.revision, v_state.updated_at,
      false, 'difficulty_mismatch'::text, 0, false, false;
    return;
  end if;

  -- Local matches cannot be authoritatively replayed by the database. Server
  -- time limits materially constrain direct-RPC farming while remaining below
  -- the normal duration of a legitimate first-to-five match.
  select max(m.created_at),
         count(*) filter (where m.created_at >= v_now - interval '1 hour'),
         count(*) filter (where m.created_at >= v_now - interval '1 day')
    into v_last_match, v_hour_count, v_day_count
  from public.outpost_zero_bot_ladder_matches as m
  where m.user_id = v_user_id
    and m.created_at >= v_now - interval '1 day';

  if (v_last_match is not null and v_last_match > v_now - interval '30 seconds')
     or v_hour_count >= 20
     or v_day_count >= 100 then
    return query select v_state.tier::integer, v_state.progress::integer,
      v_state.win_streak::integer, v_state.loss_streak::integer,
      v_state.wins, v_state.losses, v_state.revision, v_state.updated_at,
      false, 'rate_limited'::text, 0, false, false;
    return;
  end if;

  if p_won then
    v_state.wins := v_state.wins + 1;
    v_state.win_streak := least(v_state.win_streak + 1, 3);
    v_state.loss_streak := 0;
    if v_state.progress < 10 then
      v_state.progress := v_state.progress + 1;
      v_delta := 1;
    end if;

    if v_state.tier < 4
       and (v_state.win_streak >= 3 or v_state.progress >= 10) then
      v_state.tier := v_state.tier + 1;
      v_state.progress := 0;
      v_state.win_streak := 0;
      v_state.loss_streak := 0;
      v_promoted := true;
    end if;
  else
    v_state.losses := v_state.losses + 1;
    v_state.win_streak := 0;
    v_state.loss_streak := least(v_state.loss_streak + 1, 3);

    if v_state.loss_streak >= 3 then
      v_state.loss_streak := 0;
      if v_state.progress > 0 then
        v_state.progress := v_state.progress - 1;
        v_delta := -1;
      elsif v_state.tier > 0 then
        v_state.tier := v_state.tier - 1;
        v_state.progress := 9;
        v_delta := -1;
        v_demoted := true;
      end if;
    end if;
  end if;

  insert into public.outpost_zero_bot_ladder_matches
    (user_id, match_id, won, difficulty, delta, promoted, demoted, created_at)
  values
    (v_user_id, p_match_id, p_won, p_difficulty, v_delta,
     v_promoted, v_demoted, v_now);

  update public.outpost_zero_bot_ladder as l
  set tier = v_state.tier,
      progress = v_state.progress,
      win_streak = v_state.win_streak,
      loss_streak = v_state.loss_streak,
      wins = v_state.wins,
      losses = v_state.losses,
      revision = l.revision + 1,
      updated_at = v_now
  where l.user_id = v_user_id
  returning l.* into v_state;

  return query select v_state.tier::integer, v_state.progress::integer,
    v_state.win_streak::integer, v_state.loss_streak::integer,
    v_state.wins, v_state.losses, v_state.revision, v_state.updated_at,
    true, 'accepted'::text, v_delta::integer, v_promoted, v_demoted;
end;
$function$;

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

commit;
