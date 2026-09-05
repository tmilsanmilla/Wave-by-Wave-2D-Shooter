-- MULTI DEVICE 01 DUELS. Run after Player 03 and Admin 01; then 02 and 03.
-- Authenticated registration, immutable rosters, explicit party acceptance.
-- Browsers still simulate combat. Registration does not certify a game result.
begin;

create table if not exists public.outpost_zero_duel_matches (
  match_id uuid primary key default gen_random_uuid(),
  mode text not null check(mode in ('1v1','2v2','1v1v1')),
  source text not null check(source in ('queue','party')),
  ranked boolean not null default false,
  host_id uuid not null,
  status text not null default 'pending' check(status in ('pending','active','finalized','disputed','cancelled','expired','finished')),
  created_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  expires_at timestamptz not null,
  finished_at timestamptz,
  check(not ranked or (source='queue' and mode in ('1v1','2v2'))),
  check(mode<>'1v1v1' or source='party')
);
create table if not exists public.outpost_zero_duel_members (
  match_id uuid not null references public.outpost_zero_duel_matches on delete cascade,
  user_id uuid not null,
  slot smallint not null check(slot between 0 and 3),
  team text not null check(team in ('A','B','C')),
  username text not null check(username ~ '^[A-Za-z0-9_]{3,32}$'),
  loadout jsonb,
  accepted_at timestamptz,
  ready_at timestamptz,
  released_at timestamptz,
  primary key(match_id,user_id), unique(match_id,slot)
);
alter table public.outpost_zero_duel_members add column if not exists ready_at timestamptz;
-- A matched slot remains here until settlement/expiry: one active enrollment
-- per account, including across modes and browser tabs.
create table if not exists public.outpost_zero_duel_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null check(mode in ('1v1','2v2','1v1v1')),
  ranked boolean not null,
  loadout jsonb not null,
  joined_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  match_id uuid references public.outpost_zero_duel_matches on delete cascade
);
create index if not exists outpost_zero_duel_queue_order on public.outpost_zero_duel_queue(mode,ranked,joined_at) where match_id is null;
create index if not exists outpost_zero_duel_member_user on public.outpost_zero_duel_members(user_id,match_id);
create table if not exists public.outpost_zero_duel_wakeups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.outpost_zero_duel_matches enable row level security;
alter table public.outpost_zero_duel_matches force row level security;
alter table public.outpost_zero_duel_members enable row level security;
alter table public.outpost_zero_duel_members force row level security;
alter table public.outpost_zero_duel_queue enable row level security;
alter table public.outpost_zero_duel_queue force row level security;
alter table public.outpost_zero_duel_wakeups enable row level security;
alter table public.outpost_zero_duel_wakeups force row level security;
revoke all on table public.outpost_zero_duel_matches,public.outpost_zero_duel_members,
  public.outpost_zero_duel_queue,public.outpost_zero_duel_wakeups from public,anon,authenticated;

create or replace function public._outpost_zero_duel_actor()
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); scopes text[];
begin
  if actor is null then raise exception 'SIGN_IN_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.social_profiles where user_id=actor
    and handle ~ '^[A-Za-z0-9_]{3,32}$' and lower(handle) not in ('username_not_set','usernamenotset',
      'op_'||left(replace(actor::text,'-',''),20),'op_'||left(replace(actor::text,'-',''),8))) then
    raise exception 'CHOOSE_USERNAME_FIRST' using errcode='42501';
  end if;
  if to_regprocedure('public.get_my_outpost_zero_ban(text)') is null then
    raise exception 'Run Admin 01 Admin Menu before multiplayer';
  end if;
  for scopes in execute 'select scopes from public.get_my_outpost_zero_ban('''')' loop
    if scopes && array['account','device','all','game','online','arena','ranked','leaderboard','board'] then
      raise exception 'MULTIPLAYER_BANNED' using errcode='42501';
    end if;
  end loop;
  return actor;
end $$;

create or replace function public._outpost_zero_duel_loadout(p_loadout jsonb,p_ranked boolean)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $$
declare result jsonb:='{}'; slot text; value text;
begin
  if p_loadout is null or jsonb_typeof(p_loadout)<>'object' or octet_length(p_loadout::text)>2048 then
    raise exception 'INVALID_LOADOUT' using errcode='22023';
  end if;
  foreach slot in array array['primary','secondary','melee','utility'] loop
    value:=p_loadout->>slot;
    if slot='utility' and (p_ranked or value is null or value='') then
      result:=result||jsonb_build_object(slot,null); continue;
    end if;
    if jsonb_typeof(p_loadout->slot)<>'string' or value is null or value !~ '^[a-zA-Z0-9_]{1,40}$' then
      raise exception 'INVALID_LOADOUT' using errcode='22023';
    end if;
    result:=result||jsonb_build_object(slot,value);
  end loop;
  return result;
end $$;

create or replace function public._outpost_zero_duel_wake(p_match_id uuid)
returns void language sql security definer set search_path=pg_catalog,public as $$
  insert into public.outpost_zero_duel_wakeups as w(user_id)
  select d.user_id from public.outpost_zero_duel_members d join auth.users u on u.id=d.user_id where d.match_id=p_match_id
  on conflict(user_id) do update set revision=w.revision+1,updated_at=clock_timestamp()
$$;

-- Every enrollment/result writer takes the same short transaction lock. This
-- prevents queue-vs-party and cancellation-vs-matching races across all modes.
create or replace function public._outpost_zero_duel_lock()
returns void language sql volatile set search_path=pg_catalog,public as $$
  select pg_advisory_xact_lock(1948173,1)
$$;

create or replace function public._outpost_zero_duel_expire()
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare expired_id uuid;
begin
  for expired_id in update public.outpost_zero_duel_matches set status='expired',finished_at=clock_timestamp()
    where status in ('pending','active') and expires_at<=clock_timestamp() returning match_id loop
    perform public._outpost_zero_duel_wake(expired_id);
  end loop;
  delete from public.outpost_zero_duel_queue q where
    (q.match_id is null and q.expires_at<=clock_timestamp()) or exists(
      select 1 from public.outpost_zero_duel_matches m where m.match_id=q.match_id
        and m.status not in ('pending','active'));
end $$;

create or replace function public._outpost_zero_duel_snapshot(p_match_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('matchId',m.match_id,'epoch',m.match_id,'hostId',m.host_id,
    'mode',m.mode,'source',m.source,'ranked',m.ranked,'status',m.status,
    'expiresAt',m.expires_at,'startedAt',m.started_at,'roster',coalesce((
      select jsonb_agg(jsonb_build_object('id',d.user_id,'name',d.username,'team',d.team,
        'loadout',d.loadout,'accepted',d.accepted_at is not null,'ready',d.ready_at is not null,'released',d.released_at is not null) order by d.slot)
      from public.outpost_zero_duel_members d where d.match_id=m.match_id),'[]'::jsonb))
  from public.outpost_zero_duel_matches m where m.match_id=p_match_id
$$;

create or replace function public.get_outpost_zero_duel(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=public._outpost_zero_duel_actor(); snapshot jsonb;
begin
  perform public._outpost_zero_duel_lock(); perform public._outpost_zero_duel_expire();
  if not exists(select 1 from public.outpost_zero_duel_members where match_id=p_match_id and user_id=actor) then
    raise exception 'NOT_A_MATCH_MEMBER' using errcode='42501';
  end if;
  snapshot:=public._outpost_zero_duel_snapshot(p_match_id);
  return jsonb_build_object('status',case when snapshot->>'status'='active' or
    (snapshot->>'status'='pending' and not exists(select 1 from public.outpost_zero_duel_members where match_id=p_match_id and accepted_at is null))
    then 'matched' else snapshot->>'status' end,'match',snapshot);
end $$;

create or replace function public.get_outpost_zero_duel_assignment()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=public._outpost_zero_duel_actor(); found_id uuid; snapshot jsonb;
begin
  perform public._outpost_zero_duel_lock(); perform public._outpost_zero_duel_expire();
  select match_id into found_id from public.outpost_zero_duel_queue where user_id=actor;
  if found then
    if found_id is null then
      update public.outpost_zero_duel_queue set expires_at=clock_timestamp()+interval '90 seconds' where user_id=actor;
      return jsonb_build_object('status','waiting');
    end if;
  else
    select m.match_id into found_id from public.outpost_zero_duel_matches m
    join public.outpost_zero_duel_members d using(match_id)
    where d.user_id=actor and d.accepted_at is null and d.released_at is null and m.status='pending'
    order by m.created_at desc,m.match_id limit 1;
  end if;
  if found_id is null then return jsonb_build_object('status','idle'); end if;
  snapshot:=public._outpost_zero_duel_snapshot(found_id);
  return jsonb_build_object('status',case when snapshot->>'status'='active' or
    (snapshot->>'status'='pending' and not exists(select 1 from public.outpost_zero_duel_members where match_id=found_id and accepted_at is null))
    then 'matched' else snapshot->>'status' end,'match',snapshot);
end $$;

create or replace function public.join_outpost_zero_duel_queue(p_mode text,p_ranked boolean,p_loadout jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=public._outpost_zero_duel_actor(); kit jsonb; picked uuid[]; needed integer; match_id_new uuid; item record; slot_no integer:=0;
begin
  if p_mode is null or p_mode not in ('1v1','2v2') or p_ranked is null then raise exception 'INVALID_QUEUE_MODE' using errcode='22023'; end if;
  kit:=public._outpost_zero_duel_loadout(p_loadout,p_ranked);
  perform public._outpost_zero_duel_lock(); perform public._outpost_zero_duel_expire();
  if exists(select 1 from public.outpost_zero_duel_queue where user_id=actor) then
    return public.get_outpost_zero_duel_assignment();
  end if;
  if (select count(*) from public.outpost_zero_duel_members d join public.outpost_zero_duel_matches m using(match_id)
    where d.user_id=actor and d.accepted_at is not null and m.created_at>clock_timestamp()-interval '1 hour')>=30 then
    raise exception 'MATCH_RATE_LIMIT' using errcode='P0001';
  end if;
  insert into public.outpost_zero_duel_queue(user_id,mode,ranked,loadout,expires_at)
  values(actor,p_mode,p_ranked,kit,clock_timestamp()+interval '90 seconds');
  needed:=case when p_mode='2v2' then 4 else 2 end;
  select array_agg(q.user_id order by q.joined_at,q.user_id) into picked from (
    select user_id,joined_at from public.outpost_zero_duel_queue where mode=p_mode and ranked=p_ranked and match_id is null
    order by joined_at,user_id limit needed for update) q;
  if coalesce(cardinality(picked),0)<needed then return jsonb_build_object('status','waiting'); end if;
  insert into public.outpost_zero_duel_matches(mode,source,ranked,host_id,expires_at)
  values(p_mode,'queue',p_ranked,picked[1],clock_timestamp()+interval '90 seconds') returning match_id into match_id_new;
  for item in select q.*,sp.handle from public.outpost_zero_duel_queue q join public.social_profiles sp using(user_id)
    where q.user_id=any(picked) order by q.joined_at,q.user_id loop
    insert into public.outpost_zero_duel_members(match_id,user_id,slot,team,username,loadout,accepted_at)
    values(match_id_new,item.user_id,slot_no,case when slot_no%2=0 then 'A' else 'B' end,item.handle,item.loadout,clock_timestamp());
    slot_no:=slot_no+1;
  end loop;
  if slot_no<>needed then raise exception 'ROSTER_CHANGED_RETRY'; end if;
  update public.outpost_zero_duel_queue set match_id=match_id_new where user_id=any(picked);
  perform public._outpost_zero_duel_wake(match_id_new);
  return public.get_outpost_zero_duel_assignment();
end $$;

create or replace function public.create_outpost_zero_party_duel(p_mode text,p_members uuid[],p_loadout jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=public._outpost_zero_duel_actor(); kit jsonb; required_count integer; new_id uuid; member_id uuid; member_name text; slot_no integer:=0;
begin
  required_count:=case p_mode when '1v1' then 2 when '2v2' then 4 when '1v1v1' then 3 else 0 end;
  if required_count=0 or cardinality(p_members) is distinct from required_count
    or (select count(distinct u) from unnest(p_members) u)<>required_count or not(actor=any(p_members)) then
    raise exception 'INVALID_PARTY_ROSTER' using errcode='22023';
  end if;
  kit:=public._outpost_zero_duel_loadout(p_loadout,false);
  perform public._outpost_zero_duel_lock(); perform public._outpost_zero_duel_expire();
  if exists(select 1 from public.outpost_zero_duel_queue where user_id=actor) then return public.get_outpost_zero_duel_assignment(); end if;
  if exists(select 1 from public.outpost_zero_duel_matches where host_id=actor and source='party' and created_at>clock_timestamp()-interval '30 seconds') then
    raise exception 'PARTY_REQUEST_RATE_LIMIT';
  end if;
  insert into public.outpost_zero_duel_matches(mode,source,ranked,host_id,expires_at)
  values(p_mode,'party',false,actor,clock_timestamp()+interval '90 seconds') returning match_id into new_id;
  foreach member_id in array p_members loop
    select handle into member_name from public.social_profiles where user_id=member_id;
    if member_name is null or not exists(select 1 from auth.users where id=member_id) then raise exception 'INVALID_PARTY_MEMBER'; end if;
    insert into public.outpost_zero_duel_members(match_id,user_id,slot,team,username,loadout,accepted_at)
    values(new_id,member_id,slot_no,case when p_mode='1v1v1' then (array['A','B','C'])[slot_no+1]
      when slot_no%2=0 then 'A' else 'B' end,member_name,
      case when member_id=actor then kit else null end,case when member_id=actor then clock_timestamp() else null end);
    slot_no:=slot_no+1;
  end loop;
  insert into public.outpost_zero_duel_queue(user_id,mode,ranked,loadout,expires_at,match_id)
  values(actor,p_mode,false,kit,clock_timestamp()+interval '90 seconds',new_id);
  perform public._outpost_zero_duel_wake(new_id);
  return public.get_outpost_zero_duel(new_id);
end $$;

create or replace function public.accept_outpost_zero_party_duel(p_match_id uuid,p_loadout jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=public._outpost_zero_duel_actor(); kit jsonb; m public.outpost_zero_duel_matches%rowtype; occupied uuid;
begin
  kit:=public._outpost_zero_duel_loadout(p_loadout,false);
  perform public._outpost_zero_duel_lock(); perform public._outpost_zero_duel_expire();
  select * into m from public.outpost_zero_duel_matches where match_id=p_match_id for update;
  if not found or m.source<>'party' or not exists(select 1 from public.outpost_zero_duel_members
      where match_id=p_match_id and user_id=actor and released_at is null) then raise exception 'NOT_INVITED' using errcode='42501'; end if;
  if m.status not in ('pending','active') then return public.get_outpost_zero_duel(p_match_id); end if;
  if exists(select 1 from public.outpost_zero_duel_members where match_id=p_match_id and user_id=actor and accepted_at is not null) then
    return public.get_outpost_zero_duel(p_match_id);
  end if;
  select match_id into occupied from public.outpost_zero_duel_queue where user_id=actor;
  if found then raise exception 'ALREADY_QUEUED_OR_PLAYING'; end if;
  insert into public.outpost_zero_duel_queue(user_id,mode,ranked,loadout,expires_at,match_id)
  values(actor,m.mode,false,kit,m.expires_at,p_match_id);
  update public.outpost_zero_duel_members set accepted_at=clock_timestamp(),loadout=kit where match_id=p_match_id and user_id=actor;
  perform public._outpost_zero_duel_wake(p_match_id);
  return public.get_outpost_zero_duel_assignment();
end $$;

create or replace function public.acknowledge_outpost_zero_duel_start(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=public._outpost_zero_duel_actor(); m public.outpost_zero_duel_matches%rowtype;
begin
  perform public._outpost_zero_duel_lock(); perform public._outpost_zero_duel_expire();
  select * into m from public.outpost_zero_duel_matches where match_id=p_match_id for update;
  if not found or not exists(select 1 from public.outpost_zero_duel_members where match_id=p_match_id
    and user_id=actor and accepted_at is not null and released_at is null) then
    raise exception 'NOT_AN_ACCEPTED_MEMBER' using errcode='42501';
  end if;
  if m.status<>'pending' then return public.get_outpost_zero_duel(p_match_id); end if;
  if exists(select 1 from public.outpost_zero_duel_members where match_id=p_match_id and accepted_at is null) then
    raise exception 'WAIT_FOR_PARTY_ACCEPTANCE';
  end if;
  update public.outpost_zero_duel_members set ready_at=coalesce(ready_at,clock_timestamp()) where match_id=p_match_id and user_id=actor;
  if not exists(select 1 from public.outpost_zero_duel_members where match_id=p_match_id and ready_at is null) then
    update public.outpost_zero_duel_matches set status='active',started_at=clock_timestamp(),expires_at=clock_timestamp()+interval '45 minutes' where match_id=p_match_id;
  end if;
  perform public._outpost_zero_duel_wake(p_match_id);
  return public.get_outpost_zero_duel(p_match_id);
end $$;

create or replace function public.release_outpost_zero_duel(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); m public.outpost_zero_duel_matches%rowtype; reported boolean:=false;
begin
  if actor is null then raise exception 'SIGN_IN_REQUIRED' using errcode='42501'; end if;
  perform public._outpost_zero_duel_lock(); perform public._outpost_zero_duel_expire();
  select * into m from public.outpost_zero_duel_matches where match_id=p_match_id for update;
  if not found or not exists(select 1 from public.outpost_zero_duel_members where match_id=p_match_id and user_id=actor) then
    raise exception 'NOT_A_MATCH_MEMBER' using errcode='42501';
  end if;
  -- An unconfirmed BETA game can be abandoned without a rating result. Once
  -- anyone reports, preserve a short consensus window before releasing it.
  -- This cannot stop a dishonest loser from refusing/aborting confirmation.
  if m.ranked and m.status='active' and to_regclass('public.outpost_zero_ranked_reports') is not null then
    execute 'select exists(select 1 from public.outpost_zero_ranked_reports where match_id=$1)' into reported using p_match_id;
    if reported then return jsonb_build_object('status','pending','matchId',p_match_id,'expiresAt',m.expires_at); end if;
  end if;
  if m.status='pending' or (m.ranked and m.status='active') then
    update public.outpost_zero_duel_matches set status='cancelled',finished_at=clock_timestamp() where match_id=p_match_id;
    delete from public.outpost_zero_duel_queue where match_id=p_match_id;
  else
    update public.outpost_zero_duel_members set released_at=coalesce(released_at,clock_timestamp()) where match_id=p_match_id and user_id=actor;
    delete from public.outpost_zero_duel_queue where match_id=p_match_id and user_id=actor;
    if m.status='active' and not exists(select 1 from public.outpost_zero_duel_members where match_id=p_match_id and released_at is null) then
      update public.outpost_zero_duel_matches set status='finished',finished_at=clock_timestamp() where match_id=p_match_id;
    end if;
  end if;
  perform public._outpost_zero_duel_wake(p_match_id);
  return jsonb_build_object('status','left','matchId',p_match_id);
end $$;

create or replace function public.abort_outpost_zero_duel_setup(p_match_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog,public as $$
  select public.release_outpost_zero_duel(p_match_id)
$$;

create or replace function public.leave_outpost_zero_duel_queue()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); occupied uuid;
begin
  if actor is null then raise exception 'SIGN_IN_REQUIRED' using errcode='42501'; end if;
  perform public._outpost_zero_duel_lock(); perform public._outpost_zero_duel_expire();
  select match_id into occupied from public.outpost_zero_duel_queue where user_id=actor;
  if occupied is not null then return public.release_outpost_zero_duel(occupied); end if;
  delete from public.outpost_zero_duel_queue where user_id=actor and match_id is null;
  return jsonb_build_object('status','left');
end $$;

-- Helpers and public entry points remain inaccessible until Security 03.
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like '\_outpost\_zero\_duel\_%' escape '\'
      or p.proname in ('get_outpost_zero_duel','get_outpost_zero_duel_assignment','join_outpost_zero_duel_queue',
        'create_outpost_zero_party_duel','accept_outpost_zero_party_duel','acknowledge_outpost_zero_duel_start',
        'release_outpost_zero_duel','abort_outpost_zero_duel_setup','leave_outpost_zero_duel_queue'))
  loop execute format('revoke all on function %s from public,anon,authenticated',f); end loop;
end $$;
notify pgrst,'reload schema';
commit;
