-- OUTPOST ZERO / SOCIAL / 02: FRIENDSHIPS
-- Requires 01-profiles.sql. Safe to run again.

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
