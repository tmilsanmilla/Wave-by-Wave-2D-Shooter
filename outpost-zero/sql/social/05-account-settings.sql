-- OUTPOST ZERO / SOCIAL / 05: ACCOUNT SETTINGS
-- Requires Social 01 through 04. Run after Leaderboards 01 if that is the
-- latest SQL you installed. Adds the server-enforced username-change clock.
-- Safe to run again. Password changes use Supabase Auth and need no SQL.

begin;

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
security definer
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
security definer
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
-- Refresh the signup availability RPC here so an existing Social-04 install
-- receives the rule by running only this one upgrade file.
create or replace function public.outpost_zero_username_available(p_username text)
returns boolean
language sql stable security definer
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

-- Remove the legacy direct username-write route. SECURITY DEFINER lets the
-- authenticated RPC perform the update while RLS and grants keep browser
-- table writes closed. Profile reads remain available for Social name lookup.
drop policy if exists social_profiles_own_update on public.social_profiles;
revoke update on table public.social_profiles from anon, authenticated;
revoke update (handle, handle_key, display_name, username_changed_at)
  on public.social_profiles from anon, authenticated;

revoke all on function public.social_profiles_username_clock() from public, anon, authenticated;
revoke all on function public.outpost_zero_set_username(text) from public, anon, authenticated;
revoke all on function public.outpost_zero_username_available(text) from public, anon, authenticated;
grant execute on function public.outpost_zero_set_username(text) to authenticated;
grant execute on function public.outpost_zero_username_available(text) to anon, authenticated;

commit;
