import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..'),source=fs.readFileSync(path.join(root,'js/multidevice.js'),'utf8');
let clock=1000,dropResultsFor='';
const channels=[],timers=[],settlements=[];
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function client(id){
  const c={console,Date:{now:()=>clock},performance:{now:()=>clock},Math,Number,Object,Array,String,Map,Set,
    authUser:{id},loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:null},arena:{},player:{hp:250,mags:{},reserve:{}},perks:{},cam:{},
    WEAPONS:{ar:{},m9:{},knife:{melee:true}},TWIN_SAI_PARRY_MS:1000,MELEE_ABILITY_VISUAL_MAX_MS:10000,
    now:0,TAU:Math.PI*2,soloPractice:false,practiceMode:null,state:'select',selPage:'multidevice',menuOpen:false,aiming:false,rmbAim:false,
    bullets:[],ebullets:[],enemies:[],particles:[],pickups:[],damageNumbers:[],grenades:[],pearls:[],balls:[],flames:[],freezeFx:[],splitBalls:[],
    utilReadyT:0,medChan:0,medChanHeal:0,medHealPct:0,medKillCharge:0,utilityOut:false,abilityCD:{},quickReadyT:0,sawFuel:100,sawLock:false,
    daggersOut:null,comboStep:0,comboNextT:0,parryUntil:0,parrySeq:0,teraHitCharge:0,fistFlurryUntil:0,sawChargeUntil:0,playerFrozenUntil:0,
    zoom:1,waveMsg:'',waveMsgT:0,
    setInterval:callback=>{timers.push(callback);return timers.length;},clearInterval:()=>{},
    arenaLoadoutReady:()=>true,arenaRemoteLoadout:r=>r,freshArena:status=>({status,active:false,matchChannel:null,queueChannel:null}),
    startGame:()=>{c.player.mags={};c.player.reserve={};},resetRoundTransitionInput:()=>{},resetHeldGameplayInput:()=>{},
    resetWeaponGimmickState:()=>{},clearCameraShake:()=>{},medKillsRequired:()=>5,magSize:()=>30,arenaResetMapRuntime:()=>{},
    resetMeleeAbilityVisual:()=>{},duelArenaFitZoom:()=>1,sfx:()=>{},aimAngle:()=>0,
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),meleeAbilityVisualBlades:()=>[],stepRemoteShotVisuals:()=>{},stepRemoteFireworkVisuals:()=>{},
    arenaApplyRemoteParryState:()=>{},arenaApplyRemoteMeleeAbilityState:()=>{},arenaUtilityFrozen:()=>false,
    cancelMedHeal:()=>{},damagePlayerHp:damage=>{c.player.hp=Math.max(0,c.player.hp-damage);},addShake:()=>{},addDamageNumber:()=>{},
    duelServiceAcknowledgeStart:async()=>true,arenaPresenceList:()=>[],duelServiceAbortMatch:()=>{},
    duelServiceSubmitRanked:result=>settlements.push({id,result}),
    sb:{channel(topic,opts){
      const channel={id,topic,opts,events:{},on(kind,filter,callback){if(kind==='broadcast')this.events[filter.event]=callback;return this;},
        subscribe(callback){queueMicrotask(()=>callback('SUBSCRIBED'));return this;},track:async()=>{},
        send(message){
          for(const peer of channels)if(peer!==this&&peer.topic===topic){
            if(peer.id===dropResultsFor&&(message.event==='result'||message.event==='control'&&message.payload.phase==='round_end'))continue;
            queueMicrotask(()=>peer.events[message.event]?.({payload:structuredClone(message.payload)}));
          }
          return Promise.resolve('ok');
        }};
      channels.push(channel);return channel;
    },removeChannel:async()=>{}},
  };
  vm.createContext(c);vm.runInContext(source,c);return c;
}
const config={matchId:'00000000-0000-4000-8000-000000000099',epoch:'server-match-epoch',hostId:'alice',mode:'2v2',source:'queue',ranked:true,
  roster:['alice','bob','charlie','dana'].map((id,i)=>({id,name:id,team:i<2?'A':'B',loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:null},accepted:true}))};
const clients=config.roster.map(r=>client(r.id));
for(const c of clients)assert.equal(await c.multideviceLaunch(config),true);
await flush();
const tick=async(at)=>{
  clock=at;
  for(const c of clients){c.now=clock-1000;c.multideviceWallTick(clock);c.multideviceSyncTick(clock);}
  await flush();
};
await tick(1000);
for(const c of clients){
  const m=c.multideviceView();
  assert.equal(m.connected,true);assert.equal(m.round,1);assert.equal(m.phase,'countdown');
  assert.equal(c.player.hp,250);assert.equal(Object.keys(m.actors).length,4);
  assert.equal(m.channel.opts.config.private,true);assert.equal(m.channel.topic,'oz-duel:'+config.matchId);
  assert.equal(c.practiceMode,'arena');
}
await tick(4001);
for(const c of clients)assert.equal(c.multideviceView().phase,'fight');
const host=clients[0],bob=clients[1],charlie=clients[2],dana=clients[3];
assert.equal(host.multideviceTargets().length,2,'both enemies are visible to the collision pass');
assert.equal(host.multideviceHit(host.multideviceView().actors.bob,45,'shot'),false,'no team hit is sent');
assert.equal(bob.player.hp,250);
host.multideviceHit(host.multideviceView().actors.charlie,250,'shot');await flush();
assert.equal(charlie.player.hp,0);await tick(4100);
assert.equal(host.multideviceView().phase,'fight','round continues with the other opponent alive');
// Simulate an actual lost result packet, including the redundant round-end
// control packet. The next start must still recover Dana directly into round2.
dropResultsFor='dana';
host.multideviceHit(host.multideviceView().actors.dana,250,'shot');await flush();await tick(4200);
assert.equal(host.multideviceView().phase,'round_end');assert.equal(host.multideviceView().scores.A,1);
assert.equal(dana.multideviceView().phase,'fight','the test genuinely dropped this peer\'s result');
await tick(6801);
for(const c of clients){
  assert.equal(c.multideviceView().round,2,'all four devices must enter round2 after the first winner');
  assert.equal(c.multideviceView().scores.A,1);assert.equal(c.player.hp,250);
  assert.equal(c.multideviceView().phase,'countdown');
}
dropResultsFor='';await tick(9802);
const stale={from:'alice',matchId:config.matchId,epoch:config.epoch,round:1,id:'alice:1:hit:999',to:'charlie',dmg:250,kind:'shot'};
assert.equal(charlie.multideviceReceive('hit',stale,charlie.multideviceView().channel),false);
assert.equal(charlie.player.hp,250,'old-round damage cannot hurt a freshly respawned player');
assert.equal(charlie.multideviceReceive('hit',{...stale,round:2,epoch:'other-session'},charlie.multideviceView().channel),false);

assert.equal(settlements.length,0,'unfinished rounds cannot settle ranked results');
for(let round=2;round<=5;round++){
  host.multideviceHit(host.multideviceView().actors.charlie,250,'shot');await flush();
  host.multideviceHit(host.multideviceView().actors.dana,250,'shot');await flush();
  await tick(clock+100);
  if(round<5){await tick(clock+2601);await tick(clock+3001);}
}
for(const c of clients){
  assert.equal(c.multideviceView().phase,'match_end');assert.equal(c.multideviceView().scores.A,5);
  assert.equal(c.selPage,'multidevice');assert.equal(c.practiceMode,null);
}
assert.equal(settlements.length,4,'each roster member independently reports the same finished ranked match');
assert.equal(new Set(settlements.map(s=>s.id)).size,4);
for(const {result} of settlements){assert.equal(result.scoreA,5);assert.equal(result.scoreB,0);assert.equal(result.winningTeam,'A');}
host.multidevicePublishControl();await flush();
assert.equal(settlements.length,4,'repeated terminal snapshots cannot double-submit a result');

// Three real receiver states, not a renamed two-player duel.
const ffa={...config,matchId:'00000000-0000-4000-8000-000000000100',hostId:'eve',epoch:'ffa-epoch',mode:'1v1v1',source:'party',ranked:false,
  roster:['eve','fred','gwen'].map((id,i)=>({id,name:id,team:['A','B','C'][i],loadout:config.roster[0].loadout,accepted:true}))};
const freeClients=ffa.roster.map(r=>client(r.id));
for(const c of freeClients)await c.multideviceLaunch(ffa);await flush();
const freeTick=async(delta)=>{clock+=delta;for(const c of freeClients){c.now=clock-1000;c.multideviceWallTick(clock);c.multideviceSyncTick(clock);}await flush();};
await freeTick(1);await freeTick(3001);
const eve=freeClients[0];
eve.multideviceHit(eve.multideviceView().actors.fred,250,'shot');await flush();await freeTick(100);
assert.equal(eve.multideviceView().phase,'fight','three-way party round continues after the first elimination');
eve.multideviceHit(eve.multideviceView().actors.gwen,250,'shot');await flush();await freeTick(100);await freeTick(2601);
for(const c of freeClients){assert.equal(c.multideviceView().round,2);assert.equal(c.player.hp,250);assert.equal(c.multideviceView().scores.A,1);}
assert.equal(settlements.length,4,'FFA never submits a ranked result');
console.log('PASS independent 4-device2v2 +3-deviceFFA: private launch, friendly-fire protection, lost-result round2 recovery, first-to5 and one ranked submission per member');
