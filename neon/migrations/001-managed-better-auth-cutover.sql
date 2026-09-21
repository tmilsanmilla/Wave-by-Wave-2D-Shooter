-- Outpost Zero: Neon Managed Better Auth account cutover.
--
-- Existing game records keep their imported Supabase UUIDs. A verified Neon
-- login is linked to that stable game UUID by normalized email on first use.
-- New Neon users receive a new game UUID. The browser never supplies an email
-- or account UUID to this function, which prevents account-link spoofing.

begin;

create or replace function oz_identity.bootstrap_current_account()
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

revoke all on function oz_identity.bootstrap_current_account() from public, authenticated;
grant execute on function oz_identity.bootstrap_current_account() to neondb_owner;

revoke all on function oz_identity.game_user_id() from public;
grant execute on function oz_identity.game_user_id() to authenticated;

revoke all on function public.bootstrap_outpost_zero_account() from public;
grant execute on function public.bootstrap_outpost_zero_account() to authenticated;

commit;
