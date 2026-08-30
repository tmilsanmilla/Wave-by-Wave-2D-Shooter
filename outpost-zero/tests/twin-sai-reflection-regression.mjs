import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const online=read('js/online.js'),party=read('js/party.js'),combat=read('js/combat.js');
const ai=read('js/ai.js'),ui=read('js/ui.js'),state=read('js/state.js');
let passed=0,failed=0;
function check(name,condition){if(condition){passed++;console.log('PASS',name);}else{failed++;console.error('FAIL',name);}}

const sent=[],numbers=[],reflections=[];
let frozen=false;
const arena={matchChannel:{},opponent:{id:'opponent',x:300,y:200,r:15},matchEpoch:7,round:2,hitSeq:0,
  seenHits:new Set(),receivedHitKinds:new Map(),receivedHitDamage:new Map(),sentHitKinds:new Map(),sentHitDamage:new Map(),
  pendingHitFeedback:new Map(),pendingUnscopedHits:new Set()};
const context={ARENA_HP:250,TWIN_SAI_PARRY_MS:1000,arena,authUser:{id:'shooter'},player:{hp:250,x:100,y:100},
  now:1000,parryUntil:0,waveMsg:'',waveMsgT:0,Math,Number,String,Map,Set,Date,
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),arenaCanAct:()=>true,arenaUtilityFrozen:()=>frozen,
  arenaSend:(event,payload)=>{sent.push({event,payload});return true;},setTimeout:()=>0,
  addDamageNumber:(target,dmg,crit)=>{numbers.push({target,dmg,crit});},
  spawnTwinSaiReflection:(x,y,dmg,meta)=>{reflections.push({x,y,dmg,meta});},
  burst:()=>{},addShake:()=>{},sfx:()=>{},cancelMedHeal:()=>{},
  damagePlayerHp:dmg=>{const dealt=Math.min(context.player.hp,dmg);context.player.hp-=dealt;return dealt;},
  arenaLocalKO:()=>{throw new Error('unexpected KO');}
};
const onlineStart=online.indexOf('function arenaRememberSentHit');
const onlineEnd=online.indexOf('\nfunction arenaLocalKO',onlineStart);
vm.createContext(context);vm.runInContext(online.slice(onlineStart,onlineEnd),context);

const first=context.arenaSendHit(45,'shot');
check('Casual waits for confirmed HP loss before showing a counter',typeof first==='string'&&numbers.length===0&&arena.pendingHitFeedback.has(first));
check('A confirmed 45-damage hit shows exactly 45 once',context.arenaApplyHitResult({shotId:first,dealt:45,parried:false})===true&&numbers.length===1&&numbers[0].dmg===45);
check('Duplicate confirmations cannot duplicate a damage counter',context.arenaApplyHitResult({shotId:first,dealt:45,parried:false})===false&&numbers.length===1);

numbers.length=0;
const parriedId=context.arenaSendHit(45,'shot');
check('A parried shot never creates a counter on its shooter',context.arenaApplyHitResult({shotId:parriedId,dealt:0,parried:true})===true&&numbers.length===0&&!arena.pendingHitFeedback.has(parriedId));
const guardedId=context.arenaSendHit(45,'shot');
check('Oversized or malformed confirmations are rejected without consuming the real one',
  context.arenaApplyHitResult({shotId:guardedId,dealt:120,parried:false})===false&&arena.pendingHitFeedback.has(guardedId)&&
  context.arenaApplyHitResult({shotId:guardedId,dealt:45,parried:false})===true);

arena.sentHitKinds.set('root-45','shot');arena.sentHitDamage.set('root-45',45);
check('Casual accepts only a reflection with the root shot exact damage',
  context.arenaIncomingParryValid({kind:'parry',parryDepth:1,rootHitId:'root-45',dmg:45})===true&&
  context.arenaIncomingParryValid({kind:'parry',parryDepth:1,rootHitId:'root-45',dmg:120})===false);
arena.sentHitKinds.set('reflected-root','parry');arena.sentHitDamage.set('reflected-root',45);
check('A reflected shot can never become another reflection root',
  context.arenaIncomingParryValid({kind:'parry',parryDepth:1,rootHitId:'reflected-root',dmg:45})===false);

sent.length=0;reflections.length=0;context.parryUntil=1500;context.now=1000;context.player.hp=250;
context.arenaTakeHit({id:'incoming-45',from:'opponent',epoch:7,round:2,dmg:45,kind:'shot'});
check('Twin Sai creates a 1:1 45-damage reflection and confirms zero damage',
  context.player.hp===250&&reflections.length===1&&reflections[0].dmg===45&&
  sent.some(x=>x.event==='hit_result'&&x.payload.shotId==='incoming-45'&&x.payload.parried&&x.payload.dealt===0));

sent.length=0;context.parryUntil=0;context.player.hp=250;frozen=true;
context.arenaTakeHit({id:'incoming-frozen',from:'opponent',epoch:7,round:2,dmg:45,kind:'shot'});
check('Confirmed feedback reports actual HP removed after Freezer reduction',
  context.player.hp===227.5&&sent.some(x=>x.event==='hit_result'&&x.payload.shotId==='incoming-frozen'&&!x.payload.parried&&x.payload.dealt===22.5));
frozen=false;

const reflectionContext={ARENA_HP:250,bullets:[],mouse:{x:500,y:200},Math,
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),screenToWorld:(x,y)=>({x,y}),activeArenaBounds:()=>({left:0,top:0,right:1000,bottom:600})};
vm.createContext(reflectionContext);
const reflectionStart=combat.indexOf('function spawnTwinSaiReflection');
const reflectionEnd=combat.indexOf('\nfunction meleeSwing',reflectionStart);
vm.runInContext(combat.slice(reflectionStart,reflectionEnd),reflectionContext);
const reflected45=reflectionContext.spawnTwinSaiReflection(100,200,45,{});
check('The real reflected projectile preserves 45 damage with no falloff',reflected45&&reflected45.dmg===45&&reflected45.fall===1);
check('Twin Sai cannot invent damage without an incoming shot',reflectionContext.spawnTwinSaiReflection(100,200,0,{})===null&&reflectionContext.bullets.length===1);
check('Reflected projectiles cannot gain a random player crit',/if\(!b\.parryReflect&&perks\.crit/.test(combat));
check('CPU 1v1 passes the computed incoming damage into Twin Sai',
  /spawnTwinSaiReflection\(player\.x,player\.y,hit\)/.test(ai)&&/incomingDamage=b\.botArena\?[\s\S]*spawnTwinSaiReflection\(b\.x,b\.y,incomingDamage\)/.test(combat));

const partyNumbers=[];
const partyContext={PARTY_CPU_HP:250,ARENA_EDGE:20,WORLD:{w:1600,h:900},Math,Number,String,Set,
  player:{x:100,y:100},
  partyCpuMatch:{epoch:'match',round:3,phase:'fight',humans:{sai:{id:'sai',team:'A',x:100,y:100,tx:100,ty:100,parrySeq:1}},
    bots:[{id:'bot',team:'B'}],loadouts:{sai:{melee:'twinsai'}},shots:[],seenReflections:new Set()},
  partyCpuEnvelope:()=>true,partyCpuIsHost:()=>false,cpuTeamLocalId:()=> 'sai',parrySeq:1,
  activeArenaBounds:()=>({left:20,top:20,right:1580,bottom:880}),addDamageNumber:(target,dmg,crit)=>partyNumbers.push({target,dmg,crit})};
vm.createContext(partyContext);
const partyStart=party.indexOf('function partyCpuApplyReflectedShot');
const partyEnd=party.indexOf('\nfunction partyCpuHitBot',partyStart);
vm.runInContext(party.slice(partyStart,partyEnd),partyContext);
const original={id:'match:3:shot:1',ownerId:'bot',team:'B',dmg:45};partyContext.partyCpuMatch.shots=[original];
const partyPacket={round:3,shotId:original.id,id:original.id+':reflect',ownerId:'sai',sourceId:'bot',parrySeq:1,x:100,y:100,angle:0,dmg:45};
check('Party reconstructs the reflected projectile at the exact incoming damage',
  partyContext.partyCpuApplyReflectedShot(partyPacket)===true&&partyContext.partyCpuMatch.shots[0].dmg===45);
const forged={id:'match:3:shot:2',ownerId:'bot',team:'B',dmg:45};partyContext.partyCpuMatch.shots=[forged];
check('Party rejects a forged 120-damage reflection from a 45-damage shot',
  partyContext.partyCpuApplyReflectedShot({...partyPacket,shotId:forged.id,id:forged.id+':reflect',dmg:120})===false);
const hitPacket={round:3,to:'sai',ownerId:'sai',shotId:'match:3:shot:3:reflect',targetId:'bot',
  id:'match:3:shot:3:reflect:hit:bot',dmg:45};
partyContext.partyCpuMatch.shots.push({id:hitPacket.shotId,reflected:true,dmg:45});
check('Party guests see one counter only after the host confirms a reflected hit',
  partyContext.partyCpuApplyReflectionHit(hitPacket)===true&&partyNumbers.length===1&&partyNumbers[0].dmg===45&&
  !partyContext.partyCpuMatch.shots.some(shot=>shot.id===hitPacket.shotId)&&
  partyContext.partyCpuApplyReflectionHit(hitPacket)===false&&partyNumbers.length===1);
check('Party reflection-hit confirmations reject stale rounds and forged 120 damage',
  partyContext.partyCpuApplyReflectionHit({...hitPacket,round:2,id:'match:3:shot:4:reflect:hit:bot',shotId:'match:3:shot:4:reflect'})===false&&
  partyContext.partyCpuApplyReflectionHit({...hitPacket,id:'match:3:shot:5:reflect:hit:bot',shotId:'match:3:shot:5:reflect',dmg:120})===false);
check('Party host carries computed hit damage through its reflection packet',
  /partyCpuHostTryParry\(target,shot,hit\)/.test(party)&&/dmg:reflectionDamage/.test(party)&&
  /partySend\('cpu_reflection_hit',packet\)/.test(party)&&/event==='cpu_reflection_hit'/.test(party));
check('Round setup owns all confirmation and damage-validation maps',
  /receivedHitDamage:new Map\(\),sentHitKinds:new Map\(\),sentHitDamage:new Map\(\),[\s\S]*pendingHitFeedback:new Map\(\)/.test(state)&&
  /arena\.pendingHitFeedback=new Map\(\)/.test(online));
check('Twin Sai description promises 1:1 reflected damage instead of 120',/returns the shot\\'s damage 1:1/.test(ui)&&!/Twin Sai[\s\S]{0,160}120 dmg/i.test(ui));

console.log(`SUMMARY ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);
