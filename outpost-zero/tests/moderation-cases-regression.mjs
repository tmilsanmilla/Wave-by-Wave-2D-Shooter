import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {gameSimulation} from './helpers/game-simulation.mjs';

const sql=readFileSync(new URL('../../neon/migrations/007-moderation-cases.sql',import.meta.url),'utf8');
const engine=process.env.OUTPOST_MODERATION_PGLITE;
const actor='00000000-0000-4000-8000-000000000001',target='00000000-0000-4000-8000-000000000002',
  reviewer='00000000-0000-4000-8000-000000000003',receipt='00000000-0000-4000-8000-000000000004';

test('browser reports use the selected type and ignore a stale receipt after the form is reopened',async()=>{
  const h=gameSimulation();
  h.run(`var pendingReport,rpcCalls=[];
    authUser={id:'local-review-fixture'};
    sb={rpc:(name,args)=>{rpcCalls.push({name,args});return new Promise(resolve=>{pendingReport=resolve;});}};
    openReportForUsername('PlayerTwo');$('repmsg').value='x'.repeat(501);
    void sendReport();`);
  assert.equal(h.run('rpcCalls.length'),0);
  assert.equal(h.run("$('repmsg').maxLength"),500);
  h.run(`$('repmsg').value='Synthetic player report';$('repfix').value='Do not include';
    void sendReport();void sendReport();`);
  assert.deepEqual(h.json('rpcCalls'),[{name:'submit_outpost_zero_moderation_report',args:{
    p_kind:'player',p_problem:'Synthetic player report',p_suggested_fix:null,p_reported_username:'PlayerTwo'}}]);
  h.run(`closeReport();openReport();$('reptype').value='suggestion';syncReportFormKind();
    $('repmsg').value='New draft';pendingReport({data:42,error:null});`);
  await h.settle();
  assert.equal(h.run("$('repmsg').value"),'New draft');
  assert.equal(h.run("$('repmsg').maxLength"),300);
  assert.equal(h.run("$('reptarget').hidden"),true);
  assert.equal(h.networkCalls(),0);
});

test('moderation migration keeps legacy cases and does not install a job or seed admin authority',()=>{
  assert.doesNotMatch(sql,/cron\.schedule|create extension|insert into public\.outpost_zero_admin_config/i);
  assert.match(sql,/b\.id=item\.appealed_ban_id and b\.user_id=item\.requester_user_id/);
  assert.match(sql,/r\.game='outpost-zero' and r\.resolved and r\.resolved_at<monday-interval '7 days'/);
  assert.match(sql,/a\.status in \('lifted','denied'\) and a\.decided_at<monday-interval '14 days'/);
});

test('moderation migration: actual SQL on an isolated in-memory database',{skip:!engine},async()=>{
  const {PGlite}=await import(pathToFileURL(engine));
  const db=new PGlite();
  async function as(id,role='player'){
    await db.query("select set_config('fixture.actor',$1,false),set_config('fixture.role',$2,false)",[id,role]);
  }
  const report=(kind,problem,fix=null,who=null)=>db.query(
    'select public.submit_outpost_zero_moderation_report($1,$2,$3,$4) as id',[kind,problem,fix,who]);
  const decision=(id,value,op=receipt)=>db.query('select * from public.resolve_outpost_zero_ban_appeal($1,$2,$3)',[id,value,op]);
  try{
    await db.exec(`
      create role anonymous; create role authenticated;create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''fixture.actor'',true),'''')::uuid';
      create table auth.users(id uuid primary key,email text);
      create table public.social_profiles(user_id uuid,handle text,handle_key text unique);
      create table public.reports(id bigint generated always as identity,game text,name text,message text,meta jsonb,
        resolved boolean,reporter_user_id uuid,created_at timestamptz);
      create table public.bans(id bigint generated always as identity,user_id uuid,until timestamptz);
      create table public.ban_appeals(id bigint generated always as identity,requester_user_id uuid,player_email text,
        created_at timestamptz default now(),message text default 'Appeal text',status text default 'open',decided_by text);
      create table public.outpost_zero_admin_audit(actor_user_id uuid,operation_id uuid,details jsonb,
        unique(actor_user_id,operation_id));
      create function public._outpost_zero_staff_role() returns text language sql stable as
        'select coalesce(current_setting(''fixture.role'',true),''player'')';
      create function public._outpost_zero_is_admin_main() returns boolean language sql stable as
        'select public._outpost_zero_staff_role() in (''main'',''creator'')';
      create function public._outpost_zero_admin_identity_label(uuid) returns text language sql stable as
        'select handle from public.social_profiles where user_id=$1';
      create function public._outpost_zero_redact_report_text(text) returns text language sql immutable as 'select $1';
      create function public._outpost_zero_write_admin_audit(uuid,text,text,jsonb,uuid) returns bigint
        language sql as 'insert into public.outpost_zero_admin_audit values (auth.uid(),$5,$4) returning 1::bigint';
      insert into auth.users values ('${actor}','a@example.test'),('${target}','b@example.test'),('${reviewer}','r@example.test');
      insert into social_profiles values ('${actor}','PlayerOne','playerone'),('${target}','PlayerTwo','playertwo');
      insert into reports(game,message,resolved) values ('outpost-zero','legacy',true);
      insert into ban_appeals(requester_user_id,player_email) values ('${actor}','b@example.test');
    `);
    await db.exec(sql);
    await db.exec(sql); // safe to reapply
    assert.equal((await db.query("select has_function_privilege('authenticated','public._oz_prune_closed_moderation()','EXECUTE') as allowed")).rows[0].allowed,false);
    assert.equal((await db.query("select has_function_privilege('anonymous','public.submit_outpost_zero_moderation_report(text,text,text,text)','EXECUTE') as allowed")).rows[0].allowed,false);
    await assert.rejects(report('bug','not signed in'),/REPORT_SIGN_IN_REQUIRED/);
    await as(actor);
    await assert.rejects(report('player','x'.repeat(501),null,'PlayerTwo'),/REPORT_MESSAGE_LENGTH/);
    await assert.rejects(report('suggestion','x'.repeat(301)),/REPORT_MESSAGE_LENGTH/);
    await assert.rejects(report('bug','broken','x'.repeat(301)),/REPORT_MESSAGE_LENGTH/);
    await assert.rejects(report('player','text',null,'PlayerOne'),/REPORTED_USERNAME_NOT_FOUND/);
    const submitted=(await report('player','x'.repeat(500),null,'PlayerTwo')).rows[0].id;
    assert.equal((await db.query("select meta->>'target_user_id' as target from reports where id=$1",[submitted])).rows[0].target,target);
    await assert.rejects(report('bug','second immediately'),/REPORT_RATE_LIMIT/);
    await as(reviewer,'main');
    await db.query('update reports set resolved=true where id=$1',[submitted]);
    assert.equal((await db.query('select count(*)::int n from reports where resolved_at is not null')).rows[0].n,1);
    await db.exec(`insert into bans(user_id) values ('${actor}'),('${target}');
      insert into ban_appeals(requester_user_id,player_email) values ('${actor}','b@example.test');`);
    await as(actor);
    assert.deepEqual((await db.query("select id::int from public.list_my_outpost_zero_appeals() order by id")).rows,[{id:1},{id:2}]);
    await assert.rejects(decision(2,'lift'),/MAIN_ADMIN_ACCESS_REQUIRED/);
    await assert.rejects(db.query('select * from public.list_outpost_zero_moderation_appeals(false)'),/MAIN_ADMIN_ACCESS_REQUIRED/);
    await as(reviewer,'main');
    assert.equal((await decision(1,'lift')).rows[0].accepted,false,'legacy email cannot choose a ban');
    const accepted=(await decision(2,'lift',target)).rows[0];
    assert.equal(accepted.status,'lifted');
    assert.deepEqual((await decision(2,'lift',target)).rows[0],accepted);
    assert.deepEqual((await db.query("select id::int,status from public.list_outpost_zero_moderation_appeals(true)")).rows,[{id:2,status:'lifted'}]);
    assert.deepEqual((await db.query("select id::int,status from public.list_outpost_zero_moderation_appeals(false)")).rows,[{id:1,status:'open'}]);
    assert.deepEqual((await db.query('select user_id from bans')).rows,[{user_id:target}]);
    await as(target,'main');
    // Only the fixture clock expression is substituted. The SQL predicates,
    // statement and permissions are the same as the migration.
    const cleanup=sql.match(/create or replace function public\._oz_prune_closed_moderation\(\)[\s\S]+?end \$\$;/)[0];
    await db.exec(cleanup.replace('tick timestamptz:=statement_timestamp()', "tick timestamptz:='2026-11-23 00:00Z'::timestamptz"));
    await db.exec(`alter table reports disable trigger oz_stamp_report_resolution;
      alter table ban_appeals disable trigger oz_stamp_appeal;
      insert into reports(game,message,resolved,resolved_at) values
        ('outpost-zero','stale',true,'2026-11-15 23:59Z'),('outpost-zero','exact',true,'2026-11-16 00:00Z'),
        ('outpost-zero','open',false,'2026-10-01'),('other-game','other game',true,'2026-10-01');
      insert into ban_appeals(status,decided_at) values
        ('denied','2026-11-08 23:59Z'),('lifted','2026-11-09 00:00Z'),('open','2026-10-01');`);
    const result=(await db.query('select public._oz_prune_closed_moderation() as r')).rows[0].r;
    assert.equal(result.reports_removed,1);assert.equal(result.appeals_removed,1);
    assert.equal((await db.query("select count(*)::int n from reports where message in ('legacy','exact','open','other game')")).rows[0].n,4);
  }finally{await db.close();}
});
