import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read=name=>fs.readFileSync(new URL('../js/'+name,import.meta.url),'utf8');
const flow=read('loadout-flow.js'),online=read('online.js'),weapons=read('weapons.js');
const kit={primary:'ar',secondary:'m9',melee:'knife',utility:null};
const alt={primary:'crossbow',secondary:'shorty',melee:'twinsai',utility:null};
const json=x=>JSON.parse(JSON.stringify(x));
function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`),next=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0,name);return source.slice(start,next<0?undefined:next);
}
function harness(id='host',peer='guest'){
  let clock=1000;
  const sent=[],errors=[],c={console,Date:{now:()=>clock},performance:{now:()=>clock},Math,Number,String,Object,Array,Map,Set,
    authUser:{id},loadout:{...kit},state:'select',selPage:'arena',pendingGameMode:'arena',detailKey:null,now:1000,modeBoardNotice:'',modeBoardNoticeT:0,
    arena:{hostId:'host',opponent:{id:peer,loadout:{...kit},remoteLoadoutValid:true},room:'ROOM',round:0,active:false,
      matchEpoch:1,phase:'map_reveal',mapId:'arena',mapVotePhase:'locked',scores:{host:0,guest:0},matchChannel:{}},
    WORLD:{w:2400,h:1800},ARENA_MAP_IDS:['arena'],ARENA_MAPS:[{id:'arena',name:'ARENA'}],ARENA_HP:250,ARENA_ROUND_MS:90000,
    UTILITIES:{grenade:{}},perks:{},player:{mags:{},reserve:{}},cam:{},practiceMode:null,menuOpen:false,aiming:false,rmbAim:false,
    playerFrozenUntil:0,bullets:[],ebullets:[],enemies:[],particles:[],pickups:[],damageNumbers:[],grenades:[],pearls:[],balls:[],flames:[],freezeFx:[],
    utilReadyT:0,medChan:0,medChanHeal:0,medHealPct:0,medKillCharge:0,utilityOut:false,abilityCD:{},quickReadyT:0,sawFuel:100,sawLock:false,
    daggersOut:null,comboStep:0,comboNextT:0,parryUntil:0,parrySeq:0,teraHitCharge:0,fistFlurryUntil:0,sawChargeUntil:0,waveMsg:'',waveMsgT:0,
    sfx:()=>{},isLocked:()=>false,isWeaponPublished:()=>true,
    resetRoundTransitionInput:()=>{},resetWeaponGimmickState:()=>{},clearCameraShake:()=>{},
    resetMeleeAbilityVisual:()=>{},medKillsRequired:()=>5,magSize:()=>30,startGame:()=>true,
    setTimeout:()=>0,clearTimeout:()=>{},clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
  };
  vm.createContext(c);vm.runInContext(weapons,c);vm.runInContext(flow,c);vm.runInContext(online,c);
  vm.runInContext(`storedLoadoutSlot=k=>PRIMARIES.includes(k)?'primary':SECONDARIES.includes(k)?'secondary':MELEES.includes(k)?'melee':'utility';`,c);
  c.arenaSend=(event,p)=>{sent.push({event,p:{...json(p),from:id,room:'ROOM'}});};
  c.leaveArena=message=>{errors.push(message);c.arena.phase='cancelled';};
  return {c,sent,errors,at:value=>{clock=value;},run:code=>vm.runInContext(code,c)};
}
test('primary-only offline modes never include practice, parties, or online matches',()=>{
  const h=harness();
  for(const mode of ['endless','ai1v1','ai2v2'])assert.equal(h.c.primaryOnlyMode(mode),true);
  for(const mode of ['practice','arena','arena2v2','ranked1v1','ranked2v2','partycpu2v2','partyduel_1v1v1'])assert.equal(h.c.primaryOnlyMode(mode),false);
  assert.deepEqual(json(h.c.primaryOnlyKit(alt)),{primary:'crossbow',secondary:null,melee:null,utility:null});
});
test('offline restoration leaves saved online equipment untouched',()=>{
  const h=harness();h.c.lastLoadout={...alt,utility:'grenade'};h.c.playableLastLoadout=raw=>({...raw});h.c.modeAllowsUtility=()=>true;
  vm.runInContext(functionSource(read('persistence.js'),'restoreLastLoadoutForMode'),h.c);
  h.c.restoreLastLoadoutForMode('endless');assert.deepEqual(json(h.c.loadout),{primary:'crossbow',secondary:null,melee:null,utility:null});
  h.c.restoreLastLoadoutForMode('arena');assert.deepEqual(json(h.c.loadout),{...alt,utility:'grenade'});
  assert.deepEqual(h.c.lastLoadout,{...alt,utility:'grenade'});
});
test('local primary-only readiness does not relax remote full-kit validation',()=>{
  const h=harness();h.c.loadout=h.c.primaryOnlyKit(kit);
  assert.equal(h.c.arenaLoadoutReady(true),true);assert.equal(h.c.arenaLoadoutReady(),false);
  assert.equal(h.c.arenaRemoteLoadout(h.c.loadout),null);
  h.c.loadout={primary:'shorty',secondary:null,melee:null,utility:null};assert.equal(h.c.arenaLoadoutReady(true),false);
  h.c.loadout={...kit};h.c.isLocked=k=>k==='ar';assert.equal(h.c.arenaLoadoutReady(true),false);
});
test('local CPU2v2 accepts a primary only but remote party CPU kits remain full',()=>{
  const h=harness();h.c.GEM_SHOP=[];
  vm.runInContext(functionSource(read('party.js'),'partyCpuKit'),h.c);
  assert.deepEqual(json(h.c.partyCpuKit({primary:'crossbow'},true,true)),json(h.c.primaryOnlyKit({primary:'crossbow'})));
  assert.equal(h.c.partyCpuKit({primary:'crossbow'},true),null);
  assert.equal(h.c.partyCpuKit({primary:'shorty'},true,true),null);
});
for(const mode of ['ai1v1','ai2v2'])test(`${mode} Play Again accepts its single primary without routing to a missing-sidearm error`,()=>{
  const h=harness();h.c.loadout=h.c.primaryOnlyKit(kit);h.c.arena.phase='match_end';
  h.c.GEM_SHOP=[];h.c.isBotArena=()=>true;h.c.isLocalCpu2v2=()=>true;h.c.cpuLaunchIntentCurrent=()=>true;
  h.c.partyCpuMatch={phase:'match_end',loadouts:{}};h.c.cpuTeamLocalId=()=> 'self';let starts=0;
  h.c.startBotArena=h.c.offlineCpu2v2Rematch=()=>{starts++;return true;};
  vm.runInContext(functionSource(read('party.js'),'partyCpuKit'),h.c);
  vm.runInContext(functionSource(read('ui.js'),'cpuResultRematch'),h.c);
  assert.equal(h.c.cpuResultRematch(mode,true,true,1),true);assert.equal(starts,1);
});
test('eight released guns have finite playable stats and exact slots; Shorty has two shells',()=>{
  const h=harness();
  for(const key of ['carbine','lmg','dmr','autoshotgun','crossbow','pulserifle','shorty','handcannon']){
    const w=h.run(`WEAPONS['${key}']`);
    for(const field of ['dmg','mag','reload','fireRate','pellets','spread','aimSpread','speed','range','fall','moveMod'])assert.ok(Number.isFinite(w[field]),key+':'+field);
    assert.ok(w.dmg>0&&w.mag>=1&&w.reload>0&&w.fireRate>0&&w.pellets>=1&&w.range>0&&w.fall>0&&w.fall<=1);
    assert.equal(h.c.storedLoadoutSlot(key),['shorty','handcannon'].includes(key)?'secondary':'primary');
    assert.ok(w.blurb&&w.gimmick.copy);
  }
  assert.equal(h.run('WEAPONS.shorty.mag'),2);assert.equal(h.run('WEAPONS.shorty.pellets'),6);
  assert.equal(h.run('WEAPONS.volt.fireRate'),145,'Volt remains unchanged');
});
test('windows reject duplicate members, excessive durations, and outsider commits',()=>{
  const h=harness(),create=h.c.matchLoadoutCreate;
  assert.equal(create('x',['host','host'],'host'),null);assert.equal(create('x',['host','guest'],'host',10001),null);
  const window=create('x',['host','guest'],'host');assert.equal(h.c.matchLoadoutCommit(window,'outsider',kit,h.c.arenaRemoteLoadout),false);
  assert.equal(h.c.matchLoadoutCommit(window,'guest',{...kit,primary:'shorty'},h.c.arenaRemoteLoadout),false);
});
test('commits are immutable and a host cannot replace the local player kit',()=>{
  const h=harness(),window=h.c.matchLoadoutCreate('x',['host','guest'],'host');
  assert.equal(h.c.matchLoadoutCommit(window,'host',kit,h.c.arenaRemoteLoadout),true);
  assert.equal(h.c.matchLoadoutCommit(window,'host',alt,h.c.arenaRemoteLoadout),false);
  assert.equal(h.c.matchLoadoutSeal(window,{host:kit,guest:alt},h.c.arenaRemoteLoadout,10999),false);
  assert.equal(h.c.matchLoadoutSeal(window,{host:alt,guest:kit},h.c.arenaRemoteLoadout,11000),false);
  assert.equal(h.c.matchLoadoutSeal(window,{host:kit,guest:alt,outsider:kit},h.c.arenaRemoteLoadout,11000),false);
  assert.equal(h.c.matchLoadoutSeal(window,{host:kit,guest:alt},h.c.arenaRemoteLoadout,11000),true);
  assert.equal(h.c.matchLoadoutSeal(window,{host:kit,guest:kit},h.c.arenaRemoteLoadout,11001),false);
});
test('queue editing opens/closes without leaving or changing its queue object',()=>{
  const h=harness();h.c.arena.phase='idle';h.c.arena.matchChannel=null;h.c.duelService={queue:true,mode:'2v2',ranked:true};
  const queue=h.c.duelService;assert.equal(h.c.openOnlineLoadoutEditor(),true);assert.equal(h.c.selPage,'loadout');
  h.c.loadout={...alt};assert.equal(h.c.onlineLoadoutSave(),true);assert.equal(h.c.selPage,'multidevice');
  assert.equal(h.c.duelService,queue);assert.equal(queue.queue,true);assert.deepEqual(h.c.loadout,alt);
});
test('queued required slots are replaced, never cleared by clicking the same weapon',()=>{
  const h=harness();h.c.arena.phase='queue';h.c.arena.queueChannel={};h.c.rememberLoadoutSlot=()=>{};
  vm.runInContext(functionSource(read('input.js'),'pickWeapon'),h.c);
  h.c.openOnlineLoadoutEditor();h.c.pickWeapon('ar');assert.equal(h.c.loadout.primary,'ar');
  h.c.pickWeapon('crossbow');assert.equal(h.c.loadout.primary,'crossbow');
  h.c.onlineLoadoutSave();h.c.pickWeapon('crossbow');assert.equal(h.c.loadout.primary,null,'outside a search the existing clear action remains');
});
test('a match arriving during queued category editing still launches the exact assignment',()=>{
  const h=harness();h.c.arena.phase='idle';h.c.arena.matchChannel=null;
  vm.runInContext(read('duels-service.js'),h.c);h.run("duelService={owner:'host',queue:true,match:null,ranked:false,mode:'2v2'}");
  h.c.openOnlineLoadoutEditor();h.c.selPage='PRIMARY';let launched=null;
  h.c.multideviceLaunch=match=>{launched=match;return true;};
  const match={matchId:'synthetic-match',source:'queue',roster:[{id:'host',accepted:true},{id:'guest',accepted:true}]};
  assert.equal(h.c.duelServiceApplyAssignment({status:'matched',match}),true);assert.equal(launched,match);
});
test('casual window retries cannot extend time or reopen a finished editor',()=>{
  const h=harness();assert.equal(h.c.arenaLoadoutWindowOpen(),true);assert.equal(h.c.selPage,'loadout');
  const deadline=h.c.arena.loadoutWindow.deadline;h.c.onlineLoadoutSave();h.at(5000);
  const p={from:'host',epoch:1,windowId:'arena:1',remaining:10000};
  assert.equal(h.c.arenaLoadoutWindowReceive(p),true);assert.equal(h.c.arena.loadoutWindow.deadline,deadline);assert.equal(h.c.selPage,'arena');
  assert.equal(h.c.arenaLoadoutWindowReceive({...p,from:'guest'}),false);
  assert.equal(h.c.arenaLoadoutWindowReceive({...p,epoch:0}),false);
});
test('two casual clients choose different new guns, then start with exactly those kits',()=>{
  const a=harness(),b=harness('guest','host');
  function deliver(){for(const [from,to] of [[a,b],[b,a]])while(from.sent.length){const {event,p}=from.sent.shift();to.c.arenaReceive(event,p,to.c.arena.matchChannel);}}
  a.c.arenaHostStartRound();deliver();assert.equal(a.c.arena.round,0);assert.equal(b.c.arena.round,0);
  a.c.loadout={...alt};b.c.loadout={...kit,primary:'lmg',secondary:'handcannon'};
  a.at(10999);b.at(10999);a.c.arenaLoadoutTick(10999);b.c.arenaLoadoutTick(10999);deliver();
  assert.equal(a.c.arena.round,0);assert.equal(b.c.arena.round,0);
  a.at(11000);b.at(11000);a.c.arenaLoadoutTick(11000);b.c.arenaLoadoutTick(11000);deliver();
  a.c.arenaLoadoutTick(11001);deliver();
  for(const h of [a,b]){assert.equal(h.c.arena.round,1);assert.equal(h.c.arena.phase,'countdown');assert.equal(h.errors.length,0);}
  assert.equal(a.c.loadout.primary,'crossbow');assert.equal(a.c.arena.opponent.loadout.primary,'lmg');
  assert.equal(b.c.loadout.secondary,'handcannon');assert.equal(b.c.arena.opponent.loadout.secondary,'shorty');
  assert.equal(a.c.player.cur,'crossbow');assert.equal(b.c.player.cur,'lmg');
  assert.equal(a.c.arenaLoadoutWindowReceive({from:'host',epoch:1,windowId:'arena:1',remaining:10000}),false,'no mid-fight editing');
});
test('temporary expiry or unpublication refuses a deadline kit rather than granting access',()=>{
  const h=harness();h.c.arenaLoadoutWindowOpen();h.at(11000);h.c.isLocked=()=>true;
  h.c.arenaLoadoutTick(11000);assert.equal(h.errors.length,1);assert.equal(h.c.arena.round,0);
});
test('incomplete selections fall back to the still-authorized initial kit at deadline',()=>{
  const h=harness();h.c.arenaLoadoutWindowOpen();h.c.loadout.primary=null;h.at(11000);h.c.arenaLoadoutTick(11000);
  assert.deepEqual(json(h.c.arena.loadoutWindow.commits.host),kit);assert.equal(h.errors.length,0);
});
test('lost final peer commitment retries; absent peer cancels without manufacturing a result',()=>{
  const h=harness();h.c.arenaLoadoutWindowOpen();h.at(11000);h.c.arenaLoadoutTick(11000);
  h.at(11400);h.c.arenaLoadoutTick(11400);assert.ok(h.sent.filter(p=>p.event==='loadout_commit').length>=2);
  h.at(26001);h.c.arenaLoadoutTick(26001);assert.equal(h.errors.length,1);assert.equal(h.c.arena.round,0);
});
