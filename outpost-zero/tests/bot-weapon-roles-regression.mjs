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

let meleeClear=true;
const weapons={
  ar:{dmg:48,mag:25,reload:1600,fireRate:145,melee:false,range:620,fall:.781,speed:19},
  m9:{dmg:38,mag:12,reload:800,fireRate:200,melee:false,range:340,fall:.55,speed:17,quickdrawMs:120},
  knife:{dmg:48,mag:Infinity,reload:0,fireRate:380,melee:true,range:130,arc:.35},
};
const context=vm.createContext({
  console,Math,Date,Promise,Map,Set,WeakSet,Object,Array,Number,String,Boolean,JSON,Infinity,setTimeout,clearTimeout,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),WORLD:{w:1200,h:900},WEAPONS:weapons,
  weaponEquipMs:key=>key==='m9'?120:380,arenaMeleeLineClear:()=>meleeClear,
  activeArenaBounds:()=>({left:0,top:0,right:1200,bottom:900}),activeObstacles:()=>[],activeArenaPortals:()=>[],
});
vm.runInContext(ai,context,{filename:'ai.js'});
const run=code=>vm.runInContext(code,context);

const primaryUse=JSON.parse(run(`(()=>{
  const selected=[];
  for(let seed=1;seed<=64;seed++){
    const bot={id:'bot-'+seed,team:'B',x:100,y:100,r:15,angle:0,aiRng:seed};
    const target={id:'player',x:400,y:100,r:15,hp:250};
    cpuAiInitBotWeapons(bot,0);
    for(let clock=1200;clock<=6200;clock+=500){
      bot.aiWeaponThinkAt=0;bot.aiWeaponLockUntil=0;cpuAiChooseBotWeapon(bot,target,clock,botDifficulty(4));
      selected.push(bot.cur);
    }
  }
  return JSON.stringify(selected);
})()`));
assert.equal(primaryUse[0],'ar','the CPU must spawn on its primary');
assert.ok(primaryUse.every(key=>key==='ar'),
  'a loaded, usable primary must remain the default; proximity or random variety alone cannot draw the sidearm');

const reloadNeed=JSON.parse(run(`(()=>{
  const out=[];
  for(const difficulty of [0,1,2,3,4])for(let seed=1;seed<=32;seed++){
    const bot={id:'bot-'+difficulty+'-'+seed,team:'B',x:100,y:100,r:15,angle:0,aiRng:seed};
    const target={id:'player',x:500,y:100,r:15,hp:250};
    cpuAiInitBotWeapons(bot,0);bot.aiWeaponMags.ar=0;bot.aiWeaponThinkAt=0;bot.aiWeaponLockUntil=0;
    cpuAiChooseBotWeapon(bot,target,1000,botDifficulty(difficulty));
    out.push({difficulty,cur:bot.cur,ar:bot.aiWeaponMags.ar,m9:bot.aiWeaponMags.m9,reload:bot.reloadEnd});
  }
  return JSON.stringify(out);
})()`));
assert.ok(reloadNeed.every(row=>row.cur==='m9'),
  'when the primary needs a reload and the sidearm is loaded, every difficulty must use the sidearm instead of idling');
assert.ok(reloadNeed.every(row=>row.ar===0&&row.m9===12),
  'drawing the sidearm must not silently refill or spend either magazine');

const meleeDistance=JSON.parse(run(`(()=>{
  const config=botDifficulty(4),bot={id:'bot',team:'B',x:100,y:100,r:15,angle:0,aiRng:15};
  cpuAiInitBotWeapons(bot,0);bot.aiWeaponThinkAt=0;bot.aiWeaponLockUntil=0;
  cpuAiChooseBotWeapon(bot,{id:'far',x:246,y:100,r:15,hp:250},1000,config);
  const outside=bot.cur;
  bot.aiWeaponThinkAt=0;bot.aiWeaponLockUntil=0;
  cpuAiChooseBotWeapon(bot,{id:'close',x:240,y:100,r:15,hp:250},1100,config);
  return JSON.stringify({outside,inside:bot.cur});
})()`));
assert.equal(meleeDistance.outside,'ar','the CPU must keep its gun even one pixel outside the knife hit envelope');
assert.equal(meleeDistance.inside,'knife','the CPU may commit to melee only when the target is already extra-close');

assert.match(ai,/function\s+cpuAiTryBotMeleeAbility\s*\(/,
  'CPU melee abilities need one shared deterministic authority helper');
const ability=JSON.parse(run(`(()=>{
  const bot={id:'bot',team:'B',x:100,y:100,r:15,angle:0,aiRng:8},target={id:'player',x:184,y:100,r:15,hp:250};
  const hits=[];cpuAiInitBotWeapons(bot,0);cpuAiSwitchBotWeapon(bot,'knife',0,0);bot.equipEnd=0;
  const first=cpuAiTryBotMeleeAbility(bot,target,1000,(damage,kind)=>hits.push({damage,kind}));
  const duplicate=cpuAiTryBotMeleeAbility(bot,target,1001,(damage,kind)=>hits.push({damage,kind}));
  const early=cpuAiTryBotMeleeAbility(bot,target,5799,(damage,kind)=>hits.push({damage,kind}));
  const ready=cpuAiTryBotMeleeAbility(bot,target,5800,(damage,kind)=>hits.push({damage,kind}));
  return JSON.stringify({first,duplicate,early,ready,hits,readyAt:bot.aiMeleeAbilityReadyAt,
    fx:{seq:bot.meleeFxSeq,key:bot.meleeFxKey,start:bot.meleeFxStart,until:bot.meleeFxUntil}});
})()`));
assert.deepEqual({first:ability.first,duplicate:ability.duplicate,early:ability.early,ready:ability.ready},
  {first:true,duplicate:false,early:false,ready:true},'Knife Execute must respect one real 4.8-second cooldown');
assert.deepEqual(ability.hits,[{damage:180,kind:'melee_ability'},{damage:180,kind:'melee_ability'}],
  'the bot ability must use one fixed arena-safe damage event and remain non-projectile');
assert.equal(ability.readyAt,10600);
assert.deepEqual(ability.fx,{seq:2,key:'knife',start:5800,until:6050},
  'each CPU Execute must expose the same bounded knife ability animation state');

assert.equal(run(`(()=>{const b={x:100,y:100,r:15,angle:0,aiRng:1},t={x:186,y:100,r:15};
  cpuAiInitBotWeapons(b,0);cpuAiSwitchBotWeapon(b,'knife',0,0);b.equipEnd=0;
  return cpuAiTryBotMeleeAbility(b,t,1000,()=>{});})()`),false,
  'Knife Execute must not reach beyond its 70px radius plus the target body');
meleeClear=false;
assert.equal(run(`(()=>{const b={x:100,y:100,r:15,angle:0,aiRng:1},t={x:180,y:100,r:15};
  cpuAiInitBotWeapons(b,0);cpuAiSwitchBotWeapon(b,'knife',0,0);b.equipEnd=0;
  return cpuAiTryBotMeleeAbility(b,t,1000,()=>{});})()`),false,
  'CPU melee abilities must never damage through a wall');
meleeClear=true;

const duelStep=functionSource(ai,'updateArenaBot'),teamMelee=functionSource(party,'partyCpuHostMelee');
assert.match(duelStep,/cpuAiTryBotMeleeAbility/,'CPU 1v1 must call the shared melee ability helper');
assert.match(teamMelee,/cpuAiTryBotMeleeAbility/,'CPU 2v2 authority must call the shared melee ability helper');
assert.ok(duelStep.indexOf('cpuAiTryBotMeleeAbility(')<duelStep.indexOf('cpuAiTryBotMelee('),
  'CPU 1v1 must try its ready melee ability before falling back to a normal swing');
assert.ok(teamMelee.indexOf('cpuAiTryBotMeleeAbility(')<teamMelee.indexOf('cpuAiTryBotMelee('),
  'CPU 2v2 authority must try the same ability before its normal swing');
assert.match(teamMelee,/melee:true/,'the 2v2 ability must cross the parry boundary as melee, never as a projectile');
const playerHit=functionSource(ai,'arenaBotHitPlayer');
assert.ok(/kind\s*!==\s*['"]melee_ability['"]/.test(playerHit)||/startsWith\s*\(\s*['"]melee['"]\s*\)/.test(playerHit),
  'CPU Execute must cross the 1v1 Twin Sai boundary as melee rather than becoming a reflected bullet');
const teamSync=functionSource(party,'partyCpuSyncTick'),teamApply=functionSource(party,'partyCpuApplyBotSnapshot');
for(const field of ['meleeFxSeq','meleeFxKey','meleeFxMs','meleeFxAngle'])
  assert.match(teamSync,new RegExp(field),`CPU 2v2 snapshots must replicate ${field}`);
assert.match(teamApply,/arenaApplyRemoteMeleeAbilityState\(b,raw,kit,cpuTeamClock\(\)\)/,
  'a connected teammate must apply the authority CPU ability animation');

console.log('SUMMARY PASS bot weapon roles');
