import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const abilities=fs.readFileSync(path.join(root,'js/abilities.js'),'utf8');
const combat=fs.readFileSync(path.join(root,'js/combat.js'),'utf8');

const blockStart=combat.indexOf('  // thrown burning daggers: fly out');
const blockEnd=combat.indexOf('\n\n  player.bloom',blockStart);
assert.ok(blockStart>=0&&blockEnd>blockStart,'Burning Dagger update block must remain testable');

let hitCount=0;
const bursts=[];
const context={
  state:'play',practiceMode:'arena',now:1000,Math,Number,Set,
  player:{cur:'bdaggers',x:100,y:100},abilityCD:{bdaggers:0},daggersOut:null,comboNextT:1090,
  mouse:{down:false},aimStickId:null,tapShootUntil:0,fanShots:0,parryUntil:0,TWIN_SAI_PARRY_MS:1000,
  arena:{opponent:{id:'opponent',x:115,y:100,r:15,hp:250}},enemies:[],perks:{dmg:1},tutorialOn:false,
  arenaCanAct:()=>true,arenaUtilityFrozen:()=>false,isLocked:()=>false,isCpuTeamArena:()=>false,
  aimAngle:()=>0,abilityCdOf:()=>3000,sfx:()=>{},wm:()=>({dmg:1}),rand:(lo,hi)=>(lo+hi)/2,
  pointInRects:()=>false,losBlocked:()=>false,projectileOutsideArena:()=>false,clampProjectileToArena:()=>{},
  arenaMeleeSpecialHit:()=>{hitCount++;return true;},dist2:(x1,y1,x2,y2)=>(x1-x2)**2+(y1-y2)**2,
  damageEnemy:()=>{},freezeHit:()=>1,igniteEnemy:()=>{},killEnemy:()=>{},
  burst:(...args)=>bursts.push(args)
};
vm.createContext(context);
vm.runInContext(abilities,context);
vm.runInContext(`function stepBurningDaggers(dt){${combat.slice(blockStart,blockEnd)}}`,context);

context.meleeAbility();
assert.equal(context.daggersOut.blades.length,2,'Hurl must launch exactly two blades');
assert.equal(context.comboNextT,0,'Hurl must cancel a stale queued combo slash');
const firstSeq=context.player.meleeFxSeq;

context.now=1050;context.pointInRects=()=>true;
context.stepBurningDaggers(1);
assert.equal(context.daggersOut,null,'one endpoint wall hit must teleport both blades back');
assert.equal(context.abilityCD.bdaggers,context.now,'wall contact must make Hurl ready immediately');
assert.equal(context.player.meleeFxWallRecallSeq,firstSeq,'wall recall must publish the completed Hurl sequence');
assert.equal(hitCount,0,'a wall collision must stop target damage in the same frame');
assert.ok(bursts.length>=2,'wall recall should show a small impact and hand-return cue');

context.pointInRects=()=>false;context.meleeAbility();
assert.equal(context.daggersOut.blades.length,2,'the refunded Hurl must rethrow immediately');
assert.equal(context.player.meleeFxSeq,firstSeq+1,'an immediate rethrow must get a fresh visual sequence');

context.now=1100;context.losBlocked=()=>true;
context.stepBurningDaggers(1);
assert.equal(context.daggersOut,null,'a swept thin-wall crossing must recall both blades');
assert.equal(context.abilityCD.bdaggers,1100,'a swept collision must also refund Hurl');

context.losBlocked=()=>false;context.meleeAbility();
context.now=1150;context.projectileOutsideArena=()=>true;
context.stepBurningDaggers(1);
assert.equal(context.daggersOut,null,'leaving the arena boundary must count as wall contact');
assert.equal(context.abilityCD.bdaggers,1150,'arena-boundary recall must refund Hurl');

context.projectileOutsideArena=()=>false;context.meleeAbility();
const ordinaryCooldown=context.abilityCD.bdaggers,wallMarker=context.player.meleeFxWallRecallSeq;
context.now=2650;
for(const blade of context.daggersOut.blades){blade.x=context.player.x;blade.y=context.player.y;blade.returning=true;}
context.stepBurningDaggers(0);
assert.equal(context.daggersOut,null,'normally caught blades must still finish cleanly');
assert.equal(context.abilityCD.bdaggers,ordinaryCooldown,'a normal catch must not refund the remaining cooldown');
assert.equal(context.player.meleeFxWallRecallSeq,wallMarker,'only wall recalls may advance the refund marker');

console.log('PASS Burning Daggers instantly recall and reset only on wall contact');
