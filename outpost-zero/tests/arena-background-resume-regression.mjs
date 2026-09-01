import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const online=fs.readFileSync(path.join(root,'js/online.js'),'utf8');
const index=fs.readFileSync(path.join(root,'../index.html'),'utf8');

let clock=1000,nextTimer=1;
const timers=new Map(),cleared=[];
const setTimer=(fn,delay)=>{const id=nextTimer++;timers.set(id,{fn,delay});return id;};
const clearTimer=id=>{cleared.push(id);timers.delete(id);};
let presence={};
const channel={presenceState:()=>presence,track:()=>Promise.resolve(),send:()=>Promise.resolve()};
const kit={primary:'ar',secondary:'m9',melee:'knife',utility:''};
const oldOpponent={
  id:'away',name:'Away player',loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:null},
  remoteLoadoutValid:true,x:100,y:100,tx:200,ty:100,r:15,angle:Math.PI,hp:200,cur:'ar',
  utilityOut:false,parrySeq:0,parryUntil:0,parryReadyAt:0,meleeFxSeq:0,meleeFxKey:'',
  meleeFxStart:0,meleeFxUntil:0,meleeFxAngle:0,meleeFxReadyAt:0,meleeFxBlades:[],
  lastSeen:clock,presenceSeq:1,backgrounded:false,away:false
};

const context={
  console,Math,Number,String,Boolean,Object,Array,Set,Map,Promise,JSON,
  Date:{now:()=>clock},performance:{now:()=>clock},
  setTimeout:setTimer,clearTimeout:clearTimer,queueMicrotask:fn=>fn(),
  document:{hidden:false,visibilityState:'visible',addEventListener:()=>{}},
  window:{addEventListener:()=>{}},addEventListener:()=>{},navigator:{onLine:true},
  WORLD:{w:1200,h:900},ARENA_HP:250,ARENA_TARGET:5,ARENA_ROUND_MS:90000,ARENA_SYNC_MS:50,
  ARENA_TIMEOUT_HP_RETRY_MS:160,ARENA_TIMEOUT_HP_FALLBACK_MS:1000,
  ARENA_MAPS:[{id:'arena',name:'ARENA'}],ARENA_MAP_IDS:['arena'],ARENA_MAP_VOTE_MS:5000,ARENA_MAP_REVEAL_MS:2200,
  UTILITIES:{medkit:{},grenade:{},freezer:{},redball:{},beachball:{}},
  WEAPONS:{ar:{},m9:{},knife:{melee:true}},ABILITY_CD:{},MELEE_ABILITY_VISUAL_MS:{},
  MELEE_ABILITY_VISUAL_MAX_MS:3000,TWIN_SAI_PARRY_MS:1000,TAU:Math.PI*2,
  loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:null},
  authUser:{id:'me',email:'me@example.test'},practiceMode:'arena',state:'play',now:1000,
  player:{x:300,y:100,r:15,hp:200,cur:'ar'},utilityOut:false,parrySeq:0,parryUntil:0,
  arena:{
    active:true,mode:'private',room:'ROOM01',phase:'fight',matchChannel:channel,queueChannel:null,
    expectedIds:null,wantsHost:true,joinedAt:1,hostId:'me',opponent:oldOpponent,
    localReady:true,remoteReady:true,matchEpoch:4,round:2,scores:{me:1,away:1},
    networkHold:false,disconnectAt:0,disconnectDeadline:0,disconnectTimer:null,disconnectSide:'',disconnectKind:'',
    disconnectPresenceSeq:0,disconnectToken:0,matchCommitted:true,
    departureAnnounced:'',forfeitResultId:'',forfeitPacket:null,
    roundStartAt:500,roundEndAt:60000,nextRoundAt:0,roundResolved:false,
    mapVotePhase:'idle',mapVoteId:'ROOM01:4:LIVE',mapVoteDeadline:0,mapVoteRevealUntil:0,mapVoteSyncAt:0,
    pendingHazards:new Map(),remoteShots:[],remoteFireworks:[],remoteFireworkFx:[],
    wallTickAt:1000,syncAt:0
  },
  displayName:user=>user&&user.email||'player',
  storedLoadoutSlot:key=>key==='ar'?'primary':key==='m9'?'secondary':key==='knife'?'melee':key?'utility':'',
  isWeaponPublished:()=>true,isLocked:()=>false,isBotArena:()=>false,isCpuTeamArena:()=>false,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
  arenaSend:()=>Promise.resolve(),arenaDropChannel:()=>{},
  duelArenaFitZoom:()=>1,aimAngle:()=>0
};
vm.createContext(context);
vm.runInContext(online,context);

const me={id:'me',name:'Me',joined:1,protocol:3,presenceSeq:1,host:true,ready:true,backgrounded:false,away:false,...kit};
const away={id:'away',name:'Away player',joined:2,protocol:3,presenceSeq:1,host:false,ready:true,backgrounded:false,away:false,...kit};

// The returning tab's gameplay clock must catch up to real online-match time,
// but the shared round deadline remains the one both players already received.
context.arenaSetBackgrounded(true);
assert.equal(context.arena.localBackgrounded,true);
clock=1300;
context.arenaSetBackgrounded(false);
assert.equal(context.arena.localBackgrounded,false);
assert.equal(context.now,1300,
  'returning from the background must catch online cooldowns up by the elapsed wall time');
assert.equal(context.arena.roundEndAt,60000,
  'local background recovery must not compensate by extending the shared round deadline');

// An explicit away update starts one 15-second return window. The visible
// opponent keeps playing the same round throughout it.
presence={me:[me],away:[away]};
context.arenaApplyRemoteBackground({from:'away',room:'ROOM01',epoch:4,round:2,backgrounded:true,presenceSeq:2});
const firstTimer=context.arena.disconnectTimer,firstDeadline=context.arena.disconnectDeadline;
assert.ok(firstTimer&&timers.has(firstTimer),'backgrounding must start a return timer');
assert.equal(timers.get(firstTimer).delay,15000,'the return grace must be 15 seconds');
presence={me:[me]};
context.arenaMatchPresenceSync(channel);
assert.equal(context.arena.networkHold,false,
  'backgrounding one open client must not put the opponent into a network pause');
assert.equal(context.arena.roundEndAt,60000,
  'backgrounding an opponent must not extend or replace the live round clock');
assert.equal(context.arena.disconnectTimer,firstTimer,
  'Presence loss after the away update must keep the original timer');
assert.equal(context.arena.disconnectDeadline,firstDeadline,
  'duplicate away/absence events must never extend the original deadline');
assert.equal(context.arenaCanAct(),true,
  'the visible opponent must remain able to move and fire while the other tab is backgrounded');

const beforeX=context.arena.opponent.x;
clock=1500;
context.arenaWallTick(1500);
assert.ok(context.arena.opponent.x>beforeX,
  'wall-time interpolation must continue for the visible opponent instead of freezing the match loop');
assert.equal(context.arena.wallTickAt,1500,
  'the online wall clock must continue advancing while the other client is away');

// Presence returning must reuse the same opponent/match objects and current
// deadlines. It must not compensate for away time by restarting or extending.
clock=5000;presence={me:[me],away:[{...away,presenceSeq:3,backgrounded:false,away:false}]};
context.arenaMatchPresenceSync(channel);
assert.strictEqual(context.arena.opponent,oldOpponent,
  'returning must reconcile into the existing live opponent instead of constructing a new match');
assert.equal(context.arena.matchEpoch,4);
assert.equal(context.arena.round,2);
assert.deepEqual({...context.arena.scores},{me:1,away:1});
assert.equal(context.arena.roundEndAt,60000,
  'returning from the background must resume at the current deadline, not add the away duration');
assert.equal(context.arenaCanAct(),true,'the returning client must immediately rejoin the live fight');

// The returning client's own Realtime channel may have briefly entered a
// reconnect hold. Clearing that local transport state must still preserve the
// shared wall-clock deadline established by the client that stayed visible.
context.arena.networkHold=true;context.arena.disconnectSide='self';context.arena.disconnectAt=5000;
context.arena.disconnectTimer=setTimer(()=>{},5000);
clock=7000;
context.arenaMatchPresenceSync(channel);
assert.equal(context.arena.networkHold,false,'a reconnected background client must leave transport hold');
assert.equal(context.arena.roundEndAt,60000,
  'a local reconnect must not rewind the live match by shifting its round deadline');
assert.equal(context.arenaCanAct(),true,'the reconnected client must resume the same live round');

// Even if the foreground broadcast is lost, the expiry callback rechecks
// current Presence before it awards anything.
let forfeitClaims=0;
context.arenaClaimOpponentForfeit=()=>{forfeitClaims++;return true;};
context.arenaRequestResume=()=>true;
context.arenaApplyRemoteBackground({from:'away',room:'ROOM01',epoch:4,round:2,backgrounded:true,presenceSeq:4});
const recheckTimer=context.arena.disconnectTimer;
presence={me:[me],away:[{...away,presenceSeq:5,backgrounded:false,away:false}]};
clock=context.arena.disconnectDeadline;
timers.get(recheckTimer).fn();
assert.equal(forfeitClaims,0,'fresh foreground Presence at expiry must save the live match');
assert.equal(context.arena.disconnectTimer,null,'the recovered hold must be fully cleared');

// If both players switch away, neither client may independently declare
// itself the winner. Both mirrored clients take the same no-result path.
let mutualClosures=0,ownLosses=0;
context.leaveArena=(message,toHub,suppressDeparture)=>{
  assert.match(message,/No result was recorded/);assert.equal(toHub,false);assert.equal(suppressDeparture,true);
  mutualClosures++;return true;
};
context.arenaApplyOwnDisconnectLoss=()=>{ownLosses++;return true;};
context.arena.localBackgrounded=true;
context.arenaApplyRemoteBackground({from:'away',room:'ROOM01',epoch:4,round:2,backgrounded:true,presenceSeq:6});
assert.equal(context.arena.disconnectSide,'both','local-away plus opponent-away must become one mutual hold');
presence={me:[me]};
context.arenaMatchPresenceSync(channel);
assert.equal(context.arena.disconnectSide,'both',
  'Realtime traffic received by a hidden tab must not turn a mutual hold into an opponent forfeit');
const mutualTimer=context.arena.disconnectTimer;
clock=context.arena.disconnectDeadline;
timers.get(mutualTimer).fn();
assert.equal(forfeitClaims,0);assert.equal(ownLosses,0);
assert.equal(mutualClosures,1,'simultaneous away expiry must close without a winner or loser');
context.arena.localBackgrounded=false;
context.arenaApplyRemoteBackground({from:'away',room:'ROOM01',epoch:4,round:2,backgrounded:false,presenceSeq:7});

// A stale callback from a cleared hold cannot cancel a newer outage, and a
// player who remains absent for the whole new window forfeits exactly once.
context.arenaApplyRemoteBackground({from:'away',room:'ROOM01',epoch:4,round:2,backgrounded:true,presenceSeq:8});
const obsoleteTimer=context.arena.disconnectTimer,obsoleteCallback=timers.get(obsoleteTimer).fn,obsoleteToken=context.arena.disconnectToken;
context.arenaApplyRemoteBackground({from:'away',room:'ROOM01',epoch:4,round:2,backgrounded:false,presenceSeq:9});
context.arenaApplyRemoteBackground({from:'away',room:'ROOM01',epoch:4,round:2,backgrounded:true,presenceSeq:10});
const expiryTimer=context.arena.disconnectTimer;
assert.notEqual(context.arena.disconnectToken,obsoleteToken,'each genuine outage needs a unique callback identity');
obsoleteCallback();
assert.equal(context.arena.disconnectTimer,expiryTimer,'an obsolete callback must not clear the newer outage');
presence={me:[me]};clock=context.arena.disconnectDeadline;
timers.get(expiryTimer).fn();
assert.equal(forfeitClaims,1,'an absent player must forfeit after the full grace window');
assert.equal(context.arena.disconnectTimer,null,'expiry must retire its timer before applying the result');

assert.match(index,/js\/online\.js\?v=20260831-duel-stability-v1/,
  'the deployed page must load the background-resume Arena code');
assert.match(index,/js\/state\.js\?v=20260831-duel-stability-v1/,
  'the deployed page must load the matching background-resume Arena state');

console.log('PASS backgrounding one open Arena client never pauses the other and rejoins the live match');
