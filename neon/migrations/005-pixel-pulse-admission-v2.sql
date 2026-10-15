-- PENDING / NOT APPLIED. Couple this with the v2 server, not the legacy BFF.
-- Application-owned objects only: no alteration of neon_auth or auth schemas.
begin;
do $$ begin
  if current_database()<>'neondb' or current_user<>'neondb_owner'
    or current_setting('neon.project_id',true) is distinct from 'plain-bar-15608612'
    or current_setting('neon.branch_id',true) is distinct from 'br-dawn-butterfly-a573hk7g'
    or to_regprocedure('auth.session()') is null then
    raise exception 'PIXEL_V2_WRONG_DATABASE_OR_VALIDATED_CLAIMS_HELPER';
  end if;
end $$;
create table if not exists oz_identity.pixel_link_attempts (
  state_hash text primary key check(state_hash ~ '^[0-9a-f]{64}$'),
  browser_hash text not null check(browser_hash ~ '^[0-9a-f]{64}$'),
  context jsonb not null check(jsonb_typeof(context)='object'),
  expires_at timestamptz not null
);
create table if not exists oz_identity.pixel_link_redemptions (
  jti uuid primary key, subject text not null,
  account_id uuid not null references oz_identity.accounts(id),
  expires_at timestamptz not null, consumed_at timestamptz not null default clock_timestamp()
);
-- Independent of the display profile: revocation must survive a name conflict,
-- an unverified email or a failed profile projection. Never downgrade an epoch.
create table if not exists oz_identity.pixel_runtime_authorities (
  subject text primary key references oz_identity.pixel_profiles(subject),
  account_id uuid not null unique references oz_identity.accounts(id),
  credential_version bigint not null check(credential_version between 0 and 9007199254740991),
  profile_version bigint not null check(profile_version between 0 and 9007199254740991),
  checked_until timestamptz not null,
  disabled boolean not null default true
);
alter table oz_identity.pixel_sessions add column if not exists credential_version bigint;
alter table oz_identity.pixel_sessions add column if not exists access_cipher text;
alter table oz_identity.pixel_sessions add column if not exists upstream_until timestamptz;
alter table oz_identity.pixel_link_attempts enable row level security;
alter table oz_identity.pixel_link_attempts force row level security;
alter table oz_identity.pixel_link_redemptions enable row level security;
alter table oz_identity.pixel_link_redemptions force row level security;
alter table oz_identity.pixel_runtime_authorities enable row level security;
alter table oz_identity.pixel_runtime_authorities force row level security;
revoke all on oz_identity.pixel_link_attempts,oz_identity.pixel_link_redemptions,
  oz_identity.pixel_runtime_authorities from public,anonymous,authenticated;

create or replace function oz_identity.game_user_id()
returns uuid language plpgsql stable security definer
set search_path=pg_catalog,oz_identity as $$
declare v_subject text:=oz_identity.request_subject(); claims jsonb; result uuid;
begin
  if v_subject is null then return null; end if;
  if v_subject not like 'pixelpulse:%' then
    -- A valid native JWT, including credential epoch zero, is NOT admission to
    -- an account whose authority has moved to Pixel Pulse. Native credentials
    -- and historical account links are retained, not deleted or overwritten.
    select l.account_id into result from oz_identity.account_links l
      join oz_identity.accounts a on a.id=l.account_id
      where l.provider='neon' and l.subject=v_subject and a.deleted_at is null
      and not exists(select 1 from oz_identity.pixel_profiles p where p.account_id=l.account_id);
    return result;
  end if;
  -- auth.session() is Neon's validated Data API context. Never trust a caller
  -- parameter, raw request GUC, cookie name, client boolean or management token.
  execute 'select auth.session()' into claims;
  if claims->>'iss' is distinct from 'https://wave-by-wave-2-d-shooter.vercel.app/api/pixel-pulse'
    or claims->>'sub' is distinct from v_subject or claims->>'role' is distinct from 'authenticated'
    or claims->'aud' is distinct from '["https://ep-fragrant-salad-a577vui2.neonauth.us-east-2.aws.neon.tech","outpost-zero-pixel-pulse"]'::jsonb
    or jsonb_typeof(claims->'credential_version') is distinct from 'number'
    or coalesce(claims->>'outpost_session','') !~ '^[0-9a-f]{64}$' then return null; end if;
  select p.account_id into result from oz_identity.pixel_profiles p
    join oz_identity.account_links l on l.provider='pixelpulse' and l.subject=p.subject and l.account_id=p.account_id
    join oz_identity.accounts a on a.id=p.account_id and a.deleted_at is null
    join oz_identity.pixel_runtime_authorities r on r.subject=p.subject and r.account_id=p.account_id
    join oz_identity.pixel_sessions s on s.subject=p.subject and s.token_hash=claims->>'outpost_session'
    where p.subject=substring(v_subject from 12) and not r.disabled
      and r.checked_until>statement_timestamp() and s.expires_at>statement_timestamp()
      and s.upstream_until>statement_timestamp()
      and s.credential_version=r.credential_version
      and claims->>'credential_version'=r.credential_version::text;
  return result;
end $$;
revoke all on function oz_identity.game_user_id() from public,anonymous;
grant execute on function oz_identity.game_user_id() to authenticated;

-- The legacy bootstrap's independent native mapping must not bypass the gate.
-- Its account-links write also rechecks, serializing with first-link adoption.
create or replace function oz_identity.guard_pixel_native_mapping()
returns trigger language plpgsql security definer
set search_path=pg_catalog,oz_identity as $$
begin
  if new.provider='neon' then
    perform pg_advisory_xact_lock(hashtextextended('outpost-pixel:account:'||new.account_id::text,0));
    if exists(select 1 from oz_identity.pixel_profiles p where p.account_id=new.account_id) then
      raise exception 'SIGN_IN_WITH_PIXEL_PULSE' using errcode='28000';
    end if;
  end if;
  return new;
end $$;
revoke all on function oz_identity.guard_pixel_native_mapping() from public,anonymous,authenticated;
drop trigger if exists pixel_native_mapping_guard on oz_identity.account_links;
create trigger pixel_native_mapping_guard before insert or update on oz_identity.account_links
  for each row execute function oz_identity.guard_pixel_native_mapping();
commit;
