import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const party=fs.readFileSync(path.join(root,'js/party.js'),'utf8');

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

// Local CPU 2v2 must not consume its only transition deadline when a round
// launch is rejected once (for example, while a loadout entitlement refreshes).
let localStarts=0;
const local={
  Math,PARTY_CPU_ROUND_RETRY_MS:350,now:1000,
  arena:{active:true,phase:'round_end'},
  partyCpuMatch:{phase:'round_end',nextRoundAt:1000},
  isLocalCpu2v2:()=>true,
  offlineCpu2v2BeginRound:()=>{
    localStarts++;
    if(localStarts===1)return false;
    local.partyCpuMatch.round=2;local.partyCpuMatch.phase='countdown';
    local.partyCpuMatch.nextRoundAt=0;local.arena.phase='countdown';return true;
  },
  partyCpuActors:()=>[],arenaTimeoutWinner:()=>null,offlineCpu2v2Resolve:()=>false
};
vm.createContext(local);vm.runInContext(functionSource(party,'offlineCpu2v2RoundTick'),local);
local.offlineCpu2v2RoundTick();
assert.equal(localStarts,1,'the expired local transition should attempt round 2');
assert.equal(local.partyCpuMatch.nextRoundAt,1350,'a failed local launch must schedule a bounded retry');
assert.equal(local.partyCpuMatch.phase,'round_end','a failed launch must keep the completed-round state intact');
local.now=1350;local.offlineCpu2v2RoundTick();
assert.equal(localStarts,2,'the local transition must retry after its first failure');
assert.equal(local.partyCpuMatch.round,2,'the retry must advance Local CPU 2v2 to round 2');
assert.equal(local.partyCpuMatch.phase,'countdown','the retried local round must enter countdown');

// Party authority uses wall time, but needs the same retry guarantee. A failed
// start must not strand both clients forever with ROUND COMPLETE on screen.
let partyStarts=0;
const host={
  Math,Object,PARTY_CPU_ROUND_RETRY_MS:350,PARTY_CPU_STEP:1000/60,PARTY_MISSING_MS:10000,now:1000,
  arena:{active:true,mode:'partycpu',phase:'round_end'},
  party:{self:{id:'host'},hostId:'host',members:[{id:'host'},{id:'guest'}],liveIds:new Set(['host','guest']),missingSince:{},directCpu:false},
  partyCpuMatch:{local:false,hostId:'host',humanIds:['host','guest'],phase:'round_end',round:1,nextRoundAt:2000,simAt:2000,simClock:2000,simAcc:0,humans:{},bots:[]},
  partyCpuSessionOpen:()=>true,partyMember:id=>host.party.members.find(member=>member.id===id),partyCpuIsHost:()=>true,isPartyCpuMatch:()=>true,
  partyCpuHostStartRound:()=>{
    partyStarts++;
    if(partyStarts===1)return false;
    host.partyCpuMatch.round=2;host.partyCpuMatch.phase='countdown';host.partyCpuMatch.nextRoundAt=0;host.arena.phase='countdown';return true;
  },
  partyCpuReturnToLobby:()=>{throw new Error('unexpected lobby return');},partyCpuAbort:()=>{throw new Error('unexpected abort');},
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),partyCpuFixedStep:()=>{},partyCpuActors:()=>[],arenaTimeoutWinner:()=>null,partyCpuHostResolve:()=>false
};
vm.createContext(host);vm.runInContext(functionSource(party,'partyCpuWallTick'),host);
host.partyCpuWallTick(2000);
assert.equal(partyStarts,1,'the Party host should attempt the expired transition');
assert.equal(host.partyCpuMatch.nextRoundAt,2350,'a failed Party start must schedule a bounded wall-clock retry');
assert.equal(host.partyCpuMatch.phase,'round_end','the Party host must retain round_end until launch succeeds');
host.partyCpuWallTick(2350);
assert.equal(partyStarts,2,'the Party host must retry after its first failed start');
assert.equal(host.partyCpuMatch.round,2,'the successful retry must advance Party CPU 2v2 to round 2');
assert.equal(host.partyCpuMatch.phase,'countdown','the retried Party round must enter countdown');

// Broadcasts can arrive out of order. An authenticated sequential round-start
// is sufficient to reconcile a guest that never received round 1's result.
const cancelled=[],begun=[];
const guest={
  Math,Date:{now:()=>5000},PARTY_CPU_MODE:'partycpu2v2',state:'play',selPage:'hub',formOpen:false,
  arena:{active:true,mode:'partycpu',phase:'fight'},
  party:{self:{id:'guest'},hostId:'host',directCpu:false,chatComposing:false,chatOpen:false},
  partyCpuMatch:{phase:'fight',round:1,epoch:77,hostEpoch:4,hostId:'host',humanIds:['host','guest']},
  partyCpuEnvelope:(packet,hostOnly)=>packet.matchEpoch===77&&packet.hostEpoch===4&&(!hostOnly||packet.from==='host'),
  isPartyCpuMatch:()=>true,partyCpuIsHost:()=>false,
  partyCpuKit:raw=>raw&&raw.primary&&raw.secondary&&raw.melee?raw:null,
  partySend:(event,payload)=>cancelled.push({event,payload}),closeForm:()=>{},
  cpuTeamBeginRound:options=>{
    begun.push(options);guest.partyCpuMatch.round=options.round;guest.partyCpuMatch.phase='countdown';guest.arena.phase='countdown';return true;
  }
};
vm.createContext(guest);vm.runInContext(functionSource(party,'partyCpuApplyRoundStart'),guest);
const kits={
  host:{primary:'ar',secondary:'m9',melee:'knife'},
  guest:{primary:'smg',secondary:'m9',melee:'knife'}
};
assert.equal(guest.partyCpuApplyRoundStart({from:'host',matchEpoch:77,hostEpoch:4,round:2,startDelay:3000,scores:{allies:1,cpus:0},loadouts:kits}),true,
  'a guest in the prior fight must recover from a missed result using the sequential host round-start');
assert.equal(cancelled.length,0,'recovery must not send cpu_cancel to the host');
assert.equal(begun.length,1,'the guest must launch exactly one recovered round');
assert.equal(begun[0].round,2,'the recovered guest must join round 2');
assert.deepEqual(begun[0].scores,{allies:1,cpus:0},'the authoritative score must replace the guest\'s missed result');
assert.equal(guest.partyCpuMatch.phase,'countdown','the recovered guest must enter round 2 countdown');
assert.equal(guest.partyCpuApplyRoundStart({from:'host',matchEpoch:77,hostEpoch:4,round:2,startDelay:3000,scores:{allies:1,cpus:0},loadouts:kits}),false,
  'a duplicate round-start retry must stay idempotent');
assert.equal(begun.length,1,'a duplicate round-start must not reset the live round again');

console.log('PASS CPU 2v2 round transitions retry safely and recover missed Party results');
