-- OUTPOST ZERO / PLAYER 03: SOCIAL MENU
-- One rerunnable owner for the private account profile, public username,
-- friendships, private conversations, Parties, maintenance, and the Social Realtime refresh feeds.
-- Policies, grants, and RPC elevation live in Player 04 Security.
--
-- Private game-save profiles and public Social profiles deliberately remain
-- separate tables with separate row-level security. Run Player 03 before
-- Player 01 Stats because leaderboard identity uses public.social_profiles.

begin;

-- Fail closed: policy setup lives in Player 04 Security. Install it first.
do $section_security_required$
begin
  if to_regprocedure('public._outpost_zero_apply_player_security(text)') is null then
    raise exception 'Run Player 04 Security first; this transaction made no changes';
  end if;
end;
$section_security_required$;

-- PRIVATE ACCOUNT PROFILE

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists data jsonb;
alter table public.profiles add column if not exists updated_at timestamptz;

-- Missing compatible columns can be repaired, but incompatible legacy types
-- fail the transaction rather than casting or deleting account progress.
do $shape$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='user_id' and udt_name='uuid')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='data' and udt_name='jsonb')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='updated_at' and udt_name='timestamptz') then
    raise exception 'public.profiles has an incompatible legacy shape; no data was changed';
  end if;
end;
$shape$;

update public.profiles set data='{}'::jsonb where data is null;
update public.profiles set updated_at=now() where updated_at is null;
alter table public.profiles alter column data set default '{}'::jsonb;
alter table public.profiles alter column data set not null;
alter table public.profiles alter column updated_at set default now();
alter table public.profiles alter column updated_at set not null;

do $key$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.profiles'::regclass and c.contype='p'
      and c.conkey=array[(select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.profiles'::regclass and a.attname='user_id')]::smallint[]
  ) then
    if exists (select 1 from pg_catalog.pg_constraint c where c.conrelid='public.profiles'::regclass and c.contype='p') then
      raise exception 'public.profiles has a primary key other than user_id; no data was changed';
    end if;
    alter table public.profiles alter column user_id set not null;
    alter table public.profiles add constraint profiles_pkey primary key(user_id);
  end if;
end;
$key$;

-- Add the Auth ownership constraint without deleting an unexpected orphan.
do $fk$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.profiles'::regclass and c.contype='f'
      and c.confrelid='auth.users'::regclass
      and c.confdeltype='c'
      and c.conkey=array[(select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.profiles'::regclass and a.attname='user_id')]::smallint[]
      and c.confkey=array[(select a.attnum from pg_catalog.pg_attribute a where a.attrelid='auth.users'::regclass and a.attname='id')]::smallint[]
  ) then
    alter table public.profiles add constraint outpost_zero_profiles_user_auth_fkey
      foreign key(user_id) references auth.users(id) on delete cascade not valid;
    if not exists (select 1 from public.profiles p left join auth.users u on u.id=p.user_id where u.id is null) then
      alter table public.profiles validate constraint outpost_zero_profiles_user_auth_fkey;
    end if;
  end if;
end;
$fk$;

-- Game-save consumers require an object. Preserve any malformed legacy row for
-- manual repair, while preventing all new scalar/array values immediately.
alter table public.profiles drop constraint if exists outpost_zero_profiles_data_object_check;
alter table public.profiles add constraint outpost_zero_profiles_data_object_check
  check (jsonb_typeof(data)='object') not valid;
do $profile_json$
begin
  if not exists (select 1 from public.profiles where jsonb_typeof(data) is distinct from 'object') then
    alter table public.profiles validate constraint outpost_zero_profiles_data_object_check;
  end if;
end;
$profile_json$;

do $realtime$
begin
  if exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='profiles'
  ) then
    alter publication supabase_realtime drop table public.profiles;
  end if;
end;
$realtime$;

-- SOCIAL PROFILES, FRIENDSHIPS, PRIVATE MESSAGES, AND CONVERSATION STATE

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
-- reruns. RLS, privileges, and RPC elevation remain centralized in the final
-- Player 03 security section.


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

-- RLS and browser privileges are centralized in the final Player 03 section.

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
      -- Direct browser inserts are still pending-only under Player 03 RLS.
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

-- Social Inbox owns its own yearly retention. One physical message belongs to
-- both participants, so it is removed only after it is one year old, read,
-- and no longer current for either side. Delete cutoffs count as done; an
-- archived conversation counts only while no newer message has reopened it.
do $social_inbox_retention$
declare v_job_id bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    v_job_id := cron.schedule(
      'purge-old-social-inbox-messages',
      '0 3 1 1 *',
      $cron$
      delete from public.private_messages m
      where m.created_at < clock_timestamp() - interval '1 year'
        and m.read_at is not null
        and exists (
          select 1 from public.private_conversation_states s
          where s.owner_id=m.sender_id and s.peer_id=m.recipient_id
            and (s.deleted_before >= m.created_at or (
              s.archived_at >= m.created_at and not exists (
                select 1 from public.private_messages newer
                where ((newer.sender_id=m.sender_id and newer.recipient_id=m.recipient_id)
                    or (newer.sender_id=m.recipient_id and newer.recipient_id=m.sender_id))
                  and newer.created_at > s.archived_at
              )
            ))
        )
        and exists (
          select 1 from public.private_conversation_states s
          where s.owner_id=m.recipient_id and s.peer_id=m.sender_id
            and (s.deleted_before >= m.created_at or (
              s.archived_at >= m.created_at and not exists (
                select 1 from public.private_messages newer
                where ((newer.sender_id=m.sender_id and newer.recipient_id=m.recipient_id)
                    or (newer.sender_id=m.recipient_id and newer.recipient_id=m.sender_id))
                  and newer.created_at > s.archived_at
              )
            ))
        )
      $cron$
    );
    if to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is not null then
      perform cron.alter_job(v_job_id, active => true);
    end if;
  end if;
end;
$social_inbox_retention$;

-- RPC permissions and Realtime publication membership are centralized in
-- the final Player 03 security section.

-- USERNAME CREATION + 21-DAY CHANGE CLOCK

alter table public.social_profiles
  add column if not exists username_changed_at timestamptz;

comment on column public.social_profiles.username_changed_at is
  'Server time of the latest chosen-username change; null until an initial claim or migration grace change.';

-- This trigger is the final database guard. It protects the 21-day rule even
-- if an obsolete client somehow retains a direct-update path. Existing chosen
-- usernames receive one migration-grace change because their historical
-- change time cannot be reconstructed safely. A temporary op_<uuid> name can
-- always be replaced once without waiting.
create or replace function public.social_profiles_username_clock()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  old_is_generated boolean;
  next_change timestamptz;
begin
  if tg_op = 'INSERT' then
    new.username_changed_at := case
      when new.handle_key in (
        'op_' || left(replace(new.user_id::text, '-', ''), 20),
        'op_' || left(replace(new.user_id::text, '-', ''), 8),
        'username_not_set',
        'usernamenotset'
      ) then null
      else now()
    end;
    return new;
  end if;

  -- Clients can never edit the clock itself.
  new.username_changed_at := old.username_changed_at;
  if new.handle is not distinct from old.handle then
    return new;
  end if;
  if new.handle_key in ('username_not_set', 'usernamenotset') then
    raise exception using errcode = '22023', message = 'USERNAME_INVALID',
      hint = 'That name is reserved. Choose a different username.';
  end if;

  old_is_generated := old.username_changed_at is null
    and old.handle_key in (
      'op_' || left(replace(old.user_id::text, '-', ''), 20),
      'op_' || left(replace(old.user_id::text, '-', ''), 8),
      'username_not_set',
      'usernamenotset'
    );
  next_change := old.username_changed_at + interval '21 days';

  if not old_is_generated
     and old.username_changed_at is not null
     and next_change > now() then
    raise exception using
      errcode = 'P0001',
      message = 'USERNAME_CHANGE_COOLDOWN',
      detail = to_char(next_change at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      hint = 'Usernames can be changed once every 21 days.';
  end if;

  new.username_changed_at := now();
  return new;
end;
$$;

drop trigger if exists social_profiles_username_clock_trigger
  on public.social_profiles;
create trigger social_profiles_username_clock_trigger
before insert or update on public.social_profiles
for each row execute function public.social_profiles_username_clock();

-- The Settings screen calls only this RPC. The user id always comes from the
-- verified JWT, never a browser parameter. Row locking makes simultaneous
-- requests obey one cooldown clock, and the unique index remains the final
-- protection against two accounts selecting the same case-insensitive name.
create or replace function public.outpost_zero_set_username(p_username text)
returns table(
  username text,
  changed_at timestamptz,
  next_change_at timestamptz,
  first_choice boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  wanted text := btrim(coalesce(p_username, ''));
  current_username text;
  current_key text;
  current_changed_at timestamptz;
  was_generated boolean;
  available_at timestamptz;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if wanted !~ '^[A-Za-z0-9_]{3,32}$'
     or lower(wanted) in ('username_not_set', 'usernamenotset')
     or lower(wanted) in (
       'op_' || left(replace(actor::text, '-', ''), 20),
       'op_' || left(replace(actor::text, '-', ''), 8)
     ) then
    raise exception using errcode = '22023', message = 'USERNAME_INVALID',
      hint = 'Use 3-32 letters, numbers, or underscores and not the temporary account name.';
  end if;

  select sp.handle, sp.handle_key, sp.username_changed_at
    into current_username, current_key, current_changed_at
  from public.social_profiles sp
  where sp.user_id = actor
  for update;

  if not found then
    current_username := 'op_' || left(replace(actor::text, '-', ''), 20);
    insert into public.social_profiles(user_id, handle, handle_key, display_name)
    values(actor, current_username, current_username, current_username);
    current_key := current_username;
    current_changed_at := null;
  end if;

  was_generated := current_changed_at is null
    and current_key in (
      'op_' || left(replace(actor::text, '-', ''), 20),
      'op_' || left(replace(actor::text, '-', ''), 8),
      'username_not_set',
      'usernamenotset'
    );
  available_at := current_changed_at + interval '21 days';

  -- Saving the exact current spelling is idempotent and does not restart the
  -- clock. A case-only spelling change is a real public-identity change.
  if wanted = current_username then
    return query select current_username, current_changed_at, available_at, was_generated;
    return;
  end if;
  if not was_generated and current_changed_at is not null and available_at > now() then
    raise exception using errcode = 'P0001', message = 'USERNAME_CHANGE_COOLDOWN',
      detail = to_char(available_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      hint = 'Usernames can be changed once every 21 days.';
  end if;

  begin
    update public.social_profiles sp
    set handle = wanted, handle_key = lower(wanted), display_name = wanted
    where sp.user_id = actor;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'USERNAME_UNAVAILABLE',
      hint = 'Choose a different username.';
  end;

  return query
  select sp.handle, sp.username_changed_at,
         sp.username_changed_at + interval '21 days', was_generated
  from public.social_profiles sp
  where sp.user_id = actor;
end;
$$;

-- These strings are transport/UI sentinels, not claimable public identities.
-- Refresh the signup availability RPC here so an existing legacy Social install
-- receives the rule by running only this one upgrade file.
create or replace function public.outpost_zero_username_available(p_username text)
returns boolean
language sql stable security invoker
set search_path = pg_catalog, public
as $$
  select coalesce(
    btrim(p_username) ~ '^[A-Za-z0-9_]{3,32}$'
    and lower(btrim(p_username)) not in ('username_not_set', 'usernamenotset')
    and not exists (
      select 1 from public.social_profiles sp
      where sp.handle_key = lower(btrim(p_username))
    ), false
  )
$$;

-- RLS, direct-write removal, and RPC execute permissions are centralized in
-- the final Player 03 section so every Social boundary is reviewed together.

-- PARTY INVITATIONS, PUBLIC DIRECTORY, AND JOIN REQUESTS

-- The older Party migration stored a database heartbeat. Online discovery now uses
-- Supabase Realtime Presence, so remove that old state and its RPCs explicitly.
-- The two invite RPCs are dropped first because the old versions referenced the
-- heartbeat table; secure replacements are created below.
drop function if exists public.touch_outpost_zero_social_presence();
drop function if exists public.leave_outpost_zero_social_presence();
drop function if exists public.list_outpost_zero_party_invite_targets(integer);
drop function if exists public.list_outpost_zero_party_invite_targets(integer, text[]);
drop function if exists public.send_outpost_zero_party_invite(uuid, text, text, text, uuid);
drop table if exists public.outpost_zero_social_presence;

-- OPAQUE TARGET TICKETS
--
-- The candidate list never returns an Auth account UUID. Realtime supplies the
-- usernames currently visible to the browser; this RPC resolves those names
-- and returns viewer-bound action tokens that expire after two minutes. Online
-- state is a UI signal, not a database authorization boundary. Blocks, identity,
-- rate limits, recipient ownership, and CPU 2v2 friendship are server-enforced.
create table if not exists public.outpost_zero_party_invite_targets (
  target_token uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  target_kind text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  constraint outpost_zero_party_invite_targets_distinct check (viewer_id <> target_id),
  constraint outpost_zero_party_invite_targets_kind check (target_kind in ('friend', 'online')),
  constraint outpost_zero_party_invite_targets_window check (
    expires_at > issued_at
    and expires_at <= issued_at + interval '2 minutes'
  ),
  constraint outpost_zero_party_invite_targets_pair unique (viewer_id, target_id)
);

-- Rerunning over an older Party migration may encounter the table without
-- target_kind. Target tickets are intentionally ephemeral, so discard any old
-- tickets before tightening the upgraded schema.
alter table public.outpost_zero_party_invite_targets
  add column if not exists target_kind text;
delete from public.outpost_zero_party_invite_targets;
alter table public.outpost_zero_party_invite_targets
  alter column target_kind set not null;
alter table public.outpost_zero_party_invite_targets
  drop constraint if exists outpost_zero_party_invite_targets_kind;
alter table public.outpost_zero_party_invite_targets
  add constraint outpost_zero_party_invite_targets_kind
  check (target_kind in ('friend', 'online'));

create index if not exists outpost_zero_party_invite_targets_expiry_idx
  on public.outpost_zero_party_invite_targets(expires_at);

-- INVITES
--
-- Join secrets live only in this locked table. Candidate/list RPCs return no
-- secret. The intended recipient receives it only from the claim RPC. A claim
-- is recipient-idempotent until expiry so a reload or failed connection can
-- retry; the ephemeral Party host still admits its join token only once.
create table if not exists public.outpost_zero_party_invites (
  invite_id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  request_target_token uuid not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  recipient_username_at_send text not null,
  recipient_kind text not null,
  kind text not null,
  party_code text not null,
  join_token text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  dismissed_at timestamptz,
  constraint outpost_zero_party_invites_distinct check (sender_id <> recipient_id),
  constraint outpost_zero_party_invites_kind check (kind in ('party', 'cpu2v2')),
  constraint outpost_zero_party_invites_recipient_kind check (recipient_kind in ('friend', 'online')),
  constraint outpost_zero_party_invites_code check (party_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  constraint outpost_zero_party_invites_token check (join_token ~ '^[A-Za-z0-9_-]{20,64}$'),
  constraint outpost_zero_party_invites_username check (
    recipient_username_at_send ~ '^[A-Za-z0-9_]{3,32}$'
  ),
  constraint outpost_zero_party_invites_window check (
    expires_at > created_at
    and expires_at <= created_at + interval '5 minutes'
  ),
  constraint outpost_zero_party_invites_claim_clock check (
    claimed_at is null or claimed_at >= created_at
  ),
  constraint outpost_zero_party_invites_dismiss_clock check (
    dismissed_at is null or dismissed_at >= created_at
  ),
  constraint outpost_zero_party_invites_operation unique (sender_id, operation_id)
);

create index if not exists outpost_zero_party_invites_recipient_live_idx
  on public.outpost_zero_party_invites(recipient_id, expires_at desc, created_at desc);
create index if not exists outpost_zero_party_invites_sender_recent_idx
  on public.outpost_zero_party_invites(sender_id, created_at desc);
create index if not exists outpost_zero_party_invites_sender_target_idx
  on public.outpost_zero_party_invites(sender_id, recipient_id, created_at desc);
create index if not exists outpost_zero_party_invites_expiry_idx
  on public.outpost_zero_party_invites(expires_at);

-- RLS and browser privileges for these locked tables are centralized in
-- the final Player 03 section. The RPCs below retain their action-specific identity, block,
-- friendship, idempotency, and rate-limit checks.

-- Accepted friends are always returned. p_online_usernames contains only the
-- handles currently visible in the shared Realtime Presence channel. A blocked
-- pair, the caller, and generated usernames are excluded. target_token is an
-- opaque action capability scoped to the caller; it is not an Auth UUID.
create or replace function public.list_outpost_zero_party_invite_targets(
  p_limit integer default 40,
  p_online_usernames text[] default array[]::text[]
)
returns table(
  target_token uuid,
  username text,
  is_friend boolean,
  is_online boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  clock_now timestamptz := statement_timestamp();
  row_limit integer := least(60, greatest(1, coalesce(p_limit, 40)));
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not exists (
    select 1 from public.social_profiles own_profile
    where own_profile.user_id = actor
      and own_profile.handle ~ '^[A-Za-z0-9_]{3,32}$'
      and own_profile.handle_key not in ('username_not_set', 'usernamenotset')
      and own_profile.handle_key <> 'op_' || left(replace(actor::text, '-', ''), 20)
      and own_profile.handle_key <> 'op_' || left(replace(actor::text, '-', ''), 8)
  ) then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_USERNAME_REQUIRED';
  end if;

  -- Tickets have no audit value after expiry; global indexed cleanup prevents
  -- the viewer/target cross-product from growing forever.
  delete from public.outpost_zero_party_invite_targets t
  where t.expires_at <= clock_now;

  return query
  with accepted as materialized (
    select case
      when f.requester_id = actor then f.addressee_id
      else f.requester_id
    end as target_id
    from public.friendships f
    where f.status = 'accepted'
      and actor in (f.requester_id, f.addressee_id)
  ), requested_online as materialized (
    select distinct lower(regexp_replace(btrim(candidate.username), '^@', '')) as handle_key
    from unnest((coalesce(p_online_usernames, array[]::text[]))[1:60]) as candidate(username)
    where lower(regexp_replace(btrim(candidate.username), '^@', '')) ~ '^[a-z0-9_]{3,32}$'
  ),
  eligible as materialized (
    select sp.user_id as target_id,
           sp.handle as username,
           exists(select 1 from accepted a where a.target_id = sp.user_id) as is_friend,
           exists(select 1 from requested_online ro where ro.handle_key = sp.handle_key) as is_online
    from public.social_profiles sp
    where sp.user_id <> actor
      and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
      and sp.handle_key not in ('username_not_set', 'usernamenotset')
      and sp.handle_key <> 'op_' || left(replace(sp.user_id::text, '-', ''), 20)
      and sp.handle_key <> 'op_' || left(replace(sp.user_id::text, '-', ''), 8)
      and (
        exists(select 1 from accepted a where a.target_id = sp.user_id)
        or exists(select 1 from requested_online ro where ro.handle_key = sp.handle_key)
      )
      and not exists (
        select 1 from public.friendships blocked
        where blocked.status = 'blocked'
          and ((blocked.requester_id = actor and blocked.addressee_id = sp.user_id)
            or (blocked.requester_id = sp.user_id and blocked.addressee_id = actor))
      )
    order by
      exists(select 1 from accepted a where a.target_id = sp.user_id) desc,
      exists(select 1 from requested_online ro where ro.handle_key = sp.handle_key) desc,
      sp.handle_key,
      sp.user_id
    limit row_limit
  ),
  issued as (
    insert into public.outpost_zero_party_invite_targets(
      viewer_id, target_id, target_kind, issued_at, expires_at
    )
    select actor, e.target_id,
      case when e.is_friend then 'friend' else 'online' end,
      clock_now, clock_now + interval '2 minutes'
    from eligible e
    on conflict (viewer_id, target_id) do update
    set target_kind = excluded.target_kind,
        issued_at = excluded.issued_at,
        expires_at = excluded.expires_at
    returning outpost_zero_party_invite_targets.target_token,
              outpost_zero_party_invite_targets.target_id
  )
  select i.target_token, e.username, e.is_friend, e.is_online
  from issued i
  join eligible e on e.target_id = i.target_id
  order by e.is_friend desc, e.is_online desc, lower(e.username), i.target_token;
end;
$$;

-- Create one invitation. Actor identity and recipient resolution are entirely
-- server-derived. Normal Party invites accept a short-lived target ticket made
-- from the Realtime list; CPU 2v2 deliberately remains accepted-friend-only.
--
-- `p_operation_id` is exact-once per sender. A byte-for-byte retry returns the
-- original row (even if its target ticket has since expired); reusing that UUID
-- with different arguments fails closed.
create or replace function public.send_outpost_zero_party_invite(
  p_target_token uuid,
  p_kind text,
  p_party_code text,
  p_join_token text,
  p_operation_id uuid
)
returns table(
  invite_id uuid,
  recipient_username text,
  recipient_kind text,
  created_at timestamptz,
  expires_at timestamptz,
  reused boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  clock_now timestamptz := statement_timestamp();
  wanted_kind text := lower(btrim(coalesce(p_kind, '')));
  clean_code text := upper(btrim(coalesce(p_party_code, '')));
  clean_token text := btrim(coalesce(p_join_token, ''));
  existing public.outpost_zero_party_invites%rowtype;
  target_user uuid;
  target_username text;
  ticket_kind text;
  target_is_friend boolean := false;
  target_is_blocked boolean := false;
  target_kind text;
  ttl interval;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_target_token is null or p_operation_id is null then
    raise exception using errcode = '22023', message = 'PARTY_INVITE_INVALID';
  end if;
  if wanted_kind not in ('party', 'cpu2v2')
     or clean_code !~ '^[A-HJ-NP-Z2-9]{6}$'
     or clean_token !~ '^[A-Za-z0-9_-]{20,64}$' then
    raise exception using errcode = '22023', message = 'PARTY_INVITE_INVALID';
  end if;
  if not exists (
    select 1 from public.social_profiles own_profile
    where own_profile.user_id = actor
      and own_profile.handle ~ '^[A-Za-z0-9_]{3,32}$'
      and own_profile.handle_key not in ('username_not_set', 'usernamenotset')
      and own_profile.handle_key <> 'op_' || left(replace(actor::text, '-', ''), 20)
      and own_profile.handle_key <> 'op_' || left(replace(actor::text, '-', ''), 8)
  ) then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_USERNAME_REQUIRED';
  end if;

  -- Serialize every send for one account so concurrent tabs cannot step over
  -- the rolling limits or the sender-scoped idempotency key.
  perform pg_advisory_xact_lock(
    hashtextextended('outpost-zero-party-invite:' || actor::text, 0)
  );

  select pi.* into existing
  from public.outpost_zero_party_invites pi
  where pi.sender_id = actor and pi.operation_id = p_operation_id
  for update;

  if found then
    if existing.request_target_token is distinct from p_target_token
       or existing.kind is distinct from wanted_kind
       or existing.party_code is distinct from clean_code
       or existing.join_token is distinct from clean_token then
      raise exception using errcode = 'P0001', message = 'PARTY_INVITE_IDEMPOTENCY_CONFLICT';
    end if;
    return query select existing.invite_id,
      existing.recipient_username_at_send,
      existing.recipient_kind,
      existing.created_at,
      existing.expires_at,
      true;
    return;
  end if;

  select t.target_id, t.target_kind into target_user, ticket_kind
  from public.outpost_zero_party_invite_targets t
  where t.target_token = p_target_token
    and t.viewer_id = actor
    and t.expires_at > clock_now
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_TARGET_UNAVAILABLE';
  end if;

  select sp.handle into target_username
  from public.social_profiles sp
  where sp.user_id = target_user
    and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
    and sp.handle_key not in ('username_not_set', 'usernamenotset')
    and sp.handle_key <> 'op_' || left(replace(sp.user_id::text, '-', ''), 20)
    and sp.handle_key <> 'op_' || left(replace(sp.user_id::text, '-', ''), 8);
  if not found then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_TARGET_UNAVAILABLE';
  end if;

  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = actor and f.addressee_id = target_user)
        or (f.requester_id = target_user and f.addressee_id = actor))
  ) into target_is_friend;
  select exists (
    select 1 from public.friendships f
    where f.status = 'blocked'
      and ((f.requester_id = actor and f.addressee_id = target_user)
        or (f.requester_id = target_user and f.addressee_id = actor))
  ) into target_is_blocked;
  if target_is_blocked then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_TARGET_UNAVAILABLE';
  end if;
  if wanted_kind = 'cpu2v2' and not target_is_friend then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_FRIEND_REQUIRED';
  end if;
  if wanted_kind = 'party' and ticket_kind = 'friend' and not target_is_friend then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_TARGET_UNAVAILABLE';
  end if;

  -- A second namespaced lock serializes the recipient-wide inbound limit.
  -- Its key space is separate from sender locks, so reciprocal invitations do
  -- not create an actor/recipient advisory-lock cycle.
  perform pg_advisory_xact_lock(
    hashtextextended('outpost-zero-party-invite-recipient:' || target_user::text, 0)
  );

  target_kind := case when target_is_friend then 'friend' else 'online' end;
  ttl := case when wanted_kind = 'party' then interval '5 minutes' else interval '2 minutes' end;

  -- Abuse limits use server time and count operation rows, not client UUIDs:
  -- 8 total / 10 minutes, 40 / day, 2 to one player / 10 minutes, and
  -- 30 incoming / hour for one recipient. Only one live same-kind invitation
  -- may be pending from this sender to this recipient.
  if (select count(*) from public.outpost_zero_party_invites pi
      where pi.sender_id = actor and pi.created_at > clock_now - interval '10 minutes') >= 8
     or (select count(*) from public.outpost_zero_party_invites pi
         where pi.sender_id = actor and pi.created_at > clock_now - interval '1 day') >= 40
     or (select count(*) from public.outpost_zero_party_invites pi
         where pi.sender_id = actor and pi.recipient_id = target_user
           and pi.created_at > clock_now - interval '10 minutes') >= 2
     or (select count(*) from public.outpost_zero_party_invites pi
         where pi.recipient_id = target_user
           and pi.created_at > clock_now - interval '1 hour') >= 30 then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_RATE_LIMITED';
  end if;

  if exists (
    select 1 from public.outpost_zero_party_invites pi
    where pi.sender_id = actor
      and pi.recipient_id = target_user
      and pi.kind = wanted_kind
      and pi.expires_at > clock_now
      and pi.dismissed_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_ALREADY_PENDING';
  end if;

  insert into public.outpost_zero_party_invites(
    operation_id, request_target_token, sender_id, recipient_id,
    recipient_username_at_send, recipient_kind, kind, party_code, join_token,
    created_at, expires_at
  ) values (
    p_operation_id, p_target_token, actor, target_user,
    target_username, target_kind, wanted_kind, clean_code, clean_token,
    clock_now, clock_now + ttl
  ) returning * into existing;

  -- Expired rows remain for seven days so a delayed retry keeps exact-once
  -- semantics, then are removed without retaining a permanent social graph.
  delete from public.outpost_zero_party_invites pi
  where pi.expires_at < clock_now - interval '7 days';

  return query select existing.invite_id,
    existing.recipient_username_at_send,
    existing.recipient_kind,
    existing.created_at,
    existing.expires_at,
    false;
end;
$$;

-- Poll while signed in (the client uses seven seconds). Only live invites for
-- the JWT owner are returned, and join secrets/account UUIDs are omitted.
create or replace function public.list_outpost_zero_party_invites(
  p_limit integer default 20
)
returns table(
  invite_id uuid,
  sender_username text,
  kind text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  clock_now timestamptz := statement_timestamp();
  row_limit integer := least(40, greatest(1, coalesce(p_limit, 20)));
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  delete from public.outpost_zero_party_invites pi
  where pi.expires_at < clock_now - interval '7 days';

  return query
  select pi.invite_id,
         sender.handle as sender_username,
         pi.kind,
         pi.created_at,
         pi.expires_at
  from public.outpost_zero_party_invites pi
  join public.social_profiles sender on sender.user_id = pi.sender_id
    and sender.handle ~ '^[A-Za-z0-9_]{3,32}$'
    and sender.handle_key not in ('username_not_set', 'usernamenotset')
    and sender.handle_key <> 'op_' || left(replace(sender.user_id::text, '-', ''), 20)
    and sender.handle_key <> 'op_' || left(replace(sender.user_id::text, '-', ''), 8)
  where pi.recipient_id = actor
    and pi.expires_at > clock_now
    and pi.dismissed_at is null
    and not exists (
      select 1 from public.friendships blocked
      where blocked.status = 'blocked'
        and ((blocked.requester_id = pi.sender_id and blocked.addressee_id = actor)
          or (blocked.requester_id = actor and blocked.addressee_id = pi.sender_id))
    )
  order by pi.created_at desc, pi.invite_id
  limit row_limit;
end;
$$;

-- Recipient-bound, idempotent claim. Repeating this call from the same account
-- before expiry returns the same join secret and original claimed_at. Any
-- other account receives the same generic unavailable error as an unknown ID.
create or replace function public.claim_outpost_zero_party_invite(
  p_invite_id uuid
)
returns table(
  invite_id uuid,
  sender_username text,
  kind text,
  party_code text,
  join_token text,
  created_at timestamptz,
  expires_at timestamptz,
  claimed_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  clock_now timestamptz := statement_timestamp();
  picked public.outpost_zero_party_invites%rowtype;
  safe_sender text;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_invite_id is null then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_UNAVAILABLE';
  end if;

  select pi.* into picked
  from public.outpost_zero_party_invites pi
  where pi.invite_id = p_invite_id
    and pi.recipient_id = actor
    and pi.expires_at > clock_now
    and pi.dismissed_at is null
    and not exists (
      select 1 from public.friendships blocked
      where blocked.status = 'blocked'
        and ((blocked.requester_id = pi.sender_id and blocked.addressee_id = actor)
          or (blocked.requester_id = actor and blocked.addressee_id = pi.sender_id))
    )
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_UNAVAILABLE';
  end if;

  if picked.claimed_at is null then
    update public.outpost_zero_party_invites pi
    set claimed_at = clock_now
    where pi.invite_id = picked.invite_id
    returning pi.claimed_at into picked.claimed_at;
  end if;

  select sp.handle into safe_sender
  from public.outpost_zero_party_invites pi
  join public.social_profiles sp on sp.user_id = pi.sender_id
  where pi.invite_id = picked.invite_id
    and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
    and sp.handle_key not in ('username_not_set', 'usernamenotset')
    and sp.handle_key <> 'op_' || left(replace(sp.user_id::text, '-', ''), 20)
    and sp.handle_key <> 'op_' || left(replace(sp.user_id::text, '-', ''), 8);
  if not found then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_UNAVAILABLE';
  end if;

  return query select picked.invite_id,
    safe_sender,
    picked.kind,
    picked.party_code,
    picked.join_token,
    picked.created_at,
    picked.expires_at,
    picked.claimed_at;
end;
$$;

create or replace function public.dismiss_outpost_zero_party_invite(
  p_invite_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  clock_now timestamptz := statement_timestamp();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_invite_id is null then return false; end if;

  update public.outpost_zero_party_invites pi
  set dismissed_at = coalesce(pi.dismissed_at, clock_now)
  where pi.invite_id = p_invite_id
    and pi.recipient_id = actor
    and pi.expires_at > clock_now;
  return found;
end;
$$;

-- RPC execute permissions are centralized in the final Player 03 section.

-- PUBLIC PARTY DIRECTORY + HOST APPROVAL + UNIQUE NAMES
--
-- Public-party liveness remains an expiring directory lease. This is separate
-- from player online discovery: player online/offline state uses only Realtime
-- Presence and never writes an account heartbeat row.
do $preflight$
begin
  if to_regclass('public.social_profiles') is null then
    raise exception 'Player 03 Party setup requires its social_profiles section';
  end if;
end;
$preflight$;

create table if not exists public.outpost_zero_public_parties (
  party_id uuid primary key default gen_random_uuid(),
  host_id uuid not null unique references auth.users(id) on delete cascade,
  party_code text not null,
  member_count smallint not null default 1,
  capacity smallint not null default 4,
  created_at timestamptz not null default statement_timestamp(),
  heartbeat_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp() + interval '75 seconds',
  constraint outpost_zero_public_party_code check (party_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  constraint outpost_zero_public_party_size check (capacity between 2 and 4 and member_count between 1 and capacity),
  constraint outpost_zero_public_party_expiry check (expires_at > heartbeat_at and expires_at <= heartbeat_at + interval '90 seconds')
);

create table if not exists public.outpost_zero_public_party_requests (
  request_id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.outpost_zero_public_parties(party_id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_username_at_request text not null,
  operation_id uuid not null,
  status text not null default 'pending',
  created_at timestamptz not null default statement_timestamp(),
  decided_at timestamptz,
  join_token text,
  join_expires_at timestamptz,
  constraint outpost_zero_public_party_request_username check (requester_username_at_request ~ '^[A-Za-z0-9_]{3,32}$'),
  constraint outpost_zero_public_party_request_status check (status in ('pending','accepted','declined')),
  constraint outpost_zero_public_party_request_token check (
    (status = 'accepted' and join_token ~ '^[A-Za-z0-9_-]{20,64}$' and join_expires_at is not null)
    or (status <> 'accepted' and join_token is null and join_expires_at is null)
  ),
  constraint outpost_zero_public_party_request_pair unique (party_id, requester_id),
  constraint outpost_zero_public_party_request_operation unique (requester_id, operation_id)
);

create index if not exists outpost_zero_public_parties_expiry_idx
  on public.outpost_zero_public_parties(expires_at desc, created_at desc);
create index if not exists outpost_zero_public_party_requests_host_idx
  on public.outpost_zero_public_party_requests(party_id, status, created_at);
create index if not exists outpost_zero_public_party_requests_requester_idx
  on public.outpost_zero_public_party_requests(requester_id, created_at desc);

-- Upgrade an existing public-party table and require one unique searchable name.
alter table public.outpost_zero_public_parties
  add column if not exists party_name text;

update public.outpost_zero_public_parties as p
set party_name = left(coalesce(nullif(sp.handle,''),'Party'),23)
  || ' ' || left(replace(p.party_id::text,'-',''),8)
from public.social_profiles as sp
where sp.user_id=p.host_id
  and (p.party_name is null or btrim(p.party_name)='');

update public.outpost_zero_public_parties as p
set party_name = 'Party ' || left(replace(p.party_id::text,'-',''),8)
where p.party_name is null or btrim(p.party_name)='';

alter table public.outpost_zero_public_parties
  alter column party_name set not null;
alter table public.outpost_zero_public_parties
  drop constraint if exists outpost_zero_public_party_name;
alter table public.outpost_zero_public_parties
  add constraint outpost_zero_public_party_name
  check (party_name ~ '^[A-Za-z0-9][A-Za-z0-9 _-]{2,31}$');

create unique index if not exists outpost_zero_public_party_name_unique_idx
  on public.outpost_zero_public_parties(lower(btrim(party_name)));

drop function if exists public.publish_outpost_zero_public_party(text,integer,integer);
create or replace function public.publish_outpost_zero_public_party(
  p_party_code text,
  p_party_name text,
  p_member_count integer default 1,
  p_capacity integer default 4
)
returns table(party_id uuid, party_name text, expires_at timestamptz, server_now timestamptz)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  actor uuid := auth.uid();
  clock_now timestamptz := statement_timestamp();
  clean_code text := upper(btrim(coalesce(p_party_code,'')));
  clean_name text := regexp_replace(btrim(coalesce(p_party_name,'')),'[[:space:]]+',' ','g');
  clean_count integer := least(greatest(coalesce(p_member_count,1),1),4);
  clean_capacity integer := least(greatest(coalesce(p_capacity,4),2),4);
  username text;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if clean_code !~ '^[A-HJ-NP-Z2-9]{6}$' then raise exception using errcode='22023',message='INVALID_PARTY_CODE'; end if;
  if clean_name !~ '^[A-Za-z0-9][A-Za-z0-9 _-]{2,31}$' then raise exception using errcode='22023',message='INVALID_PARTY_NAME'; end if;
  clean_count := least(clean_count,clean_capacity);
  select sp.handle into username from public.social_profiles sp where sp.user_id=actor;
  if username is null or username !~ '^[A-Za-z0-9_]{3,32}$' then
    raise exception using errcode='22023',message='USERNAME_REQUIRED';
  end if;
  delete from public.outpost_zero_public_parties p where p.expires_at <= clock_now;
  begin
    insert into public.outpost_zero_public_parties(host_id,party_code,party_name,member_count,capacity,created_at,heartbeat_at,expires_at)
    values(actor,clean_code,clean_name,clean_count,clean_capacity,clock_now,clock_now,clock_now+interval '75 seconds')
    on conflict(host_id) do update set
      party_code=excluded.party_code,party_name=excluded.party_name,member_count=excluded.member_count,capacity=excluded.capacity,
      heartbeat_at=excluded.heartbeat_at,expires_at=excluded.expires_at
    returning outpost_zero_public_parties.party_id,outpost_zero_public_parties.party_name,
      outpost_zero_public_parties.expires_at,clock_now
    into party_id,party_name,expires_at,server_now;
  exception when unique_violation then
    raise exception using errcode='23505',message='PARTY_NAME_TAKEN';
  end;
  return next;
end;
$function$;

drop function if exists public.close_outpost_zero_public_party();
create or replace function public.close_outpost_zero_public_party(p_party_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare affected integer;
begin
  if auth.uid() is null then return false; end if;
  delete from public.outpost_zero_public_parties p where p.host_id=auth.uid() and p.party_id=p_party_id;
  get diagnostics affected = row_count;
  return affected>0;
end;
$function$;

drop function if exists public.list_outpost_zero_public_parties(integer);
create or replace function public.list_outpost_zero_public_parties(
  p_limit integer default 20,
  p_search text default null
)
returns table(
  party_id uuid,
  party_name text,
  host_username text,
  member_count integer,
  capacity integer,
  created_at timestamptz,
  request_status text,
  server_now timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  actor uuid := auth.uid();
  clock_now timestamptz := statement_timestamp();
  search_key text := left(regexp_replace(btrim(coalesce(p_search,'')),'[[:space:]]+',' ','g'),32);
begin
  if search_key <> '' and search_key !~ '^[A-Za-z0-9 _-]{1,32}$' then
    raise exception using errcode='22023',message='INVALID_PARTY_SEARCH';
  end if;
  delete from public.outpost_zero_public_parties p where p.expires_at<=clock_now;
  return query
  select p.party_id,p.party_name::text,sp.handle::text,p.member_count::integer,p.capacity::integer,p.created_at,
    case when p.host_id=actor then 'host'::text else r.status::text end,clock_now
  from public.outpost_zero_public_parties p
  join public.social_profiles sp on sp.user_id=p.host_id
  left join public.outpost_zero_public_party_requests r on r.party_id=p.party_id and r.requester_id=actor
  where p.expires_at>clock_now and p.member_count<p.capacity
    and (search_key='' or p.party_name ilike '%'||search_key||'%' or sp.handle ilike '%'||search_key||'%')
  order by case when search_key<>'' and lower(p.party_name)=lower(search_key) then 0 else 1 end,
    p.created_at desc,p.party_id
  limit least(greatest(coalesce(p_limit,20),1),40);
end;
$function$;

create or replace function public.request_outpost_zero_public_party(
  p_party_id uuid,
  p_operation_id uuid
)
returns table(accepted boolean, request_id uuid, status text, reason text)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  actor uuid:=auth.uid();clock_now timestamptz:=statement_timestamp();picked public.outpost_zero_public_parties%rowtype;
  username text;existing public.outpost_zero_public_party_requests%rowtype;reserved integer;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_party_id is null or p_operation_id is null then return query select false,null::uuid,'rejected'::text,'INVALID_REQUEST'::text;return;end if;
  select * into picked from public.outpost_zero_public_parties p where p.party_id=p_party_id and p.expires_at>clock_now for update;
  if not found or picked.member_count>=picked.capacity then return query select false,null::uuid,'rejected'::text,'PARTY_UNAVAILABLE'::text;return;end if;
  select count(*)::integer into reserved from public.outpost_zero_public_party_requests r
    where r.party_id=p_party_id and r.status='accepted' and r.join_expires_at>clock_now;
  if picked.member_count+reserved>=picked.capacity then return query select false,null::uuid,'rejected'::text,'PARTY_FULL'::text;return;end if;
  if picked.host_id=actor then return query select false,null::uuid,'rejected'::text,'HOST_CANNOT_REQUEST'::text;return;end if;
  select sp.handle into username from public.social_profiles sp where sp.user_id=actor;
  if username is null or username !~ '^[A-Za-z0-9_]{3,32}$' then raise exception using errcode='22023',message='USERNAME_REQUIRED';end if;
  select * into existing from public.outpost_zero_public_party_requests r where r.requester_id=actor and r.operation_id=p_operation_id;
  if found then
    if existing.party_id=p_party_id then return query select true,existing.request_id,existing.status,'duplicate'::text;
    else return query select false,existing.request_id,existing.status,'OPERATION_CONFLICT'::text;end if;
    return;
  end if;
  insert into public.outpost_zero_public_party_requests(party_id,requester_id,requester_username_at_request,operation_id,status,created_at,decided_at,join_token,join_expires_at)
  values(p_party_id,actor,username,p_operation_id,'pending',clock_now,null,null,null)
  on conflict(party_id,requester_id) do update set requester_username_at_request=excluded.requester_username_at_request,
    operation_id=excluded.operation_id,status='pending',created_at=clock_now,decided_at=null,join_token=null,join_expires_at=null
  returning outpost_zero_public_party_requests.request_id into request_id;
  return query select true,request_id,'pending'::text,'REQUESTED'::text;
end;
$function$;

create or replace function public.list_outpost_zero_public_party_host_requests(p_limit integer default 20)
returns table(request_id uuid,requester_username text,created_at timestamptz,server_now timestamptz)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare actor uuid:=auth.uid();clock_now timestamptz:=statement_timestamp();
begin
  if actor is null then return;end if;
  return query select r.request_id,r.requester_username_at_request::text,r.created_at,clock_now
  from public.outpost_zero_public_party_requests r
  join public.outpost_zero_public_parties p on p.party_id=r.party_id
  where p.host_id=actor and p.expires_at>clock_now and r.status='pending'
  order by r.created_at,r.request_id
  limit least(greatest(coalesce(p_limit,20),1),40);
end;
$function$;

create or replace function public.decide_outpost_zero_public_party_request(
  p_request_id uuid,
  p_accept boolean,
  p_join_token text default null
)
returns table(accepted boolean,status text,requester_username text,join_expires_at timestamptz)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  actor uuid:=auth.uid();clock_now timestamptz:=statement_timestamp();picked public.outpost_zero_public_party_requests%rowtype;
  host_party public.outpost_zero_public_parties%rowtype;clean_token text:=btrim(coalesce(p_join_token,''));reserved integer;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
  select r.* into picked from public.outpost_zero_public_party_requests r where r.request_id=p_request_id for update;
  if not found then return query select false,'missing'::text,''::text,null::timestamptz;return;end if;
  select p.* into host_party from public.outpost_zero_public_parties p where p.party_id=picked.party_id and p.host_id=actor and p.expires_at>clock_now for update;
  if not found then raise exception using errcode='42501',message='HOST_ACCESS_REQUIRED';end if;
  if picked.status<>'pending' then return query select true,picked.status,picked.requester_username_at_request,picked.join_expires_at;return;end if;
  if coalesce(p_accept,false) then
    select count(*)::integer into reserved from public.outpost_zero_public_party_requests r
      where r.party_id=host_party.party_id and r.status='accepted' and r.join_expires_at>clock_now;
    if host_party.member_count+reserved>=host_party.capacity then return query select false,'full'::text,picked.requester_username_at_request,null::timestamptz;return;end if;
    if clean_token !~ '^[A-Za-z0-9_-]{20,64}$' then raise exception using errcode='22023',message='INVALID_JOIN_TOKEN';end if;
    update public.outpost_zero_public_party_requests r set status='accepted',decided_at=clock_now,join_token=clean_token,join_expires_at=clock_now+interval '2 minutes'
      where r.request_id=p_request_id returning r.status,r.join_expires_at into status,join_expires_at;
  else
    update public.outpost_zero_public_party_requests r set status='declined',decided_at=clock_now,join_token=null,join_expires_at=null
      where r.request_id=p_request_id returning r.status into status;
    join_expires_at:=null;
  end if;
  accepted:=true;requester_username:=picked.requester_username_at_request;return next;
end;
$function$;

drop function if exists public.list_my_outpost_zero_public_party_requests(integer);
create or replace function public.list_my_outpost_zero_public_party_requests(p_limit integer default 20)
returns table(
  request_id uuid,party_id uuid,party_name text,host_username text,status text,party_code text,join_token text,
  join_expires_at timestamptz,created_at timestamptz,server_now timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare actor uuid:=auth.uid();clock_now timestamptz:=statement_timestamp();
begin
  if actor is null then return;end if;
  return query select r.request_id,r.party_id,p.party_name::text,sp.handle::text,r.status::text,
    case when r.status='accepted' and r.join_expires_at>clock_now then p.party_code else null end,
    case when r.status='accepted' and r.join_expires_at>clock_now then r.join_token else null end,
    r.join_expires_at,r.created_at,clock_now
  from public.outpost_zero_public_party_requests r
  join public.outpost_zero_public_parties p on p.party_id=r.party_id
  join public.social_profiles sp on sp.user_id=p.host_id
  where r.requester_id=actor and p.expires_at>clock_now
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit,20),1),40);
end;
$function$;

-- Table and RPC permissions are centralized in Player 04 Security.

-- COMPLETE PLAYER 03 FEATURE PREFLIGHT AND REALTIME OWNERSHIP
-- Player 04 applies the security boundary at the end of this transaction.

do $preflight$
begin
  if to_regclass('public.social_profiles') is null
     or to_regclass('public.friendships') is null
     or to_regclass('public.private_messages') is null
     or to_regclass('public.outpost_zero_party_invite_targets') is null
     or to_regclass('public.outpost_zero_party_invites') is null
     or to_regclass('public.outpost_zero_public_parties') is null
     or to_regclass('public.outpost_zero_public_party_requests') is null
     or to_regclass('public.private_conversation_states') is null then
    raise exception 'Player 03 security requires its profile, username, and Party sections first';
  end if;
end;
$preflight$;

-- REALTIME PUBLICATION
-- These are refresh hints only. The policies above still decide which rows a
-- signed-in player may receive.
do $realtime$
declare relation_name text;
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
  ) then alter publication supabase_realtime add table public.friendships; end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'private_messages'
  ) then alter publication supabase_realtime add table public.private_messages; end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'private_conversation_states'
  ) then alter publication supabase_realtime add table public.private_conversation_states; end if;
  foreach relation_name in array array[
    'social_profiles',
    'outpost_zero_party_invite_targets',
    'outpost_zero_party_invites',
    'outpost_zero_public_parties',
    'outpost_zero_public_party_requests'
  ] loop
    if exists (
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

-- Refresh PostgREST only after the complete Profile + Social installation
-- commits successfully.
notify pgrst, 'reload schema';

-- Apply this section's complete boundary atomically before anything is visible.
select public._outpost_zero_apply_player_security('Player 03');

commit;
