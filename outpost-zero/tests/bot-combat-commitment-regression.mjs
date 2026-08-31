import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ai=fs.readFileSync(path.join(root,'js/ai.js'),'utf8');
const party=fs.readFileSync(path.join(root,'js/party.js'),'utf8');
function functionSource(source,name){
  const start=source.search(new RegExp(`function\\s+${name}\\s*\\(`));assert.ok(start>=0,`missing ${name}`);
  const brace=source.indexOf('{',start);let depth=0,quote='',escape=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}

const weapons={
  ar:{dmg:48,mag:25,reload:1600,fireRate:145,melee:false,range:620,fall:.781,speed:19},
  m9:{dmg:38,mag:12,reload:800,fireRate:200,melee:false,range:340,fall:.55,speed:17,quickdrawMs:120},
  knife:{dmg:48,mag:Infinity,reload:0,fireRate:380,melee:true,range:130,arc:.35},
};
const context=vm.createContext({
  console,Math,Date,Promise,Map,Set,WeakSet,Object,Array,Number,String,Boolean,JSON,Infinity,setTimeout,clearTimeout,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),WORLD:{w:1200,h:900},WEAPONS:weapons,
  weaponEquipMs:key=>key==='m9'?120:380,weaponBulletSpeed:key=>weapons[key].speed,
  activeArenaBounds:()=>({left:0,top:0,right:1200,bottom:900}),activeObstacles:()=>[],activeArenaPortals:()=>[],
  arenaMeleeLineClear:()=>true,
});
vm.runInContext(ai,context,{filename:'ai.js'});
const run=code=>vm.runInContext(code,context);
const tiers=JSON.parse(run('JSON.stringify(BOT_DIFFICULTIES)'));

for(let i=1;i<tiers.length;i++){
  assert.ok(tiers[i].pressureChance>tiers[i-1].pressureChance,'pressure-shot commitment must improve by difficulty');
  assert.ok(tiers[i].pressureBurstMax>=tiers[i-1].pressureBurstMax,'higher tiers must sustain at least as much pressure');
  assert.ok(tiers[i].pressureMemoryMs>tiers[i-1].pressureMemoryMs,'last-visible memory must scale by difficulty');
  assert.ok(tiers[i].parryRespectChance>tiers[i-1].parryRespectChance,'visible Twin Sai recognition must improve by difficulty');
  assert.ok(tiers[i].parryReactionMs<tiers[i-1].parryReactionMs,'visible Twin Sai reaction must improve by difficulty');
}
for(const tier of tiers)for(const unfair of ['damage','fireMs','mag','reload','hp','parryCooldownMs'])
  assert.equal(tier[unfair],undefined,'combat judgment must not alter '+unfair);

const memory=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),bot={id:'bot',x:100,y:100,angle:0,aiRng:17},target={id:'player',x:400,y:140,r:15};
  cpuAiInitBotWeapons(bot,0);
  const seen=cpuAiRangedAimSolution(bot,target,1000,config,{x:425,y:145},true);
  target.x=940;target.y=760;
  const remembered=cpuAiRangedAimSolution(bot,target,1500,config,null,false);
  const expired=cpuAiRangedAimSolution(bot,target,1801,config,null,false);
  return JSON.stringify({seen,remembered,expired,stored:[bot.aiSeenTargetX,bot.aiSeenTargetY]});
})()`));
assert.deepEqual(memory.stored,[400,140],'aim memory must store the last visible position, not a later hidden position');
assert.deepEqual({x:memory.seen.x,y:memory.seen.y,visible:memory.seen.visible},{x:425,y:145,visible:true});
assert.deepEqual({x:memory.remembered.x,y:memory.remembered.y,remembered:memory.remembered.remembered},{x:400,y:140,remembered:true});
assert.equal(memory.expired.available,false,'a stale observation must expire instead of tracking through cover');

const reacquired=JSON.parse(run(`(()=>{
  const bot={aiTracks:{}},target={id:'player',x:400,y:300};
  cpuAiTrackTarget(bot,target,16.667,1000);target.x=460;
  return JSON.stringify(cpuAiTrackTarget(bot,target,16.667,2000));
})()`));
assert.ok(reacquired.vx>0&&reacquired.vx<.5,
  'reacquiring after cover must divide by elapsed observation time instead of inventing a one-frame velocity spike');

const pressure=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),bot={id:'bot',x:100,y:100,angle:0,aiRng:91},target={id:'player',x:500,y:100,r:15};
  cpuAiInitBotWeapons(bot,0);
  const first=cpuAiPressureFireDecision(bot,target,1000,config,{available:true,visible:true,aimErr:.08});
  const before=bot.aiPressureShotsLeft;cpuAiRecordPressureShot(bot,first);
  const hidden=cpuAiPressureFireDecision(bot,target,1245,config,{available:true,visible:false,aimErr:.09});
  cpuAiRecordPressureShot(bot,hidden);
  const held=cpuAiPressureFireDecision(bot,target,1490,config,{available:true,visible:true,aimErr:.02,holdRanged:true});
  return JSON.stringify({first,before,after:bot.aiPressureShotsLeft,hidden,held,burstUntil:bot.aiPressureBurstUntil});
})()`));
assert.deepEqual(pressure.first,{fire:true,pressure:true},'Impossible must begin a finite burst before aim is guaranteed');
assert.ok(pressure.before>=4&&pressure.before<=6,'Impossible pressure must use a bounded 4–6 round intent');
assert.deepEqual(pressure.hidden,{fire:true,pressure:true},'an active burst may continue at the last visibly observed lane');
assert.deepEqual(pressure.held,{fire:false,pressure:false},'a recognized guard must cancel new ranged pressure');
assert.equal(pressure.after,0);assert.equal(pressure.burstUntil,0);

const parry=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),bot={id:'bot',x:100,y:100,angle:0,aiRng:77},target={id:'player',x:220,y:100,r:15};
  cpuAiInitBotWeapons(bot,0);bot.aiWeaponThinkAt=0;bot.aiWeaponLockUntil=9000;
  const seen=cpuAiObserveVisibleParry(bot,target,1000,config,true);
  const early=cpuAiObserveVisibleParry(bot,target,1049,config,true);
  const reacted=cpuAiObserveVisibleParry(bot,target,1050,config,true);
  cpuAiChooseBotWeapon(bot,target,1050,config,reacted);
  const weapon={cur:bot.cur,equipEnd:bot.equipEnd,lockUntil:bot.aiWeaponLockUntil};
  const ended=cpuAiObserveVisibleParry(bot,target,1100,config,false);
  const released=cpuAiObserveVisibleParry(bot,target,1166,config,false);
  return JSON.stringify({seen,early,reacted,weapon,ended,released});
})()`));
assert.equal(parry.seen.holdRanged,false,'an observed guard must keep a fair reaction delay');
assert.equal(parry.early.holdRanged,false);
assert.deepEqual({hold:parry.reacted.holdRanged,melee:parry.reacted.forceMelee},{hold:true,melee:true});
assert.deepEqual(parry.weapon,{cur:'knife',equipEnd:1430,lockUntil:2050},
  'Impossible may counter an extra-close visible guard with a real 380ms knife draw and committed switch');
assert.equal(parry.ended.holdRanged,true,'the bot may use only a short post-animation caution delay');
assert.equal(parry.released.holdRanged,false);

const distantGuard=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),bot={id:'far-bot',x:100,y:100,angle:0,aiRng:77},target={id:'player',x:350,y:100,r:15};
  cpuAiInitBotWeapons(bot,0);bot.aiWeaponThinkAt=0;bot.aiWeaponLockUntil=0;
  cpuAiObserveVisibleParry(bot,target,2000,config,true);
  const reacted=cpuAiObserveVisibleParry(bot,target,2050,config,true);
  cpuAiChooseBotWeapon(bot,target,2050,config,reacted);
  return JSON.stringify({reacted,cur:bot.cur,equipEnd:bot.equipEnd});
})()`));
assert.deepEqual({hold:distantGuard.reacted.holdRanged,melee:distantGuard.reacted.forceMelee},{hold:true,melee:true});
assert.equal(distantGuard.cur,'ar',
  'recognizing Twin Sai must not make the CPU draw melee from 250px away; melee remains extra-close only');

const vanished=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),bot={id:'bot',x:0,y:0,aiRng:9},target={id:'player',x:100,y:0};
  cpuAiInitBotWeapons(bot,0);
  const seen=cpuAiObserveVisibleParry(bot,target,2000,config,true);
  const hidden=cpuAiObserveVisibleParry(bot,target,2030,config,false);
  const late=cpuAiObserveVisibleParry(bot,target,2050,config,false);
  return JSON.stringify({seen,hidden,late});
})()`));
assert.equal(vanished.seen.holdRanged,false);
assert.equal(vanished.hidden.holdRanged,false,'a guard hidden before reaction must not leak state through the wall');
assert.equal(vanished.late.holdRanged,false);

assert.match(ai,/if\(targetVisible&&tuning\.usePrediction\)cpuAiTrackTarget\(b,player,dtms,now\)/,
  'CPU 1v1 tracking must update only from visible positions');
assert.match(party,/if\(targetVisible&&\(!localMatch\|\|profile\.usePrediction\)\)cpuAiTrackTarget\(b,target,dtms,clock\)/,
  'CPU 2v2 tracking must update only from visible positions');
assert.match(ai,/cpuAiLosBlocked\(b\.x,b\.y,aimX,aimY\)/,'1v1 pressure must recheck its physical shot lane');
assert.match(party,/cpuAiLosBlocked\(b\.x,b\.y,aimX,aimY\)/,'2v2 pressure must recheck its physical shot lane');
assert.match(party,/partyCpuSpawnBotShot\(b,aimTntId\?\{id:aimTntId,kind:'tnt'\}:target,profile,weaponKey\)/,
  '2v2 pressure must retain the real authority-owned target ID');
assert.match(functionSource(ai,'updateArenaBot'),/const shotStamp=now;/,
  'CPU 1v1 must stamp a round at its real emission time instead of catching up hidden shots');
assert.match(functionSource(party,'partyCpuHostStep'),/const shotStamp=clock;/,
  'CPU 2v2 must stamp a round at its real emission time instead of catching up hidden shots');
assert.doesNotMatch(functionSource(ai,'updateArenaBot')+functionSource(party,'partyCpuHostStep'),/previous\+interval/,
  'a fire hold must never grant faster-than-weapon catch-up cadence');
for(const source of [functionSource(ai,'cpuAiObserveVisibleParry'),functionSource(ai,'updateArenaBot'),functionSource(party,'partyCpuHostStep')]){
  assert.doesNotMatch(source,/parryReadyAt|ABILITY_CD/,'bot counters must never read Twin Sai cooldown state');
}

console.log('SUMMARY PASS bot combat commitment');
