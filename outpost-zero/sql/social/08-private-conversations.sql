-- SOCIAL 08: threaded private Inbox, per-player Archive/Delete state, and
-- username-addressed private messaging. Run after Social 01 and Social 05.
-- Rerunnable: existing messages and conversation state are preserved.

begin;

create table if not exists public.private_conversation_states (
  owner_id uuid not null references auth.users(id) on delete cascade,
  peer_id uuid not null references auth.users(id) on delete cascade,
  archived_at timestamptz,
  deleted_before timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (owner_id, peer_id),
  constraint private_conversation_states_distinct_users check (owner_id <> peer_id)
);

create index if not exists private_conversation_states_owner_updated_idx
  on public.private_conversation_states(owner_id, updated_at desc);

alter table public.private_conversation_states enable row level security;
alter table public.private_conversation_states force row level security;

drop policy if exists private_conversation_states_owner_read on public.private_conversation_states;
create policy private_conversation_states_owner_read on public.private_conversation_states
for select to authenticated
using (owner_id = auth.uid());

revoke all on table public.private_conversation_states from public, anon, authenticated;
grant select on table public.private_conversation_states to authenticated;

create or replace function public.list_my_outpost_zero_private_conversation_states()
returns table (
  peer_id uuid,
  archived_at timestamptz,
  deleted_before timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  return query
  select s.peer_id, s.archived_at, s.deleted_before, s.updated_at
  from public.private_conversation_states s
  where s.owner_id = v_actor
  order by s.updated_at desc, s.peer_id;
end;
$$;

create or replace function public.set_my_outpost_zero_private_conversation_state(
  p_peer_id uuid,
  p_action text
)
returns table (
  peer_id uuid,
  archived_at timestamptz,
  deleted_before timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_peer_id is null or p_peer_id = v_actor or v_action not in ('archive', 'inbox', 'delete') then
    raise exception using errcode = '22023', message = 'INVALID_CONVERSATION_ACTION';
  end if;
  if not exists (
    select 1 from public.private_messages m
    where (m.sender_id = v_actor and m.recipient_id = p_peer_id)
       or (m.sender_id = p_peer_id and m.recipient_id = v_actor)
  ) then
    raise exception using errcode = '22023', message = 'CONVERSATION_NOT_FOUND';
  end if;

  insert into public.private_conversation_states as s
    (owner_id, peer_id, archived_at, deleted_before, updated_at)
  values (
    v_actor,
    p_peer_id,
    case when v_action = 'archive' then v_now else null end,
    case when v_action = 'delete' then v_now else null end,
    v_now
  )
  on conflict on constraint private_conversation_states_pkey do update set
    archived_at = case
      when v_action = 'archive' then v_now
      when v_action in ('inbox', 'delete') then null
      else s.archived_at
    end,
    -- Per-owner cutoff: deleting never removes the other participant's copy.
    deleted_before = case when v_action = 'delete' then v_now else s.deleted_before end,
    updated_at = v_now;

  return query
  select s.peer_id, s.archived_at, s.deleted_before, s.updated_at
  from public.private_conversation_states s
  where s.owner_id = v_actor and s.peer_id = p_peer_id;
end;
$$;

-- Keep at most 25 active conversation rows. Manual archives stay archived;
-- a genuinely new message after archived_at automatically reopens its thread.
create or replace function public.archive_my_outpost_zero_private_conversation_overflow()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_count integer := 0;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('oz-private-inbox:' || v_actor::text, 0));

  with pairs as (
    select case when m.sender_id = v_actor then m.recipient_id else m.sender_id end as peer_id,
           m.created_at
    from public.private_messages m
    where (m.sender_id = v_actor or m.recipient_id = v_actor)
      and m.body not like 'OUTPOST ZERO · PARTY INVITE · %'
      and m.body not like 'OUTPOST ZERO · CPU 2V2 GAME INVITE · %'
  ), visible as (
    select p.peer_id, max(p.created_at) as last_at
    from pairs p
    left join public.private_conversation_states s
      on s.owner_id = v_actor and s.peer_id = p.peer_id
    where p.created_at > coalesce(s.deleted_before, '-infinity'::timestamptz)
    group by p.peer_id
  ), active as (
    select v.peer_id, v.last_at
    from visible v
    left join public.private_conversation_states s
      on s.owner_id = v_actor and s.peer_id = v.peer_id
    where s.archived_at is null or v.last_at > s.archived_at
  ), ranked as (
    select a.peer_id, row_number() over (order by a.last_at desc, a.peer_id) as position
    from active a
  ), overflow as (
    select r.peer_id from ranked r where r.position > 25
  )
  insert into public.private_conversation_states as s
    (owner_id, peer_id, archived_at, deleted_before, updated_at)
  select v_actor, o.peer_id, v_now, null, v_now from overflow o
  on conflict (owner_id, peer_id) do update set
    archived_at = v_now,
    updated_at = v_now;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Ordinary private messages may address any public username. The database
-- resolves the recipient, enforces blocks, and rate-limits before inserting.
-- The existing friends-only direct INSERT policy remains for legacy Party
-- invite envelopes; browsers use this RPC for human-written messages.
create or replace function public.send_outpost_zero_private_message(
  p_recipient_username text,
  p_body text
)
returns table (
  message_key text,
  recipient_username text,
  created_at timestamptz,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_username text := lower(regexp_replace(btrim(coalesce(p_recipient_username, '')), '^@', ''));
  v_body text := regexp_replace(btrim(coalesce(p_body, '')), '[[:space:]]+', ' ', 'g');
  v_target uuid;
  v_target_username text;
  v_now timestamptz := clock_timestamp();
  v_id bigint;
  v_created timestamptz;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if v_username !~ '^[a-z0-9_]{3,32}$' or char_length(v_body) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_PRIVATE_MESSAGE';
  end if;

  select p.user_id, p.handle into v_target, v_target_username
  from public.social_profiles p
  where p.handle_key = v_username
  limit 1;
  if v_target is null or v_target = v_actor then
    raise exception using errcode = '22023', message = 'PRIVATE_MESSAGE_TARGET_UNAVAILABLE';
  end if;
  if exists (
    select 1 from public.friendships f
    where f.status = 'blocked'
      and ((f.requester_id = v_actor and f.addressee_id = v_target)
        or (f.requester_id = v_target and f.addressee_id = v_actor))
  ) then
    raise exception using errcode = '42501', message = 'PRIVATE_MESSAGE_BLOCKED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('oz-private-message:' || v_actor::text, 0));
  if (select count(*) from public.private_messages m where m.sender_id = v_actor and m.created_at > v_now - interval '10 minutes') >= 20
     or (select count(*) from public.private_messages m where m.sender_id = v_actor and m.created_at > v_now - interval '1 day') >= 200
     or (select count(*) from public.private_messages m where m.recipient_id = v_target and m.created_at > v_now - interval '1 hour') >= 80
     or (select count(*) from public.private_messages m where m.sender_id = v_actor and m.recipient_id = v_target and m.created_at > v_now - interval '1 minute') >= 8 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_MESSAGE_RATE_LIMITED';
  end if;

  insert into public.private_messages as inserted (sender_id, recipient_id, body)
  values (v_actor, v_target, v_body)
  returning inserted.id, inserted.created_at into v_id, v_created;

  message_key := 'm_' || v_id::text;
  recipient_username := v_target_username;
  created_at := v_created;
  server_now := v_now;
  return next;
end;
$$;

revoke all on function public.list_my_outpost_zero_private_conversation_states() from public, anon, authenticated;
revoke all on function public.set_my_outpost_zero_private_conversation_state(uuid, text) from public, anon, authenticated;
revoke all on function public.archive_my_outpost_zero_private_conversation_overflow() from public, anon, authenticated;
revoke all on function public.send_outpost_zero_private_message(text, text) from public, anon, authenticated;
grant execute on function public.list_my_outpost_zero_private_conversation_states() to authenticated;
grant execute on function public.set_my_outpost_zero_private_conversation_state(uuid, text) to authenticated;
grant execute on function public.archive_my_outpost_zero_private_conversation_overflow() to authenticated;
grant execute on function public.send_outpost_zero_private_message(text, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'private_conversation_states'
  ) then
    alter publication supabase_realtime add table public.private_conversation_states;
  end if;
end;
$$;

commit;
