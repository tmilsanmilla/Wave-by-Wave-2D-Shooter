-- MULTI DEVICE 02 RANKED. Run after 01, then Security 03.
-- BETA: ALL registered members must independently report the same result.
-- PostgreSQL protects identities, ratings, and retries; browsers still simulate
-- the match. Collusion and refusing to confirm a loss are not solved by SQL.
begin;
create table if not exists public.outpost_zero_ranked_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check(mode in ('1v1','2v2')),
  elo integer not null default 1000 check(elo>=0),
  wins bigint not null default 0 check(wins>=0),
  losses bigint not null default 0 check(losses>=0),
  revision bigint not null default 0 check(revision>=0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(user_id,mode)
);
create table if not exists public.outpost_zero_ranked_reports (
  match_id uuid not null,
  user_id uuid not null,
  winning_team text not null check(winning_team in ('A','B')),
  score_a smallint not null check(score_a between 0 and 5),
  score_b smallint not null check(score_b between 0 and 5),
  created_at timestamptz not null default clock_timestamp(),
  primary key(match_id,user_id),
  foreign key(match_id,user_id) references public.outpost_zero_duel_members(match_id,user_id),
  check((winning_team='A' and score_a=5 and score_b<5) or (winning_team='B' and score_b=5 and score_a<5))
);
create table if not exists public.outpost_zero_ranked_rating_changes (
  match_id uuid not null,
  user_id uuid not null,
  mode text not null check(mode in ('1v1','2v2')),
  before_elo integer not null,
  delta integer not null,
  after_elo integer not null check(after_elo>=0 and after_elo=before_elo+delta),
  created_at timestamptz not null default clock_timestamp(),
  primary key(match_id,user_id),
  foreign key(match_id,user_id) references public.outpost_zero_duel_members(match_id,user_id)
);
alter table public.outpost_zero_ranked_ratings enable row level security;
alter table public.outpost_zero_ranked_ratings force row level security;
alter table public.outpost_zero_ranked_reports enable row level security;
alter table public.outpost_zero_ranked_reports force row level security;
alter table public.outpost_zero_ranked_rating_changes enable row level security;
alter table public.outpost_zero_ranked_rating_changes force row level security;
revoke all on table public.outpost_zero_ranked_ratings,public.outpost_zero_ranked_reports,
  public.outpost_zero_ranked_rating_changes from public,anon,authenticated;

create or replace function public._outpost_zero_rank_name(p_elo integer)
returns text language sql immutable set search_path=pg_catalog,public as $$
  select case when p_elo<900 then 'BRONZE' when p_elo<1200 then 'SILVER'
    when p_elo<1500 then 'GOLD' when p_elo<1800 then 'PLATINUM'
    when p_elo<2100 then 'DIAMOND' else 'MASTER' end
$$;

create or replace function public._outpost_zero_ranked_result(p_match_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('status',case when m.status='active' then 'pending' else m.status end,
    'matchId',m.match_id,'reports',(select count(*) from public.outpost_zero_ranked_reports r where r.match_id=m.match_id),
    'required',case when m.mode='2v2' then 4 else 2 end,'ratings',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.user_id,'mode',c.mode,'elo',c.after_elo,
        'rank',public._outpost_zero_rank_name(c.after_elo),'delta',c.delta) order by c.user_id)
      from public.outpost_zero_ranked_rating_changes c where c.match_id=m.match_id),'[]'::jsonb))
  from public.outpost_zero_duel_matches m where m.match_id=p_match_id
$$;

create or replace function public.submit_outpost_zero_ranked_result(
  p_match_id uuid,p_winning_team text,p_score_a integer,p_score_b integer
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=public._outpost_zero_duel_actor(); m public.outpost_zero_duel_matches%rowtype;
  prior public.outpost_zero_ranked_reports%rowtype; member record; needed integer; reported integer;
  average_a numeric; average_b numeric; team_a_delta integer; change_value integer; after_value integer;
begin
  if p_match_id is null or p_winning_team is null or p_winning_team not in ('A','B')
    or p_score_a is null or p_score_b is null or p_score_a not between 0 and 5 or p_score_b not between 0 and 5
    or not((p_winning_team='A' and p_score_a=5 and p_score_b<5) or (p_winning_team='B' and p_score_b=5 and p_score_a<5)) then
    raise exception 'INVALID_RANKED_RESULT' using errcode='22023';
  end if;
  perform public._outpost_zero_duel_lock(); perform public._outpost_zero_duel_expire();
  select * into m from public.outpost_zero_duel_matches where match_id=p_match_id for update;
  if not found or not m.ranked or m.source<>'queue' or m.mode not in ('1v1','2v2') then
    raise exception 'NOT_A_RANKED_MATCH' using errcode='42501';
  end if;
  if not exists(select 1 from public.outpost_zero_duel_members where match_id=p_match_id and user_id=actor and accepted_at is not null) then
    raise exception 'NOT_A_MATCH_MEMBER' using errcode='42501';
  end if;
  select * into prior from public.outpost_zero_ranked_reports where match_id=p_match_id and user_id=actor;
  if found then
    if prior.winning_team<>p_winning_team or prior.score_a<>p_score_a or prior.score_b<>p_score_b then
      raise exception 'RESULT_REPORT_IS_IMMUTABLE' using errcode='22023';
    end if;
    return public._outpost_zero_ranked_result(p_match_id);
  end if;
  if m.status<>'active' then return public._outpost_zero_ranked_result(p_match_id); end if;
  if m.started_at is null or clock_timestamp()<m.started_at+interval '15 seconds' then raise exception 'MATCH_NOT_FINISHED'; end if;
  needed:=case when m.mode='2v2' then 4 else 2 end;
  if (select count(*) from public.outpost_zero_duel_members where match_id=p_match_id and accepted_at is not null)<>needed
    or (select count(*) from public.outpost_zero_duel_members where match_id=p_match_id and team='A')<>needed/2
    or (select count(*) from public.outpost_zero_duel_members where match_id=p_match_id and team='B')<>needed/2
    or exists(select 1 from public.outpost_zero_duel_members d left join auth.users u on u.id=d.user_id where d.match_id=p_match_id and u.id is null) then
    raise exception 'INVALID_RANKED_ROSTER';
  end if;
  insert into public.outpost_zero_ranked_reports(match_id,user_id,winning_team,score_a,score_b)
  values(p_match_id,actor,p_winning_team,p_score_a,p_score_b);
  update public.outpost_zero_duel_matches set expires_at=least(expires_at,clock_timestamp()+interval '5 minutes') where match_id=p_match_id;
  if (select count(distinct (winning_team,score_a,score_b)) from public.outpost_zero_ranked_reports where match_id=p_match_id)>1 then
    update public.outpost_zero_duel_matches set status='disputed',finished_at=clock_timestamp() where match_id=p_match_id;
    delete from public.outpost_zero_duel_queue where match_id=p_match_id;
    perform public._outpost_zero_duel_wake(p_match_id);
    return public._outpost_zero_ranked_result(p_match_id);
  end if;
  select count(*) into reported from public.outpost_zero_ranked_reports where match_id=p_match_id;
  if reported<needed then
    perform public._outpost_zero_duel_wake(p_match_id);
    return public._outpost_zero_ranked_result(p_match_id);
  end if;

  insert into public.outpost_zero_ranked_ratings(user_id,mode)
  select user_id,m.mode from public.outpost_zero_duel_members where match_id=p_match_id on conflict do nothing;
  -- Lock accounts in a stable order. The immutable per-match ledger and final
  -- match state commit in the same transaction as every rating adjustment.
  perform 1 from public.outpost_zero_ranked_ratings r join public.outpost_zero_duel_members d on d.user_id=r.user_id
    where d.match_id=p_match_id and r.mode=m.mode order by r.user_id for update of r;
  select avg(r.elo) filter(where d.team='A'),avg(r.elo) filter(where d.team='B') into average_a,average_b
  from public.outpost_zero_ranked_ratings r join public.outpost_zero_duel_members d on d.user_id=r.user_id
  where d.match_id=p_match_id and r.mode=m.mode;
  team_a_delta:=round(32*((case when p_winning_team='A' then 1 else 0 end)
    -1/(1+power(10::numeric,(average_b-average_a)/400))))::integer;
  for member in select d.user_id,d.team,r.elo from public.outpost_zero_duel_members d
    join public.outpost_zero_ranked_ratings r on r.user_id=d.user_id and r.mode=m.mode
    where d.match_id=p_match_id order by d.user_id loop
    after_value:=greatest(0,member.elo+case when member.team='A' then team_a_delta else -team_a_delta end);
    change_value:=after_value-member.elo;
    insert into public.outpost_zero_ranked_rating_changes(match_id,user_id,mode,before_elo,delta,after_elo)
    values(p_match_id,member.user_id,m.mode,member.elo,change_value,after_value);
    update public.outpost_zero_ranked_ratings set elo=after_value,
      wins=wins+case when member.team=p_winning_team then 1 else 0 end,
      losses=losses+case when member.team=p_winning_team then 0 else 1 end,
      revision=revision+1,updated_at=clock_timestamp() where user_id=member.user_id and mode=m.mode;
  end loop;
  update public.outpost_zero_duel_matches set status='finalized',finished_at=clock_timestamp() where match_id=p_match_id;
  delete from public.outpost_zero_duel_queue where match_id=p_match_id;
  perform public._outpost_zero_duel_wake(p_match_id);
  return public._outpost_zero_ranked_result(p_match_id);
end $$;

create or replace function public.get_outpost_zero_ranked_profile()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
  if actor is null then raise exception 'SIGN_IN_REQUIRED' using errcode='42501'; end if;
  select jsonb_object_agg(case modes.mode when '1v1' then 'one' else 'two' end,
    jsonb_build_object('mode',modes.mode,'elo',coalesce(r.elo,1000),'rank',public._outpost_zero_rank_name(coalesce(r.elo,1000)),
      'wins',coalesce(r.wins,0),'losses',coalesce(r.losses,0),'matches',coalesce(r.wins+r.losses,0))) into result
  from (values('1v1'),('2v2')) modes(mode)
  left join public.outpost_zero_ranked_ratings r on r.mode=modes.mode and r.user_id=actor;
  return result;
end $$;

create or replace function public.list_outpost_zero_ranked_leaderboard(p_mode text,p_limit integer default 50)
returns table(user_id uuid,username text,elo integer,rank text,wins bigint,losses bigint,matches bigint)
language sql stable security definer set search_path=pg_catalog,public as $$
  select r.user_id,case when sp.handle ~ '^[A-Za-z0-9_]{3,32}$' and lower(sp.handle) not in ('username_not_set','usernamenotset',
      'op_'||left(replace(r.user_id::text,'-',''),20),'op_'||left(replace(r.user_id::text,'-',''),8))
    then sp.handle else 'USERNAME_NOT_SET' end,
    r.elo,public._outpost_zero_rank_name(r.elo),r.wins,r.losses,r.wins+r.losses
  from public.outpost_zero_ranked_ratings r left join public.social_profiles sp using(user_id)
  where p_mode in ('1v1','2v2') and r.mode=p_mode and r.wins+r.losses>0
  order by r.elo desc,r.wins desc,r.user_id limit least(100,greatest(1,coalesce(p_limit,50)))
$$;
revoke all on function public._outpost_zero_rank_name(integer),public._outpost_zero_ranked_result(uuid),
  public.submit_outpost_zero_ranked_result(uuid,text,integer,integer),public.get_outpost_zero_ranked_profile(),
  public.list_outpost_zero_ranked_leaderboard(text,integer) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
