import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const online=read('js/online.js'),rendering=read('js/rendering.js');
let passed=0,failed=0;
function check(name,condition){if(condition){passed++;console.log('PASS',name);}else{failed++;console.error('FAIL',name);}}

const helperStart=online.indexOf('function arenaApplyRemoteParryState');
const helperEnd=online.indexOf('\nfunction arenaGuard',helperStart);
const context={TWIN_SAI_PARRY_MS:1000,ABILITY_CD:{twinsai:2500},now:0};
vm.createContext(context);
vm.runInContext(online.slice(helperStart,helperEnd),context);
const apply=context.arenaApplyRemoteParryState;

const actor={loadout:{melee:'twinsai'},parrySeq:0,parryUntil:0,parryReadyAt:0};
check('Valid remote guard starts for the advertised remaining window',apply(actor,{parrySeq:1,parryMs:1000},5000)===true&&actor.parryUntil===6000&&actor.parryReadyAt===8500);
check('Repeated state cannot extend the same guard',apply(actor,{parrySeq:1,parryMs:900},5100)===false&&actor.parryUntil===6000);
check('A zero remainder clears that guard without inventing a new activation',apply(actor,{parrySeq:1,parryMs:0},6000)===false&&actor.parryUntil===6000);
actor.parryUntil=6200;
check('A zero remainder clears a guard still visible through network latency',apply(actor,{parrySeq:1,parryMs:0},6000)===true&&actor.parryUntil===6000);
const invalid={loadout:{melee:'twinsai'},parrySeq:0,parryUntil:0,parryReadyAt:0};
check('Malformed or oversized remote durations are rejected',apply(invalid,{parrySeq:1,parryMs:1001},100)===false&&invalid.parrySeq===0&&apply(invalid,{parrySeq:1,parryMs:NaN},100)===false);
check('A player without Twin Sai cannot advertise its guard',apply({loadout:{melee:'knife'},parrySeq:0,parryUntil:0,parryReadyAt:0},{parrySeq:1,parryMs:1000},100)===false);
check('Stale sequences and cooldown-skipping activations do not redraw the guard',apply(actor,{parrySeq:0,parryMs:1000},7000)===false&&apply(actor,{parrySeq:2,parryMs:1000},8000)===false&&actor.parryUntil===6000);
check('A later sequence works after the full post-guard cooldown',apply(actor,{parrySeq:3,parryMs:1000},8500)===true&&actor.parryUntil===9500);

check('Casual 1v1 sends and receives bounded parry state',/parrySeq:Math\.max\(0,Math\.floor\(\+parrySeq\|\|0\)\),parryMs:clamp\(parryUntil-now,0,TWIN_SAI_PARRY_MS\)/.test(online)&&/arenaApplyRemoteParryState\(r,p,now\)/.test(online));
check('Every round resets the opponent parry sequence and timers',/arena\.opponent\.parrySeq=0;arena\.opponent\.parryUntil=0;arena\.opponent\.parryReadyAt=0/.test(online));
check('Opponent and teammate screens render the full active Twin Sai pose',/remoteParryActive[\s\S]*drawMeleeWeaponSilhouette\('twinsai',true,true\)/.test(rendering)&&/partyParryActive[\s\S]*drawMeleeWeaponSilhouette\('twinsai',false,true\)/.test(rendering));
check('Quick-melee parry keeps the local Twin Sai pose visible for the full guard',/localParryActive[\s\S]*drawMeleeWeaponSilhouette\('twinsai',false,true\)/.test(rendering));

console.log(`SUMMARY ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);
