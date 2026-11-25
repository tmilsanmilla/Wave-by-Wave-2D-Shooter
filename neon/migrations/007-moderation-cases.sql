-- Outpost Zero only. Apply after the existing Admin 01–04 sections.
-- No identity/role grants, historical deletion, extension install or job registration.
begin;
set local lock_timeout = '4s';
set local statement_timeout = '20s';

alter table public.reports add column if not exists resolved_at timestamptz;
alter table public.ban_appeals add column if not exists decided_at timestamptz,
  add column if not exists appealed_ban_id bigint;
create index if not exists outpost_zero_report_retention_idx on public.reports(resolved_at)
  where game='outpost-zero' and resolved and resolved_at is not null;
create index if not exists outpost_zero_appeal_retention_idx on public.ban_appeals(decided_at)
  where status in ('lifted','denied') and decided_at is not null;

-- Cover old clients and both single/bulk resolution. Never guess the age of
-- legacy resolved rows. The audit keeps case IDs/outcomes, not case text.
create or replace function public._oz_stamp_report_resolution()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.game <> 'outpost-zero' then return new; end if;
  if tg_op='INSERT' then
    if char_length(new.message)>(case when new.meta ? 'reported_username' then 500
                                     when new.meta ? 'structured_v1' then 629 else 300 end) then
      raise exception using errcode='22023',message='REPORT_MESSAGE_LENGTH';
    end if;
    new.resolved_at:=null;
  elsif new.resolved and not old.resolved then
    new.resolved_at:=clock_timestamp();
    if auth.uid() is not null then
      perform public._outpost_zero_write_admin_audit(null,'report.resolve','applied',
        jsonb_build_object('report_id',new.id),null);
    end if;
  elsif new.resolved then new.resolved_at:=old.resolved_at;
  else new.resolved_at:=null;
  end if;
  return new;
end $$;
revoke all on function public._oz_stamp_report_resolution() from public,anonymous,authenticated;
drop trigger if exists oz_stamp_report_resolution on public.reports;
create trigger oz_stamp_report_resolution before insert or update on public.reports
  for each row execute function public._oz_stamp_report_resolution();

create or replace function public.submit_outpost_zero_moderation_report(
  p_kind text,p_problem text,p_suggested_fix text default null,p_reported_username text default null
) returns bigint language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  actor uuid:=auth.uid(); reporter text; target_id uuid; target_name text; report bigint;
  problem text:=btrim(coalesce(p_problem,'')); fix text:=btrim(coalesce(p_suggested_fix,''));
begin
  if actor is null then raise exception using errcode='42501',message='REPORT_SIGN_IN_REQUIRED'; end if;
  select s.handle into reporter from public.social_profiles s where s.user_id=actor;
  if reporter is null or reporter !~ '^[A-Za-z0-9_]{3,32}$' then
    raise exception using errcode='22023',message='REPORT_USERNAME_REQUIRED';
  end if;
  if p_kind is null or p_kind not in ('player','bug','suggestion') or
     char_length(problem) not between 1 and (case when p_kind='player' then 500 else 300 end) or
     char_length(fix)>300 or (p_kind='player' and fix<>'') then
    raise exception using errcode='22023',message='REPORT_MESSAGE_LENGTH';
  end if;
  if p_kind='player' then
    select s.user_id,s.handle into target_id,target_name from public.social_profiles s
    where s.handle_key=lower(btrim(p_reported_username)) and s.handle ~ '^[A-Za-z0-9_]{3,32}$';
    if target_id is null or target_id=actor then
      raise exception using errcode='22023',message='REPORTED_USERNAME_NOT_FOUND';
    end if;
  elsif p_reported_username is not null then
    raise exception using errcode='22023',message='REPORT_CONTEXT_INVALID';
  end if;

  if coalesce(public._outpost_zero_staff_role(),'') not in ('creator','main','co','tester') then
    perform pg_advisory_xact_lock(hashtext('outpost-zero-report:'||actor::text)::bigint);
    if exists(select 1 from public.reports r where r.game='outpost-zero' and r.reporter_user_id=actor
        and r.created_at>clock_timestamp()-interval '30 seconds') then
      raise exception using errcode='P0001',message='REPORT_RATE_LIMIT';
    end if;
  end if;
  -- Existing list/export redacts this text and does not expose target_user_id.
  insert into public.reports(game,name,message,meta,resolved,reporter_user_id,created_at)
  values('outpost-zero',reporter,
    case when p_kind='player' then problem
      else (case when p_kind='bug' then 'Bug: ' else 'Suggestion: ' end)||problem
        ||case when fix='' then '' else E'\nSuggested fix: '||fix end end,
    jsonb_strip_nulls(jsonb_build_object('category',case when p_kind='suggestion' then 'general' else p_kind end,
      'reported_username',target_name,'target_user_id',target_id,'structured_v1',true)),
    false,actor,clock_timestamp()) returning id into report;
  return report;
end $$;
revoke all on function public.submit_outpost_zero_moderation_report(text,text,text,text) from public,anonymous,authenticated;
grant execute on function public.submit_outpost_zero_moderation_report(text,text,text,text) to authenticated;

-- The existing appeal submission RPC authenticates requester_user_id. Pin
-- new cases to one exact active ban on that immutable account, never email.
-- Unbound legacy/device-only cases remain reviewable but cannot auto-lift.
create or replace function public._oz_stamp_appeal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='INSERT' then
    select b.id into new.appealed_ban_id from public.bans b
      where b.user_id=new.requester_user_id and (b.until is null or b.until>clock_timestamp())
      order by b.id desc limit 1;
    new.decided_at:=null;
  elsif old.status='open' and new.status in ('lifted','denied') then
    new.decided_at:=clock_timestamp();
  else new.decided_at:=old.decided_at;
  end if;
  return new;
end $$;
revoke all on function public._oz_stamp_appeal() from public,anonymous,authenticated;
drop trigger if exists oz_stamp_appeal on public.ban_appeals;
create trigger oz_stamp_appeal before insert or update of status on public.ban_appeals
  for each row execute function public._oz_stamp_appeal();

create or replace function public.resolve_outpost_zero_ban_appeal(
  p_appeal_id bigint,p_decision text,p_operation_id uuid
) returns table(accepted boolean,appeal_id bigint,status text,reason text)
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  actor uuid:=auth.uid(); item public.ban_appeals%rowtype; prior public.outpost_zero_admin_audit%rowtype;
  decision text:=lower(btrim(coalesce(p_decision,''))); outcome text;
begin
  if actor is null or public._outpost_zero_is_admin_main() is not true then
    raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';
  end if;
  if p_appeal_id is null or p_operation_id is null or decision not in ('lift','deny') then
    raise exception using errcode='22023',message='INVALID_APPEAL_DECISION';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-appeal-review:'||actor::text||':'||p_operation_id::text,0));
  select a.* into prior from public.outpost_zero_admin_audit a
    where a.actor_user_id=actor and a.operation_id=p_operation_id;
  if found then
    if prior.details->>'operation'='ban_appeal_resolve' and prior.details->>'appeal_id'=p_appeal_id::text
        and prior.details->>'decision'=decision then
      return query select coalesce((prior.details->>'accepted')::boolean,false),
        p_appeal_id,prior.details->>'status',prior.details->>'reason';
    else return query select false,p_appeal_id,'unknown'::text,'operation_conflict'::text;
    end if;
    return;
  end if;
  select a.* into item from public.ban_appeals a where a.id=p_appeal_id for update;
  if not found then return query select false,p_appeal_id,'unknown'::text,'appeal_not_found'::text;return;end if;
  if item.status<>'open' then return query select false,item.id,item.status,'already_decided'::text;return;end if;
  if decision='lift' then
    -- One statement verifies the immutable owner and deletes just this ban.
    delete from public.bans b where b.id=item.appealed_ban_id and b.user_id=item.requester_user_id;
    if not found then
      perform public._outpost_zero_write_admin_audit(item.requester_user_id,'ban_appeal.lift','rejected',
        jsonb_build_object('operation','ban_appeal_resolve','appeal_id',item.id,'decision',decision,
          'accepted',false,'status','open','reason','ban_not_bound_or_replaced'),p_operation_id);
      return query select false,item.id,'open'::text,'ban_not_bound_or_replaced'::text;return;
    end if;
  end if;
  outcome:=case when decision='lift' then 'lifted' else 'denied' end;
  update public.ban_appeals a set status=outcome,decided_by=(select lower(btrim(u.email)) from auth.users u where u.id=actor)
    where a.id=item.id;
  perform public._outpost_zero_write_admin_audit(item.requester_user_id,'ban_appeal.'||decision,'applied',
    jsonb_build_object('operation','ban_appeal_resolve','appeal_id',item.id,'decision',decision,
      'accepted',true,'status',outcome,'reason',outcome,'ban_id',item.appealed_ban_id),p_operation_id);
  return query select true,item.id,outcome,outcome;
end $$;
revoke all on function public.resolve_outpost_zero_ban_appeal(bigint,text,uuid) from public,anonymous,authenticated;
grant execute on function public.resolve_outpost_zero_ban_appeal(bigint,text,uuid) to authenticated;

create or replace function public.list_my_outpost_zero_appeals()
returns table(id bigint,status text,created_at timestamptz,decided_at timestamptz)
language sql stable security definer set search_path=pg_catalog,public as $$
  select a.id,a.status,a.created_at,a.decided_at from public.ban_appeals a
  where auth.uid() is not null and a.requester_user_id=auth.uid()
  order by a.id desc limit 20
$$;
revoke all on function public.list_my_outpost_zero_appeals() from public,anonymous,authenticated;
grant execute on function public.list_my_outpost_zero_appeals() to authenticated;

create or replace function public.list_outpost_zero_moderation_appeals(p_resolved boolean,p_limit integer default 100)
returns table(id bigint,player_username text,message text,status text,created_at timestamptz,decided_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null or public._outpost_zero_is_admin_main() is not true then
    raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';
  end if;
  return query select a.id,coalesce(public._outpost_zero_admin_identity_label(a.requester_user_id),'UNKNOWN PLAYER'),
    public._outpost_zero_redact_report_text(a.message),a.status,a.created_at,a.decided_at
  from public.ban_appeals a where (a.status<>'open')=coalesce(p_resolved,false)
  order by a.id desc limit least(greatest(coalesce(p_limit,100),1),100);
end $$;
revoke all on function public.list_outpost_zero_moderation_appeals(boolean,integer) from public,anonymous,authenticated;
grant execute on function public.list_outpost_zero_moderation_appeals(boolean,integer) to authenticated;

-- Intentionally not registered with a scheduler. Run from an approved UTC
-- scheduler using the owner (never from Data API): 0 0 * * 1.
create or replace function public._oz_prune_closed_moderation()
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  tick timestamptz:=statement_timestamp();
  monday timestamptz:=date_trunc('week',tick at time zone 'UTC') at time zone 'UTC';
  reports_removed integer; appeals_removed integer;
begin
  if tick>=monday+interval '1 hour' then
    raise exception using errcode='22023',message='MODERATION_CLEANUP_MONDAY_UTC_WINDOW_REQUIRED';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('oz-moderation-retention',0)) then
    return jsonb_build_object('busy',true);
  end if;
  delete from public.reports r where r.game='outpost-zero' and r.resolved and r.resolved_at<monday-interval '7 days';
  get diagnostics reports_removed=row_count;
  delete from public.ban_appeals a where a.status in ('lifted','denied') and a.decided_at<monday-interval '14 days';
  get diagnostics appeals_removed=row_count;
  return jsonb_build_object('reports_removed',reports_removed,'appeals_removed',appeals_removed,'cutoff_monday',monday);
end $$;
revoke all on function public._oz_prune_closed_moderation() from public,anonymous,authenticated;

commit;
