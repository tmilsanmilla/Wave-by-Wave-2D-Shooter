-- OUTPOST ZERO / SOCIAL / 01: CORE DATA
-- Profiles, friendships, and private messages belong to one Social data layer.
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
set search_path = public
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
security definer
set search_path = public
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
set search_path = public
as $$
declare actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.requester_id is distinct from actor or new.status <> 'pending' or new.blocked_by is not null then
      raise exception 'friend requests must start pending and be created by the requester';
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
set search_path = public
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
