-- OUTPOST ZERO / SOCIAL / 07: PUBLIC PARTY DIRECTORY + HOST APPROVAL
-- Run after Social 01. Social 06 is recommended for the matching invite UI.
-- Safe to rerun. Raw party codes, join tokens, Auth UUIDs, and requests are
-- never readable through the browser tables.

begin;

do $preflight$
begin
  if to_regclass('public.social_profiles') is null then
    raise exception 'Social 07 requires Social 01 (social_profiles)';
  end if;
end;
$preflight$;

create table if not exists public.outpost_zero_public_parties (
  party_id uuid primary key default gen_random_uuid(),
  host_id uuid not null unique references auth.users(id) on delete cascade,
  party_code text not null,
  member_count smallint not null default 1,
  capacity smallint not null default 4,
  created_at timestamptz not null default statement_timestamp(),
  heartbeat_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp() + interval '75 seconds',
  constraint outpost_zero_public_party_code check (party_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  constraint outpost_zero_public_party_size check (capacity between 2 and 4 and member_count between 1 and capacity),
  constraint outpost_zero_public_party_expiry check (expires_at > heartbeat_at and expires_at <= heartbeat_at + interval '90 seconds')
);

create table if not exists public.outpost_zero_public_party_requests (
  request_id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.outpost_zero_public_parties(party_id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_username_at_request text not null,
  operation_id uuid not null,
  status text not null default 'pending',
  created_at timestamptz not null default statement_timestamp(),
  decided_at timestamptz,
  join_token text,
  join_expires_at timestamptz,
  constraint outpost_zero_public_party_request_username check (requester_username_at_request ~ '^[A-Za-z0-9_]{3,32}$'),
  constraint outpost_zero_public_party_request_status check (status in ('pending','accepted','declined')),
  constraint outpost_zero_public_party_request_token check (
    (status = 'accepted' and join_token ~ '^[A-Za-z0-9_-]{20,64}$' and join_expires_at is not null)
    or (status <> 'accepted' and join_token is null and join_expires_at is null)
  ),
  constraint outpost_zero_public_party_request_pair unique (party_id, requester_id),
  constraint outpost_zero_public_party_request_operation unique (requester_id, operation_id)
);

create index if not exists outpost_zero_public_parties_expiry_idx
  on public.outpost_zero_public_parties(expires_at desc, created_at desc);
create index if not exists outpost_zero_public_party_requests_host_idx
  on public.outpost_zero_public_party_requests(party_id, status, created_at);
create index if not exists outpost_zero_public_party_requests_requester_idx
  on public.outpost_zero_public_party_requests(requester_id, created_at desc);

alter table public.outpost_zero_public_parties enable row level security;
alter table public.outpost_zero_public_parties force row level security;
alter table public.outpost_zero_public_party_requests enable row level security;
alter table public.outpost_zero_public_party_requests force row level security;
revoke all on table public.outpost_zero_public_parties from public, anon, authenticated;
revoke all on table public.outpost_zero_public_party_requests from public, anon, authenticated;

create or replace function public.publish_outpost_zero_public_party(
  p_party_code text,
  p_member_count integer default 1,
  p_capacity integer default 4
)
returns table(party_id uuid, expires_at timestamptz, server_now timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  actor uuid := auth.uid();
  clock_now timestamptz := statement_timestamp();
  clean_code text := upper(btrim(coalesce(p_party_code,'')));
  clean_count integer := least(greatest(coalesce(p_member_count,1),1),4);
  clean_capacity integer := least(greatest(coalesce(p_capacity,4),2),4);
  username text;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if clean_code !~ '^[A-HJ-NP-Z2-9]{6}$' then raise exception using errcode='22023',message='INVALID_PARTY_CODE'; end if;
  clean_count := least(clean_count,clean_capacity);
  select sp.handle into username from public.social_profiles sp where sp.user_id=actor;
  if username is null or username !~ '^[A-Za-z0-9_]{3,32}$' then
    raise exception using errcode='22023',message='USERNAME_REQUIRED';
  end if;
  delete from public.outpost_zero_public_parties p where p.expires_at <= clock_now;
  insert into public.outpost_zero_public_parties(host_id,party_code,member_count,capacity,created_at,heartbeat_at,expires_at)
  values(actor,clean_code,clean_count,clean_capacity,clock_now,clock_now,clock_now+interval '75 seconds')
  on conflict(host_id) do update set
    party_code=excluded.party_code,member_count=excluded.member_count,capacity=excluded.capacity,
    heartbeat_at=excluded.heartbeat_at,expires_at=excluded.expires_at
  returning outpost_zero_public_parties.party_id,outpost_zero_public_parties.expires_at,clock_now
  into party_id,expires_at,server_now;
  return next;
end;
$function$;

drop function if exists public.close_outpost_zero_public_party();
create or replace function public.close_outpost_zero_public_party(p_party_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare affected integer;
begin
  if auth.uid() is null then return false; end if;
  delete from public.outpost_zero_public_parties p where p.host_id=auth.uid() and p.party_id=p_party_id;
  get diagnostics affected = row_count;
  return affected>0;
end;
$function$;

create or replace function public.list_outpost_zero_public_parties(p_limit integer default 20)
returns table(
  party_id uuid,
  host_username text,
  member_count integer,
  capacity integer,
  created_at timestamptz,
  request_status text,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor uuid := auth.uid();clock_now timestamptz := statement_timestamp();
begin
  delete from public.outpost_zero_public_parties p where p.expires_at<=clock_now;
  return query
  select p.party_id,sp.handle::text,p.member_count::integer,p.capacity::integer,p.created_at,
    case when p.host_id=actor then 'host'::text else r.status::text end,clock_now
  from public.outpost_zero_public_parties p
  join public.social_profiles sp on sp.user_id=p.host_id
  left join public.outpost_zero_public_party_requests r on r.party_id=p.party_id and r.requester_id=actor
  where p.expires_at>clock_now and p.member_count<p.capacity
  order by p.created_at desc,p.party_id
  limit least(greatest(coalesce(p_limit,20),1),40);
end;
$function$;

create or replace function public.request_outpost_zero_public_party(
  p_party_id uuid,
  p_operation_id uuid
)
returns table(accepted boolean, request_id uuid, status text, reason text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  actor uuid:=auth.uid();clock_now timestamptz:=statement_timestamp();picked public.outpost_zero_public_parties%rowtype;
  username text;existing public.outpost_zero_public_party_requests%rowtype;reserved integer;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_party_id is null or p_operation_id is null then return query select false,null::uuid,'rejected'::text,'INVALID_REQUEST'::text;return;end if;
  select * into picked from public.outpost_zero_public_parties p where p.party_id=p_party_id and p.expires_at>clock_now for update;
  if not found or picked.member_count>=picked.capacity then return query select false,null::uuid,'rejected'::text,'PARTY_UNAVAILABLE'::text;return;end if;
  select count(*)::integer into reserved from public.outpost_zero_public_party_requests r
    where r.party_id=p_party_id and r.status='accepted' and r.join_expires_at>clock_now;
  if picked.member_count+reserved>=picked.capacity then return query select false,null::uuid,'rejected'::text,'PARTY_FULL'::text;return;end if;
  if picked.host_id=actor then return query select false,null::uuid,'rejected'::text,'HOST_CANNOT_REQUEST'::text;return;end if;
  select sp.handle into username from public.social_profiles sp where sp.user_id=actor;
  if username is null or username !~ '^[A-Za-z0-9_]{3,32}$' then raise exception using errcode='22023',message='USERNAME_REQUIRED';end if;
  select * into existing from public.outpost_zero_public_party_requests r where r.requester_id=actor and r.operation_id=p_operation_id;
  if found then
    if existing.party_id=p_party_id then return query select true,existing.request_id,existing.status,'duplicate'::text;
    else return query select false,existing.request_id,existing.status,'OPERATION_CONFLICT'::text;end if;
    return;
  end if;
  insert into public.outpost_zero_public_party_requests(party_id,requester_id,requester_username_at_request,operation_id,status,created_at,decided_at,join_token,join_expires_at)
  values(p_party_id,actor,username,p_operation_id,'pending',clock_now,null,null,null)
  on conflict(party_id,requester_id) do update set requester_username_at_request=excluded.requester_username_at_request,
    operation_id=excluded.operation_id,status='pending',created_at=clock_now,decided_at=null,join_token=null,join_expires_at=null
  returning outpost_zero_public_party_requests.request_id into request_id;
  return query select true,request_id,'pending'::text,'REQUESTED'::text;
end;
$function$;

create or replace function public.list_outpost_zero_public_party_host_requests(p_limit integer default 20)
returns table(request_id uuid,requester_username text,created_at timestamptz,server_now timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor uuid:=auth.uid();clock_now timestamptz:=statement_timestamp();
begin
  if actor is null then return;end if;
  return query select r.request_id,r.requester_username_at_request::text,r.created_at,clock_now
  from public.outpost_zero_public_party_requests r
  join public.outpost_zero_public_parties p on p.party_id=r.party_id
  where p.host_id=actor and p.expires_at>clock_now and r.status='pending'
  order by r.created_at,r.request_id
  limit least(greatest(coalesce(p_limit,20),1),40);
end;
$function$;

create or replace function public.decide_outpost_zero_public_party_request(
  p_request_id uuid,
  p_accept boolean,
  p_join_token text default null
)
returns table(accepted boolean,status text,requester_username text,join_expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  actor uuid:=auth.uid();clock_now timestamptz:=statement_timestamp();picked public.outpost_zero_public_party_requests%rowtype;
  host_party public.outpost_zero_public_parties%rowtype;clean_token text:=btrim(coalesce(p_join_token,''));reserved integer;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
  select r.* into picked from public.outpost_zero_public_party_requests r where r.request_id=p_request_id for update;
  if not found then return query select false,'missing'::text,''::text,null::timestamptz;return;end if;
  select p.* into host_party from public.outpost_zero_public_parties p where p.party_id=picked.party_id and p.host_id=actor and p.expires_at>clock_now for update;
  if not found then raise exception using errcode='42501',message='HOST_ACCESS_REQUIRED';end if;
  if picked.status<>'pending' then return query select true,picked.status,picked.requester_username_at_request,picked.join_expires_at;return;end if;
  if coalesce(p_accept,false) then
    select count(*)::integer into reserved from public.outpost_zero_public_party_requests r
      where r.party_id=host_party.party_id and r.status='accepted' and r.join_expires_at>clock_now;
    if host_party.member_count+reserved>=host_party.capacity then return query select false,'full'::text,picked.requester_username_at_request,null::timestamptz;return;end if;
    if clean_token !~ '^[A-Za-z0-9_-]{20,64}$' then raise exception using errcode='22023',message='INVALID_JOIN_TOKEN';end if;
    update public.outpost_zero_public_party_requests r set status='accepted',decided_at=clock_now,join_token=clean_token,join_expires_at=clock_now+interval '2 minutes'
      where r.request_id=p_request_id returning r.status,r.join_expires_at into status,join_expires_at;
  else
    update public.outpost_zero_public_party_requests r set status='declined',decided_at=clock_now,join_token=null,join_expires_at=null
      where r.request_id=p_request_id returning r.status into status;
    join_expires_at:=null;
  end if;
  accepted:=true;requester_username:=picked.requester_username_at_request;return next;
end;
$function$;

create or replace function public.list_my_outpost_zero_public_party_requests(p_limit integer default 20)
returns table(
  request_id uuid,party_id uuid,host_username text,status text,party_code text,join_token text,
  join_expires_at timestamptz,created_at timestamptz,server_now timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor uuid:=auth.uid();clock_now timestamptz:=statement_timestamp();
begin
  if actor is null then return;end if;
  return query select r.request_id,r.party_id,sp.handle::text,r.status::text,
    case when r.status='accepted' and r.join_expires_at>clock_now then p.party_code else null end,
    case when r.status='accepted' and r.join_expires_at>clock_now then r.join_token else null end,
    r.join_expires_at,r.created_at,clock_now
  from public.outpost_zero_public_party_requests r
  join public.outpost_zero_public_parties p on p.party_id=r.party_id
  join public.social_profiles sp on sp.user_id=p.host_id
  where r.requester_id=actor and p.expires_at>clock_now
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit,20),1),40);
end;
$function$;

revoke all on function public.publish_outpost_zero_public_party(text,integer,integer) from public,anon,authenticated;
revoke all on function public.close_outpost_zero_public_party(uuid) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_public_parties(integer) from public,anon,authenticated;
revoke all on function public.request_outpost_zero_public_party(uuid,uuid) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_public_party_host_requests(integer) from public,anon,authenticated;
revoke all on function public.decide_outpost_zero_public_party_request(uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.list_my_outpost_zero_public_party_requests(integer) from public,anon,authenticated;

grant execute on function public.publish_outpost_zero_public_party(text,integer,integer) to authenticated;
grant execute on function public.close_outpost_zero_public_party(uuid) to authenticated;
grant execute on function public.list_outpost_zero_public_parties(integer) to authenticated;
grant execute on function public.request_outpost_zero_public_party(uuid,uuid) to authenticated;
grant execute on function public.list_outpost_zero_public_party_host_requests(integer) to authenticated;
grant execute on function public.decide_outpost_zero_public_party_request(uuid,boolean,text) to authenticated;
grant execute on function public.list_my_outpost_zero_public_party_requests(integer) to authenticated;

commit;
