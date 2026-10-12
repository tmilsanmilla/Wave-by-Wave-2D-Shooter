-- Preserve ordinary rename rules. Only a protected, proved Pixel link may
-- adopt its one canonical username during the local 21-day rename period.
begin;
create or replace function public.social_profiles_username_clock()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare old_is_generated boolean; next_change timestamptz;
begin
  if tg_op = 'INSERT' then
    new.username_changed_at := case when new.handle_key in (
      'op_' || left(replace(new.user_id::text, '-', ''), 20),
      'op_' || left(replace(new.user_id::text, '-', ''), 8),
      'username_not_set','usernamenotset') then null else now() end;
    return new;
  end if;
  new.username_changed_at := old.username_changed_at;
  if new.handle is not distinct from old.handle then return new; end if;
  if new.handle_key in ('username_not_set','usernamenotset') then
    raise exception using errcode='22023',message='USERNAME_INVALID',hint='That name is reserved. Choose a different username.';
  end if;
  -- Browsers cannot write this forced-RLS registry. The existing Pixel guard
  -- also rejects every different name, including through native sign-in.
  if exists(select 1 from oz_identity.pixel_profiles p
    where p.account_id=new.user_id and p.username=new.handle and p.username=new.handle_key) then
    new.username_changed_at := now(); return new;
  end if;
  old_is_generated := old.username_changed_at is null and old.handle_key in (
    'op_' || left(replace(old.user_id::text, '-', ''), 20),
    'op_' || left(replace(old.user_id::text, '-', ''), 8),
    'username_not_set','usernamenotset');
  next_change := old.username_changed_at + interval '21 days';
  if not old_is_generated and old.username_changed_at is not null and next_change > now() then
    raise exception using errcode='P0001',message='USERNAME_CHANGE_COOLDOWN',
      detail=to_char(next_change at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),hint='Usernames can be changed once every 21 days.';
  end if;
  new.username_changed_at := now(); return new;
end $$;
revoke all on function public.social_profiles_username_clock() from public, anonymous, authenticated;
commit;
