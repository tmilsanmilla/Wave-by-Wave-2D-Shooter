"use strict";

/* ---------------- state ---------------- */
let now = performance.now(), last = now, fireSuppressT=0, fanShots=0, fanNextT=0, fanBurstUntil=0;
// Per-weapon timing stays separate from player.lastShot so switching away never
// erases a weapon's own identity (for example, the SCAR's rested first shot).
let weaponLastShotAt=Object.create(null);

const player = {
  x:WORLD.w/2, y:WORLD.h/2, r:15, hp:100, spd:3.4,
  cur:'pistol', mags:{}, lastShot:0, reloadEnd:0, equipEnd:0,
  flash:0, hurtCd:0, hurtFlash:0, bloom:0,
};
let aiming=false, rmbAim=false;
let bullets=[], ebullets=[], enemies=[], particles=[], pickups=[], damageNumbers=[];
let cam={x:WORLD.w/2,y:WORLD.h/2}, zoom=1, shakeMag=0, shakeX=0, shakeY=0;
let wave=0, score=0, kills=0, waveMsg='', waveMsgT=0, hiScore=0, prevBest=0;
let dailyEndlessRunSettled=true,dailyEndlessClearedWaves=0,dailyEndlessTaskOwner='';
let unscopedSniperCelebration={startAt:0,until:0,serial:0,seen:new Set()};
let diffMode='normal';
const DEFAULT_PRACTICE_TRACKING_SPEED=1, DEFAULT_PRACTICE_TRACKING_DIRECTION=0;
const PRACTICE_TRACKING_SPEED_MIN=0.2, PRACTICE_TRACKING_SPEED_MAX=3.5, PRACTICE_TRACKING_SPEED_STEP=0.1;
const PRACTICE_TRACKING_DIRECTION_STEP=15;
let practiceMode=null, practiceSpawns=[], practiceRects=[], pracBtnRect=null, arenaBtnRect=null, dpsLog=[], dpsPrevHp=0, dpsTotal=0, dpsStart=0, pracLockMsgT=0, pracNeedMsgT=0, pendingPractice=null;
let practiceTrackingSpeed=DEFAULT_PRACTICE_TRACKING_SPEED, practiceTrackingDirection=DEFAULT_PRACTICE_TRACKING_DIRECTION;
const ARENA_TARGET=5, ARENA_HP=250, ARENA_ROUND_MS=90000, ARENA_SYNC_MS=50;
const ARENA_TIMEOUT_HP_RETRY_MS=160, ARENA_TIMEOUT_HP_FALLBACK_MS=1000;
// Every timed Arena round uses this one rule. Remaining HP is compared as a
// real number; only an exact tie is a draw and receives no round point.
function arenaTimeoutWinner(firstId,firstHp,secondId,secondHp){
  const first=Number.isFinite(+firstHp)?Math.max(0,+firstHp):0;
  const second=Number.isFinite(+secondHp)?Math.max(0,+secondHp):0;
  return first===second?null:(first>second?firstId:secondId);
}
const ARENA_MAPS=Object.freeze([
  Object.freeze({id:'arena',name:'ARENA'}),
  Object.freeze({id:'dimension',name:'DIMENSION'}),
  Object.freeze({id:'construction',name:'CONSTRUCTION SITE'}),
]);
const ARENA_MAP_IDS=Object.freeze(ARENA_MAPS.map(m=>m.id));
const ARENA_MAP_VOTE_MS=5000, ARENA_MAP_REVEAL_MS=2200;
const LOCAL_DUEL_PLAYER='local-player', LOCAL_DUEL_BOT='local-bot', LOCAL_CPU2V2_PLAYER='local-cpu2v2-player',
  LOCAL_CPU2V2_CPU_TEAM='local-cpu2v2-cpu-team';
let arenaRects=[];
function freshArena(status){
  return {phase:'menu',mode:null,room:'',status:status||'',queueChannel:null,matchChannel:null,
    expectedIds:null,queueCandidate:null,queueOffer:null,wantsHost:false,hostId:null,opponent:null,localReady:false,remoteReady:false,
    networkHold:false,disconnectAt:0,disconnectTimer:null,disconnectSide:'',departureAnnounced:'',departurePromise:null,forfeitResultId:'',forfeitPacket:null,
    active:false,matchEpoch:0,round:0,scores:{},roundStartAt:0,roundEndAt:0,nextRoundAt:0,roundResolved:false,winRecorded:false,
    dailyTaskMatchRecorded:false,dailyTaskRounds:new Set(),dailyTaskOwner:'',
    dailyTaskCompletedCount:0,dailyTaskReward:0,dailyTaskResult:'',
    mapId:'arena',mapVotePhase:'idle',mapVoteId:'',mapVoteDeadline:0,mapVotes:{},mapVoteResult:null,
    mapVoteAcks:new Set(),mapVoteRevealUntil:0,mapVoteSyncAt:0,mapVoteStartPending:false,
    detonatedTnt:new Set(),tntDamage:new Map(),tntFx:[],portalLocks:{},pendingHazards:new Map(),hazardReceipts:new Map(),hazardArbitrations:new Map(),localKoCause:null,
    syncAt:0,wallTickAt:0,hitSeq:0,seenHits:new Set(),receivedHitKinds:new Map(),receivedHitDamage:new Map(),sentHitKinds:new Map(),sentHitDamage:new Map(),
    pendingHitFeedback:new Map(),pendingUnscopedHits:new Set(),timeoutHpId:'',timeoutHp:new Map(),timeoutHpNextAt:0,timeoutOpponentHp:null,
    shotSeq:0,seenShots:new Set(),remoteShots:[],meleeSeq:0,seenMelees:new Set(),fireworkSeq:0,remoteFireworkHighestSeq:0,
    seenFireworks:new Set(),remoteFireworks:[],remoteFireworkFx:[],
    utilitySeq:0,seenUtilities:new Set(),remoteUtilityReadyAt:new Map(),utilityFrozenUntil:0,
    rematchVotes:new Set(),savedUtility:undefined};
}
function arenaResetDailyTaskTracking(match=arena){
  if(!match)return false;
  match.dailyTaskMatchRecorded=false;match.dailyTaskRounds=new Set();
  match.dailyTaskCompletedCount=0;match.dailyTaskReward=0;match.dailyTaskResult='';
  match.dailyTaskOwner=typeof dailyTaskOwnerKey==='function'?dailyTaskOwnerKey():'';return true;
}
function arenaDailyTaskSnapshot(){
  return {done:new Set(typeof dailyTasks!=='undefined'&&Array.isArray(dailyTasks)?dailyTasks.filter(task=>task.done).map(task=>task.id):[]),
    gems:typeof gems==='number'?gems:0};
}
function arenaFinishDailyTaskOutcome(snapshot,changed){
  if(!changed||!arena||typeof dailyTasks==='undefined'||!Array.isArray(dailyTasks))return !!changed;
  const completed=dailyTasks.filter(task=>task.done&&!snapshot.done.has(task.id)).length,
    reward=Math.max(0,(typeof gems==='number'?gems:0)-snapshot.gems);
  if(completed>0){
    arena.dailyTaskCompletedCount=Math.max(0,Math.floor(+arena.dailyTaskCompletedCount||0))+completed;
    arena.dailyTaskReward=Math.max(0,Math.floor(+arena.dailyTaskReward||0))+reward;
    const total=arena.dailyTaskCompletedCount;
    arena.dailyTaskResult='DAILY TASK'+(total===1?'':'S')+' COMPLETE \u00b7 +'+arena.dailyTaskReward+' GEMS';
  }
  return true;
}
function arenaRecordDailyOutcome(localId,winnerId,reason,matchCompleted=false,qualified=true){
  if(!arena||(typeof dailyTaskOwnerMatches==='function'&&!dailyTaskOwnerMatches(arena.dailyTaskOwner)))return false;
  let elimination=false,completed=false;
  if(reason==='knockout'&&String(winnerId||'')===String(localId||'')){
    if(!(arena.dailyTaskRounds instanceof Set))arena.dailyTaskRounds=new Set();
    const key=Math.floor(+arena.matchEpoch||0)+':'+Math.floor(+arena.round||0);
    if(!arena.dailyTaskRounds.has(key)){arena.dailyTaskRounds.add(key);elimination=true;}
  }
  if(matchCompleted&&qualified&&!arena.dailyTaskMatchRecorded){arena.dailyTaskMatchRecorded=true;completed=true;}
  if(!elimination&&!completed)return false;
  const snapshot=arenaDailyTaskSnapshot(),won=String(winnerId||'')===String(localId||'');
  let changed=false;
  if(typeof recordDailyDuelOutcome==='function')changed=recordDailyDuelOutcome(elimination,completed,won);
  else{
    if(elimination&&typeof recordDailyDuelElimination==='function')changed=recordDailyDuelElimination()||changed;
    if(completed&&typeof recordDailyDuelMatch==='function')changed=recordDailyDuelMatch(won)||changed;
  }
  return arenaFinishDailyTaskOutcome(snapshot,changed);
}
function arenaRecordDailyElimination(localId,winnerId,reason){
  return arenaRecordDailyOutcome(localId,winnerId,reason,false,true);
}
function arenaRecordDailyMatch(localId,winnerId,qualified=true){
  return arenaRecordDailyOutcome(localId,winnerId,'',true,qualified);
}
arena=freshArena('Sign in, choose a loadout, then enter Casual 1v1.');
