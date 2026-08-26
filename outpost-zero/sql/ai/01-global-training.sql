-- OUTPOST ZERO / GLOBAL BOT TRAINING
-- Run this file once in the Supabase SQL Editor. It is safe to run again.

create table if not exists public.global_bot_training (
  id smallint primary key default 1 check (id = 1),
  version smallint not null default 1 check (version = 1),
  xp integer not null default 0 check (xp between 0 and 45),
  matches bigint not null default 0 check (matches >= 0),
  wins bigint not null default 0 check (wins between 0 and matches),
  updated_at timestamptz not null default now()
);

create table if not exists public.global_bot_training_contributions (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null,
  won boolean not null,
  xp_awarded smallint not null check (xp_awarded between 0 and 2),
  created_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

create index if not exists global_bot_training_contributions_user_time_idx
  on public.global_bot_training_contributions (user_id, created_at desc);

insert into public.global_bot_training (id, version, xp, matches, wins)
values (1, 1, 0, 0, 0)
on conflict (id) do nothing;

alter table public.global_bot_training enable row level security;
alter table public.global_bot_training force row level security;
alter table public.global_bot_training_contributions enable row level security;
alter table public.global_bot_training_contributions force row level security;

drop policy if exists global_bot_training_public_read on public.global_bot_training;
create policy global_bot_training_public_read
  on public.global_bot_training
  for select
  to anon, authenticated
  using (id = 1);

-- There is intentionally no direct policy on the contribution ledger. All
-- validation and writes pass through the authenticated function below.
revoke all on table public.global_bot_training from public, anon, authenticated;
revoke all on table public.global_bot_training_contributions from public, anon, authenticated;
grant select on table public.global_bot_training to anon, authenticated;

create or replace function public.get_outpost_zero_bot_training()
returns table (
  version smallint,
  xp integer,
  matches bigint,
  wins bigint,
  max_xp integer,
  level integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select s.version,
         s.xp,
         s.matches,
         s.wins,
         45 as max_xp,
         case when s.xp >= 45 then 10 else (s.xp / 5) + 1 end as level,
         s.updated_at
  from public.global_bot_training as s
  where s.id = 1;
$function$;

create or replace function public.submit_outpost_zero_bot_training(
  p_match_id uuid,
  p_won boolean
)
returns table (
  version smallint,
  xp integer,
  matches bigint,
  wins bigint,
  max_xp integer,
  level integer,
  updated_at timestamptz,
  accepted boolean,
  reason text,
  xp_awarded smallint
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  -- The email claim is signed by Supabase Auth. Client-supplied profile or
  -- user-metadata fields are deliberately not trusted for this permission.
  v_user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_now timestamptz := clock_timestamp();
  v_state public.global_bot_training%rowtype;
  v_previous_award smallint;
  v_last_contribution timestamptz;
  v_hour_count bigint := 0;
  v_day_count bigint := 0;
  v_award smallint;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_match_id is null or p_won is null then
    raise exception 'match id and result are required' using errcode = '22004';
  end if;

  -- Global learning is curated: everyone may read/play the shared model, but
  -- only the creator and server-listed main admins may add training matches.
  -- Co-admins and ordinary authenticated players receive the public snapshot
  -- without changing either table.
  if v_user_email <> 'tmilsanmilla@gmail.com'
     and not exists (
       select 1
       from public.admins as a
       where lower(a.email) = v_user_email
         and lower(a.role) = 'main'
     ) then
    select s.* into v_state
    from public.global_bot_training as s
    where s.id = 1;

    if not found then
      raise exception 'global bot training state is not installed' using errcode = '55000';
    end if;

    return query select v_state.version, v_state.xp, v_state.matches, v_state.wins,
      45, case when v_state.xp >= 45 then 10 else (v_state.xp / 5) + 1 end,
      v_state.updated_at, false, 'main_admin_only'::text, 0::smallint;
    return;
  end if;

  -- The singleton row is the lock for both the capped total and duplicate
  -- admission, so concurrent clients cannot over-award the global bot.
  select s.* into v_state
  from public.global_bot_training as s
  where s.id = 1
  for update;

  if not found then
    insert into public.global_bot_training (id, version, xp, matches, wins)
    values (1, 1, 0, 0, 0)
    on conflict (id) do nothing;
    select s.* into strict v_state
    from public.global_bot_training as s
    where s.id = 1
    for update;
  end if;

  -- A retry after a lost response returns the original award and canonical
  -- state, but never mutates either table a second time.
  select c.xp_awarded into v_previous_award
  from public.global_bot_training_contributions as c
  where c.user_id = v_user_id and c.match_id = p_match_id;
  if found then
    return query select v_state.version, v_state.xp, v_state.matches, v_state.wins,
      45, case when v_state.xp >= 45 then 10 else (v_state.xp / 5) + 1 end,
      v_state.updated_at, false, 'duplicate'::text, v_previous_award;
    return;
  end if;

  -- Once execution skill reaches its fairness cap, do not grow the ledger.
  if v_state.xp >= 45 then
    return query select v_state.version, v_state.xp, v_state.matches, v_state.wins,
      45, 10, v_state.updated_at, false, 'max'::text, 0::smallint;
    return;
  end if;

  select max(c.created_at),
         count(*) filter (where c.created_at >= v_now - interval '1 hour'),
         count(*) filter (where c.created_at >= v_now - interval '1 day')
    into v_last_contribution, v_hour_count, v_day_count
  from public.global_bot_training_contributions as c
  where c.user_id = v_user_id
    and c.created_at >= v_now - interval '1 day';

  if (v_last_contribution is not null and v_last_contribution > v_now - interval '30 seconds')
     or v_hour_count >= 20
     or v_day_count >= 100 then
    return query select v_state.version, v_state.xp, v_state.matches, v_state.wins,
      45, case when v_state.xp >= 45 then 10 else (v_state.xp / 5) + 1 end,
      v_state.updated_at, false, 'rate_limited'::text, 0::smallint;
    return;
  end if;

  v_award := least(case when p_won then 2 else 1 end, 45 - v_state.xp)::smallint;
  insert into public.global_bot_training_contributions (user_id, match_id, won, xp_awarded, created_at)
  values (v_user_id, p_match_id, p_won, v_award, v_now);

  update public.global_bot_training as s
  set xp = s.xp + v_award,
      matches = s.matches + 1,
      wins = s.wins + case when p_won then 1 else 0 end,
      updated_at = v_now
  where s.id = 1
  returning s.* into v_state;

  return query select v_state.version, v_state.xp, v_state.matches, v_state.wins,
    45, case when v_state.xp >= 45 then 10 else (v_state.xp / 5) + 1 end,
    v_state.updated_at, true, 'accepted'::text, v_award;
end;
$function$;

revoke all on function public.get_outpost_zero_bot_training() from public, anon, authenticated;
revoke all on function public.submit_outpost_zero_bot_training(uuid, boolean) from public, anon, authenticated;
grant execute on function public.get_outpost_zero_bot_training() to anon, authenticated;
grant execute on function public.submit_outpost_zero_bot_training(uuid, boolean) to authenticated;

alter table public.global_bot_training replica identity full;
do $block$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'global_bot_training'
     ) then
    alter publication supabase_realtime add table public.global_bot_training;
  end if;
end;
$block$;
