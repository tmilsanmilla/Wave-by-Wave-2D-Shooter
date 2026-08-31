import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const upgrades=read('js/upgrades.js');
const gameplay=read('js/gameplay.js');
const combat=read('js/combat.js');
const rendering=read('js/rendering.js');
const ui=read('js/ui.js');

const approx=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-9,`${message}: expected ${expected}, got ${actual}`);

function runUpgradeFallbackTest(){
  const context=vm.createContext({
    WEAPONS:{smg:{name:'SMG',mag:30,melee:false}},
    UTILITIES:{},
    loadout:{primary:'smg',secondary:null,melee:null,utility:null},
    player:{hp:100},
  });
  vm.runInContext(upgrades,context,{filename:'upgrades.js'});
  const result=vm.runInContext(`
    perkCounts=Object.fromEntries(UPGRADES.map(upgrade=>[upgrade.n,1]));
    bossBounty=false;
    const lateChoices=rollUpgrades();
    const snapshot={length:lateChoices.length,late:lateChoices.every(choice=>choice.lateRun===true),names:lateChoices.map(choice=>choice.n)};
    lateChoices.forEach(choice=>choice.f());
    snapshot.finite=[perks.dmg,perks.rate,perks.mag,perks.maxhp,player.hp].every(Number.isFinite);
    snapshot.values={dmg:perks.dmg,rate:perks.rate,mag:perks.mag,maxhp:perks.maxhp,hp:player.hp,medkitHeal:perks.medkitHeal};
    snapshot.descriptions=lateChoices.map(choice=>choice.d);
    snapshot.medStashMax=MED_STASH_MAX;
    perkCounts=Object.fromEntries([...UPGRADES,...WEAPON_MODS].map(upgrade=>[upgrade.n,1]));
    bossBounty=true;
    const exhaustedBossChoices=rollUpgrades();
    snapshot.bossFallback=exhaustedBossChoices.length===4&&exhaustedBossChoices.every(choice=>choice.lateRun===true);
    snapshot;
  `,context);
  assert.equal(result.length,4,'an exhausted upgrade pool must still return four choices');
  assert.equal(result.late,true,'every exhausted-pool choice must be a late-run fallback');
  assert.equal(new Set(result.names).size,4,'fallback choices must remain distinct');
  assert.equal(result.finite,true,'fallback upgrades must keep all changed stats finite');
  assert.equal(result.bossFallback,true,'an exhausted boss-mod pool must also reach the late-run fallback');
  approx(result.values.dmg,1.10,'late damage must double from 5% to 10%');
  approx(result.values.rate,0.94,'late cycling must double from 3% to 6%');
  approx(result.values.mag,1.10,'late magazine size must double from 5% to 10%');
  approx(result.values.maxhp,115,'late armor must add 15% maximum HP');
  approx(result.values.hp,115,'late armor must heal the newly added maximum HP');
  approx(result.values.medkitHeal,28.75,'late armor must add 15% medkit healing');
  assert.equal(result.medStashMax,15,'the Endless medkit stash must hold exactly 15');
  assert.deepEqual([...result.descriptions],['+10% weapon damage','+6% fire rate','+10% magazine size','+15% maximum HP and medkit healing']);
}

function runWaveScalingTest(){
  const context=vm.createContext({DIFFS:{normal:{hp:1,dmg:1}},wave:1,diffMode:'normal'});
  vm.runInContext(gameplay,context,{filename:'gameplay.js'});
  const values=vm.runInContext(`({
    boost14:endlessWave15Boost(14),boost15:endlessWave15Boost(15),
    hp14:endlessEnemyHpMultiplier(14,'normal'),hp15:endlessEnemyHpMultiplier(15,'normal'),
    dmg14:endlessEnemyDamageMultiplier(14,'normal'),dmg15:endlessEnemyDamageMultiplier(15,'normal')
  })`,context);
  assert.equal(values.boost14,1,'the wave-15 step must not leak into wave 14');
  assert.equal(values.boost15,1.2,'wave 15 and later must receive one 20% step');
  approx(values.hp14,1+13*0.047,'wave 14 HP keeps the original curve');
  approx(values.hp15,(1+14*0.047)*1.2,'wave 15 HP gets the 20% step');
  approx(values.dmg14,1+13*0.053,'wave 14 damage keeps the original curve');
  approx(values.dmg15,(1+14*0.053)*1.2,'wave 15 damage gets the 20% step');
  assert.match(gameplay,/hpMul=endlessEnemyHpMultiplier\(wave,diffMode\)\*\(t\.boss\?1\.20:1\)/,
    'Endless Warlords must get a separate 20% health increase');
  assert.match(gameplay,/spawnPracticeEnemy[\s\S]{0,180}hpMul=DIFFS\[diffMode\]\.hp/,
    'the Endless breakpoint and Warlord health bonus must not alter Practice spawns');
}

function runImmediateMedkitTest(){
  const context=vm.createContext({
    player:{x:300,y:200,hp:50},perks:{maxhp:115,medkitHeal:28.75},medStash:0,MED_STASH_MAX:15,
    medkitFlyFx:[],now:1000,waveMsg:'',waveMsgT:0,tutorialOn:false,state:'play',
    burst(){},sfx(){},tutorialRecordMedkitCollected(){},
  });
  vm.runInContext(combat,context,{filename:'combat.js'});
  const result=vm.runInContext(`(()=>{
    const awards=[];for(let i=0;i<16;i++)awards.push(collectDroppedMedkit(20+i,40));
    const full={stash:medStash,fx:medkitFlyFx.length,awards:[...awards],origin:{...medkitFlyFx[0]}};
    const used=useStashedMedkit();
    return {full,used,afterUse:{stash:medStash,hp:player.hp}};
  })()`,context);
  assert.equal(result.full.stash,15,'medkits must enter the stash immediately up to the cap');
  assert.equal(result.full.fx,15,'each accepted medkit must create one visible flight, not a ground reserve');
  assert.equal(result.full.awards.filter(Boolean).length,15,'a sixteenth medkit must be rejected at the cap');
  assert.equal(result.full.awards[15],false,'the cap must not silently queue an extra medkit');
  assert.equal(result.full.origin.fromX,20,'the flight must begin at the defeated enemy');
  assert.equal(result.used,true,'a stashed medkit must remain usable');
  assert.equal(result.afterUse.stash,14,'using a medkit consumes exactly one');
  approx(result.afterUse.hp,78.75,'the upgraded medkit heal must be applied');
  assert.match(combat,/if\(!t\.boss\) collectDroppedMedkit\(e\.x,e\.y\)/,
    'cadence medkits must auto-award instead of waiting on the ground');
  assert.match(combat,/if\(t\.boss\)\{[\s\S]{0,100}collectDroppedMedkit\(e\.x-32,e\.y\)/,
    'boss medkits must auto-award even when the kill ends the wave');
  assert.match(rendering,/for\(let i=medkitFlyFx\.length-1[\s\S]{0,700}player\.x-fx\.fromX/,
    'the accepted medkit must visibly fly from its origin to the player');
  assert.doesNotMatch(ui,/stash holds up to five|stash \(max 5\)/i,'tutorial text must not advertise the old cap');
  assert.match(ui,/auto-collect into your stash[\s\S]{0,120}holds up to 15/,
    'the tutorial must explain automatic storage and the 15-item cap');
}

function runWarlordTest(){
  const context=vm.createContext({wave:30});
  vm.runInContext(combat,context,{filename:'combat.js'});
  const aim=vm.runInContext(`({
    still:predictiveAimAngle(0,0,{x:100,y:0,motionVx:0,motionVy:0},18.1125,45),
    lateral:predictiveAimAngle(0,0,{x:100,y:0,motionVx:0,motionVy:5},18.1125,45),
    impossible:predictiveAimAngle(0,0,{x:100,y:0,motionVx:30,motionVy:0},10,45),
    capped:predictiveAimAngle(0,0,{x:1000,y:0,motionVx:0,motionVy:5},10,45),
    purple30:purpleHeavyShotDamage(30),purple31:purpleHeavyShotDamage(31),purple35:purpleHeavyShotDamage(35)
  })`,context);
  approx(aim.still,0,'a stationary target must retain direct Yellow aim');
  assert.ok(aim.lateral>0,'Yellow must lead a laterally moving player');
  approx(aim.impossible,0,'an impossible intercept must safely fall back to direct aim');
  approx(aim.capped,Math.atan2(225,1000),'Yellow lead must cap at 45 simulation frames');
  approx(aim.purple30,150,'Purple heavy damage must start at exactly 150 on wave 30');
  approx(aim.purple31,157.95,'Purple heavy damage must increase on wave 31');
  approx(aim.purple35,189.75,'Purple heavy damage must continue increasing every wave');

  assert.match(combat,/fireHoming\(e, pa\+rand\(-0\.3,0\.3\), 3\.85, 0\.045, 6500, 20\)/,
    'Blue missiles must be slightly faster and deal exactly 25% more base damage');
  assert.match(combat,/shotSpeed=18\.1125,pa=predictiveAimAngle[\s\S]{0,180}dmg:27\.5,predictive:true/,
    'Yellow rounds must use predictive aim, +15% speed, and +25% damage');
  assert.match(combat,/dmg:purpleHeavyShotDamage\(wave\),preScaledDamage:true,king:true,flashing:true/,
    'Purple must fire one flashing heavy projectile through the safe pre-scaled path');
  assert.match(combat,/Math\.random\(\)<0\.20[\s\S]{0,110}purpleDeflectReadyAt=now\+650/,
    'Purple must have a bounded occasional deflect rather than a permanent shield');
  assert.match(rendering,/projectile\.flashing[\s\S]{0,100}#fff4ff[\s\S]{0,80}#ff275f/,
    'the Purple heavy tracer must visibly flash without adding a projectile ring');
  assert.match(rendering,/projectile&&projectile\.h\)return \{danger:'#ff9f43',accent:'#fff0a6',tail:42,homing:true\}/,
    'homing missiles must use a distinct orange-and-cream visual profile');
  const homingCue=rendering.slice(rendering.indexOf('function drawHostileProjectileCue'),rendering.indexOf('function drawRemoteShotVisuals'));
  assert.match(homingCue,/if\(profile\.homing\)[\s\S]{0,900}trailOffset[\s\S]{0,900}bodySide/,
    'homing missiles must have twin guidance trails and a geometric missile body');
  assert.doesNotMatch(homingCue,/\.arc\(/,'homing differentiation must not reintroduce a warning ring');

  const hurtContext=vm.createContext({
    now:1000,invincUntil:0,player:{hp:1000,hurtCd:0,hurtFlash:0,x:0,y:0},playerFrozenUntil:0,
    perks:{armor:1,secondWind:0,maxhp:1000},DIFFS:{normal:{dmg:1}},diffMode:'normal',wave:30,
    practiceMode:false,medChan:0,medChanHeal:0,endlessEnemyDamageMultiplier(){return 3.0444;},
    damagePlayerHp(amount){hurtContext.player.hp-=amount;hurtContext.lastDamage=amount;},addShake(){},sfx(){},
  });
  vm.runInContext(combat,hurtContext,{filename:'combat-hurt.js'});
  vm.runInContext(`hurtPlayer(150,{preScaled:true})`,hurtContext);
  approx(hurtContext.lastDamage,150,'Purple wave-30 heavy damage must not be multiplied to 456+');
  hurtContext.player.hurtCd=0;
  vm.runInContext(`hurtPlayer(10)`,hurtContext);
  approx(hurtContext.lastDamage,30.444,'ordinary enemy damage must retain the full wave-30 scaling');
}

function runEndlessExitTest(){
  const context=vm.createContext({});
  vm.runInContext(gameplay,context,{filename:'gameplay.js'});
  const run=scenario=>{
    Object.assign(context,{state:'play',practiceMode:null,testMode:false,unrankedRun:false,adminUsed:false,
      score:725,hiScore:500,saves:0,submissions:[],saveMeta(){context.saves++;},submitScore(value){context.submissions.push(value);}} ,scenario);
    const result=vm.runInContext('persistNormalEndlessScoreOnExit()',context);
    return {result,hiScore:context.hiScore,saves:context.saves,submissions:[...context.submissions]};
  };

  const ranked=run({});
  assert.equal(ranked.result,true);
  assert.equal(ranked.hiScore,725);
  assert.equal(ranked.saves,1);
  assert.deepEqual(ranked.submissions,[725]);

  for(const blocked of [
    {practiceMode:'range'},
    {testMode:true},
    {unrankedRun:true},
    {adminUsed:true},
    {state:'over'},
  ]){
    const result=run(blocked);
    assert.equal(result.result,false,'non-ranked contexts must not finalize as normal Endless');
    assert.equal(result.saves,0);
    assert.deepEqual(result.submissions,[]);
  }
}

runUpgradeFallbackTest();
runWaveScalingTest();
runImmediateMedkitTest();
runWarlordTest();
runEndlessExitTest();
assert.equal((combat.match(/upgradeChoices=rollUpgrades\(\)/g)||[]).length,2,
  'normal clears and Wave Skipper must both use the non-empty upgrade roller');
assert.match(upgrades,/persistNormalEndlessScoreOnExit\(\);\s*\n\s*const returnPage=/,
  'the normal menu exit must finalize Endless before clearing its routing state');
console.log('SUMMARY PASS Endless scaling, upgrades, and medkit stash');
