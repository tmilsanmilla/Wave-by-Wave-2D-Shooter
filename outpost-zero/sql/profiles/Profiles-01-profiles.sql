-- OUTPOST ZERO / PROFILES 01: PRIVATE GAME-SAVE STORAGE + SECURITY
-- This is the private progress blob, not the public Social username profile.
-- Safe to rerun. Profiles deliberately does not use Postgres Realtime.

begin;

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

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Profiles is Outpost Zero-owned, so replace every legacy policy with one
-- exact own-row perimeter instead of leaving permissive policies additive.
do $policies$
declare p record;
begin
  for p in select policyname from pg_catalog.pg_policies where schemaname='public' and tablename='profiles'
  loop execute format('drop policy %I on public.profiles',p.policyname); end loop;
end;
$policies$;

create policy outpost_zero_profiles_own_read
on public.profiles for select to authenticated
using ((select auth.uid())=user_id);
create policy outpost_zero_profiles_own_insert
on public.profiles for insert to authenticated
with check ((select auth.uid())=user_id);
create policy outpost_zero_profiles_own_update
on public.profiles for update to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

revoke all on table public.profiles from public, anon, authenticated;
-- Table revokes do not remove old column ACLs. Clear them before granting the
-- exact three-column browser interface used by persistence.js.
do $column_acl$
declare p record;
begin
  for p in
    select distinct grantee,privilege_type,column_name
    from information_schema.column_privileges
    where table_schema='public' and table_name='profiles'
      and grantee in ('PUBLIC','anon','authenticated')
  loop
    execute format(
      'revoke %s (%I) on table public.profiles from %s',
      p.privilege_type,
      p.column_name,
      case when p.grantee='PUBLIC' then 'PUBLIC' else quote_ident(p.grantee) end
    );
  end loop;
end;
$column_acl$;
grant select(user_id,data,updated_at),insert(user_id,data,updated_at),update(user_id,data,updated_at)
on public.profiles to authenticated;

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

notify pgrst,'reload schema';
commit;
