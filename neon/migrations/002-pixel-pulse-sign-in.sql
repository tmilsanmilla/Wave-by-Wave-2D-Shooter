-- Additive: existing accounts, progress, ranks, bans and roles stay intact.
begin;
create table if not exists oz_identity.pixel_profiles (
  subject text primary key check (subject ~ '^[0-9a-f-]{36}$'),
  account_id uuid not null unique references oz_identity.accounts(id),
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  email text not null,
  updated_at timestamptz not null default now()
);
create table if not exists oz_identity.pixel_login_attempts (
  state_hash text primary key, browser_hash text not null,
  verifier text not null, nonce text not null,
  link_account_id uuid references oz_identity.accounts(id),
  expires_at timestamptz not null
);
create table if not exists oz_identity.pixel_sessions (
  token_hash text primary key,
  subject text not null references oz_identity.pixel_profiles(subject),
  expires_at timestamptz not null
);
alter table oz_identity.pixel_profiles enable row level security;
alter table oz_identity.pixel_profiles force row level security;
alter table oz_identity.pixel_login_attempts enable row level security;
alter table oz_identity.pixel_login_attempts force row level security;
alter table oz_identity.pixel_sessions enable row level security;
alter table oz_identity.pixel_sessions force row level security;
revoke all on oz_identity.pixel_profiles, oz_identity.pixel_login_attempts, oz_identity.pixel_sessions from public, anonymous, authenticated;

create or replace function oz_identity.game_user_id()
returns uuid language sql stable security definer
set search_path = pg_catalog, oz_identity as $$
  select l.account_id from oz_identity.account_links l
  where l.provider = case when oz_identity.request_subject() like 'pixelpulse:%' then 'pixelpulse' else 'neon' end
    and l.subject = case when oz_identity.request_subject() like 'pixelpulse:%'
      then substring(oz_identity.request_subject() from 12) else oz_identity.request_subject() end
$$;

-- A linked name is authoritative. Even native-login clients cannot rename it
-- independently. Do not expose any way for browsers to write this registry.
create or replace function oz_identity.enforce_pixel_username()
returns trigger language plpgsql security definer
set search_path = pg_catalog, oz_identity as $$
declare wanted text;
begin
  select p.username into wanted from oz_identity.pixel_profiles p where p.account_id=new.user_id;
  if wanted is not null and new.handle <> wanted then
    raise exception 'USERNAME_MANAGED_BY_PIXEL_PULSE' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function oz_identity.enforce_pixel_username() from public, anonymous, authenticated;
drop trigger if exists pixel_username_guard on public.social_profiles;
create trigger pixel_username_guard before insert or update on public.social_profiles
for each row execute function oz_identity.enforce_pixel_username();
create or replace function public.get_my_outpost_zero_pixel_identity()
returns table(username text) language sql stable security definer
set search_path = pg_catalog, oz_identity as $$
  select p.username from oz_identity.pixel_profiles p where p.account_id=oz_identity.game_user_id()
$$;
revoke all on function public.get_my_outpost_zero_pixel_identity() from public, anonymous;
grant execute on function public.get_my_outpost_zero_pixel_identity() to authenticated;
commit;
