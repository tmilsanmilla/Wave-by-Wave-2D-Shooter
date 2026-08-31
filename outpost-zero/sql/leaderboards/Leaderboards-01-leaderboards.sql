-- OUTPOST ZERO / LEADERBOARDS 01: STORAGE + SECURITY + REALTIME
-- One rerunnable owner for public boards, score storage, exact-once Arena wins,
-- browser permissions, and the scores Realtime refresh feed. Run after Social 01.

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

-- Fail closed on an incompatible legacy table. This consolidation never casts,
-- deduplicates, drops, or recreates live scores.
do $shape$
begin
  if to_regclass('public.social_profiles') is null then
    raise exception 'Leaderboards 01 requires Social 01 (public.social_profiles)';
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

alter table public.scores enable row level security;
alter table public.scores force row level security;
alter table public.outpost_zero_arena_win_receipts enable row level security;
alter table public.outpost_zero_arena_win_receipts force row level security;

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

revoke all on function public.outpost_zero_reject_legacy_profile_score() from public;

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

revoke all on function public.get_outpost_zero_leaderboard(text, integer) from public;
grant execute on function public.get_outpost_zero_leaderboard(text, integer) to anon, authenticated;

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
notify pgrst, 'reload schema';

commit;
