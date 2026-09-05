import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const weaponsSource=read('js/weapons.js');
const combat=read('js/combat.js');
const online=read('js/online.js');
const rendering=read('js/rendering.js');
const index=read('../index.html');

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,`missing ${name}`);
  const params=source.indexOf('(',start);let paren=0,brace=-1,paramQuote='',paramEscaped=false;
  for(let i=params;i<source.length;i++){
    const c=source[i];
    if(paramQuote){if(paramEscaped)paramEscaped=false;else if(c==='\\')paramEscaped=true;else if(c===paramQuote)paramQuote='';continue;}
    if(c==='"'||c==="'"||c==='`'){paramQuote=c;continue;}
    if(c==='(')paren++;else if(c===')'&&--paren===0){brace=source.indexOf('{',i+1);break;}
  }
  assert.ok(brace>=0,`missing ${name} body`);let depth=0,quote='',escaped=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}

const weaponContext=vm.createContext({console,Math,Number,Object,Array,Set,Map,Infinity});
vm.runInContext(`${weaponsSource}\nglobalThis.__utilities=UTILITIES;`,weaponContext,{filename:'weapons.js'});
const freezer={...weaponContext.__utilities.freezer};
assert.deepEqual(
  {cd:freezer.cd,speed:freezer.speed,fuseMs:freezer.fuseMs,radius:freezer.radius,freezeMs:freezer.freezeMs},
  {cd:12500,speed:11.25,fuseMs:1580,radius:105,freezeMs:2500},
  'Freezer must have half cooldown, +25% speed, and enough flight time for +35% travel range',
);
const dragTravel=(speed,ticks)=>speed*(1-Math.pow(0.985,ticks))/(1-0.985);
const oldTravel=dragTravel(9,80),buffedTravel=dragTravel(freezer.speed,94);
assert.ok(Math.abs(buffedTravel/oldTravel-1.35)<0.002,
  'the faster charge plus its adjusted fuse must produce approximately 35% more maximum travel distance');
assert.doesNotMatch(String(freezer.blurb||'')+String(freezer.gimmick&&freezer.gimmick.copy||''),/wide radius for 5s/i,
  'the player-facing Freezer description must not advertise the removed instant five-second blast');

const launchSource=functionSource(combat,'launchFreezer');
const updateSource=functionSource(combat,'updateFreezerProjectile');
const detonateSource=functionSource(combat,'detonateFreezer');
const blastClearSource=functionSource(combat,'freezerBlastClear');
const selfFreezeSource=functionSource(combat,'applyPlayerFreezerFreeze');

const bursts=[];
let wallAt=Infinity;
const context=vm.createContext({
  console,Math,Number,Object,Array,Set,Map,Infinity,
  now:1000,UTILITIES:{freezer},grenades:[],freezeFx:[],
  player:{x:100,y:100,r:15,dashUntil:0,moveT:0},playerFrozenUntil:0,
  enemies:[
    {x:125,y:100,r:12,frozenUntil:0,id:'clear'},
    {x:150,y:100,r:12,frozenUntil:0,id:'walled'},
  ],
  practiceMode:null,arena:null,utilityOut:false,fistFlurryUntil:0,sawChargeUntil:0,comboNextT:0,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),dist2:(x0,y0,x1,y1)=>(x1-x0)**2+(y1-y0)**2,
  activeArenaBounds:()=>({left:0,top:0,right:500,bottom:500}),
  projectileOutsideArena:()=>false,pointInRects:x=>x>=wallAt,
  losBlocked:(x0,y0,x1)=>x1>=145,
  burst:(...args)=>bursts.push(args),addShake(){},sfx(){},
  cancelFanTheHammer(){},cancelMedHeal(){},resetFireCadence(){},finishMeleeAbilityVisual(){},
  isCasualOnlineArena:()=>false,arenaCanAct:()=>true,
});
vm.runInContext(`${selfFreezeSource}\n${blastClearSource}\n${launchSource}\n${updateSource}\n${detonateSource}`,context,
  {filename:'freezer-helpers.js'});

const projectile=context.launchFreezer(0);
assert.equal(context.grenades.length,1,'casting Freezer must launch one visible projectile');
assert.equal(projectile.freezer,true,'the launched object must be identifiable as a Freezer projectile');
assert.equal(projectile.x,100,'Freezer must begin at the player instead of appearing at the crosshair');
assert.equal(projectile.y,100);
assert.equal(projectile.vx,11.25,'Freezer must travel 25% faster');
assert.ok(Math.abs(projectile.vy)<1e-9);
assert.equal(projectile.t,2580,'Freezer must stay in flight long enough to gain 35% total travel range');

context.updateFreezerProjectile(projectile,1);
assert.equal(projectile.x,111.25,'a live Freezer must visibly move across the world');
assert.equal(context.freezeFx.length,0,'moving one step must not apply an instant crosshair blast');
assert.equal(context.enemies[0].frozenUntil,0,'targets must not freeze before impact');

wallAt=116;
const wallShot=context.launchFreezer(0);wallShot.x=109;
assert.equal(context.updateFreezerProjectile(wallShot,1),true,'the first wall contact must end Freezer travel');
assert.ok(wallShot.x<wallAt,'swept movement must leave the visible ice charge on the near side of the wall');
wallAt=Infinity;

// Detonation freezes the caster and visible targets on the same side of a wall,
// while line-of-sight prevents both gameplay and the final effect crossing it.
projectile.x=100;projectile.y=100;
context.detonateFreezer(projectile);
assert.equal(context.playerFrozenUntil,3500,'standing in your own Freezer blast must freeze you for 2.5 seconds');
assert.equal(context.enemies[0].frozenUntil,3500,'an exposed nearby enemy must receive the shorter freeze');
assert.equal(context.enemies[1].frozenUntil,0,'a wall must shield enemies from the Freezer blast');
assert.equal(context.freezeFx.length,1,'impact must create exactly one final icy effect');
assert.equal(context.freezeFx[0].r,105,'the travel-range buff must not undo the smaller blast radius');

assert.match(updateSource,/losBlocked|pointInRects/,
  'projectile movement must test solid geometry instead of visually passing through walls');
assert.match(functionSource(combat,'utilCast'),/launchFreezer\(/,
  'Freezer casting must enter the projectile lifecycle');
assert.doesNotMatch(functionSource(combat,'utilCast'),/freezeFx\.push\(/,
  'Freezer casting must not create the old instant crosshair explosion');
assert.match(functionSource(combat,'update'),/updateFreezerProjectile\(/,
  'the fixed gameplay update must advance Freezer projectiles');
assert.match(functionSource(combat,'update'),/playerFrozenUntil\s*>\s*now/,
  'self-freeze must actually stop player movement while active');
assert.match(rendering,/g\.freezer[\s\S]{0,700}(arc|fill)/,
  'the travelling Freezer must have its own visible projectile artwork');
const visualContext=vm.createContext({Math,pointInRects:x=>x>=40});
vm.runInContext(functionSource(rendering,'freezerVisualReach'),visualContext,{filename:'freezer-visual-reach.js'});
assert.equal(visualContext.freezerVisualReach(0,0,0,105),36,
  'the ice blast artwork must clip its ray before solid geometry instead of painting through it');

assert.match(functionSource(online,'arenaBroadcastUtility'),/key==='freezer'[\s\S]{0,260}angle/,
  'online Freezer packets must describe a launch angle rather than an instant endpoint');
assert.match(functionSource(online,'arenaApplyRemoteUtility'),/key==='freezer'[\s\S]{0,900}launchFreezer\(/,
  'remote Freezers must reproduce the same moving projectile');
assert.doesNotMatch(functionSource(online,'arenaApplyRemoteUtility'),/key==='freezer'[\s\S]{0,600}utilityFrozenUntil\s*=\s*now/,
  'receiving a cast packet must never freeze the player before the projectile arrives');

for(const [script,version] of [['weapons','20260831-frag-range-v1'],['upgrades','20260831-hub-tools-settings-v1'],
  ['gameplay','20260831-practice-loan-v1'],['combat','20260831-utility-preround-v1'],
  ['online','20260902-ai-cleanup-v1'],['rendering','20260831-mobile-quick-melee-v1'],
  ['ui','20260902-ai-cleanup-v1']])
  assert.match(index,new RegExp(`js/${script}\\.js\\?v=${version}`),`${script}.js needs its current gameplay cache-buster`);

console.log('PASS Freezer travels, respects walls, self-freezes, and uses the reduced blast');
