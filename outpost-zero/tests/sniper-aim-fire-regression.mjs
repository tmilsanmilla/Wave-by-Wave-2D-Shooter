import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const weaponsSource=read('js/weapons.js'),gameplay=read('js/gameplay.js'),input=read('js/input.js'),combat=read('js/combat.js'),index=read('../index.html');

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
const WEAPONS=weaponContext.__weapons;

// A shot made with another weapon must not create an extra one-second AWM
// lockout after its normal draw finishes. The AWM still keeps its own bolt
// cadence, so swapping away and back cannot bypass two Sniper shots' interval.
const cadenceContext=vm.createContext({Number,Infinity,weaponLastShotAt:{ar:1000},player:{lastShot:1000}});
vm.runInContext(functionSource(combat,'fireCadenceLastShot'),cadenceContext,{filename:'sniper-cadence.js'});
assert.equal(cadenceContext.fireCadenceLastShot('sniper',WEAPONS.sniper),-Infinity,
  'another weapon must not put an unfired AWM on cooldown');
cadenceContext.weaponLastShotAt.sniper=1380;
assert.equal(cadenceContext.fireCadenceLastShot('sniper',WEAPONS.sniper),1380,
  'the AWM must retain its own previous-shot clock');
assert.equal(cadenceContext.fireCadenceLastShot('ar',WEAPONS.ar),1000,
  'ordinary weapon cadence behavior must remain unchanged');
assert.match(functionSource(combat,'tryFire'),/cadenceLastShot=fireCadenceLastShot\(player\.cur,w\)/,
  'the real firing gate must consume the AWM-specific cadence clock');

// Exercise the small desktop trigger-buffer boundary directly. One physical
// held press receives a bounded retry, but success consumes the buffer and can
// never turn the semi-auto AWM into held full-auto fire.
const bufferStart=input.indexOf('const SNIPER_TRIGGER_BUFFER_MS');
const bufferEnd=input.indexOf('function toggleMenuFromInput',bufferStart);
assert.ok(bufferStart>=0&&bufferEnd>bufferStart,'missing Sniper trigger-buffer boundary');
let ready=false,shots=0;
const bufferContext=vm.createContext({
  WEAPONS,player:{cur:'sniper',mags:{sniper:6}},state:'play',menuOpen:false,utilityOut:false,now:1000,
  mouse:{down:true},mouseFireCadence:false,touchFireCadence:false,
  tryFire:()=>{if(!ready)return false;shots++;return true;},
});
vm.runInContext(`${input.slice(bufferStart,bufferEnd)}\nglobalThis.__bufferMs=SNIPER_TRIGGER_BUFFER_MS;`,bufferContext,
  {filename:'sniper-trigger-buffer.js'});
assert.equal(bufferContext.__bufferMs,220,'the desktop AWM retry window must stay bounded to 220ms');
assert.equal(bufferContext.queueSniperTriggerBuffer(),true);
bufferContext.now=1218;
assert.equal(bufferContext.retrySniperTriggerBuffer(),false,'an AWM must still respect its real draw/bolt gate');
ready=true;bufferContext.now=1219;
assert.equal(bufferContext.retrySniperTriggerBuffer(),true,'a held LMB should fire once when the AWM becomes ready inside the buffer');
assert.equal(bufferContext.retrySniperTriggerBuffer(),false,'the consumed press must not repeat while LMB remains held');
assert.equal(shots,1,'one buffered physical press must emit exactly one AWM shot');

ready=true;bufferContext.now=2000;bufferContext.mouse.down=true;
assert.equal(bufferContext.queueSniperTriggerBuffer(),true);
bufferContext.now=2221;
assert.equal(bufferContext.retrySniperTriggerBuffer(),false,'an expired click must never fire late');
assert.equal(shots,1);

bufferContext.now=3000;bufferContext.mouse.down=true;
bufferContext.queueSniperTriggerBuffer();bufferContext.cancelSniperTriggerBuffer();
assert.equal(bufferContext.retrySniperTriggerBuffer(),false,'release cancellation must retire the queued shot');
bufferContext.queueSniperTriggerBuffer();bufferContext.resetFireCadence();
assert.equal(bufferContext.retrySniperTriggerBuffer(),false,'a weapon swap/reset must retire the queued shot');
bufferContext.now=4000;bufferContext.mouse.down=true;bufferContext.queueSniperTriggerBuffer();bufferContext.mouse.down=false;
assert.equal(bufferContext.retrySniperTriggerBuffer(),false,'a released LMB must not produce a delayed shot');
assert.equal(shots,1);

const mouseDown=input.slice(input.indexOf("cv.addEventListener('mousedown'"),input.indexOf("cv.addEventListener('contextmenu'"));
assert.match(mouseDown,/tryFire\(false\)[\s\S]*queueSniperTriggerBuffer\(\)/,
  'a failed desktop LMB attempt must enter the bounded AWM buffer');
assert.match(mouseDown,/if\(e\.button===0\)[\s\S]*cancelSniperTriggerBuffer\(\)/,
  'desktop LMB release must cancel the AWM buffer');
assert.match(functionSource(combat,'switchWeapon'),/resetFireCadence\(\)/,
  'switching weapons must cancel buffered fire through the shared reset boundary');
assert.match(functionSource(combat,'update'),/retrySniperTriggerBuffer\(\)/,
  'the fixed gameplay step must service the held desktop AWM retry');

// "Perfect scoped accuracy" means zero shot spread even if recoil bloom is
// still decaying. Hip-fire and non-perfect scopes retain their normal spread.
const spreadContext=vm.createContext({
  WEAPONS,player:{cur:'sniper',bloom:.24,moveT:0},aiming:true,now:5000,fanShots:0,fanBurstUntil:0,
  perks:{acc:1},wm:()=>({spread:1}),
});
vm.runInContext(functionSource(gameplay,'effSpread'),spreadContext,{filename:'sniper-spread.js'});
assert.equal(spreadContext.effSpread(),0,'a scoped AWM must remain exactly accurate through its visible reticle');
spreadContext.aiming=false;
assert.ok(spreadContext.effSpread()>WEAPONS.sniper.spread,'unscoped AWM fire must retain hip-fire spread and bloom');
spreadContext.player.cur='ar';spreadContext.aiming=true;
assert.ok(spreadContext.effSpread()>WEAPONS.ar.aimSpread,'ordinary aimed guns must retain recoil bloom');

for(const [script,version] of [['input','20260830-sniper-fire-v1'],['gameplay','20260830-freezer-projectile-v1'],
  ['combat','20260830-freezer-projectile-v1'],['ai','20260830-sniper-fire-v1']])
  assert.match(index,new RegExp(`js/${script}\\.js\\?v=${version}`),`${script}.js needs its current gameplay cache-buster`);

console.log('PASS AWM cadence, held-trigger retry, cancellation, and scoped accuracy');
