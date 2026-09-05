import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const abilities=fs.readFileSync(path.join(root,'js/abilities.js'),'utf8');
const combat=fs.readFileSync(path.join(root,'js/combat.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
const index=fs.readFileSync(path.join(root,'../index.html'),'utf8');
let passed=0,failed=0;
function check(name,condition){
  if(condition){passed++;console.log('PASS',name);}
  else{failed++;console.error('FAIL',name);}
}

const sounds=[];
const context={
  state:'play',practiceMode:'',now:1000,Math,Number,waveMsg:'',waveMsgT:0,fanShots:0,comboNextT:0,
  player:{cur:'twinsai',x:100,y:100,swingT:0,swingA:0,swingSide:0,swingArc:0,swingR:0,swingDur:0},
  mouse:{down:false},aimStickId:null,tapShootUntil:0,
  abilityCD:{twinsai:0},parryUntil:0,parrySeq:0,TWIN_SAI_PARRY_MS:1000,
  particles:[],TAU:Math.PI*2,tutorialOn:false,waveMsg:'',waveMsgT:0,
  arenaCanAct:()=>true,arenaUtilityFrozen:()=>false,isLocked:()=>false,
  aimAngle:()=>0,abilityCdOf:()=>2500,rand:(lo,hi)=>(lo+hi)/2,resetFireCadence:()=>{},
  sfx:name=>sounds.push(name)
};
vm.createContext(context);
vm.runInContext(abilities,context);

function resetAttempt(){
  context.abilityCD.twinsai=0;context.parryUntil=0;context.parrySeq=0;
  context.mouse.down=false;context.aimStickId=null;context.tapShootUntil=0;context.fanShots=0;context.comboNextT=0;
  context.player.swingT=0;context.player.swingDur=0;
  context.particles.length=0;sounds.length=0;
}
function parryStayedOff(){
  return context.parryUntil===0&&context.parrySeq===0&&context.abilityCD.twinsai===0&&context.particles.length===0;
}

context.mouse.down=true;
context.meleeAbility();
check('Twin Sai cannot start Parry while mouse fire is held',parryStayedOff());

resetAttempt();context.mouse.down=false;context.aimStickId=7;
context.meleeAbility();
check('Twin Sai cannot start Parry while touchscreen aim/fire is held',parryStayedOff());

resetAttempt();context.aimStickId=null;context.tapShootUntil=context.now+100;
context.meleeAbility();
check('Twin Sai cannot start Parry during the touchscreen fire window',parryStayedOff());

resetAttempt();context.tapShootUntil=0;
context.meleeAbility();
check('Twin Sai can start Parry after firing is released',
  context.parryUntil===2000&&context.parrySeq===1&&context.abilityCD.twinsai===4500&&context.particles.length===14);

resetAttempt();context.fanShots=4;
context.meleeAbility();
check('Twin Sai cannot cancel an active Python fan into Parry',parryStayedOff());

resetAttempt();context.player.swingT=context.now-30;context.player.swingDur=90;
context.meleeAbility();
check('Twin Sai cannot start Parry during its active attack swing',parryStayedOff());

resetAttempt();context.comboNextT=context.now+80;
context.meleeAbility();
check('Twin Sai cannot start Parry while its second slash is queued',parryStayedOff());

check('Quick-melee rejects active Twin Sai fire before it cancels Python fan fire',
  /if\(loadout\.melee==='twinsai'[\s\S]{0,180}rejectTwinSaiWhileFiring\(\)[\s\S]{0,180}cancelMedHeal\(\)/.test(combat));
check('No weapon attack can start during the live Twin Sai guard',
  /function tryFire\([\s\S]{0,500}now<parryUntil&&now>=parryUntil-TWIN_SAI_PARRY_MS\)return false/.test(combat));
check('Twin Sai details explain that firing and guarding cannot overlap',
  /twinsai:\[[^\n]*stop firing first[^\n]*cannot attack during 1s guard/.test(ui));
for(const [script,version] of [['abilities','20260831-melee-polish-v1'],
  ['combat','20260831-utility-preround-v1'],['ui','20260902-ai-cleanup-v1']])
  check(`${script}.js has its current cache tag`,
    new RegExp(`js/${script}\\.js\\?v=${version}`).test(index));

console.log(`SUMMARY ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);
