-- OUTPOST ZERO / SOCIAL / 03: PARTIES
-- File: Social-03-parties.sql
-- Requires Social 01 and 02. Adds Realtime-discovered Party invitations,
-- the public-party directory, host approval, unique names, and server search.
-- Safe to run again. Add/run this file; do not replace Social 01 or 02.

begin;

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
-- Social 04. The RPCs below retain their action-specific identity, block,
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

-- RPC execute permissions are centralized in Social 04.

-- PUBLIC PARTY DIRECTORY + HOST APPROVAL + UNIQUE NAMES
--
-- Public-party liveness remains an expiring directory lease. This is separate
-- from player online discovery: player online/offline state uses only Realtime
-- Presence and never writes an account heartbeat row.
do $preflight$
begin
  if to_regclass('public.social_profiles') is null then
    raise exception 'Social 03 requires Social 01 (social_profiles)';
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

-- Table and RPC permissions are centralized in Social 04.

commit;
