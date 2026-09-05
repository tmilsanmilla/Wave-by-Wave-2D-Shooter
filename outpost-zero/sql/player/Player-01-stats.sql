-- OUTPOST ZERO / PLAYER 01: STATS
-- One rerunnable owner for public leaderboards, exact-once Arena wins, and the
-- private per-account CPU ladder. Run after Player 03 Social Menu.
--
-- Data remains in separate tables with separate RLS boundaries. Only public
-- score changes are published through Supabase Realtime; Arena receipts and
-- CPU ladder state remain private RPC-only data.

begin;

-- Fail closed: policy setup lives in Player 04 Security. Install it first.
do $section_security_required$
begin
  if to_regprocedure('public._outpost_zero_apply_player_security(text)') is null then
    raise exception 'Run Player 04 Security first; this transaction made no changes';
  end if;
end;
$section_security_required$;

-- LEADERBOARDS + EXACT-ONCE ARENA WINS

create table if not exists public.scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  name text not null,
  score integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);
alter table public.scores add column if not exists updated_at timestamptz not null default now();

-- Fail closed on an incompatible legacy table. This consolidation never casts,
-- deduplicates, drops, or recreates live scores.
do $shape$
begin
  if to_regclass('public.social_profiles') is null then
    raise exception 'Player 01 Stats requires Player 03 Social Menu (public.social_profiles)';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='scores' and column_name='user_id' and udt_name='uuid' and is_nullable='NO')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='scores' and column_name='game' and udt_name='text' and is_nullable='NO')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='scores' and column_name='name' and udt_name='text' and is_nullable='NO')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='scores' and column_name='score' and udt_name='int4' and is_nullable='NO')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='scores' and column_name='updated_at' and udt_name='timestamptz') then
    raise exception 'public.scores has an incompatible legacy shape; no data was changed';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.scores'::regclass and c.contype in ('p','u')
      and not c.condeferrable
      and array_length(c.conkey,1)=2
      and c.conkey @> array[
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.scores'::regclass and a.attname='user_id'),
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.scores'::regclass and a.attname='game')
      ]::smallint[]
  ) then
    raise exception 'public.scores requires one unique row per (user_id, game); no data was changed';
  end if;
end;
$shape$;

-- Repair only the safe timestamp invariant, then add the exact Auth ownership
-- FK without deleting any unexpected legacy orphan. New rows are protected
-- immediately; a clean legacy table is validated in the same transaction.
update public.scores set updated_at=now() where updated_at is null;
alter table public.scores alter column updated_at set default now();
alter table public.scores alter column updated_at set not null;

do $score_fk$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.scores'::regclass and c.contype='f'
      and c.confrelid='auth.users'::regclass and c.confdeltype='c'
      and c.conkey=array[(select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.scores'::regclass and a.attname='user_id')]::smallint[]
      and c.confkey=array[(select a.attnum from pg_catalog.pg_attribute a where a.attrelid='auth.users'::regclass and a.attname='id')]::smallint[]
  ) then
    alter table public.scores add constraint outpost_zero_scores_user_auth_fkey
      foreign key(user_id) references auth.users(id) on delete cascade not valid;
    if not exists (select 1 from public.scores s left join auth.users u on u.id=s.user_id where u.id is null) then
      alter table public.scores validate constraint outpost_zero_scores_user_auth_fkey;
    end if;
  end if;
end;
$score_fk$;

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

-- Exact-once counting depends on a usable, non-deferrable two-column arbiter.
-- Never assume CREATE TABLE IF NOT EXISTS repaired an older Dashboard table.
do $receipt_shape$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='outpost_zero_arena_win_receipts' and column_name='user_id' and udt_name='uuid' and is_nullable='NO')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='outpost_zero_arena_win_receipts' and column_name='match_id' and udt_name='text' and is_nullable='NO')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='outpost_zero_arena_win_receipts' and column_name='created_at' and udt_name='timestamptz' and is_nullable='NO') then
    raise exception 'public.outpost_zero_arena_win_receipts has an incompatible legacy shape; no data was changed';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.outpost_zero_arena_win_receipts'::regclass
      and c.contype in ('p','u') and not c.condeferrable
      and array_length(c.conkey,1)=2
      and c.conkey @> array[
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.outpost_zero_arena_win_receipts'::regclass and a.attname='user_id'),
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.outpost_zero_arena_win_receipts'::regclass and a.attname='match_id')
      ]::smallint[]
  ) then
    raise exception 'Arena win receipts require one unique row per (user_id, match_id); no data was changed';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.outpost_zero_arena_win_receipts'::regclass and c.contype='f'
      and c.confrelid='auth.users'::regclass and c.confdeltype='c'
      and c.conkey=array[(select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.outpost_zero_arena_win_receipts'::regclass and a.attname='user_id')]::smallint[]
      and c.confkey=array[(select a.attnum from pg_catalog.pg_attribute a where a.attrelid='auth.users'::regclass and a.attname='id')]::smallint[]
  ) then
    raise exception 'Arena win receipts require user_id -> auth.users(id) ON DELETE CASCADE; no data was changed';
  end if;
end;
$receipt_shape$;

-- The signed-out leaderboard receives only user id, username, and score. It
-- never reads email-bearing profile JSON or trusts scores.name for identity.
-- USERNAME_NOT_SET is the public API sentinel for a missing, blank, reserved,
-- or generated handle; clients should render it as a prompt for the owner.

-- Old tabs must not be able to recreate those public JSON snapshots after the
-- cleanup. Install the guard first so a concurrent old tab cannot race the
-- cleanup. This trigger rejects only INSERT/UPDATE; the privacy DELETE below
-- and ordinary leaderboard/referral score rows remain unaffected.
create or replace function public.outpost_zero_reject_legacy_profile_score()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.game = 'outpost-zero-profile' then
    raise exception using
      errcode = '42501',
      message = 'legacy public profile score rows are disabled';
  end if;
  return new;
end;
$$;

drop trigger if exists outpost_zero_reject_legacy_profile_score_trigger
  on public.scores;
create trigger outpost_zero_reject_legacy_profile_score_trigger
before insert or update on public.scores
for each row execute function public.outpost_zero_reject_legacy_profile_score();

-- Remove the obsolete public-profile snapshots. Account progress is already
-- stored in the private profiles table; these score rows duplicated it into a
-- publicly readable column and older rows included account email.
delete from public.scores
where game = 'outpost-zero-profile';

-- Replace every Outpost Zero legacy score alias with the canonical username.
-- Scope this cleanup to the game's own namespace in case another game shares
-- the scores table. Accounts that have not chosen a username yet, including
-- blank/reserved legacy values and both generated-handle formats, get a clear
-- label.
update public.scores s
set name = case
  when nullif(btrim(sp.handle), '') is null
    or btrim(coalesce(sp.handle, '')) !~ '^[A-Za-z0-9_]{3,32}$'
    or lower(btrim(coalesce(sp.handle_key, ''))) in (
      'username_not_set',
      'usernamenotset',
      'op_' || left(replace(sp.user_id::text, '-', ''), 20),
      'op_' || left(replace(sp.user_id::text, '-', ''), 8)
    )
    or lower(btrim(coalesce(sp.handle, ''))) in (
      'username_not_set',
      'usernamenotset',
      'op_' || left(replace(sp.user_id::text, '-', ''), 20),
      'op_' || left(replace(sp.user_id::text, '-', ''), 8)
    )
    then 'USERNAME_NOT_SET'
  else sp.handle
end
from public.social_profiles sp
where sp.user_id = s.user_id
  and s.game like 'outpost-zero%'
  and s.name is distinct from case
    when nullif(btrim(sp.handle), '') is null
      or btrim(coalesce(sp.handle, '')) !~ '^[A-Za-z0-9_]{3,32}$'
      or lower(btrim(coalesce(sp.handle_key, ''))) in (
        'username_not_set',
        'usernamenotset',
        'op_' || left(replace(sp.user_id::text, '-', ''), 20),
        'op_' || left(replace(sp.user_id::text, '-', ''), 8)
      )
      or lower(btrim(coalesce(sp.handle, ''))) in (
        'username_not_set',
        'usernamenotset',
        'op_' || left(replace(sp.user_id::text, '-', ''), 20),
        'op_' || left(replace(sp.user_id::text, '-', ''), 8)
      )
      then 'USERNAME_NOT_SET'
    else sp.handle
  end;

-- A legacy/orphaned score may predate Social backfill. Its old name must not
-- remain publicly readable even though there is no profile row to join yet.
update public.scores s
set name = 'USERNAME_NOT_SET'
where s.game like 'outpost-zero%'
  and not exists (
    select 1
    from public.social_profiles sp
    where sp.user_id = s.user_id
  )
  and s.name is distinct from 'USERNAME_NOT_SET';

create or replace function public.get_outpost_zero_leaderboard(
  p_game text,
  p_limit integer default 5
)
returns table(user_id uuid, username text, score bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select s.user_id,
         case
           when sp.user_id is null
             or nullif(btrim(sp.handle), '') is null
             or btrim(coalesce(sp.handle, '')) !~ '^[A-Za-z0-9_]{3,32}$'
             or lower(btrim(coalesce(sp.handle_key, ''))) in (
               'username_not_set',
               'usernamenotset',
               'op_' || left(replace(s.user_id::text, '-', ''), 20),
               'op_' || left(replace(s.user_id::text, '-', ''), 8)
             )
             or lower(btrim(coalesce(sp.handle, ''))) in (
               'username_not_set',
               'usernamenotset',
               'op_' || left(replace(s.user_id::text, '-', ''), 20),
               'op_' || left(replace(s.user_id::text, '-', ''), 8)
             )
             then 'USERNAME_NOT_SET'
           else sp.handle
         end::text as username,
         greatest(0, s.score)::bigint as score
  from public.scores s
  left join public.social_profiles sp on sp.user_id = s.user_id
  where p_game in ('outpost-zero', 'outpost-zero-arena-wins')
    and s.game = p_game
  order by s.score desc, s.user_id
  limit least(greatest(coalesce(p_limit, 5), 1), 5)
$$;

-- Username/UUID lookup for the player card. Keep this deliberately narrower
-- than both scores and private account progress: callers receive only the same
-- public identity and high score already shown by the leaderboard.
create or replace function public.get_outpost_zero_public_player(p_query text)
returns table(user_id uuid, username text, high_score bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with target as (
    -- Normal public lookup: chosen username or account UUID.
    select sp.user_id, 0 as priority
    from public.social_profiles sp
    where (
        btrim(coalesce(p_query, '')) ~ '^[A-Za-z0-9_]{3,32}$'
        and sp.handle_key = lower(btrim(p_query))
      ) or (
        btrim(coalesce(p_query, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and lower(sp.user_id::text) = lower(btrim(p_query))
      )

    union all

    -- Repair path for an older score whose Social profile was not backfilled.
    -- A leaderboard click already has this UUID, so it must remain resolvable.
    select s.user_id, 1 as priority
    from public.scores s
    where btrim(coalesce(p_query, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and lower(s.user_id::text) = lower(btrim(p_query))
      and s.game in ('outpost-zero', 'outpost-zero-arena-wins')
    group by s.user_id
  ), chosen as (
    select t.user_id
    from target t
    order by t.priority
    limit 1
  )
  select c.user_id,
         case
           when sp.user_id is null
             or nullif(btrim(sp.handle), '') is null
             or btrim(coalesce(sp.handle, '')) !~ '^[A-Za-z0-9_]{3,32}$'
             or lower(btrim(coalesce(sp.handle_key, ''))) in (
               'username_not_set',
               'usernamenotset',
               'op_' || left(replace(c.user_id::text, '-', ''), 20),
               'op_' || left(replace(c.user_id::text, '-', ''), 8)
             )
             or lower(btrim(coalesce(sp.handle, ''))) in (
               'username_not_set',
               'usernamenotset',
               'op_' || left(replace(c.user_id::text, '-', ''), 20),
               'op_' || left(replace(c.user_id::text, '-', ''), 8)
             )
             then 'USERNAME_NOT_SET'
           else sp.handle
         end::text as username,
         greatest(0, coalesce(s.high_score, 0))::bigint as high_score
  from chosen c
  left join public.social_profiles sp on sp.user_id = c.user_id
  left join lateral (
    select max(sc.score)::bigint as high_score
    from public.scores sc
    where sc.user_id = c.user_id
      and sc.game = 'outpost-zero'
  ) s on true
$$;

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

-- Leaderboards owns only scores publication membership. Receipts remain private.
alter table public.scores replica identity full;
do $realtime$
begin
  if exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
      and tablename='outpost_zero_arena_win_receipts'
  ) then
    alter publication supabase_realtime drop table public.outpost_zero_arena_win_receipts;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='scores'
  ) then
    alter publication supabase_realtime add table public.scores;
  end if;
end;
$realtime$;

-- Transactional cache refresh: PostgREST sees the replaced public functions
-- only if this complete Leaderboards installation commits successfully.

-- PRIVATE CPU LADDER + EXACT-ONCE CPU MATCH RECEIPTS

create table if not exists public.outpost_zero_bot_ladder (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier smallint not null default 0 check (tier between 0 and 4),
  progress smallint not null default 0 check (progress between 0 and 10),
  win_streak smallint not null default 0,
  loss_streak smallint not null default 0,
  wins bigint not null default 0 check (wins >= 0),
  losses bigint not null default 0 check (losses >= 0),
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint outpost_zero_bot_ladder_win_streak_cycle
    check (win_streak between 0 and 2),
  constraint outpost_zero_bot_ladder_loss_streak_cycle
    check (loss_streak between 0 and 2),
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

-- A completed three-result streak is an event, not a stored display value.
-- An early ladder build could leave Impossible wins at 3 forever because no
-- promotion existed above tier 4. Repair those rows once and advance their
-- revision so every cached client accepts the corrected canonical snapshot.
update public.outpost_zero_bot_ladder
set win_streak = case when win_streak > 2 then 0 else win_streak end,
    loss_streak = case when loss_streak > 2 then 0 else loss_streak end,
    revision = revision + 1,
    updated_at = pg_catalog.clock_timestamp()
where win_streak > 2 or loss_streak > 2;

-- Replace the unnamed 0..3 checks from the first ladder release. Named 0..2
-- constraints make the visible 0, 1, 2, reset cycle a database invariant and
-- keep this entire file safe to rerun on both old and fresh installations.
alter table public.outpost_zero_bot_ladder
  drop constraint if exists outpost_zero_bot_ladder_win_streak_check;
alter table public.outpost_zero_bot_ladder
  drop constraint if exists outpost_zero_bot_ladder_loss_streak_check;
do $block$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.outpost_zero_bot_ladder'::regclass
      and conname = 'outpost_zero_bot_ladder_win_streak_cycle'
  ) then
    alter table public.outpost_zero_bot_ladder
      add constraint outpost_zero_bot_ladder_win_streak_cycle
      check (win_streak between 0 and 2);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.outpost_zero_bot_ladder'::regclass
      and conname = 'outpost_zero_bot_ladder_loss_streak_cycle'
  ) then
    alter table public.outpost_zero_bot_ladder
      add constraint outpost_zero_bot_ladder_loss_streak_cycle
      check (loss_streak between 0 and 2);
  end if;
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
      case when v_existing.won = p_won and v_existing.difficulty = p_difficulty
        then v_existing.delta::integer else 0 end,
      case when v_existing.won = p_won and v_existing.difficulty = p_difficulty
        then v_existing.promoted else false end,
      case when v_existing.won = p_won and v_existing.difficulty = p_difficulty
        then v_existing.demoted else false end;
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
    elsif v_state.win_streak >= 3 then
      -- Impossible is the ceiling, but its consecutive-win bar must still
      -- complete and restart instead of becoming permanently stuck at 3.
      v_state.win_streak := 0;
      v_state.loss_streak := 0;
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

-- REALTIME OWNERSHIP
-- CPU ladder/model history is private RPC-only state. Current and retired AI
-- tables must never remain in the publication after a legacy Realtime query.
do $realtime$
declare relation_name text;
begin
  foreach relation_name in array array[
    'outpost_zero_bot_ladder',
    'outpost_zero_bot_ladder_matches',
    'outpost_zero_bot_models',
    'outpost_zero_bot_model_state',
    'outpost_zero_bot_model_audit',
    'outpost_zero_ai_training_matches',
    'global_bot_training',
    'global_bot_training_contributions'
  ] loop
    if to_regclass(format('public.%I', relation_name)) is not null
       and exists (
         select 1 from pg_catalog.pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = relation_name
       ) then
      execute format(
        'alter publication supabase_realtime drop table public.%I',
        relation_name
      );
    end if;
  end loop;
end;
$realtime$;

-- Refresh the public RPC schema only if this complete Player 01 transaction
-- commits successfully.
notify pgrst, 'reload schema';

-- Apply this section's complete boundary atomically before anything is visible.
select public._outpost_zero_apply_player_security('Player 01');

commit;
