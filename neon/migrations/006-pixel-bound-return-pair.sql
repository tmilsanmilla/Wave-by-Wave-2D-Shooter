-- PENDING / NOT APPLIED. Requires reviewed 005 + compatible dormant server.
-- Expand-only application-owned attempt/session pairing, no account-row edits.
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
select pg_advisory_xact_lock(20261024,608);
do $$ begin
  if current_database()<>'neondb' or current_user<>'neondb_owner'
    or current_setting('neon.project_id',true) is distinct from 'plain-bar-15608612'
    or current_setting('neon.branch_id',true) is distinct from 'br-dawn-butterfly-a573hk7g'
    or to_regclass('oz_identity.pixel_link_attempts') is null
    or to_regclass('oz_identity.pixel_runtime_authorities') is null
    or coalesce(position('outpost_session' in pg_get_functiondef(to_regprocedure('oz_identity.game_user_id()'))),0)=0
    or exists(select 1 from pg_class where oid in
      (to_regclass('oz_identity.pixel_link_attempts'),to_regclass('oz_identity.pixel_sessions'),
       to_regclass('oz_identity.pixel_runtime_authorities')) and (not relrowsecurity or not relforcerowsecurity))
  then raise exception 'OUTPOST_BOUND_RETURN_WRONG_TARGET_OR_005'; end if;
end $$;
alter table oz_identity.pixel_link_attempts add column if not exists claimed_by uuid;
alter table oz_identity.pixel_link_attempts add column if not exists claimed_at timestamptz;
alter table oz_identity.pixel_link_attempts add column if not exists completed_at timestamptz;
alter table oz_identity.pixel_link_attempts add column if not exists cancelled_at timestamptz;
alter table oz_identity.pixel_sessions add column if not exists login_attempt_state_hash text
  references oz_identity.pixel_link_attempts(state_hash);
create index if not exists pixel_owned_attempt_browser on oz_identity.pixel_link_attempts(browser_hash);
-- Receiver-owned one-use correlation. A provisional mint session intentionally
-- has no session FK yet; its retained owned attempt is mandatory instead.
create table if not exists oz_identity.pixel_status_requests (
  request_jti uuid primary key, nonce text not null unique check(nonce ~ '^[A-Za-z0-9_-]{43}$'),
  subject text not null references oz_identity.pixel_profiles(subject),
  account_id uuid not null references oz_identity.accounts(id),
  token_hash text not null check(token_hash ~ '^[0-9a-f]{64}$'),
  expected_epoch bigint not null check(expected_epoch between 0 and 9007199254740991),
  attempt_state_hash text not null references oz_identity.pixel_link_attempts(state_hash),
  mode text not null check(mode in ('mint','refresh')), claim uuid,
  request_expires timestamptz not null, upstream_until timestamptz not null,
  response_jti uuid unique, proof_expires timestamptz, consumed_at timestamptz,
  check(request_expires<=upstream_until),
  check((mode='mint' and claim is not null) or (mode='refresh' and claim is null)),
  check((consumed_at is null and response_jti is null and proof_expires is null) or
    (consumed_at is not null and response_jti is not null and proof_expires is not null and proof_expires<=request_expires))
);
alter table oz_identity.pixel_status_requests enable row level security;
alter table oz_identity.pixel_status_requests force row level security;
revoke all on oz_identity.pixel_status_requests from public,anonymous,authenticated;
do $$ begin
  if exists(select 1 from (values('claimed_by','uuid'),('claimed_at','timestamptz'),
    ('completed_at','timestamptz'),('cancelled_at','timestamptz')) v(name,type)
    where not exists(select 1 from pg_attribute where attrelid='oz_identity.pixel_link_attempts'::regclass
      and attname=v.name and atttypid=v.type::regtype and not attisdropped))
    or not exists(select 1 from pg_attribute where attrelid='oz_identity.pixel_sessions'::regclass
      and attname='login_attempt_state_hash' and atttypid='text'::regtype and not attisdropped)
    or not exists(select 1 from pg_constraint c where c.contype='f'
      and c.conrelid='oz_identity.pixel_sessions'::regclass and c.confrelid='oz_identity.pixel_link_attempts'::regclass
      and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname='login_attempt_state_hash' and not attisdropped)]::smallint[]
      and c.confkey=array[(select attnum from pg_attribute where attrelid=c.confrelid and attname='state_hash' and not attisdropped)]::smallint[])
    or exists(select 1 from (values('request_jti','p'),('nonce','u'),('response_jti','u')) v(name,kind)
      where not exists(select 1 from pg_constraint c where c.conrelid='oz_identity.pixel_status_requests'::regclass
        and c.contype::text=v.kind and c.conkey=array[(select attnum from pg_attribute
          where attrelid=c.conrelid and attname=v.name and not attisdropped)]::smallint[]))
  then raise exception 'OUTPOST_BOUND_RETURN_PAIR_CONTRACT'; end if;
end $$;
-- Existing rows remain unchanged/null. Retained attempts are the cancellation
-- authority; never delete a row while a paired session still references it.
commit;
