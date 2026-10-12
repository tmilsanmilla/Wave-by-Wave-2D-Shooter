-- Native/unlinked usernames: one real rename per 720 hours. Linked names are
-- canonical server-owned Pixel identities, never an independent local rename.
begin;
do $$ begin
  if current_setting('neon.branch_id',true) is distinct from 'br-dawn-butterfly-a573hk7g' then
    raise exception 'WRONG_OUTPOST_BRANCH';
  end if;
end $$;
create or replace function oz_identity.enforce_pixel_username()
returns trigger language plpgsql security definer
set search_path=pg_catalog,oz_identity as $$
declare wanted text; owner_id uuid;
begin
  owner_id:=case when tg_op='UPDATE' then old.user_id else new.user_id end;
  select username into wanted from oz_identity.pixel_profiles where account_id=owner_id;
  if wanted is not null and (new.handle<>wanted or new.display_name<>wanted) then
    raise exception 'USERNAME_MANAGED_BY_PIXEL_PULSE' using errcode='42501',hint='Manage your shared username in Pixel Pulse Account.';
  end if;
  return new;
end $$;
revoke all on function oz_identity.enforce_pixel_username() from public,anonymous,authenticated;
create or replace function public.social_profiles_username_clock()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
declare first_choice boolean; available_at timestamptz;
begin
  if tg_op='INSERT' then new.username_changed_at:=null; return new; end if;
  new.username_changed_at:=old.username_changed_at;
  if new.handle is not distinct from old.handle or new.handle_key=old.handle_key then return new; end if;
  if new.handle_key in('username_not_set','usernamenotset') then raise exception 'USERNAME_INVALID' using errcode='22023'; end if;
  if exists(select 1 from oz_identity.pixel_profiles p where p.account_id=old.user_id
    and p.username=new.handle and p.username=new.handle_key) then return new; end if;
  first_choice:=old.username_changed_at is null and old.handle_key in(
    'op_'||left(replace(old.user_id::text,'-',''),20),'op_'||left(replace(old.user_id::text,'-',''),8),
    'username_not_set','usernamenotset');
  if first_choice then return new; end if;
  available_at:=old.username_changed_at+interval '720 hours';
  if available_at>statement_timestamp() then
    raise exception 'USERNAME_CHANGE_COOLDOWN' using errcode='P0001',
      detail=to_char(available_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      hint='Usernames can be changed once every 30 days.';
  end if;
  new.username_changed_at:=statement_timestamp(); return new;
end $$;
revoke all on function public.social_profiles_username_clock() from public,anonymous,authenticated;
-- Keep the existing native Auth directory label aligned with the same game
-- identity. Only a previously established, private native binding is used:
-- never match/adopt an Auth user by email, or touch credentials/roles/email.
create or replace function oz_identity.sync_native_username()
returns trigger language plpgsql security definer
set search_path=pg_catalog,oz_identity as $$
begin
  update neon_auth."user" u set name=new.handle,"updatedAt"=statement_timestamp()
  from oz_identity.account_links l
  where l.provider='neon' and l.account_id=new.user_id and l.subject=u.id::text
    and u.name is distinct from new.handle;
  return new;
end $$;
revoke all on function oz_identity.sync_native_username() from public,anonymous,authenticated;
drop trigger if exists outpost_native_username_label on public.social_profiles;
create trigger outpost_native_username_label after insert or update of handle on public.social_profiles
for each row execute function oz_identity.sync_native_username();
create or replace function public.outpost_zero_set_username(p_username text)
returns table(username text,changed_at timestamptz,next_change_at timestamptz,first_choice boolean)
language plpgsql security definer set search_path=pg_catalog,public,oz_identity as $$
declare actor uuid:=oz_identity.game_user_id(); wanted text:=btrim(coalesce(p_username,''));
  current_username text; current_key text; current_changed_at timestamptz;
  was_generated boolean; available_at timestamptz; canonical text;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select p.username into canonical from oz_identity.pixel_profiles p where p.account_id=actor;
  if canonical is not null and wanted<>canonical then
    raise exception 'USERNAME_MANAGED_BY_PIXEL_PULSE' using errcode='42501',hint='Manage your shared username in Pixel Pulse Account.';
  end if;
  if wanted!~'^[A-Za-z0-9_]{3,32}$' or lower(wanted) in('username_not_set','usernamenotset',
    'op_'||left(replace(actor::text,'-',''),20),'op_'||left(replace(actor::text,'-',''),8)) then
    raise exception 'USERNAME_INVALID' using errcode='22023',hint='Use 3-32 letters, numbers, or underscores and not the temporary account name.';
  end if;
  -- Serialize one identity's first choice and updates, including a missing row.
  perform pg_advisory_xact_lock(hashtextextended('outpost-username:'||actor::text,0));
  select sp.handle,sp.handle_key,sp.username_changed_at into current_username,current_key,current_changed_at
    from public.social_profiles sp where sp.user_id=actor for update;
  if not found then
    current_username:='op_'||left(replace(actor::text,'-',''),20);
    insert into public.social_profiles(user_id,handle,handle_key,display_name)
      values(actor,current_username,current_username,current_username);
    current_key:=current_username;
  end if;
  was_generated:=current_changed_at is null and current_key in('username_not_set','usernamenotset',
    'op_'||left(replace(actor::text,'-',''),20),'op_'||left(replace(actor::text,'-',''),8));
  available_at:=current_changed_at+interval '720 hours';
  if wanted=current_username then
    -- Recover a name already saved by an older client whose subsequent Auth
    -- metadata call failed. Fire the same-ID label sync without spending a
    -- rename or changing the existing clock.
    update public.social_profiles sp set handle=wanted where sp.user_id=actor;
    return query select current_username,current_changed_at,available_at,was_generated; return;
  end if;
  if canonical is null and lower(wanted)<>current_key and not was_generated and available_at>statement_timestamp() then
    raise exception 'USERNAME_CHANGE_COOLDOWN' using errcode='P0001',
      detail=to_char(available_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      hint='Usernames can be changed once every 30 days.';
  end if;
  begin
    update public.social_profiles sp set handle=wanted,handle_key=lower(wanted),display_name=wanted where sp.user_id=actor;
  exception when unique_violation then raise exception 'USERNAME_UNAVAILABLE' using errcode='23505'; end;
  return query select sp.handle,sp.username_changed_at,sp.username_changed_at+interval '720 hours',was_generated
    from public.social_profiles sp where sp.user_id=actor;
end $$;
revoke all on function public.outpost_zero_set_username(text) from public,anonymous;
grant execute on function public.outpost_zero_set_username(text) to authenticated;
-- The authenticated Data API confirms the same saved game identity directly.
-- Neither a browser-supplied user ID nor stale Auth-cookie metadata is proof.
create or replace function public.get_my_outpost_zero_username()
returns table(user_id uuid,username text) language sql stable security definer
set search_path=pg_catalog,oz_identity as $$
  select sp.user_id,sp.handle from public.social_profiles sp
  where sp.user_id=oz_identity.game_user_id()
    and sp.handle~'^[A-Za-z0-9_]{3,32}$'
    and sp.handle_key not in('username_not_set','usernamenotset',
      'op_'||left(replace(sp.user_id::text,'-',''),20),'op_'||left(replace(sp.user_id::text,'-',''),8))
    and (exists(select 1 from oz_identity.pixel_profiles p
      where p.account_id=sp.user_id and p.username=sp.handle)
      or exists(select 1 from oz_identity.account_links l join neon_auth."user" u on u.id::text=l.subject
        where l.provider='neon' and l.account_id=sp.user_id and u.name=sp.handle))
$$;
revoke all on function public.get_my_outpost_zero_username() from public,anonymous;
grant execute on function public.get_my_outpost_zero_username() to authenticated;
commit;
