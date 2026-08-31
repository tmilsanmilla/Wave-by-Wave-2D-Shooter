import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ai=fs.readFileSync(path.join(root,'js/ai.js'),'utf8');
const party=fs.readFileSync(path.join(root,'js/party.js'),'utf8');
const rendering=fs.readFileSync(path.join(root,'js/rendering.js'),'utf8');
const index=fs.readFileSync(path.join(root,'..','index.html'),'utf8');
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
const context=vm.createContext({
  console,Math,Date,Promise,Map,Set,WeakSet,Object,Array,Number,String,Boolean,JSON,Infinity,setTimeout,clearTimeout,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
  WORLD:{w:1200,h:900},
  WEAPONS:{
    ar:{dmg:48,mag:25,reload:1600,fireRate:145,melee:false,range:620,fall:.781,speed:19},
    m9:{dmg:38,mag:12,reload:800,fireRate:200,melee:false,range:340,fall:.55,speed:17,quickdrawMs:120},
    knife:{dmg:48,mag:Infinity,reload:0,fireRate:380,melee:true,range:130,arc:.35},
  },
  weaponEquipMs:key=>key==='m9'?120:380,
  arenaMeleeLineClear:()=>meleeClear,
  activeArenaBounds:()=>({left:0,top:0,right:1200,bottom:900}),activeObstacles:()=>[],activeArenaPortals:()=>[],
});
vm.runInContext(ai,context,{filename:'ai.js'});
const run=code=>vm.runInContext(code,context);

const tiers=JSON.parse(run('JSON.stringify(BOT_DIFFICULTIES)'));
for(let i=1;i<tiers.length;i++){
  assert.ok(tiers[i].secondaryChance>tiers[i-1].secondaryChance,'secondary judgment must improve by difficulty');
  assert.ok(tiers[i].secondaryMixChance>tiers[i-1].secondaryMixChance,'sidearm mixups must rise by difficulty');
  assert.ok(tiers[i].meleeChance>tiers[i-1].meleeChance,'melee commitment must rise by difficulty');
  assert.ok(tiers[i].meleeCommitRange>tiers[i-1].meleeCommitRange,'higher tiers must anticipate close combat sooner');
  assert.ok(tiers[i].weaponThinkMs<tiers[i-1].weaponThinkMs,'higher tiers must reconsider weapons sooner');
}
for(const tier of tiers)for(const unfair of ['damage','fireMs','mag','reload','equipMs','meleeDamage','secondaryDamage'])
  assert.equal(tier[unfair],undefined,'difficulty must not scale raw weapon stat '+unfair);
const rules=JSON.parse(run('JSON.stringify(CPU_AI_WEAPON_RULES)'));
assert.deepEqual(rules,{ar:{damage:34,fireMs:245,maxRange:840,forgiveness:8},m9:{damage:38,fireMs:200,maxRange:440,forgiveness:5},knife:{damage:48,fireMs:380,maxRange:130,forgiveness:0}});

const sidearm=JSON.parse(run(`(()=>{
  const bot={id:'bot',team:'B',x:800,y:450,r:15,angle:Math.PI,aiRng:123};
  cpuAiInitBotWeapons(bot,0);bot.aiWeaponMags.ar=0;bot.aiWeaponThinkAt=0;bot.aiWeaponLockUntil=0;
  const beforeM9=bot.aiWeaponMags.m9;cpuAiChooseBotWeapon(bot,{id:'player',x:100,y:450,r:15,hp:250},1000,botDifficulty(4));
  const afterSwitch={cur:bot.cur,equipEnd:bot.equipEnd,ar:bot.aiWeaponMags.ar,m9:bot.aiWeaponMags.m9,reload:bot.reloadEnd};
  const spent=cpuAiSpendBotRound(bot,'m9',1120),afterShot={ar:bot.aiWeaponMags.ar,m9:bot.aiWeaponMags.m9,last:bot.aiWeaponLastShot.m9};
  return JSON.stringify({beforeM9,afterSwitch,spent,afterShot});
})()`));
assert.equal(sidearm.afterSwitch.cur,'m9','Impossible must draw its sidearm when the AR is empty');
assert.equal(sidearm.afterSwitch.equipEnd,1120,'M9 must retain its real 120ms draw time');
assert.equal(sidearm.afterSwitch.reload,0,'the stowed AR must not reload in the background');
assert.equal(sidearm.afterSwitch.ar,0);
assert.equal(sidearm.spent,true);
assert.equal(sidearm.afterShot.m9,sidearm.beforeM9-1,'M9 must spend its own magazine');
assert.equal(sidearm.afterShot.ar,0,'M9 fire must not mutate AR ammunition');

const reload=JSON.parse(run(`(()=>{
  const bot={id:'bot',team:'B',x:800,y:450,r:15,angle:Math.PI,aiRng:77};
  cpuAiInitBotWeapons(bot,0);bot.cur='m9';bot.aiWeaponMags.ar=0;bot.aiWeaponMags.m9=0;bot.aiWeaponLockUntil=0;bot.aiWeaponThinkAt=0;
  cpuAiChooseBotWeapon(bot,{id:'player',x:100,y:450,r:15,hp:250},2000,botDifficulty(4));
  const started={cur:bot.cur,reloadWeapon:bot.aiReloadWeapon,reloadEnd:bot.reloadEnd,ar:bot.aiWeaponMags.ar,m9:bot.aiWeaponMags.m9};
  cpuAiCompleteBotReload(bot,3599);const early=bot.aiWeaponMags.ar;cpuAiCompleteBotReload(bot,3600);
  return JSON.stringify({started,early,done:bot.aiWeaponMags.ar,m9:bot.aiWeaponMags.m9});
})()`));
assert.deepEqual({cur:reload.started.cur,reloadWeapon:reload.started.reloadWeapon,reloadEnd:reload.started.reloadEnd},{cur:'ar',reloadWeapon:'ar',reloadEnd:3600});
assert.equal(reload.early,0,'reload may not complete early');
assert.equal(reload.done,25,'only the selected AR reloads');
assert.equal(reload.m9,0,'the stowed sidearm remains empty');

const melee=JSON.parse(run(`(()=>{
  const bot={id:'bot',team:'B',x:100,y:100,r:15,angle:0,aiRng:55};
  const target={id:'player',x:220,y:100,r:15,hp:250};let damage=0,hits=0;
  cpuAiInitBotWeapons(bot,0);bot.aiWeaponThinkAt=0;bot.aiWeaponLockUntil=0;
  cpuAiChooseBotWeapon(bot,target,1000,botDifficulty(4));
  const selected={cur:bot.cur,equipEnd:bot.equipEnd,move:cpuAiMeleeMovement(bot,target)};
  const early=cpuAiTryBotMelee(bot,target,1379,48,d=>{damage+=d;hits++;});
  const first=cpuAiTryBotMelee(bot,target,1380,48,d=>{damage+=d;hits++;});
  const duplicate=cpuAiTryBotMelee(bot,target,1390,48,d=>{damage+=d;hits++;});
  return JSON.stringify({selected,early,first,duplicate,damage,hits,swingSeq:bot.swingSeq,swingR:bot.swingR});
})()`));
assert.equal(melee.selected.cur,'knife','Impossible must commit to the knife at a clear close-range opportunity');
assert.equal(melee.selected.equipEnd,1380,'knife must wait the normal draw time');
assert.equal(melee.early,false,'knife cannot hit during its draw');
assert.equal(melee.first,true);
assert.equal(melee.duplicate,false,'one swing cannot deal repeated frame damage');
assert.deepEqual({damage:melee.damage,hits:melee.hits,swingSeq:melee.swingSeq,swingR:melee.swingR},{damage:48,hits:1,swingSeq:1,swingR:130});

meleeClear=false;
assert.equal(run(`(()=>{const b={x:100,y:100,r:15,angle:0,aiRng:1},t={x:200,y:100,r:15};cpuAiInitBotWeapons(b,0);cpuAiSwitchBotWeapon(b,'knife',0,0);b.equipEnd=0;return cpuAiTryBotMelee(b,t,1000,48,()=>{});})()`),false,
  'knife must never hit through a wall');
meleeClear=true;
assert.equal(run(`(()=>{const b={x:100,y:100,r:15,angle:Math.PI,aiRng:1},t={x:200,y:100,r:15};cpuAiInitBotWeapons(b,0);cpuAiSwitchBotWeapon(b,'knife',0,0);b.equipEnd=0;return cpuAiTryBotMelee(b,t,1000,48,()=>{});})()`),false,
  'knife must not hit a target behind the bot');
assert.equal(run(`(()=>{const b={x:100,y:100,r:15,angle:0,aiRng:1},t={x:260,y:100,r:15};cpuAiInitBotWeapons(b,0);cpuAiSwitchBotWeapon(b,'knife',0,0);b.equipEnd=0;return cpuAiTryBotMelee(b,t,1000,48,()=>{});})()`),false,
  'knife damage must use its real hit range, not its longer decision range');

const partyWeapons={
  ar:{dmg:48,mag:25,reload:1600,fireRate:145,melee:false,range:620,fall:.781,speed:19},
  m9:{dmg:38,mag:12,reload:800,fireRate:200,melee:false,range:340,fall:.55,speed:17,quickdrawMs:120},
  knife:{dmg:48,mag:Infinity,reload:0,fireRate:380,melee:true,range:130,arc:.35},
};
let hostMelee=null;
const partyContext=vm.createContext({
  console,Math,Date,Object,Array,Number,String,Boolean,Set,Map,Infinity,WEAPONS:partyWeapons,WORLD:{w:1200,h:900},ARENA_EDGE:20,PARTY_CPU_HP:250,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),weaponBulletSpeed:key=>partyWeapons[key].speed*1.15,
  weaponBulletLife:(_key,base)=>base/1.15,cpuTeamIsAuthority:()=>true,isLocalCpu2v2:()=>true,partySend:()=>{},
  cpuAiRange:()=>0,cpuAiBotLoadout:run('cpuAiBotLoadout'),cpuAiTryBotMelee:run('cpuAiTryBotMelee'),
  partyCpuEnvelope:()=>true,partyCpuIsHost:()=>false,cpuTeamClock:()=>5000,partyCpuTakeLocalDamage:()=>{},
  party:{self:{id:'local'}},player:{hp:250},recordAiTrainingBotSignal:()=>{},partyCpuHostEvaluate:()=>{},
  partyCpuRecordThreat:()=>{},cpuAiRegisterIncomingHit:()=>{},
  partyCpuHostDamageHuman:(_target,attack,damage)=>{hostMelee={attack,damage};return true;},
});
partyContext.partyCpuMatch={phase:'fight',epoch:'epoch',round:1,shotSeq:0,seenShots:new Set(),shots:[],bots:[],humans:{}};
const rulesStart=party.indexOf('const PARTY_CPU_WEAPON_RULES'),rulesEnd=party.indexOf('function partyCpuWeaponRule',rulesStart);
vm.runInContext(party.slice(rulesStart,rulesEnd)+[
  'partyCpuWeaponRule','partyCpuSpawnBotShot','partyCpuHostMelee','partyCpuApplyBotSnapshot','partyCpuApplyBotShot',
].map(name=>functionSource(party,name)).join('\n'),partyContext,{filename:'party-weapon-runtime.js'});

const partyBot={id:'cpu-red-1',team:'B',x:700,y:450,r:15,angle:Math.PI,cur:'m9',loadout:{primary:'ar',secondary:'m9',melee:'knife'},hp:250};
partyContext.partyCpuMatch.bots=[partyBot];
partyContext.partyCpuSpawnBotShot(partyBot,{id:'local'}, {shotJitter:0},'m9');
const networkShot=partyContext.partyCpuMatch.shots[0];
assert.deepEqual({weapon:networkShot.weapon,dmg:networkShot.dmg,rng:networkShot.rng},{weapon:'m9',dmg:24,rng:340},
  '2v2 must spawn a real M9 projectile from server-owned rules');
partyContext.partyCpuMatch.shots=[];partyContext.partyCpuMatch.seenShots=new Set();
assert.equal(partyContext.partyCpuApplyBotShot({round:1,shot:networkShot}),true,'a canonical M9 bot shot must pass guest validation');
partyContext.partyCpuMatch.shots=[];partyContext.partyCpuMatch.seenShots=new Set();
assert.equal(partyContext.partyCpuApplyBotShot({round:1,shot:{...networkShot,dmg:49}}),false,'a forged M9 damage value must be rejected');

partyBot.cur='ar';partyBot.swingSeq=0;partyBot.swingT=0;
assert.equal(partyContext.partyCpuApplyBotSnapshot({round:1,bots:[{id:partyBot.id,x:690,y:450,angle:Math.PI,cur:'knife',hp:250,flash:0,
  swingSeq:1,swingMs:180,swingA:Math.PI,swingSide:-1}]}),true);
assert.deepEqual({cur:partyBot.cur,seq:partyBot.swingSeq,side:partyBot.swingSide},{cur:'knife',seq:1,side:-1},
  '2v2 guests must apply the allowlisted knife and one bounded swing');

const meleeBot={id:'cpu-red-2',team:'B',x:100,y:100,r:15,angle:0,cur:'knife',loadout:{primary:'ar',secondary:'m9',melee:'knife'},
  aiWeaponLastShot:{ar:0,m9:0,knife:0},equipEnd:0,reloadEnd:0,aiMeleeSide:1,swingSeq:0};
const meleeHuman={id:'local',team:'A',x:220,y:100,r:15,hp:250};partyContext.partyCpuMatch.humans.local=meleeHuman;hostMelee=null;
assert.equal(partyContext.partyCpuHostMelee(meleeBot,meleeHuman,1000),true);
assert.equal(hostMelee?.attack?.melee,true,'2v2 knife damage must be marked non-projectile before the parry boundary');
assert.equal(hostMelee?.damage,42,'2v2 knife damage must use one fixed non-scaling rule');

assert.match(ai,/cpuAiChooseBotWeapon\(b,player,now,tuning,parryResponse\)/,'1v1 must run the shared weapon selector with visible-guard context');
assert.match(ai,/cpuAiTryBotMelee\(b,player,now,weaponRule\.damage/,'1v1 must execute authoritative knife swings');
assert.match(ai,/kind!==\'melee\'&&now<parryUntil/,'Twin Sai must not turn a knife swing into a reflected bullet');
assert.match(party,/cpuAiChooseBotWeapon\(b,target,clock,profile,parryResponse\)/,'2v2 must run the shared weapon selector with visible-guard context');
assert.match(party,/function partyCpuHostMelee/,'2v2 must have an authority-owned melee damage path');
assert.match(party,/shot\.melee===true/,'2v2 melee must bypass projectile parry');
assert.match(party,/weapon:weaponId/,'2v2 bot projectiles must carry their allowlisted weapon ID');
assert.match(party,/\!\[kit\.primary,kit\.secondary\]\.includes\(weapon\)/,'2v2 guests must reject bot shots outside the fixed kit');
assert.match(party,/swingSeq:Math\.max/,'2v2 snapshots must replicate bot melee animation state');
assert.match(rendering,/swingProgress=e\.swingT&&\(clock-e\.swingT\)/,'2v2 rendering must show replicated bot swings');
for(const [script,version] of [['ai','20260830-sniper-fire-v1'],['party','20260830-cpu-combat-v2'],['rendering','20260830-freezer-projectile-v1']])
  assert.match(index,new RegExp(`js/${script}\\.js\\?v=${version}`),`${script}.js needs its current CPU cache-buster`);

console.log('SUMMARY PASS bot weapon selection');
