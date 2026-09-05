import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ai=fs.readFileSync(path.join(root,'js/ai.js'),'utf8');
const party=fs.readFileSync(path.join(root,'js/party.js'),'utf8');
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

assert.equal(tiers[0].moveSpeed,2.15,'Beginner must be physically slower than the old 2.5-speed bot');
assert.ok(tiers[0].moveSpeed<tiers[1].moveSpeed&&tiers[0].turnRate<tiers[1].turnRate&&tiers[0].reactionMs>tiers[1].reactionMs,
  'Easy and later tiers must retain a clear physical execution advantage over Beginner');
assert.deepEqual(tiers.map(tier=>tier.rangedDamageScale),[.5,.625,.75,.875,1],
  'ranged damage must rise in one explicit, monotonic curve');

const damage=JSON.parse(run(`JSON.stringify({
  ar:BOT_DIFFICULTIES.map(tier=>cpuAiRangedDamage(CPU_AI_WEAPON_RULES.ar,tier)),
  m9:BOT_DIFFICULTIES.map(tier=>cpuAiRangedDamage(CPU_AI_WEAPON_RULES.m9,tier)),
  normal:WEAPONS.ar.dmg
})`));
assert.deepEqual(damage.ar,[24,30,36,42,48]);
assert.deepEqual(damage.m9,[19,24,29,33,38]);
assert.equal(damage.ar.at(-1),damage.normal,'Impossible must deal the normal 48-damage SCAR-H hit before falloff');

const prediction=JSON.parse(run(`JSON.stringify({
  beginner:arenaBotTuning(0),easy:arenaBotTuning(1)
})`));
assert.equal(prediction.beginner.usePrediction,false,'the current tactical feature set must not re-enable predictive shots for Beginner');
assert.deepEqual({lead:prediction.beginner.leadFactor,max:prediction.beginner.maxLeadMs},{lead:0,max:0});
assert.equal(prediction.easy.usePrediction,true,'Easy and later tiers must retain predictive aiming');

assert.deepEqual({route:tiers[0].routeVariation,fixed:tiers[0].fixedRoutes,fake:tiers[0].peekFakeChance,adapt:tiers[0].prefireAdapt,
  timing:tiers[0].peekTimingVariance,move:[tiers[0].moveCommitMin,tiers[0].moveCommitMax],
  hold:[tiers[0].peekHoldMin,tiers[0].peekHoldMax],settle:[tiers[0].peekSettleMin,tiers[0].peekSettleMax]},
  {route:0,fixed:true,fake:0,adapt:0,timing:0,move:[1450,1450],hold:[125,125],settle:[125,125]},
  'Beginner routes and peek phases must use fixed, readable timing with no fake-peek adaptation');

const repeatedRoute=JSON.parse(run(`(()=>{
  const config=Object.assign({},botDifficulty(0),{useNavigation:false,useReactiveCover:false}),target={id:'player',x:500,y:100,hp:250};
  const make=seed=>({id:'b'+seed,x:100,y:100,r:15,hp:250,aiRng:seed,aiSide:1,aiTactic:'',aiTacticUntil:0,aiTacticMinUntil:0,aiPlanMoveX:0,aiPlanMoveY:0});
  const a=make(1),b=make(987654),am=cpuAiPickMove(a,target,[a],1000,config,null),bm=cpuAiPickMove(b,target,[b],1000,config,null);
  return JSON.stringify({a:{x:am.x,y:am.y,tactic:am.tactic,until:a.aiTacticUntil},b:{x:bm.x,y:bm.y,tactic:bm.tactic,until:b.aiTacticUntil}});
})()`));
assert.deepEqual(repeatedRoute.a,repeatedRoute.b,
  'Beginner must choose the same regular route from the same geometry instead of seed-dependent movement noise');

const beginnerGuard=JSON.parse(run(`(()=>{
  const config=botDifficulty(0),bot={id:'bot',x:100,y:100,angle:0,aiRng:77},target={id:'player',x:320,y:100,r:15};
  cpuAiInitBotWeapons(bot,0);
  const seen=cpuAiObserveVisibleParry(bot,target,1000,config,true),late=cpuAiObserveVisibleParry(bot,target,2000,config,true);
  const fire=cpuAiPressureFireDecision(bot,target,2000,config,{available:true,visible:true,aimErr:0,holdRanged:late.holdRanged});
  return JSON.stringify({seen,late,fire,willRespect:bot.aiParryWillRespect});
})()`));
assert.equal(beginnerGuard.willRespect,false);
assert.equal(beginnerGuard.seen.holdRanged,false);
assert.deepEqual(beginnerGuard.late,{visible:true,holdRanged:false,forceMelee:false});
assert.equal(beginnerGuard.fire.fire,true,'Beginner must keep firing instead of respecting an active Twin Sai guard');

assert.match(party,/damage=typeof cpuAiRangedDamage==='function'\?cpuAiRangedDamage\(rule,profile\):rule\.damage/,
  'local CPU 2v2 must apply the same tier multiplier to its existing team-balanced ranged baseline');
assert.match(party,/shotProfile=\{damage:rangedDamage,/,
  'CPU 2v2 TNT decisions must use the same scaled damage as the projectile they would fire');

console.log('SUMMARY PASS bot beginner difficulty');
