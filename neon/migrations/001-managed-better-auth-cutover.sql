-- Outpost Zero: Neon Managed Better Auth account cutover.
--
-- Existing game records keep their imported Supabase UUIDs. A verified Neon
-- login is linked to that stable game UUID by normalized email on first use.
-- New Neon users receive a new game UUID. The browser never supplies an email
-- or account UUID to this function, which prevents account-link spoofing.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists oz_identity.migration_config (
  singleton boolean primary key default true check (singleton),
  proof_secret text not null check (length(proof_secret) >= 43)
);

create table if not exists oz_identity.used_migration_proofs (
  proof_hash bytea primary key,
  account_id uuid not null references oz_identity.accounts(id) on delete cascade,
  used_at timestamptz not null default pg_catalog.clock_timestamp()
);

revoke all on oz_identity.migration_config from public, anonymous, authenticated;
revoke all on oz_identity.used_migration_proofs from public, anonymous, authenticated;

create or replace function oz_identity.consume_migration_proof(
  p_proof text,
  p_account_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, oz_identity
as $function$
declare
  v_parts text[];
  v_payload text;
  v_claim_account_id uuid;
  v_expires_at bigint;
  v_now bigint := pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()))::bigint;
  v_secret text;
  v_expected text;
begin
  if p_proof is null or length(p_proof) > 512 then return false; end if;
  v_parts := pg_catalog.string_to_array(p_proof, '.');
  if pg_catalog.array_length(v_parts, 1) <> 5
     or v_parts[1] <> 'v1'
     or v_parts[4] !~ '^[0-9a-f]{32}$'
     or v_parts[5] !~ '^[A-Za-z0-9_-]{43}$' then
    return false;
  end if;

  begin
    v_claim_account_id := v_parts[2]::uuid;
    v_expires_at := v_parts[3]::bigint;
  exception when others then
    return false;
  end;
  if v_claim_account_id <> p_account_id
     or v_expires_at < v_now
     or v_expires_at > v_now + 600 then
    return false;
  end if;

  select c.proof_secret into v_secret
  from oz_identity.migration_config c
  where c.singleton;
  if v_secret is null then return false; end if;

  v_payload := pg_catalog.concat_ws('.', v_parts[1], v_parts[2], v_parts[3], v_parts[4]);
  v_expected := pg_catalog.rtrim(
    pg_catalog.translate(
      pg_catalog.encode(
        extensions.hmac(
          pg_catalog.convert_to(v_payload, 'UTF8'),
          pg_catalog.convert_to(v_secret, 'UTF8'),
          'sha256'
        ),
        'base64'
      ),
      '+/', '-_'
    ),
    '='
  );
  if v_expected <> v_parts[5] then return false; end if;

  begin
    insert into oz_identity.used_migration_proofs(proof_hash, account_id)
    values (extensions.digest(pg_catalog.convert_to(p_proof, 'UTF8'), 'sha256'), p_account_id);
  exception when unique_violation then
    return false;
  end;
  return true;
end
$function$;

create or replace function oz_identity.bootstrap_current_account_with_proof(
  p_migration_proof text
)
returns table(user_id uuid, created_account boolean, linked_existing boolean)
language plpgsql
security definer
set search_path = pg_catalog, oz_identity, neon_auth
as $function$
declare
  v_subject text := oz_identity.request_subject();
  v_subject_uuid uuid;
  v_email text;
  v_email_verified boolean;
  v_auth_created_at timestamptz;
  v_link oz_identity.account_links%rowtype;
  v_account oz_identity.accounts%rowtype;
  v_account_id uuid;
begin
  if v_subject is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  begin
    v_subject_uuid := v_subject::uuid;
  exception when invalid_text_representation then
    raise exception 'NEON_SUBJECT_MUST_BE_UUID' using errcode = '28000';
  end;
  if v_subject_uuid::text <> v_subject then
    raise exception 'NEON_SUBJECT_MUST_BE_CANONICAL_UUID' using errcode = '28000';
  end if;

  select lower(btrim(u.email)), u."emailVerified", u."createdAt"
    into v_email, v_email_verified, v_auth_created_at
  from neon_auth."user" u
  where u.id = v_subject_uuid;

  if not found or v_email is null or v_email = '' then
    raise exception 'NEON_AUTH_USER_EMAIL_NOT_FOUND' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('outpost-zero:neon-sub:' || v_subject, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('outpost-zero:email:' || v_email, 0)
  );

  select l.* into v_link
  from oz_identity.account_links l
  where l.provider = 'neon' and l.subject = v_subject
  for update;

  if found then
    if not exists (
      select 1 from oz_identity.accounts a
      where a.id = v_link.account_id and a.deleted_at is null
    ) then
      raise exception 'LINKED_ACCOUNT_NOT_AVAILABLE' using errcode = '28000';
    end if;
    update oz_identity.account_links l
       set last_seen_at = pg_catalog.clock_timestamp()
     where l.provider = 'neon' and l.subject = v_subject;
    return query select v_link.account_id, false, v_link.linked_existing;
    return;
  end if;

  select a.* into v_account
  from oz_identity.accounts a
  where lower(btrim(a.email)) = v_email
    and a.deleted_at is null
  for update;

  if found then
    if not v_email_verified
       and not oz_identity.consume_migration_proof(p_migration_proof, v_account.id) then
      raise exception 'VERIFIED_MIGRATION_PROOF_REQUIRED' using errcode = '28000';
    end if;
    if exists (
      select 1 from oz_identity.account_links l
      where l.provider = 'neon' and l.account_id = v_account.id
    ) then
      raise exception 'EMAIL_ACCOUNT_ALREADY_LINKED_TO_ANOTHER_NEON_USER'
        using errcode = '23505';
    end if;

    insert into oz_identity.account_links(
      provider, subject, account_id, linked_existing
    ) values (
      'neon', v_subject, v_account.id, true
    );

    return query select v_account.id, false, true;
    return;
  end if;

  v_account_id := v_subject_uuid;
  if exists (select 1 from oz_identity.accounts a where a.id = v_account_id) then
    v_account_id := pg_catalog.gen_random_uuid();
  end if;

  insert into oz_identity.accounts(
    id, email, created_at, email_confirmed_at, banned_until, deleted_at
  ) values (
    v_account_id,
    v_email,
    coalesce(v_auth_created_at, pg_catalog.clock_timestamp()),
    case when v_email_verified then pg_catalog.clock_timestamp() else null end,
    null,
    null
  );

  insert into oz_identity.account_links(
    provider, subject, account_id, linked_existing
  ) values (
    'neon', v_subject, v_account_id, false
  );

  return query select v_account_id, true, false;
end
$function$;

create or replace function oz_identity.bootstrap_current_account()
returns table(user_id uuid, created_account boolean, linked_existing boolean)
language sql
security definer
set search_path = pg_catalog, oz_identity
as $function$
  select * from oz_identity.bootstrap_current_account_with_proof(null)
$function$;

create or replace function oz_identity.game_user_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, oz_identity
as $function$
  select l.account_id
  from oz_identity.account_links l
  where l.provider = 'neon'
    and l.subject = oz_identity.request_subject()
$function$;

revoke all on function oz_identity.consume_migration_proof(text, uuid) from public, authenticated;
revoke all on function oz_identity.bootstrap_current_account_with_proof(text) from public, authenticated;
revoke all on function oz_identity.bootstrap_current_account() from public, authenticated;
grant execute on function oz_identity.consume_migration_proof(text, uuid) to neondb_owner;
grant execute on function oz_identity.bootstrap_current_account_with_proof(text) to neondb_owner;
grant execute on function oz_identity.bootstrap_current_account() to neondb_owner;

revoke all on function oz_identity.game_user_id() from public;
grant execute on function oz_identity.game_user_id() to authenticated;

revoke all on function public.bootstrap_outpost_zero_account() from public;
grant execute on function public.bootstrap_outpost_zero_account() to authenticated;

create or replace function public.bootstrap_outpost_zero_account_with_proof(
  p_migration_proof text
)
returns table(user_id uuid, created_account boolean, linked_existing boolean)
language sql
security definer
set search_path = pg_catalog, oz_identity
as $function$
  select * from oz_identity.bootstrap_current_account_with_proof(p_migration_proof)
$function$;

revoke all on function public.bootstrap_outpost_zero_account_with_proof(text) from public;
grant execute on function public.bootstrap_outpost_zero_account_with_proof(text) to authenticated;

commit;
