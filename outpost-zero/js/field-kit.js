"use strict";

// Additive kit definitions, installed before upgrades/publication registries.
const FIELD_MELEE_KEYS=Object.freeze(['saber','pike','mace','kukri']);
const FIELD_UTILITY_KEYS=Object.freeze(['quickfrag','heavycharge','cryovial','lurepod']);
const FIELD_MELEE_PROFILES=Object.freeze({
  saber:{name:'SABER',dmg:36,fireRate:420,range:112,arc:1.35,moveMod:1.06,kick:2.4,
    skill:{label:'SWEEP',range:150,arc:3.3,mul:1.5,cd:4500,visualMs:300},
    copy:'A balanced curved blade. E / F: a wide 150-range Sweep at 1.5x damage. No wall penetration.'},
  pike:{name:'PIKE',dmg:47,fireRate:700,range:170,arc:.28,moveMod:.98,kick:3.2,
    skill:{label:'THRUST',range:215,arc:.24,mul:1.7,cd:6500,visualMs:260},
    copy:'Long reach, narrow aim and slow recovery. E / F: a 215-range power thrust at 1.7x damage; solid cover blocks it.'},
  mace:{name:'MACE',dmg:64,fireRate:820,range:95,arc:1.5,moveMod:.94,kick:5,
    skill:{label:'PULSE',range:130,arc:6.2,mul:1.15,cd:8000,visualMs:340,missiles:true},
    copy:'A heavy close-range impact. E / F: a 130-range pulse swing at 1.15x damage that also clears nearby missiles.'},
  kukri:{name:'KUKRI',dmg:25,fireRate:270,range:88,arc:1,moveMod:1.12,kick:1.8,
    skill:{label:'CROSSCUT',range:105,arc:2.6,mul:2,cd:3500,visualMs:240},
    copy:'A light, fast close-range blade. E / F: one broad Crosscut for double damage, followed by a 3.5s cooldown.'}
});
for(const key of FIELD_MELEE_KEYS){
  const {skill,copy,...stats}=FIELD_MELEE_PROFILES[key];
  WEAPONS[key]={...stats,melee:true,mag:Infinity,reload:0,auto:true,pellets:1,spread:0,aimSpread:0,len:26,zoom:1.15,scoped:false,
    fieldSkill:skill,gimmick:{id:key+'_skill',copy},blurb:copy};
  MELEES.push(key);WKEYS.push(key);
}
Object.assign(UTILITIES,{
  quickfrag:{name:'QUICK FRAG',family:'grenade',cd:14000,dmg:180,range:80,speed:17,fuseMs:650,
    gimmick:{id:'quick_frag',copy:'A fast throw and 0.65s fuse. Smaller 80-radius blast, up to 180 center damage, 14s cooldown.'},
    blurb:'Quick, compact explosive pressure. Damage falls to zero at the blast edge.'},
  heavycharge:{name:'HEAVY CHARGE',family:'grenade',cd:30000,dmg:320,range:125,speed:10,fuseMs:1400,
    gimmick:{id:'heavy_charge',copy:'A slow 1.4s fuse and short throw. Wide 125-radius blast, up to 320 center damage, 30s cooldown.'},
    blurb:'A deliberate area-denial explosive. Wide blast and long recharge; damage falls to zero at the edge.'},
  cryovial:{name:'CRYO VIAL',family:'freezer',cd:18000,speed:14,fuseMs:1050,radius:80,freezeMs:1500,
    gimmick:{id:'cryo_vial',copy:'A faster, smaller wall-stopped ice charge. Freezes exposed targets, including you, for 1.5s. First hit thaws.'},
    blurb:'A compact 80-radius freeze charge with a shorter freeze and 18s recharge. Cover shields its blast.'},
  lurepod:{name:'LURE POD',family:'redball',cd:16000,speed:4.5,lifeMs:4500,taunt:1000,
    gimmick:{id:'lure_pod',copy:'A slower lure that lasts 4.5s and draws Endless enemies within 1000 range. In Casual it is a contact hazard, not mind control.'},
    blurb:'A longer-lived bouncing distraction for Endless, with the normal Red Ball contact hit in Casual.'}
});
UTILKEYS.push(...FIELD_UTILITY_KEYS);
function utilityFamily(key){const u=UTILITIES[String(key||'')];return u?String(u.family||key):'';}
