-- OUTPOST ZERO / SOCIAL / 06: PARTY ONLINE INVITES
-- Requires Social 01 through 05. Adds private-safe online discovery and
-- server-authorized Party invitations without weakening friends-only messages.
-- Safe to run again. Add/run this file; do not replace Social 01 through 05.

begin;

-- ONLINE PRESENCE
--
-- This is an account heartbeat, not a durable activity log. One row per Auth
-- account keeps multiple tabs/devices from creating an unbounded session list.
-- The database clock supplies both timestamps, and stale rows stop qualifying
-- after 90 seconds even if a disconnect cannot send the optional leave RPC.
create table if not exists public.outpost_zero_social_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null,
  online_until timestamptz not null,
  constraint outpost_zero_social_presence_window check (
    online_until >= last_seen_at
    and online_until <= last_seen_at + interval '90 seconds'
  )
);

create index if not exists outpost_zero_social_presence_fresh_idx
  on public.outpost_zero_social_presence(online_until desc, user_id);

comment on table public.outpost_zero_social_presence is
  'Private server-time heartbeat used only to find recently-online Party invite targets.';

-- OPAQUE TARGET TICKETS
--
-- The candidate list never returns an Auth account UUID. It returns a random,
-- viewer-bound action token which expires after two minutes. The send RPC
-- resolves this token and rechecks the underlying friendship/presence at the
-- exact send boundary, so copying a token to another account does nothing.
create table if not exists public.outpost_zero_party_invite_targets (
  target_token uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  constraint outpost_zero_party_invite_targets_distinct check (viewer_id <> target_id),
  constraint outpost_zero_party_invite_targets_window check (
    expires_at > issued_at
    and expires_at <= issued_at + interval '2 minutes'
  ),
  constraint outpost_zero_party_invite_targets_pair unique (viewer_id, target_id)
);

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

-- No browser role may read or write the raw presence, target, or invite rows.
-- FORCE RLS also protects these tables from an accidental future grant. Only
-- the fixed-search-path SECURITY DEFINER RPCs below cross this boundary.
alter table public.outpost_zero_social_presence enable row level security;
alter table public.outpost_zero_social_presence force row level security;
alter table public.outpost_zero_party_invite_targets enable row level security;
alter table public.outpost_zero_party_invite_targets force row level security;
alter table public.outpost_zero_party_invites enable row level security;
alter table public.outpost_zero_party_invites force row level security;

drop policy if exists outpost_zero_social_presence_browser on public.outpost_zero_social_presence;
drop policy if exists outpost_zero_party_invite_targets_browser on public.outpost_zero_party_invite_targets;
drop policy if exists outpost_zero_party_invites_browser on public.outpost_zero_party_invites;

revoke all on table public.outpost_zero_social_presence from public, anon, authenticated;
revoke all on table public.outpost_zero_party_invite_targets from public, anon, authenticated;
revoke all on table public.outpost_zero_party_invites from public, anon, authenticated;

-- Call after signed-in Social becomes ready and every 30 seconds while the
-- page is connected. Calls inside 15 seconds do not extend the row again,
-- reducing write amplification without trusting a client clock.
create or replace function public.touch_outpost_zero_social_presence()
returns table(server_now timestamptz, online_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  clock_now timestamptz := statement_timestamp();
  fresh_until timestamptz;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  insert into public.outpost_zero_social_presence(user_id, last_seen_at, online_until)
  values(actor, clock_now, clock_now + interval '90 seconds')
  on conflict (user_id) do update
  set last_seen_at = excluded.last_seen_at,
      online_until = excluded.online_until
  where outpost_zero_social_presence.last_seen_at <= clock_now - interval '15 seconds'
  returning outpost_zero_social_presence.online_until into fresh_until;

  -- A throttled ON CONFLICT branch intentionally writes no new tuple. Return
  -- the existing lease so a caller still receives the same narrow RPC shape.
  if fresh_until is null then
    select p.online_until into fresh_until
    from public.outpost_zero_social_presence p
    where p.user_id = actor;
  end if;

  return query select clock_now, fresh_until;
end;
$$;

-- Best-effort sign-out/page-hide cleanup. Correctness never depends on it;
-- the 90-second server expiry remains the authority after abrupt disconnects.
create or replace function public.leave_outpost_zero_social_presence()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  removed boolean := false;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  delete from public.outpost_zero_social_presence p where p.user_id = actor;
  removed := found;
  delete from public.outpost_zero_party_invite_targets t
    where t.viewer_id = actor;
  return removed;
end;
$$;

-- Accepted friends are listed even while offline. Other authenticated players
-- appear only while their server heartbeat is fresh. A blocked pair, the
-- caller, and temporary/generated usernames are always excluded. `target_token`
-- is an opaque action capability scoped to the caller; it is not a user UUID.
create or replace function public.list_outpost_zero_party_invite_targets(
  p_limit integer default 40
)
returns table(
  target_token uuid,
  username text,
  is_friend boolean,
  is_online boolean,
  online_until timestamptz
)
language plpgsql
security definer
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
  ),
  eligible as materialized (
    select sp.user_id as target_id,
           sp.handle as username,
           exists(select 1 from accepted a where a.target_id = sp.user_id) as is_friend,
           coalesce(op.online_until > clock_now, false) as is_online,
           case when op.online_until > clock_now
             then date_trunc('second', op.online_until)
             else null
           end as online_until
    from public.social_profiles sp
    left join public.outpost_zero_social_presence op on op.user_id = sp.user_id
    where sp.user_id <> actor
      and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
      and sp.handle_key not in ('username_not_set', 'usernamenotset')
      and sp.handle_key <> 'op_' || left(replace(sp.user_id::text, '-', ''), 20)
      and sp.handle_key <> 'op_' || left(replace(sp.user_id::text, '-', ''), 8)
      and (
        exists(select 1 from accepted a where a.target_id = sp.user_id)
        or op.online_until > clock_now
      )
      and not exists (
        select 1 from public.friendships blocked
        where blocked.status = 'blocked'
          and ((blocked.requester_id = actor and blocked.addressee_id = sp.user_id)
            or (blocked.requester_id = sp.user_id and blocked.addressee_id = actor))
      )
    order by
      exists(select 1 from accepted a where a.target_id = sp.user_id) desc,
      coalesce(op.online_until > clock_now, false) desc,
      sp.handle_key,
      sp.user_id
    limit row_limit
  ),
  issued as (
    insert into public.outpost_zero_party_invite_targets(
      viewer_id, target_id, issued_at, expires_at
    )
    select actor, e.target_id, clock_now, clock_now + interval '2 minutes'
    from eligible e
    on conflict (viewer_id, target_id) do update
    set issued_at = excluded.issued_at,
        expires_at = excluded.expires_at
    returning outpost_zero_party_invite_targets.target_token,
              outpost_zero_party_invite_targets.target_id
  )
  select i.target_token, e.username, e.is_friend, e.is_online, e.online_until
  from issued i
  join eligible e on e.target_id = i.target_id
  order by e.is_friend desc, e.is_online desc, lower(e.username), i.target_token;
end;
$$;

-- Create one invitation. Actor identity and recipient resolution are entirely
-- server-derived. Normal Party invites permit an accepted friend OR a fresh
-- online target; CPU 2v2 deliberately remains accepted-friend-only.
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
security definer
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
  target_is_friend boolean := false;
  target_is_online boolean := false;
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

  select t.target_id into target_user
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
  select exists (
    select 1 from public.outpost_zero_social_presence op
    where op.user_id = target_user and op.online_until > clock_now
  ) into target_is_online;

  if target_is_blocked then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_TARGET_UNAVAILABLE';
  end if;
  if wanted_kind = 'cpu2v2' and not target_is_friend then
    raise exception using errcode = 'P0001', message = 'PARTY_INVITE_FRIEND_REQUIRED';
  end if;
  if wanted_kind = 'party' and not (target_is_friend or target_is_online) then
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
security definer
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
security definer
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
security definer
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

-- Creating a function grants PUBLIC execute by default, so close every RPC
-- before granting only the signed-in role. Anonymous users cannot announce
-- presence, enumerate online usernames, send, list, claim, or dismiss invites.
revoke all on function public.touch_outpost_zero_social_presence() from public, anon, authenticated;
revoke all on function public.leave_outpost_zero_social_presence() from public, anon, authenticated;
revoke all on function public.list_outpost_zero_party_invite_targets(integer) from public, anon, authenticated;
revoke all on function public.send_outpost_zero_party_invite(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.list_outpost_zero_party_invites(integer) from public, anon, authenticated;
revoke all on function public.claim_outpost_zero_party_invite(uuid) from public, anon, authenticated;
revoke all on function public.dismiss_outpost_zero_party_invite(uuid) from public, anon, authenticated;

grant execute on function public.touch_outpost_zero_social_presence() to authenticated;
grant execute on function public.leave_outpost_zero_social_presence() to authenticated;
grant execute on function public.list_outpost_zero_party_invite_targets(integer) to authenticated;
grant execute on function public.send_outpost_zero_party_invite(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.list_outpost_zero_party_invites(integer) to authenticated;
grant execute on function public.claim_outpost_zero_party_invite(uuid) to authenticated;
grant execute on function public.dismiss_outpost_zero_party_invite(uuid) to authenticated;

commit;
