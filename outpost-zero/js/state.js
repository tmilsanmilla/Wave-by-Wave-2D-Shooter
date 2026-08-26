"use strict";

/* ---------------- state ---------------- */
let now = performance.now(), last = now, fireSuppressT=0, fanShots=0, fanNextT=0, fanBurstUntil=0;

const player = {
  x:WORLD.w/2, y:WORLD.h/2, r:15, hp:100, spd:3.4,
  cur:'pistol', mags:{}, lastShot:0, reloadEnd:0, equipEnd:0,
  flash:0, hurtCd:0, hurtFlash:0, bloom:0,
};
let aiming=false, rmbAim=false;
let bullets=[], ebullets=[], enemies=[], particles=[], pickups=[], damageNumbers=[];
let cam={x:WORLD.w/2,y:WORLD.h/2}, zoom=1, shakeMag=0, shakeX=0, shakeY=0;
let wave=0, score=0, kills=0, waveMsg='', waveMsgT=0, hiScore=0, prevBest=0;
let diffMode='normal';
let practiceMode=null, practiceSpawns=[], practiceRects=[], pracBtnRect=null, arenaBtnRect=null, dpsLog=[], dpsPrevHp=0, dpsTotal=0, dpsStart=0, pracLockMsgT=0, pracNeedMsgT=0, pendingPractice=null;
const ARENA_TARGET=5, ARENA_HP=250, ARENA_ROUND_MS=90000, ARENA_SYNC_MS=50;
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
    mapId:'arena',mapVotePhase:'idle',mapVoteId:'',mapVoteDeadline:0,mapVotes:{},mapVoteResult:null,
    mapVoteAcks:new Set(),mapVoteRevealUntil:0,mapVoteSyncAt:0,mapVoteStartPending:false,
    detonatedTnt:new Set(),tntDamage:new Map(),tntFx:[],portalLocks:{},pendingHazards:new Map(),hazardReceipts:new Map(),hazardArbitrations:new Map(),localKoCause:null,
    syncAt:0,wallTickAt:0,hitSeq:0,seenHits:new Set(),rematchVotes:new Set(),savedUtility:undefined};
}
arena=freshArena('Sign in, choose a loadout, then enter Casual 1v1.');
