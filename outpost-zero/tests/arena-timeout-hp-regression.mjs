import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const state=read('js/state.js'),online=read('js/online.js'),ai=read('js/ai.js'),party=read('js/party.js');

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

const context={Number,Math};vm.createContext(context);
vm.runInContext(functionSource(state,'arenaTimeoutWinner'),context);
assert.equal(context.arenaTimeoutWinner('player',181,'opponent',180),'player','higher local HP must win');
assert.equal(context.arenaTimeoutWinner('player',75,'opponent',126),'opponent','higher opponent HP must win');
assert.equal(context.arenaTimeoutWinner('player',90,'opponent',90),null,'equal HP must remain a draw');
assert.equal(context.arenaTimeoutWinner('allies',360,'cpus',240),'allies','2v2 must compare total surviving team HP');

const sent=[],resolved=[];let wallClock=999;
const timeoutContext={
  Number,Math,String,Map,Date:{now:()=>wallClock},clearTimeout:()=>{},
  ARENA_HP:250,ARENA_TIMEOUT_HP_RETRY_MS:160,ARENA_TIMEOUT_HP_FALLBACK_MS:1000,
  arena:{matchEpoch:7,round:2,phase:'fight',roundEndAt:1000,hostId:'host',matchChannel:{},
    opponent:{id:'guest',hp:240},hazardArbitrations:new Map(),timeoutHpId:'',timeoutHp:new Map(),timeoutHpNextAt:0,timeoutOpponentHp:null},
  authUser:{id:'host'},player:{hp:150},
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
  arenaSend:(event,payload)=>sent.push({event,payload}),
  arenaHostResolve:winner=>{resolved.push(winner);timeoutContext.arena.phase='round_end';}
};
vm.createContext(timeoutContext);
for(const name of ['arenaTimeoutWinner'])vm.runInContext(functionSource(state,name),timeoutContext);
for(const name of ['arenaTimeoutHpId','arenaResetTimeoutHp','arenaTimeoutHpLedger','arenaApplyTimeoutHp','arenaTimeoutTick'])
  vm.runInContext(functionSource(online,name),timeoutContext);

assert.equal(timeoutContext.arenaApplyTimeoutHp({from:'guest',epoch:7,round:2,timeoutId:'7:2:timeout-hp',hp:120}),false,
  'an early HP claim must not populate the final ledger before the host deadline');
wallClock=1000;
assert.equal(timeoutContext.arenaTimeoutTick(1000),true,'the host must freeze and publish its final HP at zero');
assert.equal(resolved.length,0,'the host must not decide from stale cached opponent HP');
assert.equal(sent.length,1,'the first final-HP snapshot must send immediately');
const timeoutId=timeoutContext.arenaTimeoutHpId();
assert.equal(timeoutContext.arenaApplyTimeoutHp({from:'guest',epoch:7,round:2,timeoutId,hp:120}),true,
  'a valid opponent final-HP snapshot must be accepted');
assert.equal(timeoutContext.arenaApplyTimeoutHp({from:'guest',epoch:7,round:2,timeoutId,hp:220}),false,
  'a conflicting retry must not overwrite the first final opponent snapshot');
timeoutContext.arenaTimeoutTick(1010);
assert.deepEqual(resolved,['host'],'the final 150-to-120 snapshot must override stale cached 240 HP');

timeoutContext.arena={matchEpoch:7,round:3,phase:'fight',roundEndAt:2000,hostId:'host',matchChannel:{},
  opponent:{id:'guest',hp:60},hazardArbitrations:new Map([['tnt',{eventId:'tnt'}]]),
  timeoutHpId:'',timeoutHp:new Map(),timeoutHpNextAt:0,timeoutOpponentHp:null};
timeoutContext.player.hp=50;resolved.length=0;sent.length=0;
wallClock=2000;
timeoutContext.arenaTimeoutTick(2000);timeoutContext.arenaTimeoutTick(2160);
assert.equal(resolved.length,0,'a missing snapshot must receive a bounded wait instead of an instant stale decision');
assert.equal(sent.length,2,'the final-HP snapshot must retry while the round is unsettled');
timeoutContext.player.hp=200;timeoutContext.arena.opponent.hp=1;
wallClock=3000;
timeoutContext.arenaTimeoutTick(3000);
assert.deepEqual(resolved,['guest'],'the bounded fallback must use HP captured at zero, not later live values');
assert.equal(timeoutContext.arena.hazardArbitrations.size,0,'an orphan TNT arbitration must not hang timeout resolution');
assert.equal(sent.at(-1).payload.hp,50,'the local final HP snapshot must remain write-once across retries');

timeoutContext.arena={matchEpoch:7,round:4,phase:'fight',roundEndAt:4000,hostId:'host',matchChannel:{},
  opponent:{id:'host',hp:100},hazardArbitrations:new Map(),timeoutHpId:'',timeoutHp:new Map(),timeoutHpNextAt:0,timeoutOpponentHp:null};
timeoutContext.authUser={id:'guest'};timeoutContext.player.hp=101;resolved.length=0;sent.length=0;
wallClock=4000;
timeoutContext.arenaTimeoutTick(4000);
assert.equal(resolved.length,0,'only the host may award the timeout point');
assert.equal(sent[0].event,'round_timeout_hp','the guest must still publish its final HP');

assert.match(online,/arenaHostResolve\(arenaTimeoutWinner\(me,localHp,opponent,remoteHp\),\{kind:['"]timeout['"]\}\)/,
  'Casual 1v1 timeout must resolve from the final HP ledger');
assert.match(online,/['"]round_timeout_hp['"]/,'Casual must subscribe to the final-HP event');
assert.match(state,/timeoutHpId:''[\s\S]{0,80}timeoutHp:new Map\(\)[\s\S]{0,80}timeoutHpNextAt:0/,
  'every fresh Arena must own clean timeout state');
assert.match(online,/Date\.now\(\)<arena\.roundEndAt[\s\S]{0,180}arenaMergeTntDamageSnapshot/,
  'late state snapshots must not detonate TNT after final HP locks');
assert.match(online,/arena\.phase!==['"]fight['"]\|\|Date\.now\(\)>=arena\.roundEndAt/,
  'late TNT-hit packets must not change HP after zero');
assert.match(online,/arena\.active&&arena\.roundStartAt&&!timeoutLocked/,
  'reconnect clock extension must not reopen a round whose final HP is already locked');
assert.match(ai,/arenaBotResolve\(arenaTimeoutWinner\(LOCAL_DUEL_PLAYER,player\.hp,LOCAL_DUEL_BOT,bhp\),['"]timeout['"]\)/,
  'CPU 1v1 timeout must use remaining HP');
assert.equal((party.match(/arenaTimeoutWinner\('allies',[a-zA-Z]+,'cpus',[a-zA-Z]+\)/g)||[]).length,2,
  'offline and Party CPU 2v2 timeouts must use total remaining team HP');
const partyWall=functionSource(party,'partyCpuWallTick');
assert.ok(partyWall.indexOf('partyCpuFixedStep(')<partyWall.indexOf("partyCpuHostResolve(arenaTimeoutWinner('allies'"),
  'Party CPU authority must finish its deadline-clamped simulation before comparing HP');
assert.match(partyWall,/Math\.min\(clock,partyCpuMatch\.roundEndAt\)/,
  'Party CPU authority must never simulate beyond the deadline');

console.log('PASS Timed Arena rounds award the point to the side with more HP');
