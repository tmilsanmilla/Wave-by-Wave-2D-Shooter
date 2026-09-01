import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const weaponsSource=read('js/weapons.js'),combat=read('js/combat.js'),ui=read('js/ui.js'),index=read('../index.html');

const weaponContext=vm.createContext({console,Math,Number,Object,Array,Set,Map,Infinity});
vm.runInContext(`${weaponsSource}\nglobalThis.__weapons=WEAPONS;`,weaponContext,{filename:'weapons.js'});
const WEAPONS=weaponContext.__weapons;

assert.equal(WEAPONS.volt.auto,true,'Volt must use the shared full-auto held-fire path');
assert.equal(WEAPONS.m9.auto,false,'making Volt automatic must not change the M9');
assert.equal(WEAPONS.revolver.auto,false,'making Volt automatic must not change the Python');
assert.equal(WEAPONS.g18.auto,true,'the existing machine pistol must remain automatic');
assert.match(WEAPONS.volt.blurb,/Full-auto/,'Volt details must explicitly describe its fire mode');
assert.match(ui,/\['FIRE MODE', w\.auto \? 'full-auto' : 'semi-auto'\]/,
  'weapon details must derive the displayed fire mode from the authoritative auto flag');

const fullAutoStart=combat.indexOf('  // full-auto');
const fullAutoEnd=combat.indexOf('  // movement',fullAutoStart);
assert.ok(fullAutoStart>=0&&fullAutoEnd>fullAutoStart,'missing desktop full-auto update boundary');
const fullAutoSource=combat.slice(fullAutoStart,fullAutoEnd);
function desktopHeldFire(weapon){
  const calls=[];
  const context=vm.createContext({
    w:weapon,perks:{autoAll:false},mouse:{down:true},utilityOut:false,sniperTriggerWeapon:'',
    mouseFireCadence:false,player:{reloadEnd:0},now:1000,
    retrySniperTriggerBuffer(){},tryFire(carry){calls.push(carry);return true;},
  });
  vm.runInContext(fullAutoSource,context,{filename:'volt-desktop-held-fire.js'});
  vm.runInContext(fullAutoSource,context,{filename:'volt-desktop-held-fire.js'});
  return {calls,carrying:context.mouseFireCadence};
}
const voltDesktop=desktopHeldFire(WEAPONS.volt);
assert.deepEqual(voltDesktop.calls,[false,true],
  'held LMB must fire Volt repeatedly and preserve fractional cadence after the first shot');
assert.equal(voltDesktop.carrying,true);
assert.deepEqual(desktopHeldFire(WEAPONS.m9).calls,[],
  'held LMB must not turn a neighboring semi-auto pistol into full-auto');

const touchStart=combat.indexOf('  // touch: hold anywhere on the field to fire continuously');
const touchEnd=combat.indexOf('  // --- utilities ---',touchStart);
assert.ok(touchStart>=0&&touchEnd>touchStart,'missing held-touch firing boundary');
const touchSource=combat.slice(touchStart,touchEnd),touchCalls=[];
const touchContext=vm.createContext({
  touchUI:true,aimStickId:1,tapShootUntil:0,now:1000,tapAimX:20,tapAimY:30,
  worldToScreen:()=>({x:20,y:30}),mouse:{x:0,y:0},utilityOut:false,touchUtilityUsed:false,
  touchFireCadence:false,player:{reloadEnd:0},loadout:{utility:''},
  tryFire(carry){touchCalls.push(carry);return true;},
});
vm.runInContext(touchSource,touchContext,{filename:'volt-touch-held-fire.js'});
touchContext.now+=16.667;
vm.runInContext(touchSource,touchContext,{filename:'volt-touch-held-fire.js'});
assert.deepEqual(touchCalls,[false,true],
  'a held touchscreen aim pointer must repeat Volt fire through the shared cadence path');

assert.match(index,/js\/weapons\.js\?v=20260831-frag-range-v1/,
  'the deployed page must request the full-auto Volt definition instead of a cached semi-auto copy');

console.log('PASS Volt full-auto mouse/touch cadence without changing semi-auto pistols');
