-- OUTPOST ZERO / ADMINISTRATION / 05: TESTERS, SUGGESTIONS, DEMOTION + REPORT EXPORT
-- Run after Administration 01, 02, 02B, and 04. Administration 03 (player
-- notification Inbox) is separate and may be run before or after this file.
-- Safe to rerun. Existing admins, messages, reports, and suggestions remain.

begin;

do $preflight$
begin
  if to_regclass('public.admins') is null
     or to_regprocedure('public._outpost_zero_admin_role()') is null
     or to_regprocedure('public._outpost_zero_update_role()') is null then
    raise exception 'Administration 05 requires Administration 01 and 02';
  end if;
  if to_regprocedure('public._outpost_zero_weapon_is_published(text)') is null then
    raise exception 'Administration 05 requires Administration 02B (unpublished weapon enforcement)';
  end if;
  if to_regclass('public.admin_msgs') is null or to_regclass('public.reports') is null then
    raise exception 'Administration 05 requires the original admin_msgs and reports tables';
  end if;
end;
$preflight$;

-- Replace only role-related CHECK constraints so the new lowest tier can be
-- stored. Unrelated admins-table constraints remain untouched.
do $constraints$
declare item record;
begin
  for item in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='admins' and c.contype='c'
      and pg_get_constraintdef(c.oid) ~* '\mrole\M'
  loop
    execute format('alter table public.admins drop constraint %I',item.conname);
  end loop;
end;
$constraints$;

alter table public.admins
  add constraint outpost_zero_admin_role_allowed
  check (lower(btrim(coalesce(role,''))) in ('main','co','tester'));

create or replace function public._outpost_zero_staff_role()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare actor uuid:=auth.uid();actor_email text;actor_role text;
begin
  if actor is null then return '';end if;
  select lower(btrim(u.email)) into actor_email from auth.users u where u.id=actor;
  if actor_email='tmilsanmilla@gmail.com' then return 'creator';end if;
  select lower(btrim(coalesce(a.role,''))) into actor_role
  from public.admins a where lower(btrim(a.email))=actor_email
  order by case lower(btrim(coalesce(a.role,''))) when 'main' then 0 when 'co' then 1 when 'tester' then 2 else 3 end limit 1;
  if actor_role in ('main','co','tester') then return actor_role;end if;return '';
exception when others then return '';
end;
$function$;

-- Keep the older Administration 01 authority helper deliberately blind to
-- Testers. Every legacy player/audit/grant RPC therefore continues to deny
-- them even if they call the API directly instead of using the game UI.
create or replace function public._outpost_zero_admin_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select case public._outpost_zero_staff_role()
    when 'creator' then 'creator' when 'main' then 'main' when 'co' then 'co' else '' end
$function$;

create or replace function public._outpost_zero_update_role()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  return public._outpost_zero_admin_role();
end;
$function$;

create or replace function public.list_outpost_zero_admin_roster()
returns table(email text,role text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text:=public._outpost_zero_admin_role();actor_email text;
begin
  actor_role:=public._outpost_zero_staff_role();if actor_role='' then return;end if;
  select lower(btrim(u.email)) into actor_email from auth.users u where u.id=auth.uid();
  return query
  select lower(btrim(a.email))::text,
    case when bool_or(lower(btrim(coalesce(a.role,'')))='main') then 'main'
         when bool_or(lower(btrim(coalesce(a.role,'')))='co') then 'co' else 'tester' end::text
  from public.admins a
  where lower(btrim(coalesce(a.role,''))) in ('main','co','tester')
    and (actor_role in ('creator','main') or lower(btrim(a.email))=actor_email)
  group by lower(btrim(a.email))
  order by lower(btrim(a.email));
end;
$function$;

create or replace function public.add_outpost_zero_admin(p_email text,p_role text default 'tester')
returns table(email text,role text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text:=public._outpost_zero_staff_role();clean_email text:=lower(btrim(coalesce(p_email,'')));
  clean_role text:=lower(btrim(coalesce(p_role,'tester')));existing_role text;
begin
  if actor_role not in ('creator','main') then raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';end if;
  if clean_role not in ('tester','co') then raise exception using errcode='22023',message='INVALID_STARTING_ROLE';end if;
  if char_length(clean_email) not between 3 and 320 or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    then raise exception using errcode='22023',message='VALID_ADMIN_EMAIL_REQUIRED';end if;
  if clean_email='tmilsanmilla@gmail.com' then raise exception using errcode='22023',message='CREATOR_ROLE_IS_FIXED';end if;
  if not exists(select 1 from auth.users u where lower(btrim(u.email))=clean_email) then
    raise exception using errcode='22023',message='ACCOUNT_MUST_SIGN_IN_FIRST';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-admin:'||clean_email,0));
  select lower(btrim(coalesce(a.role,''))) into existing_role from public.admins a
    where lower(btrim(a.email))=clean_email
    order by case lower(btrim(coalesce(a.role,''))) when 'main' then 0 when 'co' then 1 else 2 end limit 1 for update;
  if existing_role is null then insert into public.admins(email,role) values(clean_email,clean_role);
  elsif existing_role='tester' and clean_role='co' then update public.admins a set role='co' where lower(btrim(a.email))=clean_email;
  else clean_role:=existing_role;end if;
  return query select clean_email,clean_role;
end;
$function$;

create or replace function public.promote_outpost_zero_admin(p_email text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text:=public._outpost_zero_staff_role();clean_email text:=lower(btrim(coalesce(p_email,'')));
  target_role text;next_role text;affected bigint;
begin
  if actor_role not in ('creator','main') then raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';end if;
  if clean_email='' or clean_email='tmilsanmilla@gmail.com' then return false;end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-admin:'||clean_email,0));
  select lower(btrim(coalesce(a.role,''))) into target_role from public.admins a where lower(btrim(a.email))=clean_email
    order by case lower(btrim(coalesce(a.role,''))) when 'main' then 0 when 'co' then 1 else 2 end limit 1 for update;
  next_role:=case target_role when 'tester' then 'co' when 'co' then 'main' else null end;
  if next_role is null then return false;end if;
  update public.admins a set role=next_role where lower(btrim(a.email))=clean_email;get diagnostics affected=row_count;return affected>0;
end;
$function$;

create or replace function public.demote_outpost_zero_admin(p_email text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text:=public._outpost_zero_staff_role();clean_email text:=lower(btrim(coalesce(p_email,'')));
  target_role text;next_role text;affected bigint;
begin
  if actor_role not in ('creator','main') then raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';end if;
  if clean_email='' or clean_email='tmilsanmilla@gmail.com' then return false;end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-admin:'||clean_email,0));
  select lower(btrim(coalesce(a.role,''))) into target_role from public.admins a where lower(btrim(a.email))=clean_email
    order by case lower(btrim(coalesce(a.role,''))) when 'main' then 0 when 'co' then 1 else 2 end limit 1 for update;
  if target_role='main' and actor_role<>'creator' then return false;end if;
  next_role:=case target_role when 'main' then 'co' when 'co' then 'tester' else null end;
  if next_role is null then return false;end if;
  update public.admins a set role=next_role where lower(btrim(a.email))=clean_email;get diagnostics affected=row_count;return affected>0;
end;
$function$;

-- Testers may read only their own Admin Inbox rows and update only receipt
-- fields. Only creator/main may create a staff message.
create or replace function public._outpost_zero_admin_email()
returns text language sql stable security definer set search_path=pg_catalog,public
as $function$ select lower(btrim(u.email)) from auth.users u where u.id=auth.uid() $function$;

alter table public.admin_msgs enable row level security;
alter table public.admin_msgs force row level security;
do $policies$
declare item record;
begin
  for item in select policyname from pg_policies where schemaname='public' and tablename='admin_msgs'
  loop execute format('drop policy %I on public.admin_msgs',item.policyname);end loop;
end;
$policies$;
create policy outpost_zero_admin_msgs_own_read on public.admin_msgs for select to authenticated
  using (public._outpost_zero_staff_role() in ('creator','main','co','tester')
    and public._outpost_zero_admin_email() in (lower(btrim(from_email)),lower(btrim(to_email))));
create policy outpost_zero_admin_msgs_main_insert on public.admin_msgs for insert to authenticated
  with check (public._outpost_zero_staff_role() in ('creator','main')
    and lower(btrim(from_email))=public._outpost_zero_admin_email());
create policy outpost_zero_admin_msgs_recipient_update on public.admin_msgs for update to authenticated
  using (public._outpost_zero_staff_role() in ('creator','main','co','tester')
    and lower(btrim(to_email))=public._outpost_zero_admin_email())
  with check (lower(btrim(to_email))=public._outpost_zero_admin_email());
revoke all on table public.admin_msgs from public,anon,authenticated;
grant select(id,from_email,to_email,message,read,read_at,archived,created_at) on public.admin_msgs to authenticated;
grant insert(from_email,to_email,message) on public.admin_msgs to authenticated;
grant update(read,read_at,archived) on public.admin_msgs to authenticated;
do $sequences$
declare sequence_name text;
begin
  sequence_name:=pg_get_serial_sequence('public.admin_msgs','id');
  if sequence_name is not null then execute format('grant usage,select on sequence %s to authenticated',sequence_name);end if;
end;
$sequences$;

-- Reports stay write-only for normal players and Testers. Creator/main receive
-- the explicit read/resolve boundary used by the Reports screen and exporter.
alter table public.reports enable row level security;
alter table public.reports force row level security;
do $report_policies$
declare item record;
begin
  for item in select policyname from pg_policies where schemaname='public' and tablename='reports'
  loop execute format('drop policy %I on public.reports',item.policyname);end loop;
end;
$report_policies$;
create policy outpost_zero_reports_submit on public.reports for insert to anon,authenticated
  with check (game='outpost-zero' and char_length(btrim(coalesce(name,''))) between 1 and 160
    and char_length(btrim(coalesce(message,''))) between 1 and 1000 and coalesce(resolved,false)=false);
create policy outpost_zero_reports_main_read on public.reports for select to authenticated
  using (public._outpost_zero_admin_role() in ('creator','main'));
create policy outpost_zero_reports_main_resolve on public.reports for update to authenticated
  using (public._outpost_zero_admin_role() in ('creator','main'))
  with check (public._outpost_zero_admin_role() in ('creator','main'));
revoke all on table public.reports from public,anon,authenticated;
grant insert(game,name,message,meta) on public.reports to anon,authenticated;
grant select(id,name,message,created_at,meta,resolved) on public.reports to authenticated;
grant update(resolved) on public.reports to authenticated;
do $report_sequence$
declare sequence_name text;
begin
  sequence_name:=pg_get_serial_sequence('public.reports','id');
  if sequence_name is not null then execute format('grant usage,select on sequence %s to anon,authenticated',sequence_name);end if;
end;
$report_sequence$;

create table if not exists public.outpost_zero_weapon_suggestions(
  id bigint generated always as identity primary key,
  author_user_id uuid not null,
  author_email text not null,
  author_role text not null,
  weapon_key text not null,
  suggestion text not null,
  status text not null default 'pending',
  reviewer_user_id uuid,
  reviewer_note text,
  created_at timestamptz not null default statement_timestamp(),
  reviewed_at timestamptz,
  constraint outpost_zero_weapon_suggestion_author_role check(author_role in ('tester','co')),
  constraint outpost_zero_weapon_suggestion_key check(weapon_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint outpost_zero_weapon_suggestion_length check(char_length(suggestion) between 10 and 800),
  constraint outpost_zero_weapon_suggestion_status check(status in ('pending','approved','rejected')),
  constraint outpost_zero_weapon_suggestion_note check(reviewer_note is null or char_length(reviewer_note)<=500),
  constraint outpost_zero_weapon_suggestion_review_shape check((status='pending' and reviewer_user_id is null and reviewed_at is null) or (status<>'pending' and reviewer_user_id is not null and reviewed_at is not null))
);
create index if not exists outpost_zero_weapon_suggestions_pending_idx on public.outpost_zero_weapon_suggestions(status,created_at desc,id desc);
alter table public.outpost_zero_weapon_suggestions enable row level security;
alter table public.outpost_zero_weapon_suggestions force row level security;
revoke all on table public.outpost_zero_weapon_suggestions from public,anon,authenticated;

create or replace function public.submit_outpost_zero_weapon_suggestion(p_weapon_key text,p_suggestion text)
returns bigint language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare actor uuid:=auth.uid();actor_role text:=public._outpost_zero_staff_role();actor_email text:=public._outpost_zero_admin_email();
  clean_key text:=lower(btrim(coalesce(p_weapon_key,'')));clean_text text:=regexp_replace(btrim(coalesce(p_suggestion,'')),'[[:space:]]+',' ','g');result_id bigint;
begin
  if actor_role not in ('tester','co') then raise exception using errcode='42501',message='TESTER_OR_CO_ADMIN_REQUIRED';end if;
  if clean_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' or not public._outpost_zero_weapon_is_published(clean_key)
    then raise exception using errcode='22023',message='PUBLISHED_WEAPON_REQUIRED';end if;
  if char_length(clean_text) not between 10 and 800 then raise exception using errcode='22023',message='SUGGESTION_MUST_BE_10_TO_800_CHARACTERS';end if;
  if (select count(*) from public.outpost_zero_weapon_suggestions s where s.author_user_id=actor and s.created_at>statement_timestamp()-interval '1 day')>=20
    then raise exception using errcode='P0001',message='SUGGESTION_RATE_LIMIT';end if;
  perform pg_advisory_xact_lock(hashtextextended('outpost-zero-weapon-suggestion:'||actor::text,0));
  select s.id into result_id from public.outpost_zero_weapon_suggestions s
    where s.author_user_id=actor and s.weapon_key=clean_key and s.suggestion=clean_text and s.status='pending' order by s.id desc limit 1;
  if result_id is null then
    insert into public.outpost_zero_weapon_suggestions(author_user_id,author_email,author_role,weapon_key,suggestion)
    values(actor,actor_email,actor_role,clean_key,clean_text) returning id into result_id;
  end if;return result_id;
end;
$function$;

create or replace function public.list_outpost_zero_weapon_suggestions(p_limit integer default 40,p_status text default 'pending')
returns table(id bigint,author_email text,author_role text,weapon_key text,suggestion text,status text,created_at timestamptz,reviewer_note text,reviewed_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public
as $function$
declare clean_status text:=lower(btrim(coalesce(p_status,'pending')));
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';end if;
  if clean_status not in ('pending','approved','rejected') then raise exception using errcode='22023',message='INVALID_STATUS';end if;
  return query select s.id,s.author_email,s.author_role,s.weapon_key,s.suggestion,s.status,s.created_at,s.reviewer_note,s.reviewed_at
    from public.outpost_zero_weapon_suggestions s where s.status=clean_status order by s.id desc limit least(greatest(coalesce(p_limit,40),1),100);
end;
$function$;

create or replace function public.review_outpost_zero_weapon_suggestion(p_suggestion_id bigint,p_decision text,p_reviewer_note text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare decision text:=lower(btrim(coalesce(p_decision,'')));note text:=nullif(btrim(coalesce(p_reviewer_note,'')),'');affected bigint;
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then raise exception using errcode='42501',message='MAIN_ADMIN_ACCESS_REQUIRED';end if;
  if decision not in ('approved','rejected') or char_length(coalesce(note,''))>500 then raise exception using errcode='22023',message='INVALID_REVIEW';end if;
  update public.outpost_zero_weapon_suggestions s set status=decision,reviewer_user_id=auth.uid(),reviewer_note=note,reviewed_at=statement_timestamp()
    where s.id=p_suggestion_id and s.status='pending';get diagnostics affected=row_count;return affected>0;
end;
$function$;

create or replace function public.export_outpost_zero_reports(p_limit integer default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public
as $function$
declare bounded integer:=case when p_limit is null then null else least(greatest(p_limit,1),10000) end;payload jsonb;
begin
  if public._outpost_zero_admin_role() not in ('creator','main') then raise exception using errcode='42501',message='REPORT_ACCESS_REQUIRED';end if;
  select jsonb_build_object('count',count(*),'reports',coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id desc),'[]'::jsonb)) into payload
  from (select r.id,r.name,r.message,r.created_at,r.meta,r.resolved from public.reports r order by r.id desc limit bounded) row_data;
  return payload;
end;
$function$;

revoke all on function public._outpost_zero_admin_email() from public,anon,authenticated;
revoke all on function public._outpost_zero_staff_role() from public,anon,authenticated;
revoke all on function public.add_outpost_zero_admin(text,text) from public,anon,authenticated;
revoke all on function public.submit_outpost_zero_weapon_suggestion(text,text) from public,anon,authenticated;
revoke all on function public.list_outpost_zero_weapon_suggestions(integer,text) from public,anon,authenticated;
revoke all on function public.review_outpost_zero_weapon_suggestion(bigint,text,text) from public,anon,authenticated;
revoke all on function public.export_outpost_zero_reports(integer) from public,anon,authenticated;
grant execute on function public._outpost_zero_admin_email() to authenticated;
grant execute on function public._outpost_zero_staff_role() to authenticated;
grant execute on function public.add_outpost_zero_admin(text,text) to authenticated;
grant execute on function public.submit_outpost_zero_weapon_suggestion(text,text) to authenticated;
grant execute on function public.list_outpost_zero_weapon_suggestions(integer,text) to authenticated;
grant execute on function public.review_outpost_zero_weapon_suggestion(bigint,text,text) to authenticated;
grant execute on function public.export_outpost_zero_reports(integer) to authenticated;

-- Existing Administration 02 grants remain, but repeat the changed signatures
-- explicitly so a restrictive rerun cannot strand the roster controls.
grant execute on function public._outpost_zero_admin_role() to authenticated;
grant execute on function public._outpost_zero_update_role() to authenticated;
grant execute on function public.list_outpost_zero_admin_roster() to authenticated;
grant execute on function public.promote_outpost_zero_admin(text) to authenticated;
grant execute on function public.demote_outpost_zero_admin(text) to authenticated;

commit;
