-- OUTPOST ZERO / AI / 03: GAME-TRAINING DELIVERY
-- Requires AI 01 and AI 02. Paste this whole file into the Supabase SQL
-- Editor and run it once. It is safe to run again.
--
-- Normal completed local AI 1v1/local AI 2v2 matches and the authoritative
-- host of a completed Party CPU 2v2 match submit one compact summary. The game
-- queues that same summary on the device while offline and retries its stable
-- event UUID after reconnecting. No email, username, teammate ID, loadout,
-- chat, input history, or exact position is collected.
--
-- These rows are training evidence for creator/main-admin review. A browser
-- can never edit a bot release, activate a model, or mutate a player's ladder
-- through this API. Shipping a genuinely new brain still requires reviewed
-- game code and a new allowlisted release.

begin;

-- Only bounded numeric counters are admitted. Keeping the signal vocabulary
-- fixed prevents a modified client from hiding arbitrary personal data inside
-- a JSON object. Missing counters mean zero.
create or replace function public._outpost_zero_ai_training_signals_valid(p_signals jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_key text;
  v_value jsonb;
  v_number numeric;
  v_max numeric;
begin
  if p_signals is null
     or pg_catalog.jsonb_typeof(p_signals) <> 'object'
     or pg_catalog.octet_length(p_signals::text) > 2048 then
    return false;
  end if;

  for v_key, v_value in
    select e.key, e.value from pg_catalog.jsonb_each(p_signals) as e
  loop
    if v_key not in (
      'bot_shots', 'bot_hits', 'bot_damage_dealt', 'bot_damage_taken',
      'bot_distance_px', 'bot_wall_contacts', 'bot_stuck_recoveries',
      'bot_path_replans', 'bot_portal_uses', 'bot_tnt_avoidances',
      'bot_tnt_detonations'
    ) or pg_catalog.jsonb_typeof(v_value) <> 'number' then
      return false;
    end if;

    begin
      v_number := (v_value #>> '{}')::numeric;
    exception when others then
      return false;
    end;

    v_max := case
      when v_key in ('bot_damage_dealt', 'bot_damage_taken') then 1000000
      when v_key = 'bot_distance_px' then 100000000
      else 100000
    end;
    if v_number <> pg_catalog.trunc(v_number)
       or v_number < 0
       or v_number > v_max then
      return false;
    end if;
  end loop;

  if coalesce((p_signals ->> 'bot_hits')::integer, 0)
     > coalesce((p_signals ->> 'bot_shots')::integer, 0) then
    return false;
  end if;

  return true;
exception
  when others then return false;
end;
$function$;

revoke all on function public._outpost_zero_ai_training_signals_valid(jsonb)
  from public, anon, authenticated;

-- One immutable receipt per stable event UUID makes network retries exactly
-- once. user_id is always derived from auth.uid(); installation_id is a random
-- UUID created by this game feature, not a hardware identifier. Anonymous and
-- signed-in samples remain distinguishable in aggregate without storing names.
create table if not exists public.outpost_zero_ai_training_matches (
  event_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  installation_id uuid not null,
  was_authenticated boolean not null,
  model_id text not null
    references public.outpost_zero_bot_models(model_id) on delete restrict,
  mode text not null,
  difficulty smallint not null check (difficulty between 0 and 4),
  map_id text not null check (map_id in ('arena', 'dimension', 'construction')),
  won boolean not null,
  player_score smallint not null check (player_score between 0 and 5),
  bot_score smallint not null check (bot_score between 0 and 5),
  rounds smallint not null check (rounds between 1 and 50),
  duration_ms integer not null check (duration_ms between 5000 and 3600000),
  client_finished_at timestamptz,
  signals jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  constraint outpost_zero_ai_training_model_allowlist check (
    model_id in ('scout-v1', 'ranger-v2', 'pathfinder-v3', 'sentinel-v4', 'apex-v5')
  ),
  constraint outpost_zero_ai_training_mode_allowlist check (
    mode in ('ai1v1', 'ai2v2', 'party2v2')
  ),
  constraint outpost_zero_ai_training_party_profile check (
    mode <> 'party2v2'
    or (model_id = 'apex-v5' and difficulty = 2 and map_id = 'arena')
  ),
  constraint outpost_zero_ai_training_finished_result check (
    (won and player_score = 5 and bot_score < 5)
    or
    (not won and bot_score = 5 and player_score < 5)
  ),
  constraint outpost_zero_ai_training_round_count check (
    rounds >= player_score + bot_score
  ),
  constraint outpost_zero_ai_training_signals check (
    public._outpost_zero_ai_training_signals_valid(signals)
  )
);

-- Replace the unnamed two-mode check used by a short pre-release preview of
-- AI 03. This keeps the final file genuinely rerunnable for an early tester.
do $block$
begin
  if exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.outpost_zero_ai_training_matches'::regclass
      and conname = 'outpost_zero_ai_training_matches_mode_check'
  ) then
    alter table public.outpost_zero_ai_training_matches
      drop constraint outpost_zero_ai_training_matches_mode_check;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.outpost_zero_ai_training_matches'::regclass
      and conname = 'outpost_zero_ai_training_mode_allowlist'
  ) then
    alter table public.outpost_zero_ai_training_matches
      add constraint outpost_zero_ai_training_mode_allowlist
      check (mode in ('ai1v1', 'ai2v2', 'party2v2'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.outpost_zero_ai_training_matches'::regclass
      and conname = 'outpost_zero_ai_training_party_profile'
  ) then
    alter table public.outpost_zero_ai_training_matches
      add constraint outpost_zero_ai_training_party_profile
      check (
        mode <> 'party2v2'
        or (model_id = 'apex-v5' and difficulty = 2 and map_id = 'arena')
      );
  end if;
end;
$block$;

create index if not exists outpost_zero_ai_training_model_time_idx
  on public.outpost_zero_ai_training_matches (model_id, received_at desc);
create index if not exists outpost_zero_ai_training_user_time_idx
  on public.outpost_zero_ai_training_matches (user_id, received_at desc)
  where user_id is not null;
create index if not exists outpost_zero_ai_training_install_time_idx
  on public.outpost_zero_ai_training_matches (installation_id, received_at desc);

alter table public.outpost_zero_ai_training_matches enable row level security;
alter table public.outpost_zero_ai_training_matches force row level security;

-- No direct policies are intentional. The narrow submission and aggregate
-- functions below are the only browser-facing API.
revoke all on table public.outpost_zero_ai_training_matches
  from public, anon, authenticated;

create or replace function public.submit_outpost_zero_ai_training_match(
  p_event_id uuid,
  p_installation_id uuid,
  p_model_id text,
  p_mode text,
  p_difficulty integer,
  p_map_id text,
  p_won boolean,
  p_player_score integer,
  p_bot_score integer,
  p_rounds integer,
  p_duration_ms integer,
  p_client_finished_at timestamptz,
  p_signals jsonb
)
returns table (
  event_id uuid,
  accepted boolean,
  reason text,
  received_at timestamptz,
  model_matches bigint
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_model_id text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_model_id, '')));
  v_mode text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_mode, '')));
  v_map_id text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_map_id, '')));
  v_signals jsonb := coalesce(p_signals, '{}'::jsonb);
  v_finished_at timestamptz;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.outpost_zero_ai_training_matches%rowtype;
  v_model_matches bigint := 0;
  v_inserted boolean := false;
  v_hour_count bigint := 0;
  v_day_count bigint := 0;
begin
  if p_event_id is null then
    return query select p_event_id, false, 'invalid_event'::text, v_now, 0::bigint;
    return;
  end if;
  if p_installation_id is null then
    return query select p_event_id, false, 'invalid_installation'::text, v_now, 0::bigint;
    return;
  end if;
  if v_model_id not in ('scout-v1', 'ranger-v2', 'pathfinder-v3', 'sentinel-v4', 'apex-v5')
     or not exists (
       select 1 from public.outpost_zero_bot_models as m
       where m.model_id = v_model_id
     ) then
    return query select p_event_id, false, 'invalid_model'::text, v_now, 0::bigint;
    return;
  end if;
  if v_mode not in ('ai1v1', 'ai2v2', 'party2v2') then
    return query select p_event_id, false, 'invalid_mode'::text, v_now, 0::bigint;
    return;
  end if;
  if p_difficulty is null or p_difficulty < 0 or p_difficulty > 4 then
    return query select p_event_id, false, 'invalid_difficulty'::text, v_now, 0::bigint;
    return;
  end if;
  if v_map_id not in ('arena', 'dimension', 'construction') then
    return query select p_event_id, false, 'invalid_map'::text, v_now, 0::bigint;
    return;
  end if;
  if v_mode = 'party2v2'
     and (v_model_id <> 'apex-v5' or p_difficulty <> 2 or v_map_id <> 'arena') then
    return query select p_event_id, false, 'invalid_party_profile'::text, v_now, 0::bigint;
    return;
  end if;
  if p_won is null
     or p_player_score is null or p_player_score < 0 or p_player_score > 5
     or p_bot_score is null or p_bot_score < 0 or p_bot_score > 5
     or not (
       (p_won and p_player_score = 5 and p_bot_score < 5)
       or
       (not p_won and p_bot_score = 5 and p_player_score < 5)
     ) then
    return query select p_event_id, false, 'invalid_result'::text, v_now, 0::bigint;
    return;
  end if;
  if p_rounds is null
     or p_rounds < p_player_score + p_bot_score
     or p_rounds > 50 then
    return query select p_event_id, false, 'invalid_rounds'::text, v_now, 0::bigint;
    return;
  end if;
  if p_duration_ms is null or p_duration_ms < 5000 or p_duration_ms > 3600000 then
    return query select p_event_id, false, 'invalid_duration'::text, v_now, 0::bigint;
    return;
  end if;
  if not public._outpost_zero_ai_training_signals_valid(v_signals) then
    return query select p_event_id, false, 'invalid_signals'::text, v_now, 0::bigint;
    return;
  end if;

  -- Client wall clocks are diagnostic only. An implausible value becomes NULL
  -- rather than rejecting an otherwise valid offline sample.
  v_finished_at := case
    when p_client_finished_at between v_now - interval '31 days' and v_now + interval '1 day'
      then p_client_finished_at
    else null
  end;

  -- Serialize one account or anonymous installation so concurrent tabs cannot
  -- race through the limits. A 32-bit hash collision merely serializes two
  -- unrelated contributors for the duration of a short transaction.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(coalesce(v_user_id::text, 'guest:' || p_installation_id::text))
  );

  select m.* into v_existing
  from public.outpost_zero_ai_training_matches as m
  where m.event_id = p_event_id;

  if found then
    select count(*) into v_model_matches
    from public.outpost_zero_ai_training_matches as m
    where m.model_id = v_existing.model_id;

    if v_existing.user_id is not distinct from v_user_id
       and v_existing.installation_id = p_installation_id
       and v_existing.model_id = v_model_id
       and v_existing.mode = v_mode
       and v_existing.difficulty = p_difficulty
       and v_existing.map_id = v_map_id
       and v_existing.won = p_won
       and v_existing.player_score = p_player_score
       and v_existing.bot_score = p_bot_score
       and v_existing.rounds = p_rounds
       and v_existing.duration_ms = p_duration_ms
       and v_existing.client_finished_at is not distinct from v_finished_at
       and v_existing.signals = v_signals then
      return query select p_event_id, false, 'duplicate'::text,
        v_existing.received_at, v_model_matches;
    else
      return query select p_event_id, false, 'duplicate_conflict'::text,
        v_existing.received_at, v_model_matches;
    end if;
    return;
  end if;

  -- Authenticated callers are limited across all of their installations;
  -- every caller is also limited by installation. Anonymous installation IDs
  -- are forgeable, so guest samples remain visibly separate in admin totals
  -- and are never allowed to activate or modify a model automatically.
  select count(*) filter (where m.received_at >= v_now - interval '1 hour'),
         count(*) filter (where m.received_at >= v_now - interval '1 day')
    into v_hour_count, v_day_count
  from public.outpost_zero_ai_training_matches as m
  where m.received_at >= v_now - interval '1 day'
    and (
      m.installation_id = p_installation_id
      or (v_user_id is not null and m.user_id = v_user_id)
    );

  if v_hour_count >= 120 or v_day_count >= 500 then
    select count(*) into v_model_matches
    from public.outpost_zero_ai_training_matches as m
    where m.model_id = v_model_id;
    return query select p_event_id, false, 'rate_limited'::text,
      v_now, v_model_matches;
    return;
  end if;

  insert into public.outpost_zero_ai_training_matches
    (event_id, user_id, installation_id, was_authenticated, model_id, mode,
     difficulty, map_id, won, player_score, bot_score, rounds, duration_ms,
     client_finished_at, signals, received_at)
  values
    (p_event_id, v_user_id, p_installation_id, v_user_id is not null,
     v_model_id, v_mode, p_difficulty, v_map_id, p_won, p_player_score,
     p_bot_score, p_rounds, p_duration_ms, v_finished_at, v_signals, v_now)
  on conflict on constraint outpost_zero_ai_training_matches_pkey do nothing
  returning true into v_inserted;

  -- A different installation can race on the globally unique event UUID.
  -- Re-enter the duplicate path so it is never reported as accepted twice.
  if not coalesce(v_inserted, false) then
    select m.* into strict v_existing
    from public.outpost_zero_ai_training_matches as m
    where m.event_id = p_event_id;
    select count(*) into v_model_matches
    from public.outpost_zero_ai_training_matches as m
    where m.model_id = v_existing.model_id;
    return query select p_event_id, false, 'duplicate_conflict'::text,
      v_existing.received_at, v_model_matches;
    return;
  end if;

  select count(*) into v_model_matches
  from public.outpost_zero_ai_training_matches as m
  where m.model_id = v_model_id;

  return query select p_event_id, true, 'accepted'::text,
    v_now, v_model_matches;
end;
$function$;

-- Creator/main-admin aggregate only. No contributor IDs or individual match
-- rows leave this boundary. All five immutable releases are returned, even
-- when one has no samples yet, so the admin model table stays stable.
create or replace function public.list_outpost_zero_ai_training_summary()
returns table (
  model_id text,
  model_name text,
  active boolean,
  matches bigint,
  authenticated_matches bigint,
  guest_matches bigint,
  player_wins bigint,
  bot_wins bigint,
  bot_win_rate numeric,
  avg_duration_seconds numeric,
  bot_shots bigint,
  bot_hits bigint,
  bot_accuracy numeric,
  bot_damage_dealt bigint,
  bot_damage_taken bigint,
  bot_distance_px bigint,
  bot_wall_contacts bigint,
  bot_stuck_recoveries bigint,
  bot_path_replans bigint,
  bot_portal_uses bigint,
  bot_tnt_avoidances bigint,
  bot_tnt_detonations bigint,
  last_match_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if not public._outpost_zero_is_main_admin() then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;

  return query
  select models.model_id,
         models.model_name,
         models.model_id = state.active_model_id as active,
         count(samples.event_id)::bigint as matches,
         count(samples.event_id) filter (where samples.was_authenticated)::bigint
           as authenticated_matches,
         count(samples.event_id) filter (where not samples.was_authenticated)::bigint
           as guest_matches,
         count(samples.event_id) filter (where samples.won)::bigint as player_wins,
         count(samples.event_id) filter (where not samples.won)::bigint as bot_wins,
         coalesce(pg_catalog.round(
           100.0 * count(samples.event_id) filter (where not samples.won)
           / nullif(count(samples.event_id), 0), 1
         ), 0)::numeric as bot_win_rate,
         coalesce(pg_catalog.round(
           pg_catalog.avg(samples.duration_ms)::numeric / 1000.0, 1
         ), 0)::numeric as avg_duration_seconds,
         coalesce(sum((samples.signals ->> 'bot_shots')::bigint), 0)::bigint as bot_shots,
         coalesce(sum((samples.signals ->> 'bot_hits')::bigint), 0)::bigint as bot_hits,
         coalesce(pg_catalog.round(
           100.0 * sum((samples.signals ->> 'bot_hits')::bigint)
           / nullif(sum((samples.signals ->> 'bot_shots')::bigint), 0), 1
         ), 0)::numeric as bot_accuracy,
         coalesce(sum((samples.signals ->> 'bot_damage_dealt')::bigint), 0)::bigint
           as bot_damage_dealt,
         coalesce(sum((samples.signals ->> 'bot_damage_taken')::bigint), 0)::bigint
           as bot_damage_taken,
         coalesce(sum((samples.signals ->> 'bot_distance_px')::bigint), 0)::bigint
           as bot_distance_px,
         coalesce(sum((samples.signals ->> 'bot_wall_contacts')::bigint), 0)::bigint
           as bot_wall_contacts,
         coalesce(sum((samples.signals ->> 'bot_stuck_recoveries')::bigint), 0)::bigint
           as bot_stuck_recoveries,
         coalesce(sum((samples.signals ->> 'bot_path_replans')::bigint), 0)::bigint
           as bot_path_replans,
         coalesce(sum((samples.signals ->> 'bot_portal_uses')::bigint), 0)::bigint
           as bot_portal_uses,
         coalesce(sum((samples.signals ->> 'bot_tnt_avoidances')::bigint), 0)::bigint
           as bot_tnt_avoidances,
         coalesce(sum((samples.signals ->> 'bot_tnt_detonations')::bigint), 0)::bigint
           as bot_tnt_detonations,
         max(samples.received_at) as last_match_at
  from public.outpost_zero_bot_models as models
  cross join public.outpost_zero_bot_model_state as state
  left join public.outpost_zero_ai_training_matches as samples
    on samples.model_id = models.model_id
  where state.singleton = true
    and models.model_id in ('scout-v1', 'ranger-v2', 'pathfinder-v3', 'sentinel-v4', 'apex-v5')
  group by models.model_id, models.model_name, models.release_order,
           state.active_model_id
  order by models.release_order desc;
end;
$function$;

revoke all on function public.submit_outpost_zero_ai_training_match(
  uuid, uuid, text, text, integer, text, boolean, integer, integer, integer,
  integer, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.list_outpost_zero_ai_training_summary()
  from public, anon, authenticated;

grant execute on function public.submit_outpost_zero_ai_training_match(
  uuid, uuid, text, text, integer, text, boolean, integer, integer, integer,
  integer, timestamptz, jsonb
) to anon, authenticated;
grant execute on function public.list_outpost_zero_ai_training_summary()
  to authenticated;

commit;
