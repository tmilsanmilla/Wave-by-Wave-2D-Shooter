import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const gameplay=read('js/gameplay.js'),persistence=read('js/persistence.js'),combat=read('js/combat.js');
const weaponsSource=read('js/weapons.js'),index=read('../index.html');

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,`missing ${name}`);
  const brace=source.indexOf('{',start);let depth=0,quote='',escaped=false,line=false,block=false;
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
vm.runInContext(`${weaponsSource}\nglobalThis.__weapons=WEAPONS;`,weaponContext,{filename:'weapons.js'});
const volt={...weaponContext.__weapons.volt},smg={...weaponContext.__weapons.smg};
assert.equal(volt.auto,true,'the regression must exercise the real full-auto Volt definition');

let drySounds=0,dropCalls=0;
const context=vm.createContext({
  Math,Number,Object,Array,Set,Infinity,
  state:'play',practiceMode:'dps',soloPractice:true,
  PRACTICE_MODES:[{id:'range'},{id:'dps'},{id:'tracking'},{id:'boss'}],
  tryLoadoutBackup:{primary:'smg',secondary:'m9',melee:'knife',utility:null},tryPracticeLoanKey:'volt',
  FALL_KEYS:[],fallEligible:()=>false,isWeaponPublished:key=>key!=='hidden',
  sb:{},testMode:false,GEM_SHOP:[{key:'volt'},{key:'dart'}],gemOwned:{},temporarilyOwnsWeapon:()=>false,
  authUser:{id:'practice-user'},LOCKED_KEYS:[],
  LOADOUT_SLOTS:['primary','secondary','melee','utility'],
  loadout:{primary:null,secondary:'volt',melee:null,utility:null},
  lastLoadout:{primary:'smg',secondary:'m9',melee:'knife',utility:null},
  SHARED_LOADOUT_DEFAULTS:{primary:'smg',secondary:'m9',melee:'knife',utility:null},
  WEAPONS:{volt,smg},PRIMARIES:['smg'],utilityOut:false,
  player:{cur:'volt',mags:{volt:7,smg:30},reserve:{volt:Infinity,smg:120},reloadEnd:0,equipEnd:0,
    lastShot:0,bloom:0,x:100,y:100,flash:0},
  persistLastLoadoutLocal:()=>{},canRestoreAccountLoadout:()=>false,profileLoaded:false,
  cancelFanTheHammer:()=>{},switchWeapon:key=>{context.player.cur=key;},
  now:1000,fireSuppressT:0,parryUntil:0,TWIN_SAI_PARRY_MS:1000,
  arenaUtilityFrozen:()=>false,practiceInfiniteAmmoActive:()=>false,
  weaponLastShotAt:Object.create(null),perks:{rate:1,acc:1,velo:1,dmg:1,pierce:0,range:1,noBloom:0},
  wm:()=>({rate:1,spread:1,pellets:0,dmg:1,pierce:0,range:1,fall:1}),surgeT:0,
  resetFireCadence:()=>{},fanShots:0,fanBurstUntil:0,fanNextT:0,aiming:false,
  daggersOut:null,sawLock:false,sawFuel:100,meleeSwing:()=>{},tutorialOn:false,tutFired:0,
  aimAngle:()=>0,effSpread:()=>0,bullets:[],weaponBulletSpeed:key=>context.WEAPONS[key].speed,
  weaponBulletLife:()=>1200,weaponColor:()=>'#7fd8ff',partyCpuBroadcastPlayerShot:()=>false,
  arenaBroadcastShot:()=>{},addShake:()=>{},sfx:type=>{if(type==='dry')drySounds++;},
  magSize:key=>context.WEAPONS[key].mag,grenades:[],swayScreen:()=>({x:0,y:0}),
  screenToWorld:()=>({x:200,y:100}),mouse:{x:200,y:100},activeArenaBounds:()=>({left:0,right:1000,top:0,bottom:1000}),
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
});

vm.runInContext([
  functionSource(gameplay,'soloPracticeLoanAllows'),functionSource(persistence,'isLocked'),
  functionSource(persistence,'dropExpiredTemporaryLoadout'),functionSource(combat,'fireCadenceLastShot'),
  functionSource(combat,'tryFire'),
].join('\n'),context,{filename:'practice-weapon-loan-runtime.js'});

assert.equal(context.isLocked('volt'),false,'the exact published DPS Practice loan must pass the live firing guard');
assert.equal(context.isLocked('dart'),true,'the Practice loan must not unlock any other unowned shop weapon');
assert.equal(context.isLocked('hidden'),true,'publication must outrank every Practice loan');

assert.equal(context.tryFire(),true,'the first Volt shot in DPS Practice must fire');
assert.equal(context.player.cur,'volt','the first shot must not replace Volt with the SMG');
assert.equal(context.loadout.secondary,'volt','the first shot must preserve the temporary Practice loadout');
assert.equal(context.bullets.length,1);assert.equal(context.bullets[0].weapon,'volt');
context.now+=volt.fireRate;
assert.equal(context.tryFire(true),true,'held full-auto fire must continue after the first Volt shot');
assert.equal(context.player.cur,'volt');assert.equal(context.bullets.length,2);
assert.ok(context.bullets.every(bullet=>bullet.weapon==='volt'));
assert.equal(drySounds,0,'authorized Practice shots must never produce the locked-weapon dry fire');

const activeLoadout={...context.loadout};
assert.equal(context.dropExpiredTemporaryLoadout(['volt']),false,
  'an unrelated ownership refresh must not strip an active exact Practice loan');
assert.deepEqual({...context.loadout},activeLoadout);
assert.equal(context.gemOwned.volt,undefined,'Practice must never grant permanent ownership');

context.soloPractice=false;
assert.equal(context.isLocked('volt'),true,'leaving solo Practice must end the loan immediately');
context.soloPractice=true;context.practiceMode='arena';
assert.equal(context.isLocked('volt'),true,'the solo Practice loan must never carry into Arena');
context.practiceMode='dps';context.isWeaponPublished=key=>key!=='volt'&&key!=='hidden';
assert.equal(context.isLocked('volt'),true,'unpublishing Volt must revoke the loan immediately');
assert.equal(context.dropExpiredTemporaryLoadout(['volt']),true,'revoked Volt must be removed from the live loadout');
assert.equal(context.loadout.secondary,null);assert.equal(context.player.cur,'smg');

const launchSource=functionSource(gameplay,'tryWeaponOnRange'),restoreSource=functionSource(gameplay,'restoreTryLoadout');
assert.match(launchSource,/tryPracticeLoanKey=k/,'the Practice card must record the exact loaned item');
assert.match(restoreSource,/tryPracticeLoanKey=null/,'exiting Practice must clear the loan authorization');
assert.match(index,/js\/persistence\.js\?v=20260902-ai-cleanup-v1/);
assert.match(index,/js\/gameplay\.js\?v=20260831-practice-loan-v1/);

console.log('PASS exact Practice weapon loan survives first-shot checks without granting ownership');
