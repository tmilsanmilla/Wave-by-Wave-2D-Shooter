"use strict";

// The finite-ammo bank-shot primary. Its skill is choosing a bounce angle,
// unlike the straight-fire starter guns and Warpwave's rechargeable sine wave.
const REINFORCEMENT_ARMORY=[
  ['quasar','QUASAR RICOCHET','primary','energy',{dmg:35,mag:12,reload:1850,fireRate:290,auto:false,spread:.07,aimSpread:.014,speed:20,range:900,fall:.72,bounce:2},'#86d9df',
    'Semi-auto energy bolts bounce up to twice off walls or arena edges. Uses finite reserve, with distance falloff.']
];
const REINFORCEMENT_KEYS=Object.freeze(REINFORCEMENT_ARMORY.map(row=>row[0]));
for(const [key,name,slot,frame,stats,accent,copy] of REINFORCEMENT_ARMORY){
  if(WEAPONS[key]||!ARMORY_FRAMES[frame]||!['primary','secondary'].includes(slot))throw new Error('Invalid reinforcement profile: '+key);
  WEAPONS[key]=Object.assign({auto:true,pellets:1,scoped:false,sndF:1000,sndD:.07,fg:8},ARMORY_FRAMES[frame],stats,
    {name,armoryFrame:frame,armoryAccent:accent,armorySlot:slot,armoryMark:2,armoryCollection:'reinforcements',tracer:accent,
      gimmick:{id:key+'_profile',copy},blurb:copy});
  (slot==='primary'?PRIMARIES:SECONDARIES).push(key);
  WKEYS.push(key);
}
