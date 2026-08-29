import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const online=read('js/online.js');
const combat=read('js/combat.js');
const persistence=read('js/persistence.js');
const ui=read('js/ui.js');
const rendering=read('js/rendering.js');

const sent=[],bursts=[];
const context=vm.createContext({
  console,Math,Date,Promise,Map,Set,Object,Array,Number,String,Boolean,JSON,Infinity,
  setTimeout,clearTimeout,
  TAU:Math.PI*2,now:1000,practiceMode:'arena',state:'play',utilityOut:false,waveMsg:'',waveMsgT:0,
  fistFlurryUntil:0,sawChargeUntil:0,comboNextT:0,
  WORLD:{w:2400,h:1800},
  WEAPONS:{ar:{},m9:{},knife:{melee:true},chainsaw:{range:72}},
  UTILITIES:{medkit:{cd:75000},grenade:{cd:20000},freezer:{cd:25000},redball:{cd:11000},beachball:{cd:16000}},
  loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:'grenade'},
  storedLoadoutSlot:key=>({ar:'primary',m9:'secondary',knife:'melee',medkit:'utility',grenade:'utility',freezer:'utility',redball:'utility',beachball:'utility'}[key]||null),
  isWeaponPublished:key=>!['unpublished'].includes(key),isLocked:()=>false,
  isBotArena:()=>false,isCpuTeamArena:()=>false,
  authUser:{id:'local'},
  activeArenaBounds:()=>({left:0,top:0,right:2400,bottom:1800}),
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
  grenades:[],balls:[],freezeFx:[],player:{x:500,y:500,r:15,hp:250},
  cancelFanTheHammer(){},cancelMedHeal(){},resetFireCadence(){},
  burst(...args){bursts.push(args);},sfx(){},
});
context.arena={active:true,matchChannel:{send:packet=>sent.push(packet)},mode:'queue',phase:'fight',networkHold:false,
  room:'ROOM',matchEpoch:3,round:2,roundEndAt:Date.now()+60000,opponent:{id:'remote',x:420,y:500,tx:420,ty:500,
    loadout:{primary:'ar',secondary:'m9',melee:'knife',utility:'grenade'}},utilitySeq:0,seenUtilities:new Set(),
  remoteUtilityReadyAt:new Map(),utilityFrozenUntil:0};
vm.runInContext(online,context,{filename:'online.js'});

assert.equal(vm.runInContext('arenaLoadoutReady()',context),true,'Casual loadout should accept an optional released utility');
const serialized=vm.runInContext("arenaRemoteLoadout({primary:'ar',secondary:'m9',melee:'knife',utility:'freezer'})",context);
assert.deepEqual({...serialized},{primary:'ar',secondary:'m9',melee:'knife',utility:'freezer'},'peer loadout must retain its utility');
assert.equal(vm.runInContext("arenaRemoteLoadout({primary:'ar',secondary:'m9',melee:'knife',utility:'unpublished'})",context),null,
  'an unsupported/unpublished utility must invalidate the peer loadout');

const localId=vm.runInContext("arenaBroadcastUtility('grenade',{x:500,y:500,angle:0})",context);
assert.equal(localId,'local:3:2:utility:1');
assert.equal(sent.length,1,'a local Casual cast should send exactly one packet');
assert.equal(sent[0].event,'utility');
assert.equal(sent[0].payload.utility,'grenade');

const grenadePacket={from:'remote',room:'ROOM',epoch:3,round:2,id:'remote:3:2:utility:1',utility:'grenade',x:420,y:500,angle:0};
context.grenadePacket=grenadePacket;
assert.equal(vm.runInContext('arenaApplyRemoteUtility(grenadePacket)',context),true);
assert.equal(context.grenades.length,1,'the peer should simulate one hostile grenade visual');
assert.equal(context.grenades[0].remoteUtility,true);
assert.equal(vm.runInContext('arenaApplyRemoteUtility(grenadePacket)',context),false,'duplicate cast IDs must be ignored');
context.secondGrenade={...grenadePacket,id:'remote:3:2:utility:2'};
assert.equal(vm.runInContext('arenaApplyRemoteUtility(secondGrenade)',context),false,'receiver cooldown must reject forged cast spam');

context.arena.opponent.loadout.utility='freezer';context.arena.remoteUtilityReadyAt=new Map();
context.freezerPacket={from:'remote',room:'ROOM',epoch:3,round:2,id:'remote:3:2:utility:3',utility:'freezer',x:500,y:500};
assert.equal(vm.runInContext('arenaApplyRemoteUtility(freezerPacket)',context),true);
assert.equal(context.freezeFx.length,1,'the remote Freezer ring must render locally');
assert.ok(context.arena.utilityFrozenUntil>context.now,'a receiver inside the field must become frozen');
assert.equal(vm.runInContext('arenaUtilityFrozen()',context),true);

assert.match(persistence,/\['arena2v2','ai1v1','ai2v2','partycpu2v2','ranked','ranked1v1','ranked2v2'\]/,
  'CPU/team/ranked routes must retain their explicit utility denial list');
assert.doesNotMatch(persistence,/\['arena','arena2v2'/,'Casual arena must not be stripped by loadout restoration');
assert.match(ui,/const rows=\(aiMode\|\|partyCpuMode\)\?CATS\.slice\(0,3\):CATS/,
  'Casual loadout must show Utility while CPU duel loadouts remain three-slot');
assert.doesNotMatch(ui,/if\(pendingGameMode==='arena'\)[\s\S]{0,140}loadout\.utility=null/,
  'launching Casual must not erase the selected utility');
assert.match(combat,/arenaHitOpponent\(300\*falloff,'utility_grenade'\)/,
  'the grenade owner must authoritatively send its opponent damage');
assert.match(combat,/!b\.remoteUtility[\s\S]{0,260}arenaHitOpponent\(\(b\.dmg\|\|8\)/,
  'remote balls must remain visual-only while locally owned balls send hits');
assert.match(online,/if\(arenaUtilityFrozen\(\)\)[\s\S]{0,180}dmg\*=0\.5/,
  'the first hit must thaw Freezer and apply its half-damage rule');
assert.match(online,/cur:player\.cur,utilityOut:!!utilityOut/,
  'equipping/stowing a utility must be included in the regular peer state');
assert.match(rendering,/drawUtilIcon\(14,0,remoteUtility,'#ff8bc2'/,
  'the opponent actor must visibly hold its synchronized utility');
assert.match(rendering,/g\.remoteUtility\?'#7a302c':'#3a4a2c'/,
  'the opponent grenade must be visibly hostile without adding a ring');
assert.doesNotMatch(rendering,/remoteUtility[^\n]{0,100}(arc|ring)/i,
  'hostile utilities must not reintroduce a red warning ring');

console.log('SUMMARY PASS 27');
