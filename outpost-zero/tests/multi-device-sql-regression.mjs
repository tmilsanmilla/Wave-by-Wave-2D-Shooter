import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const sqlRoot=path.resolve(import.meta.dirname,'../sql/multi-device');
const sources=['01-duels','02-ranked','03-security'].map(name=>fs.readFileSync(path.join(sqlRoot,`Multi-device-${name}.sql`),'utf8'));
for(const source of sources){
  assert.equal((source.match(/^begin;$/gm)||[]).length,1);
  assert.equal((source.match(/^commit;$/gm)||[]).length,1);
  assert.doesNotMatch(source.replace(/alter publication[^\n;]*drop table/gi,'publication-membership'),/\b(?:drop table|truncate)\b/i);
}
assert.match(sources[0],/primary key\(match_id,user_id\), unique\(match_id,slot\)/);
assert.match(sources[0],/pg_advisory_xact_lock\(1948173,1\)/);
assert.match(sources[1],/reported<needed/);
assert.match(sources[1],/count\(distinct \(winning_team,score_a,score_b\)\)/);
assert.match(sources[1],/RESULT_REPORT_IS_IMMUTABLE/);
assert.match(sources[2],/as restrictive for all to authenticated/);
assert.match(sources[2],/for select to authenticated using\(user_id=\(select auth.uid\(\)\)\)/);
console.log('PASS multiplayer SQL transactions, locked registration, unanimous results, private boundaries');

// Optional full PostgreSQL execution, using a disposable in-memory database:
// OUTPOST_PGLITE_MODULE=/absolute/node_modules/@electric-sql/pglite/dist/index.js node <this-file>
if(!process.env.OUTPOST_PGLITE_MODULE){
  console.log('SKIP PostgreSQL runtime checks: set OUTPOST_PGLITE_MODULE to an installed PGlite module');
  process.exit(0);
}
const {PGlite}=await import(pathToFileURL(process.env.OUTPOST_PGLITE_MODULE).href);
const db=new PGlite();
const ids=Array.from({length:10},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const kit={primary:'smg',secondary:'pistol',melee:'knife',utility:'grenade'};
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema realtime;
  create table auth.users(id uuid primary key,email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create table public.social_profiles(user_id uuid primary key,handle text,handle_key text);
  create table public.test_bans(user_id uuid primary key,scopes text[]);
  create function public.get_my_outpost_zero_ban(text) returns table(scopes text[])
    language sql security definer as $$ select scopes from public.test_bans where user_id=auth.uid() $$;
  create table realtime.messages(id bigint generated always as identity primary key,payload jsonb);
  alter table realtime.messages enable row level security;
  grant usage on schema auth,realtime to authenticated,anon;
  grant select,insert on realtime.messages to authenticated;
  grant usage on sequence realtime.messages_id_seq to authenticated;
  create function realtime.topic() returns text language sql stable as $$
    select current_setting('realtime.topic',true) $$;
  create publication supabase_realtime;
`);
for(let i=0;i<ids.length;i++){
  await db.query('insert into auth.users values($1,$2)',[ids[i],`private${i}@example.test`]);
  await db.query('insert into social_profiles values($1,$2,$2)',[ids[i],`player${i+1}`]);
}
for(const source of sources)await db.exec(source);
async function asUser(index,sql,args=[]){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[index===null?'':ids[index]]);
  await db.exec('set role authenticated');
  try{return await db.query(sql,args);}finally{await db.exec('reset role');}
}
async function rpc(index,name,args=[]){
  const placeholders=args.map((_,i)=>'$'+(i+1)).join(',');
  return (await asUser(index,`select public.${name}(${placeholders}) as result`,args)).rows[0].result;
}
async function fail(index,name,args,pattern){await assert.rejects(()=>rpc(index,name,args),pattern);}
async function queue(indices,mode='1v1',ranked=true){
  let result;
  for(const i of indices)result=await rpc(i,'join_outpost_zero_duel_queue',[mode,ranked,kit]);
  assert.equal(result.status,'matched');
  assert.equal(new Set(result.match.roster.map(x=>x.id)).size,indices.length);
  return result.match;
}
async function start(indices,match){
  for(const i of indices)await rpc(i,'acknowledge_outpost_zero_duel_start',[match.matchId]);
  await db.query("update outpost_zero_duel_matches set started_at=clock_timestamp()-interval '20 seconds' where match_id=$1",[match.matchId]);
}
async function scalar(sql,args=[]){return Object.values((await db.query(sql,args)).rows[0])[0];}

await fail(null,'join_outpost_zero_duel_queue',['1v1',true,kit],/SIGN_IN_REQUIRED/);
await fail(0,'join_outpost_zero_duel_queue',['1v1v1',true,kit],/INVALID_QUEUE_MODE/);
await fail(0,'join_outpost_zero_duel_queue',['1v1',true,{...kit,primary:'../inject'}],/INVALID_LOADOUT/);
await assert.rejects(()=>asUser(0,"insert into outpost_zero_duel_queue(user_id,mode,ranked,loadout,expires_at) values(auth.uid(),'1v1',true,'{}',now())"),/permission denied/);
await db.query('insert into test_bans values($1,$2)',[ids[8],['account']]);
await fail(8,'join_outpost_zero_duel_queue',['1v1',true,kit],/MULTIPLAYER_BANNED/);
const initial=await rpc(0,'join_outpost_zero_duel_queue',['1v1',true,kit]);
assert.equal(initial.status,'waiting');
await rpc(0,'join_outpost_zero_duel_queue',['1v1',true,kit]);
assert.equal(await scalar('select count(*)::int from outpost_zero_duel_queue'),1);
const assigned=await rpc(1,'join_outpost_zero_duel_queue',['1v1',true,kit]);
const one=assigned.match;
assert.equal(assigned.status,'matched');assert.equal(one.status,'pending');
assert.equal(one.roster[0].loadout.utility,null);
await fail(2,'get_outpost_zero_duel',[one.matchId],/NOT_A_MATCH_MEMBER/);
await fail(2,'acknowledge_outpost_zero_duel_start',[one.matchId],/NOT_AN_ACCEPTED_MEMBER/);
assert.equal(await rpc(0,'_outpost_zero_duel_channel_member',['oz-duel:'+one.matchId]),true);
assert.equal(await rpc(2,'_outpost_zero_duel_channel_member',['oz-duel:'+one.matchId]),false);
await fail(0,'_outpost_zero_duel_snapshot',[one.matchId],/permission denied/);
await start([0,1],one);
await fail(0,'submit_outpost_zero_ranked_result',[one.matchId,'A',4,0],/INVALID_RANKED_RESULT/);
await fail(2,'submit_outpost_zero_ranked_result',[one.matchId,'A',5,0],/NOT_A_MATCH_MEMBER/);
const first=await rpc(0,'submit_outpost_zero_ranked_result',[one.matchId,'A',5,2]);
assert.equal(first.status,'pending');assert.equal(first.reports,1);
assert.equal(await scalar('select count(*)::int from outpost_zero_ranked_rating_changes'),0);
assert.equal((await rpc(0,'release_outpost_zero_duel',[one.matchId])).status,'pending');
const final=await rpc(1,'submit_outpost_zero_ranked_result',[one.matchId,'A',5,2]);
assert.equal(final.status,'finalized');assert.equal(final.ratings.length,2);
assert.equal(final.ratings.find(x=>x.id===one.roster.find(x=>x.team==='A').id).elo,1016);
assert.deepEqual(await rpc(1,'submit_outpost_zero_ranked_result',[one.matchId,'A',5,2]),final);
await fail(1,'submit_outpost_zero_ranked_result',[one.matchId,'B',2,5],/RESULT_REPORT_IS_IMMUTABLE/);
assert.equal(await scalar('select count(*)::int from outpost_zero_ranked_rating_changes'),2);
assert.equal((await rpc(0,'get_outpost_zero_ranked_profile')).two.matches,0);
console.log('PASS 1v1 registration, bans, actor binding, private room, unanimous rating, exact retry');

const four=await queue([0,1,2,3],'2v2');await start([0,1,2,3],four);
for(const i of [0,1,2])assert.equal((await rpc(i,'submit_outpost_zero_ranked_result',[four.matchId,'B',4,5])).status,'pending');
assert.equal(await scalar("select count(*)::int from outpost_zero_ranked_ratings where mode='2v2'"),0);
const fourFinal=await rpc(3,'submit_outpost_zero_ranked_result',[four.matchId,'B',4,5]);
assert.equal(fourFinal.status,'finalized');assert.equal(fourFinal.ratings.length,4);
assert.equal(fourFinal.ratings.reduce((sum,r)=>sum+r.delta,0),0);
assert.equal((await rpc(0,'get_outpost_zero_ranked_profile')).one.matches,1);
console.log('PASS all four 2v2 members required, separate mode ratings, balanced team Elo');

const conflict=await queue([0,1]);await start([0,1],conflict);
await rpc(0,'submit_outpost_zero_ranked_result',[conflict.matchId,'A',5,1]);
assert.equal((await rpc(1,'submit_outpost_zero_ranked_result',[conflict.matchId,'B',1,5])).status,'disputed');
assert.equal(await scalar('select count(*)::int from outpost_zero_ranked_rating_changes where match_id=$1',[conflict.matchId]),0);
assert.equal(await scalar('select count(*)::int from outpost_zero_duel_queue where match_id=$1',[conflict.matchId]),0);
const abort=await queue([0,1]);
assert.equal((await rpc(0,'abort_outpost_zero_duel_setup',[abort.matchId])).status,'left');
assert.equal(await scalar('select status from outpost_zero_duel_matches where match_id=$1',[abort.matchId]),'cancelled');
assert.equal(await scalar('select count(*)::int from outpost_zero_duel_queue where match_id=$1',[abort.matchId]),0);
const stale=await queue([0,1]);await start([0,1],stale);
await rpc(0,'submit_outpost_zero_ranked_result',[stale.matchId,'A',5,0]);
await db.query("update outpost_zero_duel_matches set expires_at=clock_timestamp()-interval '1 second' where match_id=$1",[stale.matchId]);
assert.equal((await rpc(1,'submit_outpost_zero_ranked_result',[stale.matchId,'A',5,0])).status,'expired');
assert.equal(await scalar('select count(*)::int from outpost_zero_ranked_rating_changes where match_id=$1',[stale.matchId]),0);
console.log('PASS disagreement/abandonment/expired result never changes Elo or strands queue slots');

await fail(0,'create_outpost_zero_party_duel',['1v1v1',[ids[0],ids[1],ids[1]],kit],/INVALID_PARTY_ROSTER/);
const party=(await rpc(0,'create_outpost_zero_party_duel',['1v1v1',ids.slice(0,3),kit])).match;
assert.equal(party.ranked,false);assert.equal(party.roster.filter(x=>x.accepted).length,1);
assert.equal((await rpc(1,'get_outpost_zero_duel_assignment')).status,'pending');
assert.equal(await scalar('select count(*)::int from outpost_zero_duel_queue where match_id=$1',[party.matchId]),1);
await fail(3,'accept_outpost_zero_party_duel',[party.matchId,kit],/NOT_INVITED/);
await fail(0,'acknowledge_outpost_zero_duel_start',[party.matchId],/WAIT_FOR_PARTY_ACCEPTANCE/);
await rpc(1,'accept_outpost_zero_party_duel',[party.matchId,kit]);
assert.equal((await rpc(2,'accept_outpost_zero_party_duel',[party.matchId,kit])).status,'matched');
await start([0,1,2],party);
await fail(0,'submit_outpost_zero_ranked_result',[party.matchId,'A',5,0],/NOT_A_RANKED_MATCH/);
for(const i of [0,1,2])await rpc(i,'release_outpost_zero_duel',[party.matchId]);
assert.equal(await scalar('select status from outpost_zero_duel_matches where match_id=$1',[party.matchId]),'finished');
assert.equal(await scalar('select count(*)::int from outpost_zero_duel_queue'),0);
console.log('PASS party FFA requires each member acceptance; cannot produce ranked ratings');

await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[0]]);
await db.exec('set role authenticated');
assert.equal((await db.query('select user_id from outpost_zero_duel_wakeups')).rows.every(r=>r.user_id===ids[0]),true);
await db.exec('reset role');
await db.exec('set role anon');
const publicBoard=(await db.query("select * from list_outpost_zero_ranked_leaderboard('1v1',1000)")).rows;
assert(publicBoard.length>0);assert(publicBoard.every(r=>!r.username.includes('@')));
await assert.rejects(()=>db.query('select * from outpost_zero_ranked_ratings'),/permission denied/);
await db.exec('reset role');
for(const [elo,rank] of [[0,'BRONZE'],[899,'BRONZE'],[900,'SILVER'],[1199,'SILVER'],[1200,'GOLD'],[1500,'PLATINUM'],[1800,'DIAMOND'],[2100,'MASTER']]){
  assert.equal(await scalar('select _outpost_zero_rank_name($1)',[elo]),rank);
}
const before=await scalar('select count(*)::int from outpost_zero_ranked_rating_changes');
for(const source of sources)await db.exec(source);
assert.equal(await scalar('select count(*)::int from outpost_zero_ranked_rating_changes'),before);
assert.equal(await scalar(`select count(*)::int from pg_class where relnamespace='public'::regnamespace
  and relname in ('outpost_zero_duel_matches','outpost_zero_duel_members','outpost_zero_duel_queue','outpost_zero_duel_wakeups',
    'outpost_zero_ranked_ratings','outpost_zero_ranked_reports','outpost_zero_ranked_rating_changes') and relrowsecurity and relforcerowsecurity`),7);
console.log('PASS named rank thresholds, private tables/wakeups, safe public leaderboard, non-destructive rerun');
await db.close();

// Also execute the exact extracted Admin/Player security installers followed
// by their real feature files against a fresh Supabase-shaped Auth fixture.
const full=new PGlite();
await full.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create publication supabase_realtime;`);
await full.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[ids[0],'fixture-creator@example.test',{username:'fixture_creator'}]);
await full.query("select set_config('outpost_zero.creator_username','fixture_creator',false)");
const installFiles=['player/Player-04-security.sql','administration/Admin-04-security.sql',
  'player/Player-03-social-menu.sql','player/Player-01-stats.sql','player/Player-02-weapons-and-cosmetics.sql',
  'administration/Admin-01-admin-menu.sql','administration/Admin-02-admins.sql','administration/Admin-03-inbox.sql'];
for(const file of installFiles){
  try{await full.exec(fs.readFileSync(path.resolve(sqlRoot,'..',file),'utf8'));}
  catch(error){throw new Error(`Full security installation failed at ${file}: ${error.message}`,{cause:error});}
}
for(const [label,fn] of [['player','_outpost_zero_apply_player_security'],['admin','_outpost_zero_apply_admin_security']]){
  await full.exec('set role authenticated');
  await assert.rejects(()=>full.query(`select public.${fn}()`),/permission denied/);
  await full.exec('reset role');
  await full.query(`select public.${fn}()`);
  console.log(`PASS ${label} 04 full extracted security executes and browser installer access is denied`);
}
await full.close();
