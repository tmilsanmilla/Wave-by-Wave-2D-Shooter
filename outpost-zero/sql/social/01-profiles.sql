-- OUTPOST ZERO / SOCIAL / 01: PLAYER PROFILES
-- Run before every other script in this directory. Safe to run again.

create table if not exists public.social_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
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
  new.display_name := left(coalesce(nullif(btrim(new.display_name), ''), new.handle), 48);
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

create or replace function public.social_create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_handle text;
  shown_name text;
begin
  shown_name := left(coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    'operator'
  ), 48);
  -- The UUID suffix keeps handles unique without exposing email addresses.
  generated_handle := 'op_' || left(replace(new.id::text, '-', ''), 20);
  insert into public.social_profiles(user_id, handle, handle_key, display_name)
  values(new.id, generated_handle, lower(generated_handle), shown_name)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists social_profile_after_user_insert on auth.users;
create trigger social_profile_after_user_insert
after insert on auth.users
for each row execute function public.social_create_profile_for_user();

insert into public.social_profiles(user_id, handle, handle_key, display_name)
select u.id,
       'op_' || left(replace(u.id::text, '-', ''), 20),
       'op_' || left(replace(u.id::text, '-', ''), 20),
       left(coalesce(
         nullif(u.raw_user_meta_data ->> 'full_name', ''),
         nullif(u.raw_user_meta_data ->> 'name', ''),
         'operator'
       ), 48)
from auth.users u
on conflict (user_id) do nothing;
