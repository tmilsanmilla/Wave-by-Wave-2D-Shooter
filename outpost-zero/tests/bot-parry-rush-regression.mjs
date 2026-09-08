import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ai=fs.readFileSync(path.join(root,'js/ai.js'),'utf8');
const party=fs.readFileSync(path.join(root,'js/party.js'),'utf8');
function functionSource(source,name){
  const start=source.search(new RegExp(`function\\s+${name}\\s*\\(`));assert.ok(start>=0,`missing ${name}`);
  const brace=source.indexOf('{',start);let depth=0,quote='',escape=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}
const weapons={
  ar:{dmg:48,mag:25,reload:1600,fireRate:145,melee:false,range:620,fall:.781,speed:19},
  m9:{dmg:38,mag:12,reload:800,fireRate:200,melee:false,range:340,fall:.55,speed:17},
  knife:{dmg:48,mag:Infinity,reload:0,fireRate:380,melee:true,range:130,arc:.35},
};
let obstacles=[],meleeClear=true;
function makeContext(){
  const context=vm.createContext({
    console,Math,Date,Promise,Map,Set,WeakSet,Object,Array,Number,String,Boolean,JSON,Infinity,setTimeout,clearTimeout,
    clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),WORLD:{w:1200,h:900},WEAPONS:weapons,
    weaponEquipMs:key=>key==='m9'?120:380,weaponBulletSpeed:key=>weapons[key].speed,
    activeArenaBounds:()=>({left:0,top:0,right:1200,bottom:900}),activeObstacles:()=>obstacles,activeArenaPortals:()=>[],
    arenaMeleeLineClear:()=>meleeClear,sfx:()=>{},
  });
  vm.runInContext(ai,context,{filename:'ai.js'});
  vm.runInContext(`
    function freshBot(){
      const bot={id:'bot',team:'B',x:500,y:450,r:15,hp:250,angle:0,aiRng:77,
        reactionAt:0,thinkAt:9000,aimNoise:0,moveX:0,moveY:0,aiTactic:'hold',aiTacticUntil:9000,aiTacticMinUntil:9000};
      cpuAiInitBotWeapons(bot,0);bot.equipEnd=0;return bot;
    }
    function freshTarget(hp=250,distance=200){return{id:'human',team:'A',x:500+distance,y:450,r:15,hp};}
    function observedGuard(bot,target,clock=1000,config=botDifficulty(4)){
      cpuAiObserveVisibleParry(bot,target,clock,config,true);
      return cpuAiObserveVisibleParry(bot,target,clock+config.parryReactionMs,config,true);
    }
  `,context);
  return context;
}
const context=makeContext();
const run=code=>vm.runInContext(code,context);
const json=code=>JSON.parse(run(`JSON.stringify(${code})`));

const lethal=json(`(()=>{
  const bot=freshBot(),target=freshTarget(180,80),out={};
  out.ability=cpuAiLethalMeleeOption(bot,target,2000);
  target.hp=181;out.nonlethal=cpuAiLethalMeleeOption(bot,target,2000);
  target.hp=48;target.x=640;out.swing=cpuAiLethalMeleeOption(bot,target,2000);
  out.partyNotLethal=cpuAiLethalMeleeOption(bot,target,2000,42);
  target.hp=42;out.partySwing=cpuAiLethalMeleeOption(bot,target,2000,42);
  target.x=646;out.outOfRange=cpuAiLethalMeleeOption(bot,target,2000);
  target.x=640;bot.angle=Math.PI;out.wrongArc=cpuAiLethalMeleeOption(bot,target,2000);
  bot.angle=0;bot.aiWeaponLastShot.knife=1900;out.swingCooldown=cpuAiLethalMeleeOption(bot,target,2000);
  target.x=580;target.hp=120;bot.aiMeleeAbilityReadyAt=3000;out.abilityCooldown=cpuAiLethalMeleeOption(bot,target,2000);
  delete target.hp;out.unknownHp=cpuAiLethalMeleeOption(bot,target,2000);
  target.hp=0;out.dead=cpuAiLethalMeleeOption(bot,target,2000);
  return out;
})()`);
assert.equal(lethal.ability,'ability','a ready 180-damage Execute may finish an in-range target');
assert.equal(lethal.swing,'swing','a real 48-damage normal hit may finish a target within its own range and arc');
assert.equal(lethal.partySwing,'swing','party knife finishes must use their actual 42 damage');
for(const key of ['nonlethal','partyNotLethal','outOfRange','wrongArc','swingCooldown','abilityCooldown','unknownHp','dead'])
  assert.equal(lethal[key],'',`${key} must not claim an immediate lethal knife hit`);
meleeClear=false;
assert.equal(run(`cpuAiLethalMeleeOption(freshBot(),freshTarget(100,70),2000)`),'','Execute cannot finish through walls');
meleeClear=true;

const spacing=json(`(()=>{
  const config=botDifficulty(4),bot=freshBot(),target=freshTarget(),out={};
  cpuAiObserveVisibleParry(bot,target,1000,config,true);
  out.early=cpuAiParrySpacingActive(bot,target,1049,config);
  cpuAiObserveVisibleParry(bot,target,1050,config,true);
  out.active=cpuAiParrySpacingActive(bot,target,1050,config);
  out.move=cpuAiParrySpacingMovement(bot,target,1050,config,null,[bot]);
  out.committed=cpuAiParrySpacingMovement(bot,target,1100,config,null,[bot]);
  cpuAiObserveVisibleParry(bot,target,1100,config,false);
  out.after=cpuAiParrySpacingActive(bot,target,1300,config);
  out.resumeFire=cpuAiObserveVisibleParry(bot,target,1300,config,false).holdRanged;
  out.otherTarget=cpuAiParrySpacingActive(bot,{...target,id:'other'},1300,config);
  out.expired=cpuAiParrySpacingActive(bot,target,2600,config);
  return out;
})()`);
assert.equal(spacing.early,false,'a visible guard must retain the configured observation delay');
assert.equal(spacing.active,true);
assert.ok(spacing.move&&spacing.move.x<-.1,'Impossible must gain distance from a nonlethal guarded rush');
assert.ok(Math.hypot(spacing.move.x,spacing.move.y)>.9,'the escape must not inherit a stationary hold');
assert.deepEqual({x:spacing.committed.x,y:spacing.committed.y},{x:spacing.move.x,y:spacing.move.y},
  'an escape should keep its chosen direction across nearby frames');
assert.equal(spacing.after,true,'distance control must continue through the shotgun follow-up after the guard');
assert.equal(spacing.resumeFire,false,'post-guard distancing must not delay resumed gunfire');
assert.equal(spacing.otherTarget,false,'guard memory must not transfer to an unrelated target');
assert.equal(spacing.expired,false,'temporary rush caution must expire');
const reset=json(`(()=>{
  const bot=freshBot(),target=freshTarget(),config=botDifficulty(4);observedGuard(bot,target);
  cpuAiParrySpacingMovement(bot,target,1050,config,null,[bot]);cpuAiInitBotWeapons(bot,2000);
  return {active:cpuAiParrySpacingActive(bot,target,2000,config),memory:[bot.aiParrySpacingUntil,bot.aiParryEscapeUntil,bot.aiParryEscapeX,bot.aiParryEscapeY]};
})()`);
assert.equal(reset.active,false,'the next round must not inherit a prior opponent guard response');
assert.deepEqual(reset.memory,[0,0,0,0],'round setup clears the entire temporary escape state');

const beginner=json(`(()=>{
  const config=botDifficulty(0),bot=freshBot(),target=freshTarget();observedGuard(bot,target,1000,config);
  return {active:cpuAiParrySpacingActive(bot,target,1500,config),move:cpuAiParrySpacingMovement(bot,target,1500,config,null,[bot])};
})()`);
assert.equal(beginner.active,false,'Beginner must retain its intentionally naive guard response');
assert.equal(beginner.move,null);

const weaponsAfterGuard=json(`(()=>{
  const config=botDifficulty(4),bot=freshBot(),target=freshTarget(250,120);
  cpuAiSwitchBotWeapon(bot,'knife',0,0);bot.aiWeaponThinkAt=9000;bot.aiWeaponLockUntil=9000;
  const response=observedGuard(bot,target);
  cpuAiChooseBotWeapon(bot,target,1050,config,response);
  const retreat={cur:bot.cur,equipEnd:bot.equipEnd};
  target.hp=120;target.x=580;bot.aiWeaponThinkAt=9000;bot.aiWeaponLockUntil=9000;
  cpuAiChooseBotWeapon(bot,target,1100,config,response);
  const finish={cur:bot.cur,equipEnd:bot.equipEnd};
  cpuAiChooseBotWeapon(bot,target,1110,config,response);
  return {retreat,finish,repeatedEquip:bot.equipEnd};
})()`);
assert.equal(weaponsAfterGuard.retreat.cur,'ar','a nonlethal guard rush must not trap the CPU in a long knife commitment');
assert.equal(weaponsAfterGuard.finish.cur,'knife','a lethal close counter must not wait for a stale weapon decision timer');
assert.equal(weaponsAfterGuard.finish.equipEnd,1480,'urgent choice still pays the full 380ms weapon draw');
assert.equal(weaponsAfterGuard.repeatedEquip,1480,'repeated urgent decisions must not restart the same weapon draw');

obstacles=[{x:350,y:300,w:130,h:300}];
const wallEscape=json(`(()=>{
  const bot=freshBot(),target=freshTarget(),config=botDifficulty(4);observedGuard(bot,target);
  const move=cpuAiParrySpacingMovement(bot,target,1050,config,null,[bot]);
  return {move,safe:!move||cpuAiMoveSegmentClear(bot.x,bot.y,bot.x+move.x*30,bot.y+move.y*30,bot.r,[])};
})()`);
assert.equal(wallEscape.safe,true,'retreat must not cross a wall or ignore the bot radius');
assert.ok(wallEscape.move&&Math.abs(wallEscape.move.y)>.1,'a blocked backward lane should use an open lateral escape');
obstacles=[];

const hazardEscape=json(`(()=>{
  const bot=freshBot(),target=freshTarget(),config=botDifficulty(4),
    avoid=[{x:445,y:450,radius:35}],mate={id:'ally',x:452,y:420,r:15,hp:250};
  observedGuard(bot,target);
  const move=cpuAiParrySpacingMovement(bot,target,1050,config,{avoid},[bot,mate]);
  return {move,safe:!move||cpuAiMoveSegmentClear(bot.x,bot.y,bot.x+move.x*48,bot.y+move.y*48,bot.r,avoid)};
})()`);
assert.equal(hazardEscape.safe,true,'emergency spacing must honor live TNT avoidance');
assert.ok(hazardEscape.move&&hazardEscape.move.y>0,'a nearby ally and TNT must leave the lower escape as the safe choice');

obstacles=[{x:580,y:400,w:30,h:100}];
assert.equal(run(`(()=>{
  const bot=freshBot(),target=freshTarget(),config=botDifficulty(4);observedGuard(bot,target);
  return cpuAiParrySpacingActive(bot,target,1050,config);
})()`),false,'a hidden target must not be tracked by the temporary spacing memory');
obstacles=[];

// Exercise the real update functions: only movement/VFX/world plumbing is
// stubbed. Weapon selection, equip timing, lethal checks, and attacks are real.
function integrationContext(mode){
  const ctx=makeContext();
  vm.runInContext(`
    let now=2000,parryUntil=0,TWIN_SAI_PARRY_MS=1000,bullets=[],ebullets=[],hits=[],shots=[];
    let player=freshTarget(120,70),bot=freshBot();
    bot.cur='knife';bot.equipEnd=0;bot.aiWeaponThinkAt=9000;bot.aiWeaponLockUntil=9000;
    bot.aiPeekPhase='settle';bot.aiPeekUntil=9000;bot.aiDodgeFireUntil=9000;
    let arena={opponent:bot,botTuning:{...botDifficulty(4),usePrediction:false,useTnt:false}};
    function isBotArena(){return true;}function arenaCanAct(){return true;}
    function activeArenaTnt(){return [];}function pointInRects(){return false;}
    function weaponBulletLife(){return 1200;}
    function clampActorToArena(){}function collideRects(){}function arenaPortalStep(){}
    cpuAiMeleeMovement=()=>({x:0,y:0,speedScale:1,phase:'melee_orbit'});
    cpuAiApplyProjectileDodge=()=>({active:false});
    arenaBotHitPlayer=(damage,kind)=>{hits.push({damage,kind});player.hp=Math.max(0,player.hp-damage);};
  `,ctx);
  if(mode==='party')vm.runInContext(`
    const PARTY_CPU_WEAPON_RULES={ar:{damage:18,fireMs:245,maxRange:1050},m9:{damage:24,fireMs:200,maxRange:440},knife:{damage:42,fireMs:380,maxRange:130}};
    let partyCpuMatch={phase:'fight',roundResolved:false,bots:[bot],humans:{human:player},epoch:'test',round:1,shotSeq:0};
    function cpuTeamIsAuthority(){return true;}function isLocalCpu2v2(){return true;}
    function arenaBotTuning(){return {...botDifficulty(4),usePrediction:false,useTnt:false};}
    function partyCpuActors(team){return team==='A'?[player]:[bot];}
    function partyCpuThreatTarget(){return player;}function partyCpuDodgeShots(){return [];}
    function partyCpuHostDamageHuman(target,attack,damage){hits.push({damage,kind:attack.ability?'melee_ability':'melee'});target.hp=Math.max(0,target.hp-damage);}
    function partyCpuSpawnBotShot(actor,target,profile,key){shots.push({weapon:key});}
    ${functionSource(party,'partyCpuWeaponRule')}
    ${functionSource(party,'partyCpuHostMelee')}
    ${functionSource(party,'partyCpuHostStep')}
  `,ctx);
  return ctx;
}
for(const mode of ['duel','party']){
  const ctx=integrationContext(mode),step=mode==='duel'?'updateArenaBot(16.667)':'partyCpuHostStep(16.667,now)';
  const check=code=>JSON.parse(vm.runInContext(`JSON.stringify((()=>{${code}})())`,ctx));
  assert.deepEqual(check(`${step};return hits;`),[{damage:180,kind:'melee_ability'}],
    `${mode}: a ready lethal Execute must not be blocked by stale ranged peek or dodge delays`);
  assert.deepEqual(check(`${step};return hits;`),[{damage:180,kind:'melee_ability'}],`${mode}: no duplicate Execute on the next update`);
  const delayed=integrationContext(mode);
  vm.runInContext(`bot.cur='ar';${step};`,delayed);
  assert.equal(vm.runInContext('hits.length',delayed),0,`${mode}: urgent switching cannot attack during its draw`);
  assert.equal(vm.runInContext('bot.equipEnd',delayed),2380,`${mode}: urgent switching uses real equip duration`);
  vm.runInContext(`now=2379;${step};`,delayed);
  assert.equal(vm.runInContext('hits.length',delayed),0,`${mode}: no early hit one millisecond before draw completion`);
  vm.runInContext(`now=2380;${step};`,delayed);
  assert.equal(vm.runInContext('hits.length',delayed),1,`${mode}: lethal counter attacks as soon as the real draw finishes`);

  const rush=integrationContext(mode);
  vm.runInContext(`bot.cur='ar';bot.aiDodgeFireUntil=0;player.hp=250;player.x=700;parryUntil=3000;player.parryUntil=3000;${step};now=2050;${step};`,rush);
  assert.ok(vm.runInContext('bot.x',rush)<500,`${mode}: the real loop must retreat from a nonlethal visible guard`);
  const distance=vm.runInContext('Math.hypot(bot.x-500,bot.y-450)',rush);
  assert.ok(distance>=3.4&&distance<3.46,`${mode}: an old hold must not reduce emergency retreat to 38% speed`);
  assert.equal(vm.runInContext('ebullets.length+shots.length',rush),0,`${mode}: do not shoot directly into a recognized guard`);
  const before=vm.runInContext('bot.x',rush);
  vm.runInContext(`now=3001;${step};now=3130;${step};`,rush);
  assert.ok(vm.runInContext('bot.x',rush)<before,`${mode}: keep spacing after guard ends, through the shotgun follow-up`);
  assert.equal(vm.runInContext('ebullets.length+shots.length',rush),1,`${mode}: resume normal gunfire while continuing post-guard spacing`);

  const unready=integrationContext(mode);
  vm.runInContext(`bot.reactionAt=2100;${step};`,unready);
  assert.equal(vm.runInContext('hits.length',unready),0,`${mode}: immediate knife counters cannot skip round-start reaction time`);
  meleeClear=false;
  vm.runInContext(`bot.reactionAt=0;${step};`,unready);
  assert.equal(vm.runInContext('hits.length',unready),0,`${mode}: actual knife attack cannot cross a melee-blocking wall`);
  meleeClear=true;
}

const partyDamage=integrationContext('party');
vm.runInContext(`bot.cur='ar';player.hp=45;player.x=620;bot.aiMeleeAbilityReadyAt=9000;partyCpuHostStep(16.667,now);`,partyDamage);
assert.equal(vm.runInContext('hits.length',partyDamage),0,'party must not bypass ranged pauses based on a fictional 48-damage knife');
assert.equal(vm.runInContext('bot.cur',partyDamage),'ar','a nonlethal 42-damage knife must not trigger an urgent draw for 45HP');
vm.runInContext(`player.hp=42;partyCpuHostStep(16.667,now);`,partyDamage);
assert.equal(vm.runInContext('bot.cur',partyDamage),'knife','42HP is a real urgent party knife finish');
vm.runInContext(`now=2380;partyCpuHostStep(16.667,now);`,partyDamage);
assert.equal(vm.runInContext('hits.length',partyDamage),1,'party may immediately use an actually lethal 42-damage knife');
assert.equal(vm.runInContext('hits[0].damage',partyDamage),42);

console.log('SUMMARY PASS bot parry rush counterplay');
