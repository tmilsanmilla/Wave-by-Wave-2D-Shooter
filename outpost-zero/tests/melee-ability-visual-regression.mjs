import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const abilities=read('js/abilities.js'),online=read('js/online.js'),party=read('js/party.js');
const rendering=read('js/rendering.js'),combat=read('js/combat.js'),gameplay=read('js/gameplay.js');
let passed=0,failed=0;
function check(name,condition){if(condition){passed++;console.log('PASS',name);}else{failed++;console.error('FAIL',name);}}

const durations={scythe:260,terafists:1600,knife:250,hammer:220,chainsaw:400,bdaggers:3000};
const cooldowns={scythe:9600,terafists:0,knife:4800,hammer:8000,chainsaw:16000,bdaggers:3000};
const weapons=Object.fromEntries(Object.keys(durations).map(key=>[key,{melee:true}]));
const helperStart=online.indexOf('function arenaRemoteMeleeFxBlades');
const helperEnd=online.indexOf('\nfunction arenaGuard',helperStart);
const context={MELEE_ABILITY_VISUAL_MS:durations,MELEE_ABILITY_VISUAL_MAX_MS:3000,ABILITY_CD:cooldowns,
  WEAPONS:weapons,WORLD:{w:1600,h:900},isWeaponPublished:()=>true,TAU:Math.PI*2,now:0,Math,Number,String};
vm.createContext(context);vm.runInContext(online.slice(helperStart,helperEnd),context);
const apply=context.arenaApplyRemoteMeleeAbilityState;

for(const [key,max] of Object.entries(durations)){
  const actor={meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0},kit={melee:key};
  const ok=apply(actor,{meleeFxSeq:1,meleeFxKey:key,meleeFxMs:max,meleeFxAngle:.4},kit,1000);
  check(key+' accepts one bounded owned visual',ok===true&&actor.meleeFxKey===key&&actor.meleeFxUntil===1000+max&&Math.abs(actor.meleeFxAngle-.4)<1e-9);
}
const delayed={meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0};
check('Cooldown timing is reconstructed from activation time, not packet arrival',
  apply(delayed,{meleeFxSeq:1,meleeFxKey:'knife',meleeFxMs:200,meleeFxAngle:0},{melee:'knife'},1000)===true&&
  delayed.meleeFxStart===950&&delayed.meleeFxReadyAt===5750);

const chain={meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0},chainKit={melee:'chainsaw'};
check('Repeated state cannot extend an active melee visual',
  apply(chain,{meleeFxSeq:1,meleeFxKey:'chainsaw',meleeFxMs:400,meleeFxAngle:0},chainKit,5000)===true&&
  apply(chain,{meleeFxSeq:1,meleeFxKey:'chainsaw',meleeFxMs:390,meleeFxAngle:0},chainKit,5100)===false&&chain.meleeFxUntil===5400);
check('A same-sequence zero remainder clears latency without reactivation',
  apply(chain,{meleeFxSeq:1,meleeFxKey:'chainsaw',meleeFxMs:0,meleeFxAngle:0},chainKit,5300)===true&&chain.meleeFxUntil===5300);
check('Cooldown-skipping sequences are remembered but not rendered',
  apply(chain,{meleeFxSeq:2,meleeFxKey:'chainsaw',meleeFxMs:400,meleeFxAngle:0},chainKit,6000)===false&&chain.meleeFxSeq===2&&chain.meleeFxUntil===5300);
check('The next real sequence renders after its canonical cooldown',
  apply(chain,{meleeFxSeq:3,meleeFxKey:'chainsaw',meleeFxMs:400,meleeFxAngle:0},chainKit,21000)===true&&chain.meleeFxUntil===21400);

const wrong={meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0};
check('Wrong-loadout and overlong visuals are rejected',
  apply(wrong,{meleeFxSeq:1,meleeFxKey:'hammer',meleeFxMs:220,meleeFxAngle:0},{melee:'knife'},100)===false&&
  apply({meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0},{meleeFxSeq:1,meleeFxKey:'knife',meleeFxMs:251,meleeFxAngle:0},{melee:'knife'},100)===false);
context.isWeaponPublished=()=>false;
check('Unpublished melee visuals are rejected',
  apply({meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0},{meleeFxSeq:1,meleeFxKey:'hammer',meleeFxMs:220,meleeFxAngle:0},{melee:'hammer'},100)===false);
context.isWeaponPublished=()=>true;
check('Malformed global duration and angle bounds are rejected',
  apply({meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0},{meleeFxSeq:1,meleeFxKey:'bdaggers',meleeFxMs:3001,meleeFxAngle:0},{melee:'bdaggers'},100)===false&&
  apply({meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0},{meleeFxSeq:1,meleeFxKey:'hammer',meleeFxMs:220,meleeFxAngle:Infinity},{melee:'hammer'},100)===false);
const daggers={meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0};
const blades=[{x:100,y:110,vx:15,vy:0,returning:false},{x:100,y:122,vx:15,vy:0,returning:false}];
check('Live Burning Dagger positions update without extending the activation',
  apply(daggers,{meleeFxSeq:1,meleeFxKey:'bdaggers',meleeFxMs:3000,meleeFxAngle:0,meleeFxBlades:blades},{melee:'bdaggers'},1000)===true&&
  apply(daggers,{meleeFxSeq:1,meleeFxKey:'bdaggers',meleeFxMs:2950,meleeFxAngle:0,
    meleeFxBlades:blades.map(b=>({...b,x:b.x+45}))},{melee:'bdaggers'},1050)===true&&
  daggers.meleeFxUntil===4000&&daggers.meleeFxBlades[0].x===145);
let malformedNestedSafe=false;
try{
  const malformedActor={meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0};
  malformedNestedSafe=context.arenaRemoteMeleeFxBlades({meleeFxBlades:[null,[]]},1000)===null&&
    apply(malformedActor,{meleeFxSeq:1,meleeFxKey:'bdaggers',meleeFxMs:3000,meleeFxAngle:0,
    meleeFxBlades:[null,[]]},{melee:'bdaggers'},1000)===true&&Array.isArray(malformedActor.meleeFxBlades)&&malformedActor.meleeFxBlades.length===0;
}catch{}
check('Malformed nested dagger entries are ignored without throwing',malformedNestedSafe);

const rapidDaggers={meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0,meleeFxWallRecallSeq:0};
check('A wall recall allows the very next Hurl visual without an intermediate packet',
  apply(rapidDaggers,{meleeFxSeq:1,meleeFxKey:'bdaggers',meleeFxMs:3000,meleeFxAngle:0,
    meleeFxWallRecallSeq:0,meleeFxBlades:blades},{melee:'bdaggers'},1000)===true&&
  apply(rapidDaggers,{meleeFxSeq:2,meleeFxKey:'bdaggers',meleeFxMs:3000,meleeFxAngle:0,
    meleeFxWallRecallSeq:1,meleeFxBlades:blades},{melee:'bdaggers'},1050)===true&&
  rapidDaggers.meleeFxSeq===2&&rapidDaggers.meleeFxUntil===4050&&rapidDaggers.meleeFxWallRecallSeq===1);
const explicitRecall={meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0,meleeFxWallRecallSeq:0};
check('A standalone wall-return packet clears its active Hurl and remote cooldown',
  apply(explicitRecall,{meleeFxSeq:1,meleeFxKey:'bdaggers',meleeFxMs:3000,meleeFxAngle:0,
    meleeFxWallRecallSeq:0,meleeFxBlades:blades},{melee:'bdaggers'},1000)===true&&
  apply(explicitRecall,{meleeFxSeq:1,meleeFxKey:'bdaggers',meleeFxMs:0,meleeFxAngle:0,
    meleeFxWallRecallSeq:1},{melee:'bdaggers'},1050)===true&&explicitRecall.meleeFxUntil===1050&&explicitRecall.meleeFxReadyAt===1050);
check('An ordinary early Hurl still cannot skip its cosmetic cooldown',
  apply(rapidDaggers,{meleeFxSeq:3,meleeFxKey:'bdaggers',meleeFxMs:3000,meleeFxAngle:0,
    meleeFxWallRecallSeq:1,meleeFxBlades:blades},{melee:'bdaggers'},1100)===false&&rapidDaggers.meleeFxSeq===3);
const inconsistentRecall={meleeFxSeq:0,meleeFxUntil:0,meleeFxReadyAt:0,meleeFxWallRecallSeq:0};
check('A recall marker cannot claim that the same still-active Hurl returned',
  apply(inconsistentRecall,{meleeFxSeq:1,meleeFxKey:'bdaggers',meleeFxMs:3000,meleeFxAngle:0,
    meleeFxWallRecallSeq:1,meleeFxBlades:blades},{melee:'bdaggers'},1000)===false&&
  inconsistentRecall.meleeFxWallRecallSeq===0);

check('Every successful non-Sai ability starts its cosmetic descriptor',
  /if\(activated&&k!=='twinsai'\)[\s\S]*beginMeleeAbilityVisual\(k,visualAngle\)/.test(abilities)&&
  Object.entries(durations).every(([key,ms])=>new RegExp(key+':'+ms+'(?:,|\\s*\\})').test(abilities)));
check('Casual 1v1 repeats and receives the bounded visual state',
  /meleeFxSeq:Math\.max[\s\S]*meleeFxMs:clamp[\s\S]*meleeFxAngle:[\s\S]*meleeFxBlades:meleeAbilityVisualBlades\(\)[\s\S]*meleeFxWallRecallSeq:Math\.max/.test(online)&&
  /arenaApplyRemoteMeleeAbilityState\(r,p,r\.loadout,now\)/.test(online));
check('Party 2v2 repeats and receives the same visual state',
  /partySend\('cpu_player_state',[\s\S]*meleeFxSeq:[\s\S]*meleeFxMs:clamp[\s\S]*meleeFxBlades:meleeAbilityVisualBlades\(\)[\s\S]*meleeFxWallRecallSeq:Math\.max/.test(party)&&
  /arenaApplyRemoteMeleeAbilityState\(h,p,kit,Date\.now\(\)\)/.test(party));
check('Round-created remote actors start with clean visual sequence and timers',
  /meleeFxSeq:0,meleeFxKey:'',meleeFxStart:0,meleeFxUntil:0,meleeFxAngle:0,meleeFxReadyAt:0,meleeFxBlades:\[\],meleeFxWallRecallSeq:0/.test(online)&&
  /meleeFxSeq:0,meleeFxKey:'',meleeFxStart:0,meleeFxUntil:0,meleeFxAngle:0,meleeFxReadyAt:0,meleeFxBlades:\[\],meleeFxWallRecallSeq:0/.test(party));
check('Every non-Sai melee has a distinct ability animation branch',
  Object.keys(durations).every(key=>new RegExp("key==='"+key+"'").test(rendering))&&
  /drawMeleeAbilityVisual\(e,now,true,false\)/.test(rendering)&&/drawMeleeAbilityVisual\(e,clock,!ally,false\)/.test(rendering)&&
  /drawMeleeAbilityVisual\(player,now,false,true\)/.test(rendering));
check('Burning Daggers and Tera Fists have their own weapon silhouettes',
  /else if\(key==='bdaggers'\)[\s\S]*else if\(key==='terafists'\)/.test(rendering)&&
  /actor\.meleeFxBlades/.test(rendering));
check('Burning Daggers use one detailed blade for held, local-thrown, and remote-thrown views',
  /function drawBurningDaggerBlade\(/.test(rendering)&&(rendering.match(/drawBurningDaggerBlade\(/g)||[]).length>=4&&
  /partyDaggersThrown/.test(rendering)&&/remoteDaggersThrown/.test(rendering)&&/player\.cur==='bdaggers'&&daggersOut/.test(rendering));
check('Twin Sai use proper center tines, curved prongs, wrapped grips, and a crossed guard',
  /function drawTwinSaiBlade\([\s\S]*quadraticCurveTo\(8,-8\.5[\s\S]*quadraticCurveTo\(8,8\.5/.test(rendering)&&
  /rotate\(-side\*guard\)[\s\S]*drawTwinSaiBlade\(hostile,parryActive\)/.test(rendering));
check('Twin Sai guard uses its weapon pose without an extra player or opponent ring',
  !/remoteParryActive\)\{[\s\S]{0,260}ctx\.arc\(e\.x,e\.y,r\+10/.test(rendering)&&
  !/localParryActive\)\{[\s\S]{0,260}ctx\.arc\(player\.x,player\.y,player\.r\+10/.test(rendering));
check('Returning or expired local daggers end their remote visual early',
  /finishBurningDaggerThrow\(true\)/.test(combat)&&(combat.match(/finishBurningDaggerThrow\(false\)/g)||[]).length===2);
check('Normal game and round setup clear presentation-only melee state',
  /resetWeaponGimmickState\(\)[\s\S]*resetMeleeAbilityVisual\(player\)/.test(gameplay)&&
  /resetMeleeAbilityVisual\(arena\.opponent\)/.test(online));
check('Twin Sai remains on its dedicated full-window guard protocol',
  !Object.hasOwn(durations,'twinsai')&&/arenaApplyRemoteParryState\(r,p,now\)/.test(online)&&/remoteParryActive/.test(rendering));

console.log(`SUMMARY ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);
