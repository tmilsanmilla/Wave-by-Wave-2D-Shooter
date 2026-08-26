-- OUTPOST ZERO / LEADERBOARDS / 01: PUBLIC USERNAME BOARDS
-- Run Social 01-social-core.sql first so every account has a unique username.
-- Safe to run again.

-- The public client receives only user id, username, and score. It never reads
-- email-bearing profile JSON or trusts the client-written scores.name field.

-- Remove the obsolete public-profile snapshots. Account progress is already
-- stored in the private profiles table; these score rows duplicated it into a
-- publicly readable column and older rows included account email.
delete from public.scores
where game = 'outpost-zero-profile';

-- Replace every legacy score alias with the canonical username. Accounts that
-- have not chosen one yet get a clear label instead of exposing an email or a
-- UUID-like temporary handle.
update public.scores s
set name = case
  when sp.handle_key = 'op_' || left(replace(sp.user_id::text, '-', ''), 20)
    then 'USERNAME_NOT_SET'
  else sp.handle
end
from public.social_profiles sp
where sp.user_id = s.user_id
  and s.name is distinct from case
    when sp.handle_key = 'op_' || left(replace(sp.user_id::text, '-', ''), 20)
      then 'USERNAME_NOT_SET'
    else sp.handle
  end;

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
  -- The deterministic op_ fallback is a transport marker only. The client
  -- recognizes it against user_id and renders USERNAME NOT SET instead.
  select s.user_id,
         coalesce(sp.handle, 'op_' || left(replace(s.user_id::text, '-', ''), 8))::text as username,
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
         coalesce(sp.handle, 'op_' || left(replace(c.user_id::text, '-', ''), 8))::text as username,
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
