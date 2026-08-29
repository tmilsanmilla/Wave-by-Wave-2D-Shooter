-- OUTPOST ZERO / SOCIAL / 01: SOCIAL MENU DATA + PRIVATE CONVERSATIONS
-- File: Social-01-social-menu.sql
-- Profiles, friendships, private messages, and threaded Inbox state belong to
-- one Social data layer.
-- Run before every other script in this directory. Safe to run again.

-- PLAYER PROFILES

create table if not exists public.social_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Legacy column names retained for existing installs: handle is the public
  -- username and handle_key is its case-insensitive uniqueness key.
  handle text not null,
  handle_key text not null,
  display_name text not null default 'operator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_profiles_handle_format check (handle ~ '^[A-Za-z0-9_]{3,32}$'),
  constraint social_profiles_handle_key_format check (handle_key ~ '^[a-z0-9_]{3,32}$')
);

create unique index if not exists social_profiles_handle_key_uidx
  on public.social_profiles(handle_key);

create or replace function public.social_profiles_normalize()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.handle := btrim(new.handle);
  new.handle_key := lower(new.handle);
  -- One public identity everywhere. Keep the legacy compatibility column in
  -- lockstep so an older client cannot publish a second display alias.
  new.display_name := new.handle;
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists social_profiles_normalize_trigger on public.social_profiles;
create trigger social_profiles_normalize_trigger
before insert or update on public.social_profiles
for each row execute function public.social_profiles_normalize();

-- Existing installs may contain a separate display alias. The username is now
-- canonical, so rerunning this script safely brings those rows into sync.
update public.social_profiles
set display_name = handle
where display_name is distinct from handle;

create or replace function public.social_create_profile_for_user()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  generated_handle text;
  requested_username text;
  chosen_username text;
begin
  requested_username := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  -- The UUID suffix is the collision-safe fallback and exposes no email.
  generated_handle := 'op_' || left(replace(new.id::text, '-', ''), 20);
  chosen_username := case
    when requested_username ~ '^[A-Za-z0-9_]{3,32}$' then requested_username
    else generated_handle
  end;

  -- ON CONFLICT keeps auth signup available even if two people race for the
  -- same username after the availability check. The loser gets a generated
  -- username and can choose another one from Social after signing in.
  insert into public.social_profiles(user_id, handle, handle_key, display_name)
  values(new.id, chosen_username, lower(chosen_username), chosen_username)
  on conflict do nothing;
  if not found and chosen_username <> generated_handle then
    insert into public.social_profiles(user_id, handle, handle_key, display_name)
    values(new.id, generated_handle, lower(generated_handle), generated_handle)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists social_profile_after_user_insert on auth.users;
create trigger social_profile_after_user_insert
after insert on auth.users
for each row execute function public.social_create_profile_for_user();

-- Upgrade only an old generated username; collisions safely keep the fallback.
do $$
declare candidate record;
begin
  for candidate in select u.id, btrim(u.raw_user_meta_data ->> 'username') username from auth.users u where btrim(coalesce(u.raw_user_meta_data ->> 'username', '')) ~ '^[A-Za-z0-9_]{3,32}$' order by u.created_at, u.id loop
    begin
      insert into public.social_profiles(user_id, handle, handle_key, display_name)
      values(candidate.id, candidate.username, lower(candidate.username), candidate.username)
      on conflict (user_id) do update set handle=excluded.handle, handle_key=excluded.handle_key, display_name=excluded.display_name
        where social_profiles.handle_key = 'op_' || left(replace(candidate.id::text, '-', ''), 20);
    exception when unique_violation then null; end;
  end loop;
end; $$;
-- Every remaining account receives a private-email-free generated username.
insert into public.social_profiles(user_id, handle, handle_key, display_name)
select u.id,
       'op_' || left(replace(u.id::text, '-', ''), 20),
       'op_' || left(replace(u.id::text, '-', ''), 20),
       'op_' || left(replace(u.id::text, '-', ''), 20)
from auth.users u
where not exists (select 1 from public.social_profiles sp where sp.user_id = u.id)
on conflict do nothing;

-- FRIENDSHIPS

create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  blocked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_distinct_users check (requester_id <> addressee_id),
  constraint friendships_status_check check (status in ('pending','accepted','blocked')),
  constraint friendships_block_owner_check check (
    (status = 'blocked' and blocked_by is not null and blocked_by in (requester_id, addressee_id))
    or (status <> 'blocked' and blocked_by is null)
  )
);

-- Existing installs may still have the earlier BY DEFAULT identity. ALWAYS
-- prevents API clients from choosing or colliding with server-owned row IDs.
alter table public.friendships alter column id set generated always;

-- Refresh the block-owner invariant without deleting a malformed legacy row.
alter table public.friendships
  drop constraint if exists friendships_block_owner_check;
alter table public.friendships
  add constraint friendships_block_owner_check
  check (
    (status = 'blocked' and blocked_by is not null and blocked_by in (requester_id, addressee_id))
    or (status <> 'blocked' and blocked_by is null)
  )
  not valid;
do $$
begin
  if not exists (
    select 1 from public.friendships
    where not (
      (status = 'blocked' and blocked_by is not null and blocked_by in (requester_id, addressee_id))
      or (status <> 'blocked' and blocked_by is null)
    )
  ) then
    alter table public.friendships
      validate constraint friendships_block_owner_check;
  end if;
end;
$$;

create unique index if not exists friendships_one_pair_uidx
  on public.friendships(least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_recent_idx
  on public.friendships(requester_id, updated_at desc);
create index if not exists friendships_addressee_recent_idx
  on public.friendships(addressee_id, updated_at desc);

create or replace function public.friendships_validate_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.requester_id is distinct from actor
       or not (
         (new.status = 'pending' and new.blocked_by is null)
         or (new.status = 'blocked' and new.blocked_by = actor)
       ) then
      raise exception 'relationships must be a requester-created friend request or self-owned block';
    end if;
    new.created_at := now();
    new.updated_at := new.created_at;
    return new;
  end if;

  if new.requester_id is distinct from old.requester_id or new.addressee_id is distinct from old.addressee_id
     or new.created_at is distinct from old.created_at then
    raise exception 'friendship participants are immutable';
  end if;
  if old.status = 'blocked' then
    raise exception 'blocked relationships can only be removed by the blocker';
  elsif new.status = 'accepted' then
    if old.status <> 'pending' or actor is distinct from old.addressee_id then
      raise exception 'only the invited player can accept a pending request';
    end if;
    new.blocked_by := null;
  elsif new.status = 'blocked' then
    if actor is distinct from old.requester_id and actor is distinct from old.addressee_id then
      raise exception 'only a participant can block this relationship';
    end if;
    new.blocked_by := actor;
  else
    raise exception 'unsupported friendship status change';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists friendships_validate_change_trigger on public.friendships;
create trigger friendships_validate_change_trigger
before insert or update on public.friendships
for each row execute function public.friendships_validate_change();

-- PRIVATE MESSAGES

create table if not exists public.private_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint private_messages_distinct_users check (sender_id <> recipient_id),
  constraint private_messages_body_length check (
    char_length(body) <= 500 and body ~ '[^[:space:]]'
  )
);

alter table public.private_messages alter column id set generated always;

-- Refresh the limit for projects that already ran an older copy of this file.
-- NOT VALID preserves any legacy rows that exceeded the raw 500-character cap,
-- while still enforcing the corrected rule for every new or changed row.
alter table public.private_messages
  drop constraint if exists private_messages_body_length;
alter table public.private_messages
  add constraint private_messages_body_length
  check (char_length(body) <= 500 and body ~ '[^[:space:]]')
  not valid;
do $$
begin
  if not exists (
    select 1 from public.private_messages
    where char_length(body) > 500 or body !~ '[^[:space:]]'
  ) then
    alter table public.private_messages
      validate constraint private_messages_body_length;
  end if;
end;
$$;

create index if not exists private_messages_sender_recent_idx
  on public.private_messages(sender_id, created_at desc);
create index if not exists private_messages_recipient_recent_idx
  on public.private_messages(recipient_id, created_at desc);

create or replace function public.private_messages_immutable()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.sender_id is distinct from auth.uid() then
      raise exception 'messages must be created by their sender';
    end if;
    if new.body is null or char_length(new.body) > 500 then
      raise exception 'message body must be between 1 and 500 characters';
    end if;
    new.body := regexp_replace(new.body, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if new.body = '' then
      raise exception 'message body must be between 1 and 500 characters';
    end if;
    new.created_at := now();
    new.read_at := null;
    return new;
  end if;

  if new.sender_id is distinct from old.sender_id or new.recipient_id is distinct from old.recipient_id
     or new.body is distinct from old.body or new.created_at is distinct from old.created_at then
    raise exception 'message contents and participants are immutable';
  end if;
  if auth.uid() is distinct from old.recipient_id then
    raise exception 'only the recipient can mark a message read';
  end if;
  return new;
end;
$$;

drop trigger if exists private_messages_immutable_trigger on public.private_messages;
create trigger private_messages_immutable_trigger
before insert or update on public.private_messages
for each row execute function public.private_messages_immutable();

-- THREADED PRIVATE INBOX
-- Per-player Archive/Delete state, 25-conversation overflow handling, and
-- username-addressed private messaging. Existing messages and state survive
-- reruns. RLS, privileges, and RPC elevation remain centralized in Social 04.


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

-- RLS and browser privileges are centralized in Social 04.

create or replace function public.list_my_outpost_zero_private_conversation_states()
returns table (
  peer_id uuid,
  archived_at timestamptz,
  deleted_before timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security invoker
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
security invoker
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
security invoker
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
security invoker
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

-- Block or unblock any account by its public username. This covers profiles
-- that are not already friends without ever accepting an Auth email or UUID
-- from the browser. Blocking removes the prior pending/accepted relationship;
-- unblocking removes only a block created by the caller.
create or replace function public.set_outpost_zero_player_block(
  p_target_username text,
  p_blocked boolean
)
returns table (
  target_username text,
  blocked boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_handle_key text := lower(regexp_replace(btrim(coalesce(p_target_username, '')), '^@', ''));
  v_target uuid;
  v_target_handle text;
  v_row public.friendships%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_blocked is null or v_handle_key !~ '^[a-z0-9_]{3,32}$' then
    raise exception using errcode = '22023', message = 'INVALID_BLOCK_REQUEST';
  end if;

  select p.user_id, p.handle into v_target, v_target_handle
  from public.social_profiles p
  where p.handle_key = v_handle_key
  limit 1;
  if v_target is null or v_target = v_actor then
    raise exception using errcode = '22023', message = 'BLOCK_TARGET_UNAVAILABLE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'oz-player-block:' || least(v_actor::text, v_target::text) || ':' || greatest(v_actor::text, v_target::text),
      0
    )
  );
  select f.* into v_row
  from public.friendships f
  where (f.requester_id = v_actor and f.addressee_id = v_target)
     or (f.requester_id = v_target and f.addressee_id = v_actor)
  for update;

  if p_blocked then
    if v_row.id is null then
      -- Direct browser inserts are still pending-only under Social 04 RLS.
      -- This reviewed privileged RPC path creates the final block directly,
      -- so the friend-request notification trigger never sees a fake request.
      insert into public.friendships(requester_id, addressee_id, status, blocked_by)
      values (v_actor, v_target, 'blocked', v_actor)
      returning * into v_row;
    elsif v_row.status = 'blocked' and v_row.blocked_by <> v_actor then
      raise exception using errcode = '42501', message = 'BLOCKED_BY_OTHER_PLAYER';
    end if;
    if v_row.status <> 'blocked' then
      update public.friendships f
      set status = 'blocked', blocked_by = v_actor
      where f.id = v_row.id;
    end if;
  elsif v_row.id is not null then
    if v_row.status <> 'blocked' or v_row.blocked_by <> v_actor then
      raise exception using errcode = '42501', message = 'BLOCK_NOT_OWNED_BY_CALLER';
    end if;
    delete from public.friendships f where f.id = v_row.id;
  end if;

  target_username := v_target_handle;
  blocked := p_blocked;
  return next;
end;
$$;

-- RPC permissions and Realtime publication membership are centralized in
-- Social 04.
