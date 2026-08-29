import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const progression=read('js/progression.js'),persistence=read('js/persistence.js');
const ui=read('js/ui.js'),combat=read('js/combat.js');
const plain=value=>JSON.parse(JSON.stringify(value));

function runWheelTest(){
  const store=new Map();
  const math=Object.create(Math);math.random=()=>0;
  const context=vm.createContext({
    WHEEL_GEM_SCALE:2,profileOwnerUserId:'test-user',sb:null,authUser:{id:'test-user'},testMode:false,
    now:0,TAU:Math.PI*2,Math:math,coins:0,gems:0,metaSaves:0,localSaves:0,sounds:[],
    clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),
    document:{visibilityState:'visible',focused:true,hasFocus(){return this.focused;}},
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,String(value))},
    saveMeta(){context.metaSaves++;},saveMetaLocal(){context.localSaves++;},
    addCoins(n){context.coins+=n;},addGems(n){context.gems+=n;return true;},sfx(id){context.sounds.push(id)},
  });
  const definitions=progression.slice(progression.indexOf('// WHEEL SPIN:'),progression.indexOf('// ---- PROMO CODES ----'));
  const mechanics=progression.slice(progression.indexOf('let wheelSpinning='),progression.indexOf('function streakClaimable'));
  vm.runInContext(definitions+'\n'+mechanics,context,{filename:'progression-wheel.js'});

  let result=vm.runInContext(`
    document.visibilityState='hidden';wheelTick(60000);
    document.visibilityState='visible';document.focused=false;wheelTick(60000);
    document.focused=true;wheelTick(60000);
    ({acc:wheelAcc,ready:wheelReady,tier:wheelReadyTier});
  `,context);
  assert.deepEqual(plain(result),{acc:1000,ready:0,tier:1},'hidden/unfocused time must not count and a resume gap is capped at one second');

  result=vm.runInContext(`
    for(let i=0;i<1199;i++)wheelTick(1000);
    ({ready:wheelReady,earned:wheelEarnedToday,tier:wheelReadyTier,rewards:WHEEL.map(r=>[r.gems,r.coins,r.t]),metaSaves});
  `,context);
  assert.equal(result.ready,1);
  assert.equal(result.earned,1);
  assert.equal(result.tier,1);
  assert.deepEqual(plain(result.rewards.map(r=>r.slice(0,2))),[[8,0],[0,40],[12,0],[0,80]],'the first focused interval uses the moderately buffed base wheel');
  assert.ok(result.metaSaves>=1,'earning a spin must persist it immediately');

  result=vm.runInContext(`
    const earnedBeforeClick=wheelEarnedToday;openWheel();spinWheel();
    const afterClick={ready:wheelReady,earned:wheelEarnedToday,tier:wheelReadyTier,gems};
    now=3000;wheelUpdate();
    ({earnedBeforeClick,afterClick,gems,wheelResult,wheelSpinning});
  `,context);
  assert.equal(result.earnedBeforeClick,1);
  assert.deepEqual(plain(result.afterClick),{ready:0,earned:1,tier:1,gems:8},'claiming must persist the reward before its cosmetic animation, without raising engagement tier');
  assert.equal(result.gems,8);
  assert.equal(result.wheelResult,0);
  assert.equal(result.wheelSpinning,false);

  result=vm.runInContext(`
    for(let i=0;i<1200;i++)wheelTick(1000);
    ({earned:wheelEarnedToday,tier:wheelReadyTier,rewards:WHEEL.map(r=>[r.gems,r.coins,r.t])});
  `,context);
  assert.equal(result.earned,2);
  assert.equal(result.tier,2);
  assert.deepEqual(plain(result.rewards.map(r=>r.slice(0,2))),[[12,0],[0,60],[18,0],[0,120]]);
  assert.ok(result.rewards.every(r=>r[2].includes('1.5\u00d7')),'the wheel itself must show the active +50% multiplier');

  result=vm.runInContext(`
    openWheel();spinWheel();now+=3000;wheelUpdate();
    for(let i=0;i<1200;i++)wheelTick(1000);
    const third={earned:wheelEarnedToday,tier:wheelReadyTier,rewards:WHEEL.map(r=>[r.gems,r.coins])};
    openWheel();spinWheel();now+=3000;wheelUpdate();
    for(let i=0;i<1200;i++)wheelTick(1000);
    ({third,fourth:{earned:wheelEarnedToday,tier:wheelReadyTier}});
  `,context);
  assert.deepEqual(plain(result.third),{earned:3,tier:3,rewards:[[16,0],[0,80],[24,0],[0,160]]});
  assert.deepEqual(plain(result.fourth),{earned:3,tier:3},'daily engagement rewards must remain bounded at 2x');
}

function runTutorialChecks(){
  assert.match(ui,/id:'scope',[\s\S]*?G casts a utility, so quick-cast never steals scope/);
  assert.match(ui,/if\(tutScopeHeldMs>=600\)tutScopeSeen=true/);
  assert.match(ui,/id:'utility',[\s\S]*?press 4 to equip the grenade, then RMB[\s\S]*?Casual online 1v1 allows utilities; CPU and ranked modes do not/);
  assert.match(ui,/tutorialDelta\('utilityEquip'\)>=1&&tutorialDelta\('utilityUse'\)>=1/);
  assert.match(ui,/trainingUtility=typeof UTILITIES!=='undefined'&&UTILITIES\.grenade\?'grenade'/);
  assert.match(combat,/tutorialRecordUtilityEquipped/);
  assert.match(combat,/tutorialRecordUtilityUsed/);
  assert.match(ui,/\['GEMS [^']*','unlock published weapons in the Shop/);
  assert.match(ui,/\['COINS [^']*','buy colors, equip animations, and pre-run power-ups/);
  assert.match(ui,/\['ANIMATIONS','cosmetic weapon-draw flourishes only/);
  assert.match(ui,/\['POWER-UPS','pre-buy with coins/);
  assert.match(ui,/use them from POWERUPS on an upgrade screen \(V\)/);
  assert.match(ui,/free spin every 20 focused minutes[^\n]*later spins today pay up to 2/);
  assert.match(persistence,/wd:wheelEarnedDay, we:wheelEarnedToday, wt:wheelReadyTier/);
}

runWheelTest();
runTutorialChecks();
console.log('SUMMARY PASS 14');
