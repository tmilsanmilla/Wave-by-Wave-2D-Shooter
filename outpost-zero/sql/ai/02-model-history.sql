-- OUTPOST ZERO / AI / 02: GLOBAL BOT MODEL HISTORY
-- Requires AI 01. Paste this whole file into the Supabase SQL Editor and run
-- it once. It is safe to run again.
--
-- Model releases are immutable tactical-brain snapshots. They are separate
-- from each player's Beginner-to-Impossible ladder: activating an archived
-- model never changes a player's tier, progress, wins, losses, or streaks.

begin;

-- The five identifiers below are an allowlist shared with the game client.
-- Remote rows select an embedded behavior snapshot; they never contain or
-- download executable JavaScript.
create table if not exists public.outpost_zero_bot_models (
  model_id text primary key,
  release_order smallint not null unique check (release_order between 1 and 5),
  model_name text not null check (char_length(model_name) between 1 and 48),
  improvement_note text not null check (char_length(improvement_note) between 1 and 240),
  released_at timestamptz not null default now(),
  constraint outpost_zero_bot_models_allowlist check (
    model_id in ('scout-v1', 'ranger-v2', 'pathfinder-v3', 'sentinel-v4', 'apex-v5')
  )
);

-- ON CONFLICT DO NOTHING is intentional: a released model and its note are
-- immutable history. A rerun may add a missing seed, but cannot rewrite one.
insert into public.outpost_zero_bot_models
  (model_id, release_order, model_name, improvement_note)
values
  ('scout-v1', 1, 'SCOUT V1',
   'Randomized strafing and useful long-range fire.'),
  ('ranger-v2', 2, 'RANGER V2',
   'Added target tracking and predictive aim.'),
  ('pathfinder-v3', 3, 'PATHFINDER V3',
   'Added wall-aware routes and recovery when a bot gets stuck.'),
  ('sentinel-v4', 4, 'SENTINEL V4',
   'Added reactive cover plus TNT avoidance and detonation.'),
  ('apex-v5', 5, 'APEX V5',
   'Added portal routing and the complete tactical decision set.')
on conflict (model_id) do nothing;

-- Exactly one pointer is live globally. The revision lets clients reject an
-- older response that arrives after a model has been brought back.
create table if not exists public.outpost_zero_bot_model_state (
  singleton boolean primary key default true check (singleton),
  active_model_id text not null
    references public.outpost_zero_bot_models(model_id) on delete restrict,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint outpost_zero_bot_model_state_allowlist check (
    active_model_id in ('scout-v1', 'ranger-v2', 'pathfinder-v3', 'sentinel-v4', 'apex-v5')
  )
);

insert into public.outpost_zero_bot_model_state
  (singleton, active_model_id, revision)
values (true, 'apex-v5', 1)
on conflict (singleton) do nothing;

-- This table is append-only through the browser API. Newer models remain in
-- the catalog when an admin brings an older one back.
create table if not exists public.outpost_zero_bot_model_audit (
  event_id bigint generated always as identity primary key,
  revision bigint not null unique check (revision >= 1),
  from_model_id text not null
    references public.outpost_zero_bot_models(model_id) on delete restrict,
  to_model_id text not null
    references public.outpost_zero_bot_models(model_id) on delete restrict,
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_email text,
  changed_at timestamptz not null default now(),
  action text not null default 'activate' check (action in ('seed', 'activate'))
);

-- Preserve one audit origin without duplicating it on a rerun.
insert into public.outpost_zero_bot_model_audit
  (revision, from_model_id, to_model_id, action)
values (1, 'apex-v5', 'apex-v5', 'seed')
on conflict (revision) do nothing;

alter table public.outpost_zero_bot_models enable row level security;
alter table public.outpost_zero_bot_models force row level security;
alter table public.outpost_zero_bot_model_state enable row level security;
alter table public.outpost_zero_bot_model_state force row level security;
alter table public.outpost_zero_bot_model_audit enable row level security;
alter table public.outpost_zero_bot_model_audit force row level security;

-- No direct policies are intentional. Every browser read or mutation goes
-- through the narrow functions below.
revoke all on table public.outpost_zero_bot_models from public, anon, authenticated;
revoke all on table public.outpost_zero_bot_model_state from public, anon, authenticated;
revoke all on table public.outpost_zero_bot_model_audit from public, anon, authenticated;
revoke all on sequence public.outpost_zero_bot_model_audit_event_id_seq from public, anon, authenticated;

-- UI-side admin checks are not a security boundary. This private helper reads
-- the email from Supabase's signed JWT and accepts only the fixed creator or an
-- existing public.admins row whose role is main. Dynamic SQL keeps this script
-- installable before the optional admins table exists; in that case only the
-- creator can activate models.
create or replace function public._outpost_zero_is_main_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_allowed boolean := false;
begin
  if auth.uid() is null or v_email = '' then
    return false;
  end if;

  if v_email = 'tmilsanmilla@gmail.com' then
    return true;
  end if;

  if to_regclass('public.admins') is null then
    return false;
  end if;

  execute
    'select exists (
       select 1 from public.admins
       where lower(btrim(email)) = $1
         and lower(btrim(coalesce(role, ''''))) = ''main''
     )'
    into v_allowed
    using v_email;

  return coalesce(v_allowed, false);
exception
  -- A differently shaped or unavailable admins table must fail closed.
  when others then return false;
end;
$function$;

revoke all on function public._outpost_zero_is_main_admin() from public, anon, authenticated;

-- All players may resolve the one active embedded model. This contains no
-- account information and is also available to guests.
create or replace function public.get_outpost_zero_bot_model()
returns table (
  active_model_id text,
  revision bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select s.active_model_id, s.revision, s.updated_at
  from public.outpost_zero_bot_model_state as s
  where s.singleton = true
$function$;

-- Creator/main-admin model-history rows, newest first. The active revision is
-- repeated on each row so a refresh is one consistent RPC result.
create or replace function public.list_outpost_zero_bot_models()
returns table (
  model_id text,
  model_name text,
  improvement_note text,
  released_at timestamptz,
  active boolean,
  active_revision bigint
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
  select m.model_id,
         m.model_name,
         m.improvement_note,
         m.released_at,
         (m.model_id = s.active_model_id) as active,
         s.revision as active_revision
  from public.outpost_zero_bot_models as m
  cross join public.outpost_zero_bot_model_state as s
  where s.singleton = true
    and m.model_id in ('scout-v1', 'ranger-v2', 'pathfinder-v3', 'sentinel-v4', 'apex-v5')
  order by m.release_order desc;
end;
$function$;

-- Bringing back a model changes the global pointer only. It does not mutate
-- the model catalog or AI 01 ladder rows. A row lock serializes simultaneous
-- admin actions, and every accepted change gets an audit event.
create or replace function public.activate_outpost_zero_bot_model(p_model_id text)
returns table (
  active_model_id text,
  revision bigint,
  updated_at timestamptz,
  accepted boolean,
  reason text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_model_id text := lower(btrim(coalesce(p_model_id, '')));
  v_state public.outpost_zero_bot_model_state%rowtype;
  v_from_model_id text;
  v_now timestamptz := clock_timestamp();
begin
  if not public._outpost_zero_is_main_admin() then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;

  select s.* into strict v_state
  from public.outpost_zero_bot_model_state as s
  where s.singleton = true
  for update;

  if v_model_id not in ('scout-v1', 'ranger-v2', 'pathfinder-v3', 'sentinel-v4', 'apex-v5')
     or not exists (
       select 1 from public.outpost_zero_bot_models as m
       where m.model_id = v_model_id
     ) then
    return query select v_state.active_model_id, v_state.revision,
      v_state.updated_at, false, 'unknown_model'::text;
    return;
  end if;

  if v_model_id = v_state.active_model_id then
    return query select v_state.active_model_id, v_state.revision,
      v_state.updated_at, false, 'already_active'::text;
    return;
  end if;

  v_from_model_id := v_state.active_model_id;

  update public.outpost_zero_bot_model_state as s
  set active_model_id = v_model_id,
      revision = s.revision + 1,
      updated_at = v_now,
      updated_by = v_user_id
  where s.singleton = true
  returning s.* into v_state;

  insert into public.outpost_zero_bot_model_audit
    (revision, from_model_id, to_model_id, changed_by, changed_by_email, changed_at, action)
  values
    (v_state.revision, v_from_model_id, v_state.active_model_id,
     v_user_id, v_email, v_now, 'activate');

  return query select v_state.active_model_id, v_state.revision,
    v_state.updated_at, true, 'activated'::text;
end;
$function$;

revoke all on function public.get_outpost_zero_bot_model() from public, anon, authenticated;
revoke all on function public.list_outpost_zero_bot_models() from public, anon, authenticated;
revoke all on function public.activate_outpost_zero_bot_model(text) from public, anon, authenticated;

grant execute on function public.get_outpost_zero_bot_model() to anon, authenticated;
grant execute on function public.list_outpost_zero_bot_models() to authenticated;
grant execute on function public.activate_outpost_zero_bot_model(text) to authenticated;

commit;
