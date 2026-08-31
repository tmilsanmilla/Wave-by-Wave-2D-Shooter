import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const state=read('js/state.js'),combat=read('js/combat.js'),rendering=read('js/rendering.js');
const ui=read('js/ui.js'),input=read('js/input.js'),index=read('../index.html');

const helper=state.match(/let practiceInfiniteAmmo=false;[\s\S]*?function practiceInfiniteAmmoActive\(\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(helper,'Practice needs a dedicated infinite-ammo setting and active-state guard');
const context=vm.createContext({});
vm.runInContext(`
  let practiceMode=null,tutorialOn=false;
  ${helper}
  this.ammo={
    active:()=>practiceInfiniteAmmoActive(),
    setEnabled:value=>{practiceInfiniteAmmo=!!value;},
    setMode:value=>{practiceMode=value;},
    setTutorial:value=>{tutorialOn=!!value;}
  };
`,context,{filename:'practice-ammo-state.js'});
const ammo=context.ammo;
ammo.setEnabled(true);ammo.setMode('range');
assert.equal(ammo.active(),true,'the option must activate in the shooting range');
ammo.setMode('tracking');assert.equal(ammo.active(),true,'the option must activate in Tracking Practice');
ammo.setMode('arena');assert.equal(ammo.active(),false,'Arena/CPU/online duels must never inherit infinite ammo');
ammo.setMode('range');ammo.setTutorial(true);assert.equal(ammo.active(),false,'the interactive tutorial must remain finite');
ammo.setTutorial(false);ammo.setEnabled(false);assert.equal(ammo.active(),false,'turning the option off must restore normal magazines');

const combatContext={
  state:'play',now:1000,fireSuppressT:0,practiceMode:'range',parryUntil:0,TWIN_SAI_PARRY_MS:1000,
  player:{cur:'test',mags:{test:5},reserve:{test:20},reloadEnd:0,equipEnd:0,lastShot:0,bloom:0,x:0,y:0,flash:0},
  WEAPONS:{test:{melee:false,cell:false,fireRate:10,aimSpread:0,pellets:1,kick:0,dmg:10,range:100,fall:1,reload:100}},
  inf:true,practiceInfiniteAmmoActive:()=>combatContext.inf,arenaUtilityFrozen:()=>false,isLocked:()=>false,
  weaponLastShotAt:Object.create(null),perks:{rate:1,acc:1,velo:1,dmg:1,pierce:0,range:1,noBloom:0,reload:1},
  wm:()=>({rate:1,spread:1,pellets:0,dmg:1,pierce:0,range:1,fall:1}),surgeT:0,
  resetFireCadence:()=>{},cancelFanTheHammer:()=>{},fanShots:0,fanBurstUntil:0,fanNextT:0,
  aiming:false,daggersOut:null,sawLock:false,sawFuel:100,meleeSwing:()=>{},tutorialOn:false,tutFired:0,
  aimAngle:()=>0,effSpread:()=>0,bullets:[],weaponBulletSpeed:()=>4,weaponBulletLife:()=>100,weaponColor:()=>'#fff',
  partyCpuBroadcastPlayerShot:()=>false,arenaBroadcastShot:()=>{},addShake:()=>{},sfx:()=>{},
  activeArenaBounds:()=>({left:0,right:100,top:0,bottom:100}),clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
  mouse:{x:0,y:0},swayScreen:()=>({x:0,y:0}),screenToWorld:()=>({x:0,y:0}),grenades:[],magSize:()=>5,
};
vm.createContext(combatContext);vm.runInContext(combat,combatContext,{filename:'combat.js'});
for(let shot=0;shot<20;shot++){combatContext.now+=20;assert.equal(combatContext.tryFire(),true);}
assert.equal(combatContext.player.mags.test,5,'repeated shots must leave the virtual magazine full');
assert.equal(combatContext.startReload(),false,'manual reload must be rejected in Infinite Ammo Practice');
assert.equal(combatContext.player.reloadEnd,0,'manual reload must not start a timer');
combatContext.inf=false;combatContext.now+=20;assert.equal(combatContext.tryFire(),true);
assert.equal(combatContext.player.mags.test,4,'turning the option off must restore normal ammo consumption');
combatContext.inf=true;combatContext.aiming=true;combatContext.player.cur='revolver';
combatContext.player.mags.revolver=6;combatContext.player.reserve.revolver=30;
combatContext.WEAPONS.revolver={...combatContext.WEAPONS.test,fan:true,fanGapMs:115,fanLockMs:900};
combatContext.magSize=key=>key==='revolver'?6:5;combatContext.now+=20;
assert.equal(combatContext.tryFire(),true);
assert.equal(combatContext.player.mags.revolver,6,'Python must retain its infinite magazine');
assert.equal(combatContext.fanShots,5,'Python must queue only five follow-ups after its first shot');

const reloadSource=combat.slice(combat.indexOf('function startReload(){'),combat.indexOf('function fireCadenceLastShot('));
const fireSource=combat.slice(combat.indexOf('function tryFire('),combat.indexOf('// Solve the intercept analytically'));
assert.match(reloadSource,/practiceInfiniteAmmoActive\(\)[\s\S]*?player\.reloadEnd=0;return false;/,
  'R must be a true no-op with no reload timer in Infinite Ammo Practice');
assert.match(fireSource,/if\(!infinitePractice&&player\.mags\[player\.cur\]<1\)/,
  'Infinite Ammo Practice must bypass the empty-magazine stop');
assert.match(fireSource,/if\(!infinitePractice\)player\.mags\[player\.cur\]--/,
  'fireworks must not consume the infinite Practice magazine');
assert.match(fireSource,/if\(!infinitePractice\)player\.mags\[shotWeapon\]--/,
  'ordinary and cell weapons must not consume the infinite Practice magazine');
assert.match(fireSource,/fanShots=infinitePractice[\s\S]*?magSize\(shotWeapon\)-1/,
  'Python must use a finite normal-mag volley instead of an endless fan sequence');
assert.match(fireSource,/if\(!infinitePractice&&player\.mags\[player\.cur\]<1 && !w\.cell\) startReload\(\)/,
  'Infinite Ammo Practice must not auto-reload after firing');

assert.match(ui,/action:'practice-infinite-ammo'/,'Practice needs a selectable Infinite Ammo control');
assert.match(ui,/INFINITE AMMO: ON[\s\S]*?\\u221E MAGAZINE[\s\S]*?NO RELOAD/,
  'the selected option must explain the sideways-eight magazine and disabled reload');
assert.match(input,/r\.action==='practice-infinite-ammo'\) practiceInfiniteAmmo=!practiceInfiniteAmmo/,
  'the Infinite Ammo selector must toggle without opening a mode card');
assert.match(ui,/player\.reserve\[loadout\.primary\]=magSize\(loadout\.primary\)\*7;/,
  'the tutorial primary needs seven reserve magazines (five more than before)');
assert.match(ui,/player\.reserve\[loadout\.secondary\]=magSize\(loadout\.secondary\)\*7;/,
  'the tutorial secondary needs seven reserve magazines (five more than before)');
assert.ok((rendering.match(/'\\u221E AMMO'/g)||[]).length>=2,
  'desktop and touch HUDs must both show the infinite-ammo symbol');

for(const [script,version] of [['state','20260831-practice-infinite-ammo-v1'],['input','20260831-shop-weapon-picker-v1'],
  ['combat','20260831-practice-infinite-ammo-v1'],['rendering','20260831-practice-infinite-ammo-v1'],
  ['ui','20260831-shop-weapon-picker-v1']])
  assert.match(index,new RegExp(`outpost-zero/js/${script}\\.js\\?v=${version}`),
    `${script}.js needs its current cache tag`);

console.log('PASS selectable Practice infinite ammo and expanded tutorial reserves');
