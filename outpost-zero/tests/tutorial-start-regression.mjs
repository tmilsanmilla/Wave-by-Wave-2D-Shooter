import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const ui=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
const persistence=fs.readFileSync(path.join(root,'js/persistence.js'),'utf8');
const tutorial=ui.slice(ui.indexOf('let tutorialOn=false'),ui.indexOf('function drawTutorialOverlay()'));
const lock=persistence.slice(persistence.indexOf('function isLocked(k){'));
const original={primary:'scar',secondary:'m9',melee:'knife',utility:null};
const context=vm.createContext({
  Math,Set,now:1000,WORLD:{w:2400,h:1800},state:'select',selPage:'howto',
  player:{x:500,y:500,hp:100,mags:{smg:30,m9:12},reserve:{}},
  mouse:{x:0,y:0},loadout:{...original},soloPractice:false,practiceMode:null,
  practiceSpawns:[],enemies:[],pickups:[],medStash:0,medkitFlyFx:[],perks:{maxhp:100},
  WEAPONS:{smg:{mag:30},m9:{mag:12},knife:{melee:true},scar:{mag:20}},
  UTILITIES:{grenade:{}},gemOwned:{},GEM_SHOP:[{key:'grenade'},{key:'freezer'}],
  FALL_KEYS:[],LOCKED_KEYS:[],sb:{},authUser:{id:'tutorial-player'},testMode:false,
  arena:{active:false},aiming:false,rmbAim:false,utilityOut:false,utilReadyT:0,
  waveMsg:'',waveMsgT:0,ready:true,published:true,
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),screenToWorld:(x,y)=>({x,y}),
  magSize:k=>context.WEAPONS[k].mag,sfx:()=>{},restoreTryLoadout:()=>{},
  switchWeapon:key=>{context.player.cur=key;},
  temporarilyOwnsWeapon:()=>false,isWeaponPublished:key=>key!=='grenade'||context.published,
  partyCpuSessionOpen:()=>false,spawnPracticeEnemy:()=>{},
  startPractice(mode){
    // Reproduce the real launch boundary: an unbought grenade rejects the
    // entire kit unless the narrow tutorial loan is active before launch.
    if(!context.ready||Object.values(context.loadout).filter(Boolean).some(context.isLocked))return false;
    context.state='play';context.practiceMode=mode;return true;
  },
  collectDroppedMedkit(){context.medStash++;context.tutorialRecordMedkitCollected();},
});
vm.runInContext(`${tutorial}\n${lock}`,context,{filename:'tutorial-launch-runtime.js'});
const snapshot=()=>JSON.parse(vm.runInContext(`JSON.stringify({tutorialOn,tutorialStarting,
  tutorialLoadoutBackup,loadout,state,practiceMode,step:TUT_STEPS[tutStep]?.id,done:tutDone})`,context));
const step=()=>snapshot().step;

assert.equal(context.isLocked('grenade'),true,'a new player must not own the tutorial grenade');
assert.equal(context.startTutorial(),true,'a player without a purchased grenade must be able to start');
assert.equal(snapshot().state,'play');assert.equal(step(),'move');
assert.equal(snapshot().tutorialStarting,false,'launch authorization must end immediately after setup');
assert.equal(context.isLocked('grenade'),false,'the active tutorial must permit its grenade lesson');
assert.equal(context.isLocked('freezer'),true,'the loan must not unlock unrelated utilities');
assert.equal(context.gemOwned.grenade,undefined,'the loan must never grant permanent ownership');
assert.equal(context.player.reserve.smg,210);assert.equal(context.player.reserve.m9,84);
context.published=false;
assert.equal(context.isLocked('grenade'),true,'publication rules must outrank the tutorial loan');
context.published=true;
context.practiceMode='arena';
assert.equal(context.isLocked('grenade'),true,'the tutorial loan must never authorize duel equipment');
context.practiceMode='range';

// Exercise all thirteen actual lesson state transitions after a real guarded
// launch, rather than asserting only that the tutorial button was clicked.
for(let i=0;i<90;i++){context.player.x+=8;context.tutorialUpdate();}
assert.equal(step(),'aim');
context.enemies=[0,1,2].map(i=>({spawnId:i,type:'grunt',x:100+i*100,y:100,r:15,hp:100}));
for(const e of context.enemies){context.mouse.x=e.x;context.mouse.y=e.y;context.tutorialUpdate();}
assert.equal(step(),'scope');
context.aiming=true;
for(let i=0;i<12;i++){context.now+=50;context.tutorialUpdate();}
assert.equal(step(),'shoot');
vm.runInContext('tutFired+=12',context);context.tutorialUpdate();assert.equal(step(),'reload');
context.tutorialRecordReloadCompleted();context.tutorialUpdate();assert.equal(step(),'shoot-again');
vm.runInContext('tutFired+=12',context);context.tutorialUpdate();assert.equal(step(),'shoot-again');
context.tutorialRecordReloadCompleted();context.tutorialUpdate();assert.equal(step(),'ammo');
assert.ok(context.pickups.some(p=>p.type==='ammo'&&p.tutorialPickup));
context.tutorialRecordAmmoCollected();context.tutorialUpdate();assert.equal(step(),'swap');
for(let i=0;i<3;i++)context.tutorialRecordWeaponSwitch();
context.tutorialUpdate();assert.equal(step(),'kill');
vm.runInContext('tutKilled+=3',context);context.tutorialUpdate();assert.equal(step(),'melee');
context.tutorialRecordMeleeAbility();context.tutorialUpdate();assert.equal(step(),'utility');
context.tutorialRecordUtilityEquipped();context.tutorialUpdate();assert.equal(step(),'utility');
context.tutorialRecordUtilityUsed();context.tutorialUpdate();assert.equal(step(),'med-pickup');
context.now+=650;context.tutorialUpdate();assert.equal(step(),'med-use');
assert.ok(Math.abs(context.player.hp-55)<1e-8);
context.tutorialRecordMedkitUsed();context.tutorialUpdate();assert.equal(snapshot().done,true);
context.endTutorial();
assert.deepEqual(snapshot().loadout,original,'exiting must restore the exact original loadout');
assert.equal(context.isLocked('grenade'),true,'the temporary loan must end on exit');
assert.equal(snapshot().tutorialLoadoutBackup,null);

context.ready=false;
assert.equal(context.startTutorial(),false,'an account-loading failure must not pretend to start');
assert.equal(snapshot().tutorialOn,false);assert.equal(snapshot().tutorialStarting,false);
assert.deepEqual(snapshot().loadout,original,'failed starts must restore the original kit');
assert.equal(snapshot().tutorialLoadoutBackup,null);
assert.equal(context.isLocked('grenade'),true);

const index=fs.readFileSync(path.join(root,'../index.html'),'utf8');
for(const script of ['ui','input','persistence'])assert.match(index,
  new RegExp(`js/${script}\\.js\\?[^"']*fix=20261012-tutorial-v1`),`${script} must invalidate the old browser cache`);
console.log('PASS tutorial-only grenade loan, all 13 lessons, failure cleanup, and ownership isolation');
