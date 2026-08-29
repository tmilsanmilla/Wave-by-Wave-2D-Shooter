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
runEndlessExitTest();
assert.equal((combat.match(/upgradeChoices=rollUpgrades\(\)/g)||[]).length,2,
  'normal clears and Wave Skipper must both use the non-empty upgrade roller');
assert.match(upgrades,/persistNormalEndlessScoreOnExit\(\);\s*\n\s*const returnPage=/,
  'the normal menu exit must finalize Endless before clearing its routing state');
console.log('SUMMARY PASS 4');
