-- OUTPOST ZERO / SOCIAL / 09: UNIQUE PUBLIC PARTY NAMES + SEARCH
-- Run after Social 07. Safe to rerun. Existing public parties receive a
-- temporary unique name; future hosts choose their own unique directory name.

begin;

do $preflight$
begin
  if to_regclass('public.outpost_zero_public_parties') is null then
    raise exception 'Social 09 requires Social 07 (public parties)';
  end if;
end;
$preflight$;

alter table public.outpost_zero_public_parties
  add column if not exists party_name text;

update public.outpost_zero_public_parties as p
set party_name = left(coalesce(nullif(sp.handle,''),'Party'),23)
  || ' ' || left(replace(p.party_id::text,'-',''),8)
from public.social_profiles as sp
where sp.user_id=p.host_id
  and (p.party_name is null or btrim(p.party_name)='');

update public.outpost_zero_public_parties as p
set party_name = 'Party ' || left(replace(p.party_id::text,'-',''),8)
where p.party_name is null or btrim(p.party_name)='';

alter table public.outpost_zero_public_parties
  alter column party_name set not null;
alter table public.outpost_zero_public_parties
  drop constraint if exists outpost_zero_public_party_name;
alter table public.outpost_zero_public_parties
  add constraint outpost_zero_public_party_name
  check (party_name ~ '^[A-Za-z0-9][A-Za-z0-9 _-]{2,31}$');

create unique index if not exists outpost_zero_public_party_name_unique_idx
  on public.outpost_zero_public_parties(lower(btrim(party_name)));

drop function if exists public.publish_outpost_zero_public_party(text,integer,integer);
create or replace function public.publish_outpost_zero_public_party(
  p_party_code text,
  p_party_name text,
  p_member_count integer default 1,
  p_capacity integer default 4
)
returns table(party_id uuid, party_name text, expires_at timestamptz, server_now timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  actor uuid := auth.uid();
  clock_now timestamptz := statement_timestamp();
  clean_code text := upper(btrim(coalesce(p_party_code,'')));
  clean_name text := regexp_replace(btrim(coalesce(p_party_name,'')),'[[:space:]]+',' ','g');
  clean_count integer := least(greatest(coalesce(p_member_count,1),1),4);
  clean_capacity integer := least(greatest(coalesce(p_capacity,4),2),4);
  username text;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if clean_code !~ '^[A-HJ-NP-Z2-9]{6}$' then raise exception using errcode='22023',message='INVALID_PARTY_CODE'; end if;
  if clean_name !~ '^[A-Za-z0-9][A-Za-z0-9 _-]{2,31}$' then raise exception using errcode='22023',message='INVALID_PARTY_NAME'; end if;
  clean_count := least(clean_count,clean_capacity);
  select sp.handle into username from public.social_profiles sp where sp.user_id=actor;
  if username is null or username !~ '^[A-Za-z0-9_]{3,32}$' then
    raise exception using errcode='22023',message='USERNAME_REQUIRED';
  end if;
  delete from public.outpost_zero_public_parties p where p.expires_at <= clock_now;
  begin
    insert into public.outpost_zero_public_parties(host_id,party_code,party_name,member_count,capacity,created_at,heartbeat_at,expires_at)
    values(actor,clean_code,clean_name,clean_count,clean_capacity,clock_now,clock_now,clock_now+interval '75 seconds')
    on conflict(host_id) do update set
      party_code=excluded.party_code,party_name=excluded.party_name,member_count=excluded.member_count,capacity=excluded.capacity,
      heartbeat_at=excluded.heartbeat_at,expires_at=excluded.expires_at
    returning outpost_zero_public_parties.party_id,outpost_zero_public_parties.party_name,
      outpost_zero_public_parties.expires_at,clock_now
    into party_id,party_name,expires_at,server_now;
  exception when unique_violation then
    raise exception using errcode='23505',message='PARTY_NAME_TAKEN';
  end;
  return next;
end;
$function$;

drop function if exists public.list_outpost_zero_public_parties(integer);
create or replace function public.list_outpost_zero_public_parties(
  p_limit integer default 20,
  p_search text default null
)
returns table(
  party_id uuid,
  party_name text,
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
declare
  actor uuid := auth.uid();
  clock_now timestamptz := statement_timestamp();
  search_key text := left(regexp_replace(btrim(coalesce(p_search,'')),'[[:space:]]+',' ','g'),32);
begin
  if search_key <> '' and search_key !~ '^[A-Za-z0-9 _-]{1,32}$' then
    raise exception using errcode='22023',message='INVALID_PARTY_SEARCH';
  end if;
  delete from public.outpost_zero_public_parties p where p.expires_at<=clock_now;
  return query
  select p.party_id,p.party_name::text,sp.handle::text,p.member_count::integer,p.capacity::integer,p.created_at,
    case when p.host_id=actor then 'host'::text else r.status::text end,clock_now
  from public.outpost_zero_public_parties p
  join public.social_profiles sp on sp.user_id=p.host_id
  left join public.outpost_zero_public_party_requests r on r.party_id=p.party_id and r.requester_id=actor
  where p.expires_at>clock_now and p.member_count<p.capacity
    and (search_key='' or p.party_name ilike '%'||search_key||'%' or sp.handle ilike '%'||search_key||'%')
  order by case when search_key<>'' and lower(p.party_name)=lower(search_key) then 0 else 1 end,
    p.created_at desc,p.party_id
  limit least(greatest(coalesce(p_limit,20),1),40);
end;
$function$;

drop function if exists public.list_my_outpost_zero_public_party_requests(integer);
create or replace function public.list_my_outpost_zero_public_party_requests(p_limit integer default 20)
returns table(
  request_id uuid,party_id uuid,party_name text,host_username text,status text,party_code text,join_token text,
  join_expires_at timestamptz,created_at timestamptz,server_now timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor uuid:=auth.uid();clock_now timestamptz:=statement_timestamp();
begin
  if actor is null then return;end if;
  return query select r.request_id,r.party_id,p.party_name::text,sp.handle::text,r.status::text,
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

revoke all on function public.publish_outpost_zero_public_party(text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_public_parties(integer,text) from public,anon,authenticated;
revoke all on function public.list_my_outpost_zero_public_party_requests(integer) from public,anon,authenticated;
grant execute on function public.publish_outpost_zero_public_party(text,text,integer,integer) to authenticated;
grant execute on function public.list_outpost_zero_public_parties(integer,text) to authenticated;
grant execute on function public.list_my_outpost_zero_public_party_requests(integer) to authenticated;

commit;
