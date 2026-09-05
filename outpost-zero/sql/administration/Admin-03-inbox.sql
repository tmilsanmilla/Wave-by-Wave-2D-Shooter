-- OUTPOST ZERO / ADMIN 03: INBOX
-- Player/global notifications plus the staff Inbox, Archive, Reports, and
-- human-readable audit LOG access. Run after Admin 01, Admin 02, and Player 03.
-- Safe to rerun; notification, message, report, and audit history is preserved.

begin;

-- Fail closed: policy setup lives in Admin 04 Security. Install it first.
do $section_security_required$
begin
  if to_regprocedure('public._outpost_zero_apply_admin_security(text)') is null then
    raise exception 'Run Admin 04 Security first; this transaction made no changes';
  end if;
end;
$section_security_required$;

create table if not exists public.admin_msgs(
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  from_email text not null,
  to_email text not null,
  message text not null check(char_length(message) between 1 and 500),
  read boolean not null default false,
  archived boolean not null default false,
  read_at timestamptz
);
alter table public.admin_msgs add column if not exists archived boolean not null default false;
alter table public.admin_msgs add column if not exists read_at timestamptz;
alter table public.admin_msgs add column if not exists from_user_id uuid references auth.users(id) on delete set null;
alter table public.admin_msgs add column if not exists to_user_id uuid references auth.users(id) on delete set null;
alter table public.admin_msgs add column if not exists operation_id uuid;
alter table public.admin_msgs add column if not exists request_fingerprint text;

-- Preserve the old Inbox while keeping raw private columns behind RPCs. Rows
-- whose deleted account cannot be resolved stay private and are omitted from
-- the viewer-aware identity feed.
update public.admin_msgs m set from_user_id=u.id
from auth.users u
where m.from_user_id is null and lower(btrim(u.email))=lower(btrim(m.from_email));
update public.admin_msgs m set to_user_id=u.id
from auth.users u
where m.to_user_id is null and lower(btrim(u.email))=lower(btrim(m.to_email));
create unique index if not exists outpost_zero_admin_msgs_sender_operation_uidx
  on public.admin_msgs(from_user_id,operation_id)
  where from_user_id is not null and operation_id is not null;
create index if not exists outpost_zero_admin_msgs_participants_idx
  on public.admin_msgs(to_user_id,from_user_id,id desc);

-- Privacy-safe Realtime signal. One row per staff account contains only that
-- account's own UUID, an opaque revision, and a timestamp. The trigger never
-- copies a private email or message body into the publication.
create table if not exists public.outpost_zero_admin_msg_wakeups(
  recipient_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check(revision>0),
  updated_at timestamptz not null default clock_timestamp()
);

create or replace function public._outpost_zero_wake_admin_message_participants()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $function$
begin
  insert into public.outpost_zero_admin_msg_wakeups as wake(recipient_id,revision,updated_at)
  select participant,1,clock_timestamp()
  from (select distinct participant from (values(new.from_user_id),(new.to_user_id)) p(participant)
        where participant is not null) safe
  on conflict(recipient_id) do update set
    revision=wake.revision+1,
    updated_at=excluded.updated_at;
  return new;
end;
$function$;
drop trigger if exists outpost_zero_admin_msg_wakeup_trigger on public.admin_msgs;
create trigger outpost_zero_admin_msg_wakeup_trigger
after insert on public.admin_msgs for each row
execute function public._outpost_zero_wake_admin_message_participants();

create table if not exists public.reports(
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  game text not null,
  name text,
  message text not null,
  meta jsonb,
  resolved boolean not null default false,
  reporter_user_id uuid references auth.users(id) on delete set null
);
alter table public.reports add column if not exists resolved boolean not null default false;
alter table public.reports add column if not exists reporter_user_id uuid references auth.users(id) on delete set null;
-- Some shared installs may still have a legacy reporter_role column. Leave
-- shared schema intact, but Outpost Zero never writes or returns that marker.
-- Separate active/archive reads use this stable keyset index. New reports can
-- no longer crowd resolved history out of the Archive query.
create index if not exists outpost_zero_reports_resolved_id_idx
  on public.reports(resolved,id desc);
create index if not exists outpost_zero_reports_game_resolved_id_idx
  on public.reports(game,resolved,id desc);
create index if not exists outpost_zero_reports_actor_rate_idx
  on public.reports(reporter_user_id,created_at desc)
  where reporter_user_id is not null;

-- Fail before creating a partial API. Administration 01 supplies the private
-- audit boundary used for bans/gifts; Administration 02 supplies safe banners
-- and server-derived admin roles; Player 03 supplies usernames/friendships.
do $block$
begin
  if to_regclass('public.social_profiles') is null
     or to_regclass('public.friendships') is null then
    raise exception 'Administration 03 requires Player 03 Social Menu';
  end if;
  if to_regclass('public.outpost_zero_admin_audit') is null
     or to_regprocedure('public._outpost_zero_admin_role()') is null
     or to_regprocedure('public._outpost_zero_creator_user_id()') is null
     or to_regprocedure('public._outpost_zero_admin_identity_label(uuid)') is null then
    raise exception 'Administration 03 requires Administration 01';
  end if;
  if to_regclass('public.banners') is null
     or to_regprocedure('public._outpost_zero_update_role()') is null then
    raise exception 'Administration 03 requires Administration 02';
  end if;
end;
$block$;

-- One row is one immutable Inbox event. A null recipient means one global
-- event, not one copied row per account. Internal actor/source columns support
-- authorization, exact retries, and abuse limits but are never returned.
create table if not exists public.outpost_zero_notifications (
  notification_id bigint generated always as identity primary key,
  recipient_id uuid references auth.users(id) on delete cascade,
  kind text not null,
  author_label text not null,
  title text not null,
  message text not null,
  resource_key text,
  effective_until timestamptz,
  recipient_username_at_send text,
  -- Retained internal receipt/rate key, never returned. Deliberately no Auth
  -- foreign key: deleting a former admin must not erase attribution, weaken an
  -- operation receipt, or violate the manual-message shape constraint.
  actor_user_id uuid,
  operation_id uuid,
  request_fingerprint text,
  source_type text not null,
  source_key text not null,
  created_at timestamptz not null default clock_timestamp(),
  removed_at timestamptz,
  constraint outpost_zero_notifications_kind check (kind in (
    'admin_message', 'official_update', 'ban_applied', 'ban_lifted',
    'weapon_temporary_granted', 'weapon_temporary_extended',
    'weapon_temporary_revoked', 'weapon_permanent_granted',
    'weapon_permanent_revoked', 'currency_updated', 'upgrades_updated',
    'score_updated', 'friend_request', 'friend_accepted'
  )),
  constraint outpost_zero_notifications_author check (
    author_label in ('CREATOR', 'MAIN ADMIN', 'CO-ADMIN', 'ADMIN UPDATE',
                     'ADMIN ACTION', 'SYSTEM')
    or author_label ~ '^@[A-Za-z0-9_]{3,32}$'
  ),
  constraint outpost_zero_notifications_title_length
    check (char_length(title) between 1 and 80),
  constraint outpost_zero_notifications_message_length
    check (char_length(message) between 1 and 600),
  constraint outpost_zero_notifications_resource_length
    check (resource_key is null or char_length(resource_key) between 3 and 240),
  constraint outpost_zero_notifications_recipient_username check (
    recipient_username_at_send is null
    or recipient_username_at_send ~ '^[A-Za-z0-9_]{3,32}$'
  ),
  constraint outpost_zero_notifications_fingerprint check (
    request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{32}$'
  ),
  constraint outpost_zero_notifications_source_type check (
    source_type in ('admin_audit', 'banner', 'manual', 'friendship')
  ),
  constraint outpost_zero_notifications_source_key_length
    check (char_length(source_key) between 1 and 200),
  constraint outpost_zero_notifications_removed_clock
    check (removed_at is null or removed_at >= created_at),
  constraint outpost_zero_notifications_global_shape check (
    (kind = 'official_update' and recipient_id is null)
    or (kind <> 'official_update' and recipient_id is not null)
  ),
  constraint outpost_zero_notifications_manual_shape check (
    (kind = 'admin_message'
      and actor_user_id is not null
      and operation_id is not null
      and request_fingerprint is not null
      and recipient_username_at_send is not null)
    or (kind <> 'admin_message'
      and operation_id is null
      and request_fingerprint is null)
  ),
  constraint outpost_zero_notifications_source_unique unique (source_type, source_key)
);

-- Official updates use Admin 02's 120-character heading and 4,000-character
-- details limits. Expanding these checks preserves every existing row and
-- prevents a valid update from rolling back when its Inbox event is created.
alter table public.outpost_zero_notifications
  drop constraint if exists outpost_zero_notifications_title_length;
alter table public.outpost_zero_notifications
  drop constraint if exists outpost_zero_notifications_message_length;
alter table public.outpost_zero_notifications
  add constraint outpost_zero_notifications_title_length
    check(char_length(title) between 1 and 120);
alter table public.outpost_zero_notifications
  add constraint outpost_zero_notifications_message_length
    check(char_length(message) between 1 and 4000);

-- Creator/Main receipts may display an exact Auth email only as the fallback
-- for a username-less account. Preserve the historical column name for
-- compatibility, but widen only the manual admin-message label shape; every
-- other notification still requires a public username or NULL.
alter table public.outpost_zero_notifications
  drop constraint if exists outpost_zero_notifications_recipient_username;
alter table public.outpost_zero_notifications
  add constraint outpost_zero_notifications_recipient_username check (
    recipient_username_at_send is null
    or recipient_username_at_send ~ '^[A-Za-z0-9_]{3,32}$'
    or (
      kind='admin_message'
      and char_length(recipient_username_at_send) between 3 and 320
      and recipient_username_at_send ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    )
  );

-- Reruns upgrade the short-lived preview without deleting any event.
alter table public.outpost_zero_notifications
  add column if not exists removed_at timestamptz;
alter table public.outpost_zero_notifications
  drop constraint if exists outpost_zero_notifications_removed_clock;
alter table public.outpost_zero_notifications
  add constraint outpost_zero_notifications_removed_clock
  check (removed_at is null or removed_at >= created_at);

-- Remove the short-lived preview foreign key if this file is rerun over it.
alter table public.outpost_zero_notifications
  drop constraint if exists outpost_zero_notifications_actor_user_id_fkey;

-- Only these public, non-account references may cross the list RPC. Banner and
-- friendship IDs are already visible to the relevant client; weapons and edit
-- categories are fixed allowlists. UUIDs/emails cannot match this constraint.
alter table public.outpost_zero_notifications
  drop constraint if exists outpost_zero_notifications_resource_format;
alter table public.outpost_zero_notifications
  add constraint outpost_zero_notifications_resource_format check (
    resource_key is null
    or resource_key ~ '^banner:[1-9][0-9]{0,18}$'
    or resource_key ~ '^friendship:[1-9][0-9]{0,18}:(request|accepted)$'
    or resource_key ~ '^weapon:(ar|volt|dart|hammer|twinsai|railgun|medkit|grenade|freezer)$'
    or resource_key ~ '^weapons:(ar|volt|dart|hammer|twinsai|railgun|medkit|grenade|freezer)(,(ar|volt|dart|hammer|twinsai|railgun|medkit|grenade|freezer))*$'
    or resource_key in ('currency', 'upgrades', 'score')
  );

create unique index if not exists outpost_zero_notifications_actor_operation_uidx
  on public.outpost_zero_notifications(actor_user_id, operation_id)
  where actor_user_id is not null and operation_id is not null;
create index if not exists outpost_zero_notifications_recipient_idx
  on public.outpost_zero_notifications(recipient_id, notification_id desc);
create index if not exists outpost_zero_notifications_global_idx
  on public.outpost_zero_notifications(notification_id desc)
  where recipient_id is null;
create index if not exists outpost_zero_notifications_actor_rate_idx
  on public.outpost_zero_notifications(actor_user_id, kind, created_at desc)
  where actor_user_id is not null;

-- Read state is per account even for a global event. A composite primary key
-- makes every mark operation naturally idempotent.
create table if not exists public.outpost_zero_notification_reads (
  notification_id bigint not null
    references public.outpost_zero_notifications(notification_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null,
  primary key (notification_id, user_id)
);
create index if not exists outpost_zero_notification_reads_user_idx
  on public.outpost_zero_notification_reads(user_id, notification_id desc);




-- Browser-safe notification keys are text (`n_123`), never JSON numbers that
-- could lose bigint precision in JavaScript. This parser is internal only.
create or replace function public._outpost_zero_notification_id(p_key text)
returns bigint
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $function$
declare v_id bigint;
begin
  if p_key is null or p_key !~ '^n_[1-9][0-9]{0,18}$' then
    raise exception 'invalid notification key' using errcode = '22023';
  end if;
  begin
    v_id := substring(p_key from 3)::bigint;
  exception when numeric_value_out_of_range then
    raise exception 'invalid notification key' using errcode = '22023';
  end;
  return v_id;
end;
$function$;

-- Only a chosen public username may become a friend-event label. Generated
-- op_<UUID fragment> handles and unset sentinels are excluded defensively.
create or replace function public._outpost_zero_notification_handle(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select sp.handle::text
  from public.social_profiles sp
  where sp.user_id = p_user_id
    and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
    and sp.handle_key not in ('username_not_set', 'usernamenotset')
    and sp.handle_key <> 'op_' || left(replace(sp.user_id::text, '-', ''), 20)
    and sp.handle_key <> 'op_' || left(replace(sp.user_id::text, '-', ''), 8)
  limit 1
$function$;

-- Administration 01 already records every successful mutation in the same
-- transaction. Deriving recipient notices from that protected audit stream
-- keeps gifts/bans atomic without replacing or weakening its mutation RPCs.
create or replace function public._outpost_zero_notify_admin_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_kind text;
  v_author text;
  v_title text;
  v_message text;
  v_resource text;
  v_weapon text;
  v_weapons text;
  v_until timestamptz;
begin
  if new.result <> 'applied' or new.target_user_id is null then
    return new;
  end if;

  v_author := case new.actor_role
    when 'creator' then 'CREATOR'
    when 'main' then 'MAIN ADMIN'
    else 'ADMIN ACTION'
  end;

  if new.action in ('temporary_weapon.grant', 'temporary_weapon.extend',
                    'temporary_weapon.revoke') then
    v_weapon := lower(coalesce(new.details ->> 'weapon_key', ''));
    if v_weapon not in ('ar', 'volt', 'dart', 'hammer', 'twinsai',
                        'railgun', 'medkit', 'grenade', 'freezer') then
      return new;
    end if;
    if new.action = 'temporary_weapon.grant' then
      v_kind := 'weapon_temporary_granted';
      v_title := 'TEMPORARY WEAPON GIFT';
      v_message := 'You received temporary access to ' || upper(v_weapon) || '.';
    elsif new.action = 'temporary_weapon.extend' then
      v_kind := 'weapon_temporary_extended';
      v_title := 'TEMPORARY WEAPON EXTENDED';
      v_message := 'Your temporary access to ' || upper(v_weapon) || ' was extended.';
    else
      v_kind := 'weapon_temporary_revoked';
      v_title := 'TEMPORARY WEAPON REMOVED';
      v_message := 'Your temporary access to ' || upper(v_weapon) || ' was removed.';
    end if;
    begin
      v_until := nullif(new.details ->> 'expires_at', '')::timestamptz;
    exception when others then v_until := null;
    end;
    v_resource := 'weapon:' || v_weapon;
  elsif new.action in ('permanent_weapon.grant', 'permanent_weapon.revoke') then
    if jsonb_typeof(new.details -> 'weapon_keys') <> 'array' then return new; end if;
    select string_agg(w, ',' order by w) into v_weapons
    from (
      select distinct lower(value) as w
      from jsonb_array_elements_text(new.details -> 'weapon_keys')
      where lower(value) in ('ar', 'volt', 'dart', 'hammer', 'twinsai',
                             'railgun', 'medkit', 'grenade', 'freezer')
    ) safe;
    if v_weapons is null then return new; end if;
    if new.action = 'permanent_weapon.grant' then
      v_kind := 'weapon_permanent_granted';
      v_title := 'PERMANENT WEAPON GIFT';
      v_message := 'You received permanent access to ' || upper(replace(v_weapons, ',', ', ')) || '.';
    else
      v_kind := 'weapon_permanent_revoked';
      v_title := 'PERMANENT WEAPON REMOVED';
      v_message := 'Permanent access was removed for ' || upper(replace(v_weapons, ',', ', ')) || '.';
    end if;
    v_resource := 'weapons:' || v_weapons;
  elsif new.action = 'ban.apply' then
    v_kind := 'ban_applied'; v_title := 'ACCOUNT RESTRICTION';
    v_message := 'A moderation restriction was applied to your account.';
  elsif new.action = 'ban.unban' then
    v_kind := 'ban_lifted'; v_title := 'ACCOUNT RESTRICTION LIFTED';
    v_message := 'A moderation restriction on your account was lifted.';
  elsif new.action = 'currency.edit' then
    v_kind := 'currency_updated'; v_title := 'CURRENCY UPDATED';
    v_message := 'Your gems or coins balance was updated by staff.';
    v_resource := 'currency';
  elsif new.action = 'upgrades.edit' then
    v_kind := 'upgrades_updated'; v_title := 'UPGRADES UPDATED';
    v_message := 'Your upgrades were updated by staff.';
    v_resource := 'upgrades';
  elsif new.action = 'score.edit' then
    v_kind := 'score_updated'; v_title := 'SCORE UPDATED';
    v_message := 'Your Outpost Zero score was updated by staff.';
    v_resource := 'score';
  else
    return new;
  end if;

  insert into public.outpost_zero_notifications(
    recipient_id, kind, author_label, title, message, resource_key,
    effective_until, actor_user_id, source_type, source_key, created_at
  ) values (
    new.target_user_id, v_kind, v_author, v_title, v_message, v_resource,
    v_until, new.actor_user_id, 'admin_audit', new.event_id::text, new.created_at
  ) on conflict (source_type, source_key) do nothing;
  return new;
end;
$function$;

drop trigger if exists outpost_zero_notify_admin_audit_trigger
  on public.outpost_zero_admin_audit;
create trigger outpost_zero_notify_admin_audit_trigger
after insert on public.outpost_zero_admin_audit
for each row execute function public._outpost_zero_notify_admin_audit();

-- Approved updates create one global Inbox row. Approval and notification
-- either both commit or both roll back. Deleting an update hides its Inbox
-- event while retaining a private rate/source tombstone. Existing approved
-- rows are not backfilled as new unread mail when this migration is installed.
create or replace function public._outpost_zero_notify_banner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_author text;
  v_now timestamptz := clock_timestamp();
begin
  if tg_op = 'DELETE' then
    -- Hide the deleted update but retain a private tombstone so delete/repost
    -- cannot reset the rolling global-update abuse limits.
    update public.outpost_zero_notifications n
    set removed_at = coalesce(n.removed_at, clock_timestamp())
    where n.source_type = 'banner' and n.source_key = old.id::text;
    return old;
  end if;
  if new.approved is not true
     or (tg_op = 'UPDATE' and old.approved is true) then
    return new;
  end if;

  v_role := public._outpost_zero_update_role();
  if v_actor is null or v_role not in ('creator', 'main') then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('outpost-zero-official-update:' || v_actor::text, 0)
  );
  if (select count(*) from public.outpost_zero_notifications n
      where n.actor_user_id = v_actor and n.kind = 'official_update'
        and n.created_at > v_now - interval '10 minutes') >= 5
     or (select count(*) from public.outpost_zero_notifications n
         where n.actor_user_id = v_actor and n.kind = 'official_update'
           and n.created_at > v_now - interval '1 day') >= 30 then
    raise exception 'NOTIFICATION_RATE_LIMITED' using errcode = 'P0001';
  end if;

  v_author := case when new.author in ('CREATOR', 'MAIN ADMIN', 'CO-ADMIN', 'ADMIN UPDATE')
    then new.author else 'ADMIN UPDATE' end;
  insert into public.outpost_zero_notifications(
    recipient_id, kind, author_label, title, message, resource_key,
    actor_user_id, source_type, source_key, created_at
  ) values (
    null, 'official_update', v_author, new.heading, new.details,
    'banner:' || new.id::text, v_actor, 'banner', new.id::text, v_now
  ) on conflict (source_type, source_key) do nothing;
  return new;
end;
$function$;

drop trigger if exists outpost_zero_notify_banner_trigger on public.banners;
create trigger outpost_zero_notify_banner_trigger
after insert or update of approved or delete on public.banners
for each row execute function public._outpost_zero_notify_banner();

-- Friend events are bound again to auth.uid() inside the AFTER trigger even
-- though Player 03 already enforces the transition. This prevents a future
-- policy mistake from turning a browser-selected participant into an author.
create or replace function public._outpost_zero_notify_friendship()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := auth.uid();
  v_requester text;
  v_addressee text;
  v_now timestamptz := clock_timestamp();
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or v_actor is distinct from new.requester_id then
      return new;
    end if;
    v_requester := public._outpost_zero_notification_handle(new.requester_id);
    if v_requester is null then return new; end if;

    perform pg_advisory_xact_lock(
      hashtextextended('outpost-zero-friend-notice:' || v_actor::text, 0)
    );
    if (select count(*) from public.outpost_zero_notifications n
        where n.actor_user_id = v_actor and n.kind = 'friend_request'
          and n.created_at > v_now - interval '10 minutes') >= 20
       or (select count(*) from public.outpost_zero_notifications n
           where n.actor_user_id = v_actor and n.kind = 'friend_request'
             and n.created_at > v_now - interval '1 day') >= 100
       or (select count(*) from public.outpost_zero_notifications n
           where n.actor_user_id = v_actor and n.kind = 'friend_request'
             and n.recipient_id = new.addressee_id
             and n.created_at > v_now - interval '1 day') >= 5 then
      raise exception 'FRIEND_REQUEST_RATE_LIMITED' using errcode = 'P0001';
    end if;

    insert into public.outpost_zero_notifications(
      recipient_id, kind, author_label, title, message, resource_key,
      actor_user_id, source_type, source_key, created_at
    ) values (
      new.addressee_id, 'friend_request', '@' || v_requester,
      'FRIEND REQUEST', '@' || v_requester || ' sent you a friend request.',
      'friendship:' || new.id::text || ':request', new.requester_id,
      'friendship', new.id::text || ':request', v_now
    ) on conflict (source_type, source_key) do nothing;
    return new;
  end if;

  if old.status = 'pending' and new.status = 'accepted'
     and v_actor = new.addressee_id then
    v_requester := public._outpost_zero_notification_handle(new.requester_id);
    v_addressee := public._outpost_zero_notification_handle(new.addressee_id);

    if v_addressee is not null then
      insert into public.outpost_zero_notifications(
        recipient_id, kind, author_label, title, message, resource_key,
        actor_user_id, source_type, source_key, created_at
      ) values (
        new.requester_id, 'friend_accepted', '@' || v_addressee,
        'FRIEND REQUEST ACCEPTED',
        'CONGRATULATIONS · @' || v_addressee || ' IS NOW YOUR FRIEND',
        'friendship:' || new.id::text || ':accepted', new.addressee_id,
        'friendship', new.id::text || ':accepted:requester', v_now
      ) on conflict (source_type, source_key) do nothing;
    end if;

    if v_requester is not null then
      insert into public.outpost_zero_notifications(
        recipient_id, kind, author_label, title, message, resource_key,
        actor_user_id, source_type, source_key, created_at
      ) values (
        new.addressee_id, 'friend_accepted', '@' || v_requester,
        'FRIEND REQUEST ACCEPTED',
        'CONGRATULATIONS · @' || v_requester || ' IS NOW YOUR FRIEND',
        'friendship:' || new.id::text || ':accepted', new.addressee_id,
        'friendship', new.id::text || ':accepted:addressee', v_now
      ) on conflict (source_type, source_key) do nothing;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists outpost_zero_notify_friendship_trigger on public.friendships;
create trigger outpost_zero_notify_friendship_trigger
after insert or update of status on public.friendships
for each row execute function public._outpost_zero_notify_friendship();

-- Resolve one Creator/Main-supplied identity without ever making email search
-- public. Usernames are preferred. Creator/Main may supply any account's exact
-- email; output remains username-first. Optional staff scoping protects Admin
-- Inbox recipients.
create or replace function public._outpost_zero_admin_target_user_id(
  p_identity text,
  p_staff_only boolean default false
)
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $function$
declare
  v_input text:=btrim(coalesce(p_identity,''));
  v_key text:=lower(btrim(coalesce(p_identity,'')));
  v_target uuid;
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then
    raise exception 'creator or main-admin access required' using errcode='42501';
  end if;
  if v_key ~ '^[a-z0-9_]{3,32}$' then
    select sp.user_id into v_target
    from public.social_profiles sp
    where sp.handle_key=v_key
      and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
      and sp.handle_key not in ('username_not_set','usernamenotset')
      and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),20)
      and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),8)
    limit 1;
  elsif char_length(v_input) between 3 and 320
        and v_input ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    select u.id into v_target
    from auth.users u
    where lower(btrim(u.email))=lower(v_input)
    limit 1;
  end if;
  if v_target is null or not coalesce(p_staff_only,false) then return v_target;end if;
  if v_target=public._outpost_zero_creator_user_id() or exists(
    select 1 from public.admins a join auth.users u
      on lower(btrim(u.email))=lower(btrim(a.email))
    where u.id=v_target and lower(btrim(coalesce(a.role,''))) in ('main','co','tester')
  ) then return v_target;end if;
  return null;
end;
$function$;


-- Creator/main-only targeted message. The recipient may be a chosen username
-- or any account's exact email; the receipt remains username-first.
-- One operation UUID is exact-once for one actor and exact payload.
create or replace function public.send_outpost_zero_admin_notification(
  p_recipient_username text,
  p_subject text,
  p_message text,
  p_operation_id uuid
)
returns table(
  notification_key text,
  recipient_username text,
  author_label text,
  created_at timestamptz,
  reused boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text := public._outpost_zero_admin_role();
  v_username text := btrim(coalesce(p_recipient_username, ''));
  v_subject text;
  v_message text;
  v_target uuid;
  v_author text;
  v_fingerprint text;
  v_now timestamptz := clock_timestamp();
  v_prior public.outpost_zero_notifications%rowtype;
  v_row public.outpost_zero_notifications%rowtype;
begin
  if v_actor is null or v_role not in ('creator', 'main') then
    raise exception 'creator or main-admin access required' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'operation id is required' using errcode = '22004';
  end if;

  v_subject := regexp_replace(coalesce(p_subject, ''), '[[:cntrl:]]', ' ', 'g');
  v_subject := regexp_replace(btrim(v_subject), '[[:space:]]+', ' ', 'g');
  v_message := regexp_replace(coalesce(p_message, ''), '[[:cntrl:]]', ' ', 'g');
  v_message := regexp_replace(btrim(v_message), '[[:space:]]+', ' ', 'g');
  if char_length(v_subject) not between 1 and 80
     or char_length(v_message) not between 1 and 600 then
    raise exception 'invalid notification subject or message' using errcode = '22023';
  end if;
  v_fingerprint := md5(lower(v_username) || E'\n' || v_subject || E'\n' || v_message);

  perform pg_advisory_xact_lock(
    hashtextextended('outpost-zero-admin-notification:' || v_actor::text, 0)
  );
  select n.* into v_prior
  from public.outpost_zero_notifications n
  where n.actor_user_id = v_actor and n.operation_id = p_operation_id
  for update;
  if found then
    if v_prior.kind <> 'admin_message'
       or v_prior.request_fingerprint is distinct from v_fingerprint then
      raise exception 'NOTIFICATION_OPERATION_CONFLICT' using errcode = 'P0001';
    end if;
    return query select 'n_' || v_prior.notification_id::text,
      v_prior.recipient_username_at_send, v_prior.author_label,
      v_prior.created_at, true;
    return;
  end if;

  v_target:=public._outpost_zero_admin_target_user_id(v_username,false);
  if v_target is null then
    raise exception 'NOTIFICATION_TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;
  v_username:=public._outpost_zero_admin_identity_label(v_target);
  if v_username is null then
    raise exception 'NOTIFICATION_TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- A separate key namespace serializes the recipient-wide incoming limit
  -- across creator/main senders without creating reciprocal lock cycles.
  perform pg_advisory_xact_lock(
    hashtextextended('outpost-zero-admin-notification-recipient:' || v_target::text, 0)
  );

  if (select count(*) from public.outpost_zero_notifications n
      where n.actor_user_id = v_actor and n.kind = 'admin_message'
        and n.created_at > v_now - interval '10 minutes') >= 12
     or (select count(*) from public.outpost_zero_notifications n
         where n.actor_user_id = v_actor and n.kind = 'admin_message'
           and n.created_at > v_now - interval '1 day') >= 60
     or (select count(*) from public.outpost_zero_notifications n
         where n.actor_user_id = v_actor and n.kind = 'admin_message'
           and n.recipient_id = v_target
           and n.created_at > v_now - interval '1 hour') >= 4
     or (select count(*) from public.outpost_zero_notifications n
         where n.kind = 'admin_message' and n.recipient_id = v_target
           and n.created_at > v_now - interval '1 hour') >= 30 then
    raise exception 'NOTIFICATION_RATE_LIMITED' using errcode = 'P0001';
  end if;

  v_author := case v_role when 'creator' then 'CREATOR' else 'MAIN ADMIN' end;
  insert into public.outpost_zero_notifications(
    recipient_id, kind, author_label, title, message,
    recipient_username_at_send, actor_user_id, operation_id,
    request_fingerprint, source_type, source_key, created_at
  ) values (
    v_target, 'admin_message', v_author, v_subject, v_message,
    v_username, v_actor, p_operation_id, v_fingerprint,
    'manual', v_actor::text || ':' || p_operation_id::text, v_now
  ) returning * into v_row;

  return query select 'n_' || v_row.notification_id::text,
    v_row.recipient_username_at_send, v_row.author_label,
    v_row.created_at, false;
end;
$function$;

-- Recipient-only newest-first feed. No internal source ID, actor ID, recipient
-- ID, email, operation UUID, or retry fingerprint crosses this boundary.
create or replace function public.list_my_outpost_zero_notifications(
  p_before_notification_key text default null,
  p_limit integer default 30
)
returns table(
  notification_key text,
  kind text,
  author_label text,
  title text,
  message text,
  resource_key text,
  effective_until timestamptz,
  created_at timestamptz,
  read_at timestamptz,
  is_global boolean,
  server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := auth.uid();
  v_before bigint;
  v_limit integer := least(60, greatest(1, coalesce(p_limit, 30)));
  v_now timestamptz := statement_timestamp();
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_before_notification_key is not null then
    v_before := public._outpost_zero_notification_id(p_before_notification_key);
  end if;
  return query
  select 'n_' || n.notification_id::text, n.kind, n.author_label,
    n.title, n.message, n.resource_key, n.effective_until, n.created_at,
    r.read_at, n.recipient_id is null, v_now
  from public.outpost_zero_notifications n
  left join public.outpost_zero_notification_reads r
    on r.notification_id = n.notification_id and r.user_id = v_actor
  where (n.recipient_id = v_actor or n.recipient_id is null)
    and n.removed_at is null
    and (v_before is null or n.notification_id < v_before)
  order by n.notification_id desc
  limit v_limit;
end;
$function$;

-- Drop first because adding feed_revision changes the preview return shape.
-- The transaction makes the replacement atomic for connected clients.
drop function if exists public.get_my_outpost_zero_notification_summary();
create function public.get_my_outpost_zero_notification_summary()
returns table(
  unread_count integer,
  latest_notification_key text,
  feed_revision text,
  server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := auth.uid();
  v_latest bigint;
  v_visible bigint;
  v_removed timestamptz;
  v_unread bigint;
  v_revision text;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- The digest is an opaque cache validator, not an object identifier. It is
  -- scoped to rows this account may see and includes hidden tombstone changes,
  -- allowing a client to evict a deleted older banner without exposing it.
  select max(n.notification_id) filter (where n.removed_at is null),
         count(*) filter (where n.removed_at is null),
         max(n.removed_at)
    into v_latest, v_visible, v_removed
  from public.outpost_zero_notifications n
  where n.recipient_id = v_actor or n.recipient_id is null;
  v_revision := 'f_' || md5(
    coalesce(v_latest::text, '0') || ':' ||
    coalesce(v_visible::text, '0') || ':' ||
    coalesce(extract(epoch from v_removed)::text, '-')
  );

  select count(*) into v_unread
  from public.outpost_zero_notifications n
  where (n.recipient_id = v_actor or n.recipient_id is null)
    and n.removed_at is null
    and not exists (
      select 1 from public.outpost_zero_notification_reads r
      where r.notification_id = n.notification_id and r.user_id = v_actor
    );
  return query select least(v_unread, 2147483647)::integer,
    case when v_latest is null then null else 'n_' || v_latest::text end,
    v_revision, statement_timestamp();
end;
$function$;

-- Up to 100 opaque keys may be marked together. Invisible or unknown keys are
-- ignored; malformed keys fail the whole call. A retry inserts nothing and
-- returns marked_count=0 while preserving the same read timestamp.
create or replace function public.mark_my_outpost_zero_notifications_read(
  p_notification_keys text[]
)
returns table(
  marked_count integer,
  unread_count integer,
  server_now timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_marked bigint := 0;
  v_unread bigint := 0;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_notification_keys is null
     or cardinality(p_notification_keys) > 100 then
    raise exception 'notification key list must contain at most 100 keys'
      using errcode = '22023';
  end if;

  insert into public.outpost_zero_notification_reads(notification_id, user_id, read_at)
  select distinct n.notification_id, v_actor, v_now
  from unnest(p_notification_keys) as supplied(notification_key)
  join public.outpost_zero_notifications n
    on n.notification_id = public._outpost_zero_notification_id(supplied.notification_key)
  where (n.recipient_id = v_actor or n.recipient_id is null)
    and n.removed_at is null
  on conflict (notification_id, user_id) do nothing;
  get diagnostics v_marked = row_count;

  select count(*) into v_unread
  from public.outpost_zero_notifications n
  where (n.recipient_id = v_actor or n.recipient_id is null)
    and n.removed_at is null
    and not exists (
      select 1 from public.outpost_zero_notification_reads r
      where r.notification_id = n.notification_id and r.user_id = v_actor
    );
  return query select least(v_marked, 2147483647)::integer,
    least(v_unread, 2147483647)::integer, v_now;
end;
$function$;




create or replace function public._outpost_zero_admin_message_username(p_user_id uuid)
returns text language sql stable security definer set search_path=pg_catalog,public
as $function$
  select sp.handle::text from public.social_profiles sp
  where sp.user_id=p_user_id
    and sp.handle ~ '^[A-Za-z0-9_]{3,32}$'
    and sp.handle_key not in ('username_not_set','usernamenotset')
    and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),20)
    and sp.handle_key <> 'op_'||left(replace(sp.user_id::text,'-',''),8)
  limit 1
$function$;

-- Staff Inbox labels are viewer-aware. Creator/Main may see the exact email
-- fallback for a username-less participant; Co/Tester may see that fallback
-- only for their own account and cannot enumerate another staff member's
-- private email.
create or replace function public._outpost_zero_admin_message_identity_label(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $function$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public._outpost_zero_staff_role();
  v_label text;
begin
  if v_actor is null or v_role not in ('creator','main','co','tester') then
    raise exception 'staff access required' using errcode='42501';
  end if;
  if p_user_id is null then return null;end if;
  v_label:=public._outpost_zero_admin_message_username(p_user_id);
  if v_label is not null then return v_label;end if;
  if v_role not in ('creator','main') and p_user_id<>v_actor then return null;end if;
  select lower(btrim(u.email)) into v_label
  from auth.users u
  where u.id=p_user_id and nullif(btrim(coalesce(u.email,'')),'') is not null
  limit 1;
  return v_label;
end;
$function$;

create or replace function public.list_my_outpost_zero_admin_messages(p_limit integer default 30)
returns table(
  message_id bigint,from_username text,to_username text,message text,read boolean,
  read_at timestamptz,archived boolean,created_at timestamptz,is_incoming boolean
)
language plpgsql stable security definer set search_path=pg_catalog,public
as $function$
declare v_actor uuid:=auth.uid();v_role text:=public._outpost_zero_staff_role();v_email text;
begin
  if v_actor is null or v_role not in ('creator','main','co','tester') then
    raise exception 'staff access required' using errcode='42501';
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id=v_actor;
  return query
  select m.id,
         coalesce(public._outpost_zero_admin_message_identity_label(coalesce(m.from_user_id,fu.id)),'STAFF')::text,
         coalesce(public._outpost_zero_admin_message_identity_label(coalesce(m.to_user_id,tu.id)),'STAFF')::text,
         m.message::text,m.read,m.read_at,m.archived,m.created_at,
         (coalesce(m.to_user_id,tu.id)=v_actor)::boolean
  from public.admin_msgs m
  left join auth.users fu on fu.id=m.from_user_id
    or (m.from_user_id is null and lower(btrim(fu.email))=lower(btrim(m.from_email)))
  left join auth.users tu on tu.id=m.to_user_id
    or (m.to_user_id is null and lower(btrim(tu.email))=lower(btrim(m.to_email)))
  where coalesce(m.from_user_id,fu.id)=v_actor or coalesce(m.to_user_id,tu.id)=v_actor
    or (lower(btrim(m.from_email))=v_email or lower(btrim(m.to_email))=v_email)
  order by m.id desc limit least(greatest(coalesce(p_limit,30),1),100);
end;
$function$;

create or replace function public.send_outpost_zero_admin_message(
  p_recipient_username text,p_message text,p_operation_id uuid
)
returns table(message_id bigint,recipient_username text,created_at timestamptz,reused boolean)
language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare
  v_actor uuid:=auth.uid();v_role text:=public._outpost_zero_staff_role();
  v_identity text:=btrim(coalesce(p_recipient_username,''));
  v_key text:=lower(btrim(coalesce(p_recipient_username,'')));v_message text;
  v_target uuid;v_actor_email text;v_target_email text;v_target_username text;
  v_fingerprint text;v_prior public.admin_msgs%rowtype;v_row public.admin_msgs%rowtype;
begin
  if v_actor is null or v_role not in ('creator','main') then
    raise exception 'creator or main-admin access required' using errcode='42501';
  end if;
  if p_operation_id is null then raise exception 'operation id required' using errcode='22004';end if;
  v_message:=regexp_replace(btrim(coalesce(p_message,'')),'[[:space:]]+',' ','g');
  if char_length(v_identity) not between 3 and 320
     or char_length(v_message) not between 1 and 500 then
    raise exception 'valid staff identity and message required' using errcode='22023';
  end if;
  v_fingerprint:=md5(v_key||E'\n'||v_message);
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-admin-message:'||v_actor::text,0));
  select m.* into v_prior from public.admin_msgs m
  where m.from_user_id=v_actor and m.operation_id=p_operation_id for update;
  if found then
    if v_prior.request_fingerprint is distinct from v_fingerprint then
      raise exception 'ADMIN_MESSAGE_OPERATION_CONFLICT' using errcode='P0001';
    end if;
    return query select v_prior.id,
      coalesce(public._outpost_zero_admin_identity_label(v_prior.to_user_id),'STAFF'),
      v_prior.created_at,true;
    return;
  end if;
  v_target:=public._outpost_zero_admin_target_user_id(v_identity,true);
  if v_target is null then raise exception 'STAFF_IDENTITY_NOT_FOUND' using errcode='P0001';end if;
  if v_target=v_actor then raise exception 'CANNOT_MESSAGE_SELF' using errcode='22023';end if;
  v_target_username:=public._outpost_zero_admin_identity_label(v_target);
  select u.email into v_target_email from auth.users u where u.id=v_target;
  if v_target_username is null or nullif(btrim(coalesce(v_target_email,'')),'') is null then
    raise exception 'STAFF_IDENTITY_NOT_FOUND' using errcode='P0001';
  end if;
  if (select count(*) from public.admin_msgs m where m.from_user_id=v_actor
      and m.created_at>clock_timestamp()-interval '1 day')>=100 then
    raise exception 'ADMIN_MESSAGE_RATE_LIMITED' using errcode='P0001';
  end if;
  select u.email into strict v_actor_email from auth.users u where u.id=v_actor;
  insert into public.admin_msgs(
    from_email,to_email,from_user_id,to_user_id,message,operation_id,request_fingerprint,created_at
  ) values (
    lower(btrim(v_actor_email)),lower(btrim(v_target_email)),v_actor,v_target,v_message,
    p_operation_id,v_fingerprint,clock_timestamp()
  ) returning * into v_row;
  return query select v_row.id,v_target_username::text,v_row.created_at,false;
end;
$function$;

create or replace function public.mark_my_outpost_zero_admin_messages_read(p_message_ids bigint[] default null)
returns integer language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare v_actor uuid:=auth.uid();v_email text;v_changed bigint;
begin
  if v_actor is null or public._outpost_zero_staff_role() not in ('creator','main','co','tester') then
    raise exception 'staff access required' using errcode='42501';
  end if;
  if p_message_ids is not null and cardinality(p_message_ids)>100 then
    raise exception 'at most 100 message ids' using errcode='22023';
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id=v_actor;
  update public.admin_msgs m set read=true,read_at=coalesce(m.read_at,clock_timestamp())
  where (m.to_user_id=v_actor or (m.to_user_id is null and lower(btrim(m.to_email))=v_email))
    and not m.read and (p_message_ids is null or m.id=any(p_message_ids));
  get diagnostics v_changed=row_count;return least(v_changed,2147483647)::integer;
end;
$function$;

create or replace function public.archive_my_outpost_zero_admin_message(p_message_id bigint)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare v_actor uuid:=auth.uid();v_email text;v_changed bigint;
begin
  if v_actor is null or public._outpost_zero_staff_role() not in ('creator','main','co','tester') then
    raise exception 'staff access required' using errcode='42501';
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id=v_actor;
  update public.admin_msgs m set archived=true
  where m.id=p_message_id
    and (m.to_user_id=v_actor or (m.to_user_id is null and lower(btrim(m.to_email))=v_email));
  get diagnostics v_changed=row_count;return v_changed=1;
end;
$function$;



-- These helpers are private to the report RPC boundary. Listing and exporting
-- construct a small allowlisted meta object instead of returning legacy JSON,
-- and redact email-like text even if an old client stored it before this file.
create or replace function public._outpost_zero_redact_report_text(p_value text)
returns text language sql immutable set search_path=pg_catalog,public
as $function$
  select regexp_replace(coalesce(p_value,''),'[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}','[private email removed]','gi')
$function$;

create or replace function public._outpost_zero_report_public_name(p_name text,p_reporter_user_id uuid)
returns text language plpgsql stable security definer set search_path=pg_catalog,public
as $function$
declare v_label text;v_redacted text;
begin
  if p_reporter_user_id is not null then
    v_label:=public._outpost_zero_admin_identity_label(p_reporter_user_id);
    if v_label is not null then return v_label;end if;
  end if;
  v_label:=btrim(coalesce(p_name,''));
  v_redacted:=btrim(public._outpost_zero_redact_report_text(v_label));
  if v_label<>v_redacted or position('@' in v_label)>0 then return 'LEGACY REPORTER';end if;
  if char_length(v_redacted) between 1 and 64 and v_redacted ~ '^[A-Za-z0-9_ .-]+$' then return v_redacted;end if;
  return 'LEGACY REPORTER';
end;
$function$;

-- Consolidate legacy staff/player report shapes without deleting a report.
-- Private email-like legacy labels are discarded, staff prefixes are removed,
-- and the old client-only staff flag is removed from stored metadata.
update public.reports r set
  name=case
    when coalesce(r.name,'') ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}' then 'LEGACY REPORTER'
    else nullif(btrim(regexp_replace(coalesce(r.name,''),'^(CO-ADMIN|STAFF)[[:space:]·:|-]+','','i')),'')
  end,
  message=regexp_replace(r.message,'^\[STAFF\][[:space:]]*','','i'),
  meta=case when jsonb_typeof(r.meta)='object' then r.meta-'staff' else r.meta end
where r.game='outpost-zero' and (
  coalesce(r.name,'') ~* '^(CO-ADMIN|STAFF)'
  or coalesce(r.name,'') ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
  or r.message ~* '^\[STAFF\]'
  or (jsonb_typeof(r.meta)='object' and r.meta ? 'staff')
);

create or replace function public._outpost_zero_sanitized_report_meta(p_meta jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public
as $function$
declare v jsonb:=case when jsonb_typeof(p_meta)='object' then p_meta else '{}'::jsonb end;
begin
  return jsonb_strip_nulls(jsonb_build_object(
    'category',case when v->>'category' in ('player','gameplay','account','social','party','admin','general','bug') then v->>'category' end,
    'reported_username',case when v->>'reported_username' ~ '^[A-Za-z0-9_]{3,32}$' then v->>'reported_username' end,
    'wave',case when jsonb_typeof(v->'wave')='number' and v->>'wave' ~ '^[0-9]{1,9}$' then (v->>'wave')::integer end,
    'score',case when jsonb_typeof(v->'score')='number' and v->>'score' ~ '^[0-9]{1,16}$' and (v->>'score')::numeric<=9007199254740991 then (v->>'score')::bigint end,
    'state',case when jsonb_typeof(v->'state')='string' and v->>'state' ~ '^[A-Za-z0-9_-]{1,32}$' then v->>'state' end,
    'mode',case when jsonb_typeof(v->'mode')='string' and v->>'mode' ~ '^[A-Za-z0-9 _-]{1,40}$' then v->>'mode' end,
    'screen',case when jsonb_typeof(v->'screen')='string' and v->>'screen' ~ '^[A-Za-z0-9 _-]{1,40}$' then v->>'screen' end,
    'w',case when jsonb_typeof(v->'w')='number' and v->>'w' ~ '^[0-9]{1,5}$' and (v->>'w')::integer between 1 and 16384 then (v->>'w')::integer end,
    'h',case when jsonb_typeof(v->'h')='number' and v->>'h' ~ '^[0-9]{1,5}$' and (v->>'h')::integer between 1 and 16384 then (v->>'h')::integer end,
    'dpr',case when jsonb_typeof(v->'dpr')='number' and v->>'dpr' ~ '^[0-9]{1,2}([.][0-9]{1,4})?$'
      and (v->>'dpr')::numeric between 0.25 and 8 then (v->>'dpr')::numeric end
  ));
end;
$function$;

create or replace function public.submit_outpost_zero_report(
  p_message text,
  p_context jsonb default '{}'::jsonb,
  p_reported_username text default null
)
returns table(report_id bigint,created_at timestamptz)
language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare
  v_actor uuid:=auth.uid();v_role text;v_username text;v_message text:=btrim(coalesce(p_message,''));
  v_context jsonb:=coalesce(p_context,'{}'::jsonb);v_target_username text;v_meta jsonb;v_row public.reports%rowtype;
begin
  if v_actor is null then raise exception using errcode='42501',message='REPORT_SIGN_IN_REQUIRED';end if;
  select p.handle into v_username from public.social_profiles p where p.user_id=v_actor;
  if v_username is null or v_username !~ '^[A-Za-z0-9_]{3,32}$' then
    raise exception using errcode='22023',message='REPORT_USERNAME_REQUIRED';
  end if;
  if char_length(v_message) not between 1 and 1000 then
    raise exception using errcode='22023',message='REPORT_MESSAGE_LENGTH';
  end if;
  if jsonb_typeof(v_context)<>'object' then raise exception using errcode='22023',message='REPORT_CONTEXT_INVALID';end if;
  if exists(select 1 from jsonb_object_keys(v_context) k(key)
            where k.key not in ('wave','score','state','mode','screen','w','h','dpr','ua','category')) then
    raise exception using errcode='22023',message='REPORT_CONTEXT_FIELD_INVALID';
  end if;
  if v_context ? 'wave' and not(jsonb_typeof(v_context->'wave')='number' and v_context->>'wave' ~ '^[0-9]{1,9}$') then
    raise exception using errcode='22023',message='REPORT_CONTEXT_WAVE_INVALID';end if;
  if v_context ? 'score' and not(jsonb_typeof(v_context->'score')='number' and v_context->>'score' ~ '^[0-9]{1,16}$'
      and (v_context->>'score')::numeric<=9007199254740991) then
    raise exception using errcode='22023',message='REPORT_CONTEXT_SCORE_INVALID';end if;
  if v_context ? 'state' and not(jsonb_typeof(v_context->'state')='string' and v_context->>'state' ~ '^[A-Za-z0-9_-]{1,32}$') then
    raise exception using errcode='22023',message='REPORT_CONTEXT_STATE_INVALID';end if;
  if v_context ? 'mode' and not(jsonb_typeof(v_context->'mode')='string' and v_context->>'mode' ~ '^[A-Za-z0-9 _-]{1,40}$') then
    raise exception using errcode='22023',message='REPORT_CONTEXT_MODE_INVALID';end if;
  if v_context ? 'screen' and not(jsonb_typeof(v_context->'screen')='string' and v_context->>'screen' ~ '^[A-Za-z0-9 _-]{1,40}$') then
    raise exception using errcode='22023',message='REPORT_CONTEXT_SCREEN_INVALID';end if;
  if v_context ? 'category' and not(jsonb_typeof(v_context->'category')='string'
      and v_context->>'category' in ('player','gameplay','account','social','party','admin','general','bug')) then
    raise exception using errcode='22023',message='REPORT_CONTEXT_CATEGORY_INVALID';end if;
  if v_context ? 'w' and not(jsonb_typeof(v_context->'w')='number' and v_context->>'w' ~ '^[0-9]{1,5}$'
      and (v_context->>'w')::integer between 1 and 16384) then
    raise exception using errcode='22023',message='REPORT_CONTEXT_WIDTH_INVALID';end if;
  if v_context ? 'h' and not(jsonb_typeof(v_context->'h')='number' and v_context->>'h' ~ '^[0-9]{1,5}$'
      and (v_context->>'h')::integer between 1 and 16384) then
    raise exception using errcode='22023',message='REPORT_CONTEXT_HEIGHT_INVALID';end if;
  if v_context ? 'dpr' and not(jsonb_typeof(v_context->'dpr')='number' and v_context->>'dpr' ~ '^[0-9]{1,2}([.][0-9]{1,4})?$'
      and (v_context->>'dpr')::numeric between 0.25 and 8) then
    raise exception using errcode='22023',message='REPORT_CONTEXT_DPR_INVALID';end if;
  if v_context ? 'ua' and not(jsonb_typeof(v_context->'ua')='string' and char_length(v_context->>'ua') between 1 and 160
      and v_context->>'ua' !~ '[[:cntrl:]]') then
    raise exception using errcode='22023',message='REPORT_CONTEXT_UA_INVALID';end if;

  if nullif(btrim(coalesce(p_reported_username,'')),'') is not null then
    if btrim(p_reported_username) !~ '^[A-Za-z0-9_]{3,32}$' then
      raise exception using errcode='22023',message='REPORTED_USERNAME_INVALID';end if;
    select p.handle into v_target_username from public.social_profiles p where p.handle_key=lower(btrim(p_reported_username));
    if v_target_username is null then raise exception using errcode='22023',message='REPORTED_USERNAME_NOT_FOUND';end if;
  end if;

  v_role:=public._outpost_zero_staff_role();
  if v_role not in ('creator','main','co','tester') then
    v_role:='player';
    -- The lock closes the two-tab race: at most one ordinary-player report can
    -- pass the following time check for this account in a 30-second window.
    perform pg_advisory_xact_lock(hashtext('outpost-zero-report:'||v_actor::text)::bigint);
    if exists(select 1 from public.reports r where r.game='outpost-zero' and r.reporter_user_id=v_actor
              and r.created_at>clock_timestamp()-interval '30 seconds') then
      raise exception using errcode='P0001',message='REPORT_RATE_LIMIT';
    end if;
  end if;

  v_meta:=jsonb_strip_nulls(jsonb_build_object(
    'category',case when v_target_username is not null then 'player' else v_context->>'category' end,
    'reported_username',v_target_username,
    'wave',case when v_context ? 'wave' then (v_context->>'wave')::integer end,
    'score',case when v_context ? 'score' then (v_context->>'score')::bigint end,
    'state',v_context->>'state','mode',v_context->>'mode','screen',v_context->>'screen',
    'w',case when v_context ? 'w' then (v_context->>'w')::integer end,
    'h',case when v_context ? 'h' then (v_context->>'h')::integer end,
    'dpr',case when v_context ? 'dpr' then (v_context->>'dpr')::numeric end,
    'ua',v_context->>'ua'
  ));
  insert into public.reports(game,name,message,meta,resolved,reporter_user_id,created_at)
  values('outpost-zero',v_username,v_message,v_meta,false,v_actor,clock_timestamp()) returning * into v_row;
  return query select v_row.id,v_row.created_at;
end;
$function$;

create or replace function public.list_outpost_zero_reports(
  p_resolved boolean,
  p_before_id bigint default null,
  p_limit integer default 250
)
returns table(id bigint,name text,message text,created_at timestamptz,meta jsonb,resolved boolean)
language plpgsql stable security definer set search_path=pg_catalog,public
as $function$
declare v_limit integer:=least(greatest(coalesce(p_limit,250),1),250);
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then
    raise exception using errcode='42501',message='REPORT_ACCESS_REQUIRED';end if;
  return query
  select r.id,public._outpost_zero_report_public_name(r.name,r.reporter_user_id),
    public._outpost_zero_redact_report_text(r.message),r.created_at,
    public._outpost_zero_sanitized_report_meta(r.meta),r.resolved
  from public.reports r
  where r.game='outpost-zero' and r.resolved=coalesce(p_resolved,false)
    and (p_before_id is null or r.id<p_before_id)
  order by r.id desc limit v_limit;
end;
$function$;

create or replace function public.resolve_outpost_zero_report(p_report_id bigint)
returns table(id bigint,name text,message text,created_at timestamptz,meta jsonb,resolved boolean)
language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare v_row public.reports%rowtype;
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then
    raise exception using errcode='42501',message='REPORT_ACCESS_REQUIRED';end if;
  select r.* into v_row from public.reports r where r.game='outpost-zero' and r.id=p_report_id for update;
  if not found then raise exception using errcode='22023',message='REPORT_NOT_FOUND';end if;
  if not v_row.resolved then
    update public.reports r set resolved=true where r.game='outpost-zero' and r.id=p_report_id returning r.* into v_row;
  end if;
  return query select v_row.id,public._outpost_zero_report_public_name(v_row.name,v_row.reporter_user_id),
    public._outpost_zero_redact_report_text(v_row.message),v_row.created_at,
    public._outpost_zero_sanitized_report_meta(v_row.meta),v_row.resolved;
end;
$function$;

-- Resolve the newest open reports in one transaction. NULL means all;
-- CUSTOM uses a bounded positive count. A server lock serializes concurrent
-- bulk actions; the bounded response is only a count, and the client refreshes
-- the sanitized report feed afterward.
create or replace function public.resolve_outpost_zero_reports(p_limit integer default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
declare v_changed integer:=0;v_limit integer:=p_limit;
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then
    raise exception using errcode='42501',message='REPORT_ACCESS_REQUIRED';end if;
  if v_limit is not null and v_limit not between 1 and 10000 then
    raise exception using errcode='22023',message='REPORT_LIMIT_MUST_BE_1_TO_10000';end if;
  perform pg_advisory_xact_lock(hashtext('outpost-zero-report-bulk-resolve')::bigint);
  with targets as (
    select r.id from public.reports r where r.game='outpost-zero' and not r.resolved
    order by r.id desc limit v_limit for update
  ), changed as (
    update public.reports r set resolved=true from targets t
    where r.game='outpost-zero' and r.id=t.id and not r.resolved returning r.id
  )
  select count(*)::integer into v_changed from changed;
  return jsonb_build_object('resolved_count',v_changed);
end;
$function$;

create or replace function public.export_outpost_zero_reports(p_limit integer default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public
as $function$
declare bounded integer:=case when p_limit is null then null else least(greatest(p_limit,1),10000) end;payload jsonb;
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then
    raise exception using errcode='42501',message='REPORT_ACCESS_REQUIRED';end if;
  select jsonb_build_object('count',count(*),'reports',coalesce(jsonb_agg(row_data.payload order by row_data.id desc),'[]'::jsonb)) into payload
  from (
    select r.id,jsonb_build_object(
      'id',r.id,'name',public._outpost_zero_report_public_name(r.name,r.reporter_user_id),
      'message',public._outpost_zero_redact_report_text(r.message),'created_at',r.created_at,
      'meta',public._outpost_zero_sanitized_report_meta(r.meta),'resolved',r.resolved
    ) payload
    from public.reports r where r.game='outpost-zero' and not r.resolved order by r.id desc limit bounded
  ) row_data;
  return payload;
end;
$function$;


-- Realtime publishes only a per-recipient revision hint, never a report row.
-- The UUID in each row is visible solely to that same signed-in account.
create table if not exists public.outpost_zero_report_wakeups(
  recipient_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check(revision>0),
  updated_at timestamptz not null default clock_timestamp()
);

create or replace function public._outpost_zero_wake_report_reviewers()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare v_relevant boolean:=false;
begin
  if tg_op='INSERT' then
    select exists(select 1 from outpost_zero_report_new_rows r where r.game='outpost-zero') into v_relevant;
  elsif tg_op='UPDATE' then
    select exists(
      select 1 from outpost_zero_report_new_rows n join outpost_zero_report_old_rows o using(id)
      where n.game='outpost-zero' and n.resolved is distinct from o.resolved
    ) into v_relevant;
  end if;
  if not v_relevant then return null;end if;
  insert into public.outpost_zero_report_wakeups as wake(recipient_id,revision,updated_at)
  select recipient_id,1,clock_timestamp()
  from (
    select public._outpost_zero_creator_user_id() recipient_id
    union
    select u.id from public.admins a join auth.users u on lower(btrim(u.email))=lower(btrim(a.email))
    where lower(btrim(coalesce(a.role,'')))='main'
  ) reviewers where recipient_id is not null
  on conflict(recipient_id) do update set revision=wake.revision+1,updated_at=excluded.updated_at;
  return null;
end;
$function$;
drop trigger if exists outpost_zero_report_wakeup_trigger on public.reports;
drop trigger if exists outpost_zero_report_insert_wakeup_trigger on public.reports;
drop trigger if exists outpost_zero_report_update_wakeup_trigger on public.reports;
create trigger outpost_zero_report_insert_wakeup_trigger after insert on public.reports
referencing new table as outpost_zero_report_new_rows for each statement
execute function public._outpost_zero_wake_report_reviewers();
create trigger outpost_zero_report_update_wakeup_trigger after update on public.reports
referencing old table as outpost_zero_report_old_rows new table as outpost_zero_report_new_rows for each statement
execute function public._outpost_zero_wake_report_reviewers();

alter table public.outpost_zero_admin_msg_wakeups replica identity full;
alter table public.outpost_zero_report_wakeups replica identity full;
do $realtime$
begin
  if exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='admin_msgs') then
    execute 'alter publication supabase_realtime drop table public.admin_msgs';
  end if;
  if exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reports') then
    execute 'alter publication supabase_realtime drop table public.reports';
  end if;
  if exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='outpost_zero_notifications') then
    execute 'alter publication supabase_realtime drop table public.outpost_zero_notifications';
  end if;
  if exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='outpost_zero_notification_reads') then
    execute 'alter publication supabase_realtime drop table public.outpost_zero_notification_reads';
  end if;
  begin execute 'alter publication supabase_realtime add table public.outpost_zero_admin_msg_wakeups';
  exception when duplicate_object then null;end;
  begin execute 'alter publication supabase_realtime add table public.outpost_zero_report_wakeups';
  exception when duplicate_object then null;end;
end;
$realtime$;

-- Admin Inbox owns its own yearly retention. Messages appear in Archive after
-- a manual archive or seven days after being read, and are physically removed
-- only after they are at least one year old. Unread messages are never purged.
-- A named pg_cron schedule updates the legacy Maintenance job in place.
do $admin_inbox_retention$
declare v_job_id bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    v_job_id := cron.schedule(
      'purge-old-admin-msgs',
      '0 3 1 1 *',
      $cron$delete from public.admin_msgs
        where created_at < clock_timestamp() - interval '1 year'
          and (archived or (read and read_at is not null
            and read_at <= clock_timestamp() - interval '7 days'))$cron$
    );
    if to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is not null then
      perform cron.alter_job(v_job_id, active => true);
    end if;
  end if;
end;
$admin_inbox_retention$;

-- Make the newly installed Inbox/Reports RPC signatures visible immediately.
-- This NOTIFY is transactional, so a failed Admin 03 run cannot advertise a
-- partial schema to PostgREST.
notify pgrst, 'reload schema';

select public._outpost_zero_apply_admin_security('Admin 03');
commit;
