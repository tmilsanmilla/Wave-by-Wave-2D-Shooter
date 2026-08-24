-- OUTPOST ZERO / SOCIAL / 03: PRIVATE MESSAGES
-- Requires 02-friendships.sql. Safe to run again.

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
