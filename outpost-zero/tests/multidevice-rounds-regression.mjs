import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'js/multidevice.js'),'utf8');
const context={console,Date,Math,Set,Map,Number,Object,String,Array};
vm.createContext(context);vm.runInContext(source,context);
const config={matchId:'00000000-0000-4000-8000-000000000001',epoch:'epoch-one',hostId:'alice',mode:'2v2',source:'queue',ranked:false,
  roster:['alice','bob','charlie','dana'].map((id,i)=>({id,name:id,team:i<2?'A':'B',loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:null},accepted:true}))};
const make=(cfg=config,self='alice')=>context.multideviceCreate(cfg,self,1000);
const envelope=(m,extra={})=>({from:m.hostId,matchId:m.matchId,epoch:m.epoch,round:m.round,...extra});
const start=(m,clock=1000)=>context.multideviceRoundBegin(m,envelope(m,{round:m.round+1,scores:{...m.scores},startInMs:3000,remainingMs:93000}),clock);
const finish=(m,winner,clock=7000)=>context.multideviceRoundResult(m,envelope(m,{winner,
  scores:Object.fromEntries(m.teams.map(t=>[t,m.scores[t]+(winner===t?1:0)])),
  matchOver:!!winner&&m.scores[winner]+1===5}),clock);

assert.ok(make());
assert.equal(make({...config,mode:'1v1v1'}),null,'FFA must never enter the public queue');
const ffa={...config,mode:'1v1v1',source:'party',roster:config.roster.slice(0,3).map((a,i)=>({...a,team:['A','B','C'][i]}))};
assert.ok(make(ffa));
assert.equal(make({...ffa,ranked:true}),null,'party FFA is not ranked');
assert.equal(make({...ffa,roster:ffa.roster.map(a=>({...a,team:'A'}))}),null,'FFA teams must all differ');
assert.equal(make({...config,roster:config.roster.slice(0,3)}),null,'a human2v2 requires four people');
assert.equal(make({...config,roster:config.roster.map((a,i)=>({...a,id:i===3?'charlie':a.id}))}),null,'duplicate accounts cannot fill two slots');
assert.equal(make({...config,roster:config.roster.map((a,i)=>({...a,team:i===3?'A':a.team}))}),null,'team rosters must be two versus two');
assert.equal(make({...config,roster:config.roster.map((a,i)=>({...a,accepted:i!==3}))}),null,'unaccepted party invite cannot launch');
assert.equal(make(config,'intruder'),null);

const match=make();
assert.equal(finish(match,'A'),false,'no 0-0 setup match may decide a winner');
assert.equal(start(match),true);
assert.equal(match.round,1);assert.equal(match.phase,'countdown');
assert.equal(finish(match,'A'),false,'countdown cannot produce a round result');
match.phase='fight';
match.actors.charlie.hp=0;
assert.equal(context.multideviceRoundWinner(match).resolved,false,'killing only one opposing teammate does not end the round');
match.actors.dana.hp=0;
assert.equal(context.multideviceRoundWinner(match).winner,'A');
assert.equal(finish(match,'A'),true);assert.equal(match.scores.A,1);assert.equal(match.phase,'round_end');
assert.equal(finish(match,'A'),false,'duplicate results cannot award another point');
assert.equal(start(match,9600),true,'round2 starts from the actual round-end state, not the setup menu');
assert.equal(match.round,2);assert.equal(match.scores.A,1);
for(const actor of Object.values(match.actors))assert.equal(actor.hp,250,'every actor, including both defeated players, must reset');
assert.equal(match.seen.size,0);assert.equal(match.sent.size,0);assert.equal(match.received.size,0);
assert.equal(context.multideviceEnvelope(match,envelope(match,{round:1})),false,'late prior-round packets cannot enter round2');
assert.equal(context.multideviceEnvelope(match,envelope(match,{epoch:'old-epoch'})),false,'old epoch packets cannot enter a new match');
assert.equal(context.multideviceEnvelope(match,envelope(match,{matchId:'wrong-room'})),false);

match.phase='fight';
const hit={...envelope(match),from:'alice',to:'bob',id:'alice:2:hit:1',dmg:45,kind:'shot'};
assert.equal(context.multideviceDamageAllowed(match,hit),false,'friendly fire is rejected at receiving boundary too');
assert.equal(context.multideviceDamageAllowed(match,{...hit,to:'charlie'}),true);
assert.equal(context.multideviceDamageAllowed(match,{...hit,to:'charlie',dmg:NaN}),false);
assert.equal(context.multideviceDamageAllowed(match,{...hit,to:'charlie',dmg:1000}),false);
assert.equal(context.multideviceDamageAllowed(match,{...hit,to:'intruder'}),false);
assert.equal(context.multideviceDamageAllowed(match,{...hit,from:'intruder',to:'charlie'}),false);
assert.equal(context.multideviceDamageAllowed(match,{...hit,to:'charlie',round:1}),false);
match.actors.alice.hp=0;
assert.equal(context.multideviceDamageAllowed(match,{...hit,to:'charlie'}),false,'eliminated players cannot keep sending hit events');
match.actors.alice.hp=100;match.actors.bob.hp=110;match.actors.charlie.hp=200;match.actors.dana.hp=5;
assert.equal(context.multideviceRoundWinner(match,true).winner,'A','timeout compares total remaining team HP (210 versus205)');
match.actors.dana.hp=10;
assert.equal(context.multideviceRoundWinner(match,true).winner,null,'equal teamHP is a draw');

const actorPacket={...envelope(match),from:'charlie',seq:1,x:1700,y:900,angle:0,cur:'ar',hp:180};
assert.equal(context.multideviceAcceptActorState(match,actorPacket,10000),true);
assert.equal(context.multideviceAcceptActorState(match,{...actorPacket,x:1650},10001),false,'duplicate sequence cannot rewind movement');
assert.equal(context.multideviceAcceptActorState(match,{...actorPacket,seq:2,x:NaN},10002),false);
assert.equal(context.multideviceAcceptActorState(match,{...actorPacket,seq:2,x:5000},10002),false);
assert.equal(context.multideviceAcceptActorState(match,{...actorPacket,seq:2,hp:250},10002),true);
assert.equal(match.actors.charlie.hp,180,'ordinary movement state cannot heal a player');
match.actors.charlie.hp=0;
assert.equal(context.multideviceAcceptActorState(match,{...actorPacket,seq:3,hp:250},10003),true);
assert.equal(match.actors.charlie.hp,0,'a stale healthy packet cannot resurrect an eliminated actor');
assert.equal(context.multideviceAcceptActorState(match,{...actorPacket,seq:4},match.roundEndAt),false,'post-timeout state cannot change final HP');

for(let point=2;point<=5;point++){
  if(match.phase==='countdown')match.phase='fight';
  assert.equal(finish(match,'A',point*10000),true);
  if(point<5)assert.equal(start(match,point*10000+2600),true);
}
assert.equal(match.scores.A,5);assert.equal(match.phase,'match_end');assert.equal(match.nextRoundAt,0);
assert.equal(start(match,90000),false,'first-to-five match cannot silently launch another round');

const free=make(ffa);start(free);free.phase='fight';free.actors.alice.hp=0;
assert.equal(context.multideviceRoundWinner(free).resolved,false,'three-way FFA continues after first elimination');
free.actors.bob.hp=0;
assert.equal(context.multideviceRoundWinner(free).winner,'C');
assert.equal(finish(free,'C'),true);
assert.equal(start(free,10000),true,'FFA also advances into round2');

// Complete receiver/ack path: two received copies cannot double damage and
// a deflected hit must not display a damage counter for the original shooter.
const receive=make(config,'charlie');start(receive);receive.phase='fight';
const responses=[],damageCounters=[];
Object.assign(context,{fixture:receive,arena:{mode:'multidevice'},player:{hp:250,x:1700,y:900},now:5000,
  parryUntil:0,TWIN_SAI_PARRY_MS:1000,arenaUtilityFrozen:()=>false,cancelMedHeal:()=>{},
  damagePlayerHp:d=>context.player.hp=Math.max(0,context.player.hp-d),addShake:()=>{},sfx:()=>{},
  resetHeldGameplayInput:()=>{},spawnTwinSaiReflection:()=>{},addDamageNumber:(...args)=>damageCounters.push(args)});
context.responses=responses;
vm.runInContext('multidevice=fixture; multideviceSend=(event,p)=>responses.push({event,p});',context);
receive.roundEndAt=Date.now()+90000;
const p={...hit,round:1,id:'alice:1:hit:1',to:'charlie'};
assert.equal(context.multideviceTakeHit(p),true);assert.equal(context.player.hp,205);
assert.equal(context.multideviceTakeHit(p),false);assert.equal(context.player.hp,205);
assert.equal(responses.length,2,'duplicates resend the same acknowledgement for packet-loss recovery');
context.parryUntil=5500;
const reflected={...p,id:'alice:1:hit:2'};
assert.equal(context.multideviceTakeHit(reflected),true);assert.equal(context.player.hp,205);
assert.equal(responses.at(-1).p.parried,true);assert.equal(responses.at(-1).p.dealt,0);

const sender=make();start(sender);sender.phase='fight';
sender.sent.set(p.id,{packet:{...p,to:'charlie'},at:0});context.fixture=sender;
vm.runInContext('multidevice=fixture',context);
assert.equal(context.multideviceHitResult({from:'charlie',to:'alice',id:p.id,hp:205,dealt:0,parried:true}),true);
assert.equal(damageCounters.length,0,'deflection acknowledgement must not show fake damage');

const online=fs.readFileSync(path.join(root,'js/online.js'),'utf8'),combat=fs.readFileSync(path.join(root,'js/combat.js'),'utf8');
assert.match(online,/function arenaWallTick\(wall\)\{\s*if\(typeof isMultideviceArena/);
assert.match(online,/function arenaSyncTick\(wall\)\{\s*if\(typeof isMultideviceArena/);
assert.match(online,/function arenaCanAct\(\)\{\s*if\(typeof isMultideviceArena/);
assert.match(source,/private:true/,'rooms require membership-scoped private Realtime');
assert.match(source,/setInterval\([\s\S]*multideviceWallTick/,'background control cannot depend solely on render frames');
assert.match(source,/duelServiceSubmitRanked/,'ranked result only goes to server settlement');
assert.doesNotMatch(source,/submitArenaWin\(/,'2v2 andFFA must not inflate the legacy casual1v1 counter');
assert.match(combat,/b\.multideviceHits/,'projectiles deduplicate contacts per target, not one global opponent');
assert.match(combat,/projectile\.multideviceAlly/,'friendly freezer projectiles cannot freeze a teammate');
console.log('PASS multi-device2v2/partyFFA: round2, first-to5, timeoutHP, team-safe hits, deflection, replay and reconnect guards');
