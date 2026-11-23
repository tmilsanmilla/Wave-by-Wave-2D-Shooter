"use strict";

// Pike keeps a narrow, extended-reach thrust in the melee roster.
const FIELD_MELEE_KEYS=Object.freeze(['pike']);
const FIELD_UTILITY_KEYS=Object.freeze([]); // No variant duplicates the core utilities.
const FIELD_MELEE_PROFILES=Object.freeze({
  pike:{name:'PIKE',dmg:47,fireRate:700,range:170,arc:.28,moveMod:.98,kick:3.2,
    skill:{label:'THRUST',range:215,arc:.24,mul:1.7,cd:6500,visualMs:260},
    copy:'Long reach, narrow aim and slow recovery. E / F: a 215-range power thrust at 1.7x damage; solid cover blocks it.'}
});
for(const key of FIELD_MELEE_KEYS){
  const {skill,copy,...stats}=FIELD_MELEE_PROFILES[key];
  WEAPONS[key]={...stats,melee:true,mag:Infinity,reload:0,auto:true,pellets:1,spread:0,aimSpread:0,len:26,zoom:1.15,scoped:false,
    fieldSkill:skill,gimmick:{id:key+'_skill',copy},blurb:copy};
  MELEES.push(key);WKEYS.push(key);
}
function utilityFamily(key){const u=UTILITIES[String(key||'')];return u?String(u.family||key):'';}
