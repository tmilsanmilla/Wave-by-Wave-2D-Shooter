-- LEADERBOARD 01: DISPLAY ONLY
-- Run to view saved Endless scores, 1v1 wins, and CPU rankings.
-- Saving and ranking rules remain in Player 01 stats. This query changes nothing.
with entries as (
  select case game when 'outpost-zero' then 1 else 2 end as board,
         user_id, greatest(score, 0)::bigint as value, 0::integer as progress,
         null::bigint as wins, null::bigint as losses
  from public.scores
  where game in ('outpost-zero', 'outpost-zero-arena-wins')
  union all
  select 3, user_id, tier::bigint, progress::integer, wins, losses
  from public.outpost_zero_bot_ladder
), ranked as (
  select *, rank() over (
    partition by board order by value desc, progress desc
  ) as position
  from entries
)
select (array['ENDLESS SCORE', '1V1 WINS', 'CPU RANK'])[r.board] as leaderboard,
       r.position as rank,
       coalesce(p.username, 'USERNAME_NOT_SET') as player,
       case when r.board < 3 then r.value end as score_or_wins,
       case when r.board = 3 then
         (array['BEGINNER', 'EASY', 'MEDIUM', 'HARD', 'IMPOSSIBLE'])[(r.value + 1)::integer]
       end as cpu_difficulty,
       case when r.board = 3 then r.progress end as cpu_progress_out_of_10,
       r.wins as cpu_wins, r.losses as cpu_losses
from ranked r
left join lateral public.get_outpost_zero_public_player(r.user_id::text) p on true
order by r.board, r.position, r.user_id;
