import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const online=fs.readFileSync(path.join(root,'js/online.js'),'utf8');

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);if(start<0)throw new Error('missing '+name);
  const brace=source.indexOf('{',start);let depth=0,quote='',escaped=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('unterminated '+name);
}

// Presence can briefly contain more than one metadata row for one user after
// a reconnect or when another tab closes. Array order is not freshness.
const presenceContext={Map,Object,Array,String,Number};vm.createContext(presenceContext);
vm.runInContext(functionSource(online,'arenaPresenceList'),presenceContext);
const oldMeta={id:'guest',joined:20,presenceSeq:7,backgrounded:true,away:true};
const freshMeta={id:'guest',joined:20,presenceSeq:8,backgrounded:false,away:false};
for(const rows of [[oldMeta,freshMeta],[freshMeta,oldMeta]]){
  const list=presenceContext.arenaPresenceList({presenceState:()=>({guest:rows})});
  assert.equal(list.length,1);
  assert.equal(list[0].presenceSeq,8,'the greatest Presence sequence must win regardless of metadata array order');
  assert.equal(list[0].backgrounded,false,'stale away metadata must not overwrite the newest foreground state');
}

// A missing reveal acknowledgement cannot freeze the visible host forever.
// The authoritative result is replayable, so the host must start after reveal.
let mapClock=9000,roundStarts=0;
const mapContext={
  Date:{now:()=>mapClock},Math,Number,String,Set,
  now:mapClock,arena:{networkHold:false,mapVotePhase:'reveal',mapVoteSyncAt:10000,mapVoteRevealUntil:8000,
    mapVoteResult:{resultId:'vote-result'},mapVoteAcks:new Set(['host']),mapVoteStartPending:false,
    hostId:'host',opponent:{id:'guest'}},authUser:{id:'host'},
  arenaIsLocalMapVote:()=>false,arenaMapVoteResultPacket:()=>null,arenaSend:()=>{},
  arenaHostStartRound:()=>{roundStarts++;}
};
vm.createContext(mapContext);vm.runInContext(functionSource(online,'arenaMapVoteTick'),mapContext);
mapContext.arenaMapVoteTick();
assert.equal(roundStarts,1,'the map reveal must not require a live opponent ACK before the host starts');
assert.equal(mapContext.arena.mapVoteStartPending,true,'the ACK-free start must remain idempotently locked');

// Full behavior below is intentionally end-to-end through resume_request and
// resume_state. It proves a guest can miss both a result and a later start,
// then converge without receiving a fresh full-length round.
function makeClient(id,opponentId,hostId,clockRef){
  const sent=[];
  const channel={
    presenceState:()=>({}),track:()=>Promise.resolve(),
    send:message=>{sent.push(structuredClone(message));return Promise.resolve();}
  };
  const primary={slot:'primary'},secondary={slot:'secondary'},melee={slot:'melee',melee:true};
  const ctx={
    console:{warn:()=>{}},Math,Number,String,Boolean,Object,Array,Set,Map,Promise,JSON,RegExp,
    structuredClone,Date:{now:()=>clockRef.value},performance:{now:()=>clockRef.value},
    setTimeout:()=>1,clearTimeout:()=>{},queueMicrotask:fn=>fn(),
    document:{hidden:false,visibilityState:'visible',addEventListener:()=>{}},
    window:{addEventListener:()=>{}},addEventListener:()=>{},navigator:{onLine:true},
    WORLD:{w:1600,h:900},ARENA_HP:250,ARENA_TARGET:5,ARENA_ROUND_MS:90000,ARENA_SYNC_MS:50,
    ARENA_TIMEOUT_HP_RETRY_MS:160,ARENA_TIMEOUT_HP_FALLBACK_MS:1000,
    ARENA_MAP_VOTE_MS:5000,ARENA_MAP_REVEAL_MS:2200,
    ARENA_MAPS:[{id:'arena',name:'ARENA'}],ARENA_MAP_IDS:['arena'],
    UTILITIES:{medkit:{},grenade:{},freezer:{},redball:{},beachball:{}},
    WEAPONS:{ar:primary,m9:secondary,knife:melee},ABILITY_CD:{},MELEE_ABILITY_VISUAL_MS:{},
    MELEE_ABILITY_VISUAL_MAX_MS:3000,TWIN_SAI_PARRY_MS:1000,TAU:Math.PI*2,
    loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:null},
    authUser:{id,email:id+'@example.test'},practiceMode:'arena',state:'play',now:clockRef.value,
    player:{x:id==='host'?300:1300,y:450,r:15,hp:137,cur:'ar',mags:{},reserve:{}},
    cam:{x:0,y:0},zoom:1,perks:{maxhp:250},utilityOut:false,parrySeq:0,parryUntil:0,
    playerFrozenUntil:0,bullets:[],ebullets:[],enemies:[],particles:[],pickups:[],damageNumbers:[],
    grenades:[],pearls:[],balls:[],flames:[],freezeFx:[],utilReadyT:0,medChan:0,medChanHeal:0,
    medHealPct:0,medKillCharge:0,abilityCD:{},quickReadyT:0,sawFuel:100,sawLock:false,
    daggersOut:null,comboStep:0,comboNextT:0,teraHitCharge:15,fistFlurryUntil:0,sawChargeUntil:0,
    menuOpen:false,aiming:false,rmbAim:false,waveMsg:'',waveMsgT:0,
    arena:{
      active:true,mode:'private',room:'ROOM01',phase:'fight',matchChannel:channel,queueChannel:null,
      expectedIds:null,wantsHost:id===hostId,joinedAt:id===hostId?1:2,hostId,
      opponent:{id:opponentId,name:opponentId,loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:null},
        remoteLoadoutValid:true,x:id==='host'?1300:300,y:450,tx:id==='host'?1300:300,ty:450,r:15,
        angle:0,hp:151,cur:'ar',utilityOut:false,parrySeq:0,parryUntil:0,parryReadyAt:0,
        meleeFxSeq:0,meleeFxKey:'',meleeFxStart:0,meleeFxUntil:0,meleeFxAngle:0,
        meleeFxReadyAt:0,meleeFxBlades:[],lastSeen:clockRef.value,backgrounded:false,away:false},
      localReady:true,remoteReady:true,matchEpoch:4,round:id==='host'?3:1,
      scores:id==='host'?{host:2,guest:0}:{host:0,guest:0},
      networkHold:false,disconnectAt:0,disconnectTimer:null,disconnectSide:'',departureAnnounced:'',
      forfeitResultId:'',forfeitPacket:null,roundStartAt:id==='host'?20000:1000,
      roundEndAt:id==='host'?80000:30000,nextRoundAt:0,roundResolved:false,winRecorded:false,
      mapId:'arena',mapVotePhase:'locked',mapVoteId:'ROOM01:4:VOTE',mapVoteDeadline:0,
      mapVotes:{host:'arena',guest:'arena'},mapVoteResult:null,mapVoteAcks:new Set(),
      mapVoteRevealUntil:0,mapVoteSyncAt:0,mapVoteStartPending:false,
      pendingHazards:new Map(),hazardReceipts:new Map(),hazardArbitrations:new Map(),
      remoteShots:[],remoteFireworks:[],remoteFireworkFx:[],syncAt:0,wallTickAt:clockRef.value,
      timeoutHpId:'',timeoutHp:new Map(),timeoutHpNextAt:0,timeoutOpponentHp:null
    },
    displayName:user=>user&&user.id||'player',
    storedLoadoutSlot:key=>key==='ar'?'primary':key==='m9'?'secondary':key==='knife'?'melee':key?'utility':'',
    isWeaponPublished:()=>true,isLocked:()=>false,isBotArena:()=>false,isCpuTeamArena:()=>false,
    clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
    resetHeldGameplayInput:()=>{},resetRoundTransitionInput:()=>{},resetWeaponGimmickState:()=>{},clearCameraShake:()=>{},
    startGame:()=>true,arenaResetMapRuntime:()=>{},duelArenaSpawn:side=>({x:side?1300:300,y:450,angle:side?Math.PI:0}),
    duelArenaFitZoom:()=>1,resetMeleeAbilityVisual:()=>{},medKillsRequired:()=>3,magSize:()=>30,
    sfx:()=>{},aimAngle:()=>0,dropUnownedFromLoadout:()=>{},arenaRecordDailyOutcome:()=>false,
    submitArenaWin:()=>{},arenaWinResultId:()=>'',resetWeaponState:()=>{}
  };
  vm.createContext(ctx);vm.runInContext(online,ctx);
  return {ctx,sent,drain(event){
    const index=sent.findIndex(message=>message&&message.event===event);
    return index<0?null:sent.splice(index,1)[0].payload;
  }};
}

const clock={value:50000},host=makeClient('host','guest','host',clock),guest=makeClient('guest','host','host',clock);
assert.equal(typeof guest.ctx.arenaRequestResume,'function','returning clients need an explicit resume request');
assert.equal(typeof host.ctx.arenaBuildResumeState,'function','the host needs a replayable authoritative control snapshot');
assert.equal(typeof guest.ctx.arenaApplyResumeState,'function','the stale client needs a validated snapshot application path');

guest.ctx.arenaRequestResume();
const request=guest.drain('resume_request');
assert.ok(request&&request.requestId,'resume requests need a unique correlation id');
host.ctx.arenaReceive('resume_request',request);
const snapshot=host.drain('resume_state');
assert.ok(snapshot,'the host must answer its current opponent with authoritative resume state');
assert.equal(snapshot.epoch,4);assert.equal(snapshot.round,3);
assert.deepEqual(snapshot.roundStart&&snapshot.roundStart.scores,{host:2,guest:0});
assert.equal(snapshot.roundStart&&snapshot.roundStart.remainingMs,30000,
  'the host must publish only the time actually left in the round');

guest.ctx.arenaReceive('resume_state',snapshot);
assert.equal(guest.ctx.arena.matchEpoch,4);
assert.equal(guest.ctx.arena.round,3,'a guest two control messages behind must jump to the live round');
assert.deepEqual({...guest.ctx.arena.scores},{host:2,guest:0});
assert.equal(guest.ctx.arena.phase,'fight');
assert.equal(guest.ctx.arena.roundEndAt,80000,'resume must preserve the host deadline instead of granting a new 90-second round');
assert.notEqual(guest.ctx.arena.roundEndAt,clock.value+guest.ctx.ARENA_ROUND_MS);

clock.value=55000;
guest.ctx.arenaReceive('resume_state',snapshot);
assert.equal(guest.ctx.arena.roundEndAt,80000,'a duplicated old snapshot must not extend the deadline on later receipt');

// A delayed away message from an earlier match cannot disable disconnect
// handling in the current epoch. A current message remains valid.
guest.ctx.arena.opponent.backgrounded=false;guest.ctx.arena.opponent.away=false;
guest.ctx.arenaReceive('background',{from:'host',room:'ROOM01',epoch:3,round:9,backgrounded:true,presenceSeq:1});
assert.equal(guest.ctx.arena.opponent.backgrounded,false,'stale-epoch background packets must be ignored');
guest.ctx.arenaReceive('background',{from:'host',room:'ROOM01',epoch:4,round:2,backgrounded:true,presenceSeq:1});
assert.equal(guest.ctx.arena.opponent.backgrounded,false,'a delayed background packet from an earlier round must be ignored');
guest.ctx.arenaReceive('background',{from:'host',room:'ROOM01',epoch:4,round:3,backgrounded:true,presenceSeq:1});
assert.equal(guest.ctx.arena.opponent.backgrounded,true,'the current opponent may still publish a current-epoch away state');
const awayTimer=guest.ctx.arena.disconnectTimer,awayDeadline=guest.ctx.arena.disconnectDeadline;
guest.ctx.arenaSetBackgrounded(true);
assert.equal(guest.ctx.arena.disconnectSide,'both','two away players must enter the mutual no-result hold');
guest.ctx.arenaReceive('resume_state',snapshot);
assert.equal(guest.ctx.arena.disconnectTimer,awayTimer,
  'a delayed host snapshot is not proof that its tab returned foreground');
assert.equal(guest.ctx.arena.disconnectDeadline,awayDeadline,
  'a resume snapshot must not replace or extend an opponent-away deadline');
assert.equal(guest.ctx.arena.disconnectSide,'both',
  'a hidden tab receiving a snapshot must remain in the mutual no-result hold');
guest.ctx.arenaSetBackgrounded(false);
assert.equal(guest.ctx.arena.disconnectSide,'opponent',
  'only a real local foreground return may reduce the mutual hold to the opponent');
guest.ctx.arenaReceive('background',{from:'host',room:'ROOM01',epoch:4,round:3,backgrounded:false,presenceSeq:1});
assert.equal(guest.ctx.arena.opponent.backgrounded,true,
  'same-sequence contradictory foreground metadata must not cancel an away timer');
assert.equal(guest.ctx.arena.disconnectTimer,awayTimer);
guest.ctx.arenaReceive('background',{from:'host',room:'ROOM01',epoch:4,round:3,backgrounded:false,presenceSeq:2});
assert.equal(guest.ctx.arena.opponent.backgrounded,false,'a newer foreground sequence must restore the opponent');
assert.equal(guest.ctx.arena.disconnectTimer,null,'the newer foreground sequence must clear the away timer');

console.log('PASS background resume replays authoritative control without ACK stalls, stale clocks, or stale Presence');
