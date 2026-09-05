import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source=fs.readFileSync(path.resolve(import.meta.dirname,'../js/duels-service.js'),'utf8');
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
const C='10000000-0000-4000-8000-000000000003',D='10000000-0000-4000-8000-000000000004';
const MATCH='20000000-0000-4000-8000-000000000001',OTHER='20000000-0000-4000-8000-000000000002';
const kit={primary:'ar',secondary:'pistol',melee:'knife',utility:null};
const json=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function fixture({mode='1v1',source='queue',ranked=false,host=A,ids=[A,B],accepted=true,id=MATCH}={}){
  return{matchId:id,epoch:id,mode,source,ranked,hostId:host,
    roster:ids.map((user,i)=>({id:user,name:'player'+i,team:mode==='1v1v1'?['A','B','C'][i]:i%2?'B':'A',accepted,loadout:kit}))};
}
function harness(owner=A,storage=new Map()){
  const calls=[],launches=[],leaves=[],pending=[],invites=[],channels=[];
  const context={console,Date,JSON,Map,Set,performance:{now:()=>50},navigator:{onLine:true},
    authUser:{id:owner},testMode:false,state:'select',selPage:'multidevice',arena:{},party:null,
    modeBoardNotice:'',modeBoardNoticeT:0,pendingGameMode:null,loadoutBackPage:null,loadout:{...kit},
    arenaLoadoutReady:()=>true,isMultideviceArena:()=>false,
    multideviceLaunch:match=>{launches.push(match);return true;},multideviceLeave:msg=>{leaves.push(msg);},
    partyIsHost:()=>context.party?.hostId===context.authUser?.id,
    partyModeNotice:message=>{context.partyNotice=message;return false;},
    partySetMode:mode=>{context.party.mode=mode;},partySend:(event,payload)=>invites.push({event,payload}),
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    sb:{removeChannel:()=>{},channel:name=>{
      const channel={name,handlers:[],filters:[],on(event,filter,callback){this.handlers.push(callback);this.filters.push({event,filter});return this;},subscribe(callback){this.status=callback;return this;}};
      channels.push(channel);return channel;
    },rpc:async(name,args)=>{
      calls.push({name,args:json(args)});
      const next=pending.shift();
      if(!next)return{data:{status:'idle'}};
      if(next.name)assert.equal(name,next.name,'RPC order is deterministic');
      return next.promise;
    }}};
  vm.createContext(context);vm.runInContext(source,context);
  const run=code=>vm.runInContext(code,context);
  run('duelServiceReset()');
  return{context,calls,launches,leaves,storage,run,invites,channels,
    state:()=>run('duelService'),
    enqueue(name){const next=deferred();pending.push({...next,name});return next;},
    account(id){context.authUser={id};run('duelServiceReset()');}};
}
const cases=[];const test=(name,fn)=>cases.push({name,fn});

test('1v1v1 never enters a public/ranked queue; test mode also cannot enqueue',async()=>{
  const h=harness();await h.run("duelServiceQueue('1v1v1',true)");
  assert.equal(h.calls.length,0);assert.match(h.state().status,/PARTY ONLY/);
  h.context.testMode=true;await h.run("duelServiceQueue('2v2',false)");
  assert.equal(h.calls.length,0);assert.match(h.state().status,/TEST MODE/);
});

test('Cancel serializes enrollment and does not claim completion until server confirms',async()=>{
  const h=harness(),leave=h.enqueue('leave_outpost_zero_duel_queue');h.state().queue=true;
  const action=h.run('duelServiceCancel()');
  assert.equal(h.state().busy,true);
  assert.equal(await h.run("duelServiceQueue('2v2',false)"),false);
  assert.equal(h.calls.length,1);assert.equal(h.state().queue,true);
  leave.resolve({data:{status:'left'}});assert.equal(await action,true);
  assert.equal(h.state().queue,false);assert.equal(h.state().busy,false);assert.equal(h.context.selPage,'modeboard');
});

test('A stale Cancel cannot clear or navigate a replacement account session',async()=>{
  const h=harness(),leave=h.enqueue('leave_outpost_zero_duel_queue');
  const action=h.run('duelServiceCancel()');h.account(B);
  h.state().status='NEW ACCOUNT';h.state().busy=true;h.context.selPage='ranked';
  leave.resolve({data:{status:'left'}});assert.equal(await action,false);
  assert.equal(h.state().status,'NEW ACCOUNT');assert.equal(h.state().busy,true);assert.equal(h.context.selPage,'ranked');
});

test('Server-pending ranked Cancel preserves enrollment and never says LEFT',async()=>{
  const h=harness(),match=fixture({ranked:true});h.state().match=match;h.state().ranked=true;
  const leave=h.enqueue('release_outpost_zero_duel'),action=h.run('duelServiceCancel()');
  leave.resolve({data:{status:'pending'}});assert.equal(await action,false);
  assert.equal(h.state().match,match);assert.equal(h.state().busy,false);assert.equal(h.leaves.length,0);
  assert.match(h.state().status,/AWAITING RESULT/);assert.doesNotMatch(h.state().status,/LEFT/);
});

test('Queue response from A to B to A cannot resurrect the old session',async()=>{
  const h=harness(),join=h.enqueue('join_outpost_zero_duel_queue');
  const action=h.run("duelServiceQueue('1v1',false)");h.account(B);h.account(A);
  h.state().status='CURRENT SESSION';join.resolve({data:{status:'matched',match:fixture()}});
  assert.equal(await action,false);assert.equal(h.state().match,null);assert.equal(h.launches.length,0);
  assert.equal(h.state().status,'CURRENT SESSION');
});

test('PartyReceive discards replies after party replacement or host change',async()=>{
  for(const replacement of ['object','host']){
    const h=harness(B);h.context.party={accepted:true,hostId:A,members:[{id:A},{id:B},{id:C}]};
    const response=h.enqueue('get_outpost_zero_duel');h.context.packet={from:A,matchId:MATCH};
    const action=h.run('duelServicePartyReceive(packet)');
    if(replacement==='object')h.context.party={...h.context.party};else h.context.party.hostId=C;
    response.resolve({data:{status:'pending',match:fixture({mode:'1v1v1',source:'party',ids:[A,B,C]})}});
    await action;assert.equal(h.state().invite,null);assert.equal(h.state().match,null);
  }
});

test('Old assignment failure cannot overwrite the new account or clear its polling lock',async()=>{
  const h=harness(),response=h.enqueue('get_outpost_zero_duel_assignment');h.state().queue=true;
  const action=h.run('duelServiceRefresh()');h.account(B);
  h.state().status='NEW ACCOUNT';h.state().queue=true;h.state().polling=true;
  response.reject(new Error('OLD REQUEST FAILED'));await action;
  assert.equal(h.state().status,'NEW ACCOUNT');assert.equal(h.state().polling,true);
});

test('PartyReady cleans up a pending server match if the party changes while creating it',async()=>{
  const h=harness();h.context.party={accepted:true,hostId:A,members:[{id:A,order:0},{id:B,order:1},{id:C,order:2}]};
  const created=h.enqueue('create_outpost_zero_party_duel');const action=h.run("duelServicePartyReady('1v1v1')");
  h.context.party={...h.context.party};
  created.resolve({data:{status:'pending',match:fixture({mode:'1v1v1',source:'party',ids:[A,B,C]})}});
  assert.equal(await action,false);await flush();
  assert.equal(h.state().match,null);assert.equal(h.state().invite,null);assert.equal(h.invites.length,0);
  assert.ok(h.calls.some(c=>c.name==='abort_outpost_zero_duel_setup'&&c.args.p_match_id===MATCH));
  assert.match(h.state().status,/PARTY PLAYERS CHANGED/);
});

test('Stale Realtime callbacks cannot refresh or mark a replacement same-owner session live',()=>{
  const h=harness();h.run('duelServiceSubscribe()');const old=h.channels[0];
  h.account(B);h.account(A);h.run('duelServiceSubscribe()');h.state().nextPoll=12345;
  old.handlers[0]();old.status('SUBSCRIBED');
  assert.equal(h.calls.length,0);assert.equal(h.state().live,false);assert.equal(h.state().nextPoll,12345);
});

test('Realtime subscribes only to owned INSERT/UPDATE wakeups, never unfilterable DELETE events',()=>{
  const h=harness();h.run('duelServiceSubscribe()');const channel=h.channels[0];
  assert.deepEqual(channel.filters.map(row=>row.filter.event).sort(),['INSERT','UPDATE']);
  for(const row of channel.filters){
    assert.equal(row.event,'postgres_changes');assert.equal(row.filter.schema,'public');
    assert.equal(row.filter.table,'outpost_zero_duel_wakeups');assert.equal(row.filter.filter,'user_id=eq.'+A);
  }
});

test('A confirmed current queue assignment launches only the registered returned match',async()=>{
  const h=harness(),join=h.enqueue('join_outpost_zero_duel_queue');
  const action=h.run("duelServiceQueue('2v2',true)"),match=fixture({mode:'2v2',ranked:true,ids:[A,B,C,D]});
  join.resolve({data:{status:'matched',match}});assert.equal(await action,true);
  assert.equal(h.state().queue,false);assert.equal(h.state().busy,false);assert.equal(h.launches.length,1);
  assert.equal(h.launches[0].matchId,MATCH);assert.equal(h.launches[0].ranked,true);
  assert.deepEqual(h.calls[0].args,{p_mode:'2v2',p_ranked:true,p_loadout:kit});
});

test('Ranked profile/board reply from a discarded A to B to A session is ignored',async()=>{
  const h=harness(),profile=h.enqueue('get_outpost_zero_ranked_profile'),board=h.enqueue('list_outpost_zero_ranked_leaderboard');
  const action=h.run("duelServiceRankedRefresh('2v2')");h.account(B);h.account(A);
  h.state().profile={current:true};h.state().board=[{current:true}];h.state().rankedLoading=true;
  profile.resolve({data:{old:true}});board.resolve({data:[{old:true}]});await action;
  assert.deepEqual(json(h.state().profile),{current:true});assert.deepEqual(json(h.state().board),[{current:true}]);
  assert.equal(h.state().rankedLoading,true);
});

test('An old rating reply cannot clear a new account rating request or receipt',async()=>{
  const h=harness(),old=h.enqueue('submit_outpost_zero_ranked_result');h.state().match=fixture({ranked:true});
  h.context.resultA={matchId:MATCH,winningTeam:'A',scoreA:5,scoreB:2};
  assert.equal(h.run('duelServiceSubmitRanked(resultA)'),true);h.account(B);
  h.state().match=fixture({ranked:true,id:OTHER});h.context.resultB={matchId:OTHER,winningTeam:'B',scoreA:1,scoreB:5};
  const current=h.enqueue('submit_outpost_zero_ranked_result');assert.equal(h.run('duelServiceSubmitRanked(resultB)'),true);
  old.resolve({data:{status:'finalized'}});await flush();
  assert.equal(h.state().resultBusy,true);assert.equal(h.state().result.matchId,OTHER);
  assert.ok(h.storage.has('oz-ranked-result-v1:'+A));assert.ok(h.storage.has('oz-ranked-result-v1:'+B));
  current.resolve({data:{status:'pending'}});await flush();assert.equal(h.state().resultBusy,false);
});

test('Unconfirmed ranked result survives reload, retries unchanged, and removes only its owner receipt on settlement',async()=>{
  const h=harness(),first=h.enqueue('submit_outpost_zero_ranked_result');h.state().match=fixture({ranked:true});
  h.context.result={matchId:MATCH,winningTeam:'A',scoreA:5,scoreB:3};
  assert.equal(h.run('duelServiceSubmitRanked(result)'),true);first.resolve({data:{status:'pending'}});await flush();
  const saved=h.storage.get('oz-ranked-result-v1:'+A);assert.ok(saved);
  const restored=harness(A,h.storage);assert.equal(restored.state().result.matchId,MATCH);assert.equal(restored.state().result.nextTry,0);
  const retry=restored.enqueue('submit_outpost_zero_ranked_result'),action=restored.run('duelServiceRetryResult()');
  assert.deepEqual(restored.calls[0].args,{p_match_id:MATCH,p_winning_team:'A',p_score_a:5,p_score_b:3});
  h.storage.set('oz-ranked-result-v1:'+B,'other owner data');
  retry.resolve({data:{status:'disputed'}});await action;await flush();
  assert.equal(restored.state().result,null);assert.equal(h.storage.has('oz-ranked-result-v1:'+A),false);
  assert.equal(h.storage.get('oz-ranked-result-v1:'+B),'other owner data');
  assert.doesNotMatch(restored.state().status,/ELO SAVED/);
});

test('Only one immutable local ranked receipt can be awaiting server consensus',async()=>{
  const h=harness(),pending=h.enqueue('submit_outpost_zero_ranked_result');h.state().match=fixture({ranked:true});
  h.context.first={matchId:MATCH,winningTeam:'A',scoreA:5,scoreB:2};h.run('duelServiceSubmitRanked(first)');
  h.context.changed={matchId:MATCH,winningTeam:'B',scoreA:1,scoreB:5};h.run('duelServiceSubmitRanked(changed)');
  assert.equal(h.calls.length,1);assert.equal(h.state().result.winningTeam,'A');
  h.state().match=fixture({ranked:true,id:OTHER});h.context.next={matchId:OTHER,winningTeam:'A',scoreA:5,scoreB:0};
  assert.equal(h.run('duelServiceSubmitRanked(next)'),false);assert.equal(h.state().result.matchId,MATCH);
  pending.resolve({data:{status:'pending'}});await flush();
});

test('Party-only assignment polling requires the current party, leader, and exact roster',()=>{
  for(const invalid of ['no party','different leader','outsider','wrong roster size']){
    const h=harness();h.context.party={accepted:true,hostId:A,members:[{id:A},{id:B},{id:C}]};
    const match=fixture({mode:'1v1v1',source:'party',ids:[A,B,C]});
    if(invalid==='no party')h.context.party=null;
    if(invalid==='different leader')h.context.party.hostId=B;
    if(invalid==='outsider')match.roster[2].id=D;
    if(invalid==='wrong roster size')h.context.party.members.push({id:D});
    h.context.response={status:'pending',match};h.run('duelServiceApplyAssignment(response)');
    assert.equal(h.state().invite,null,invalid+' must not create an invite');
    assert.equal(h.state().match,null,invalid+' must not create a match');assert.equal(h.launches.length,0);
  }
  const h=harness();h.context.party={accepted:true,hostId:A,members:[{id:A},{id:B},{id:C}]};
  h.context.response={status:'pending',match:fixture({mode:'1v1v1',source:'party',ids:[A,B,C]})};
  assert.equal(h.run('duelServiceApplyAssignment(response)'),true,'a real three-person party invitation is accepted');
  assert.equal(h.state().invite.matchId,MATCH);
});

let failed=0;
for(const {name,fn} of cases){
  try{await fn();console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name);console.error(error.stack);}
}
console.log(`Duels service async regression: ${cases.length-failed}/${cases.length} passed`);
if(failed)process.exitCode=1;
