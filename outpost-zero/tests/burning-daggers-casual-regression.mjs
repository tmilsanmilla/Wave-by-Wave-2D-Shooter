import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const combat=fs.readFileSync(path.join(root,'js/combat.js'),'utf8');
const adminUi=fs.readFileSync(path.join(root,'js/admin-ui.js'),'utf8');
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

const specialHit=functionSource(adminUi,'arenaMeleeSpecialHit');
const sent=[];
const context={
  practiceMode:'arena',player:{x:0,y:0},arenaCanAct:()=>true,
  arenaMeleeLineClear:(x0,y0)=>x0===95&&y0===20,
  isCpuTeamArena:()=>false,arenaHitOpponent:(damage,kind)=>sent.push({damage,kind})
};
vm.createContext(context);vm.runInContext(specialHit,context);
const target={x:100,y:20,hp:100};

assert.equal(context.arenaMeleeSpecialHit(target,40,'bdaggers'),false,
  'the wall check should reject the blocked player-to-target line');
assert.equal(context.arenaMeleeSpecialHit(target,40,'bdaggers',95,20),true,
  'the same contact should pass when validated from the flying blade');
assert.deepEqual(sent,[{damage:40,kind:'bdaggers'}],
  'an accepted dagger contact must reach the Casual hit transport exactly once');

assert.match(combat,
  /arenaMeleeSpecialHit\(target,40\*perks\.dmg\*wm\('bdaggers'\)\.dmg,'bdaggers',bl\.x,bl\.y\)/,
  'thrown daggers must supply their own contact position to wall validation');
assert.match(combat,
  /if\(arenaMeleeSpecialHit\([^\n]+bl\.x,bl\.y\)\)\{\s*bl\.hits\.add\(hitKey\)/,
  'a rejected contact must remain retryable instead of being marked as damage dealt');

const sends=[],timers=[];
const channel={};
const retryContext={
  ARENA_HP:250,arena:{matchChannel:channel,matchEpoch:4,round:3,hitSeq:0,opponent:{id:'target'},
    sentHitKinds:new Map(),sentHitDamage:new Map(),pendingHitFeedback:new Map()},
  authUser:{id:'thrower'},Date,Map,Set,String,Number,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),arenaCanAct:()=>true,
  arenaRememberSentHit:()=>{},arenaSend:(event,payload)=>sends.push({event,payload}),
  setTimeout:(run,wait)=>{timers.push({run,wait});return timers.length;}
};
vm.createContext(retryContext);vm.runInContext(functionSource(online,'arenaSendHit'),retryContext);
const hitId=retryContext.arenaSendHit(40,'bdaggers');
assert.deepEqual(timers.map(timer=>timer.wait),[180,520],
  'an unacknowledged Casual hit should receive two bounded retries');
for(const timer of timers)timer.run();
assert.equal(sends.length,3,'a dropped first hit must be followed by two delivery attempts');
assert.ok(sends.every(send=>send.event==='hit'&&send.payload.id===hitId&&send.payload.dmg===40),
  'all retries must reuse one deduplicated 40-damage dagger hit');
retryContext.arena.pendingHitFeedback.delete(hitId);
for(const timer of timers)timer.run();
assert.equal(sends.length,3,'confirmation must stop any later retry from sending');

let applied=0;
const receiveContext={
  ARENA_HP:250,TWIN_SAI_PARRY_MS:1000,now:1000,parryUntil:0,
  arena:{matchEpoch:4,round:3,seenHits:new Set()},player:{hp:100,x:0,y:0},
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),arenaCanAct:()=>true,
  arenaIncomingParryValid:()=>false,arenaRememberReceivedHit:()=>{},arenaSendHitResult:()=>{},
  arenaUtilityFrozen:()=>false,cancelMedHeal:()=>{},damagePlayerHp:damage=>{applied++;receiveContext.player.hp-=damage;return damage;},
  burst:()=>{},addShake:()=>{},sfx:()=>{},arenaLocalKO:()=>{}
};
vm.createContext(receiveContext);vm.runInContext(functionSource(online,'arenaTakeHit'),receiveContext);
const incoming={id:hitId,epoch:4,round:3,dmg:40,kind:'bdaggers'};
receiveContext.arenaTakeHit(incoming);receiveContext.arenaTakeHit(incoming);
assert.equal(applied,1,'retrying one hit id must never apply dagger damage twice');
assert.equal(receiveContext.player.hp,60,'one 40-damage dagger hit must remove exactly 40 HP');

console.log('PASS Burning Daggers deal Casual 1v1 damage from valid blade contacts');
