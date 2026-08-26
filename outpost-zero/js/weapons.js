"use strict";

/* ---------------- weapons ---------------- */
const WEAPONS = {
  /* primaries */
  ar     : { name:'SCAR-H RIFLE', dmg:48,  mag:25, reload:1600, fireRate:145, auto:true,  pellets:1, fg:15.4,
             spread:0.05,  aimSpread:0.016, speed:19, len:34, kick:2.6, zoom:1.55, scoped:false,
             moveMod:0.95, range:620,  fall:0.781, sndF:950,  sndD:0.08,
             blurb:'Measured full-auto. Heavy hitter with forgiving aim.' },
  solarrifle:{ name:'SOLAR RIFLE', dmg:95, mag:4, reload:3200, fireRate:1400, auto:false, pellets:1, pierce:2, fg:6,
             spread:0.16, aimSpread:0.10, speed:15, len:26, kick:6, zoom:1.15, scoped:false,
             solar:true, fire:true, bounce:5, infinite:true, tracer:'rgba(255,200,70,0.95)',
             moveMod:0.95, range:99999, fall:1, sndF:1100, sndD:0.08,
             blurb:'Bouncing solar bolts \u2014 hits ignite, infinite reach & ammo. Slow, kicks hard, wild spread.' },
  smg    : { name:'MP7 SMG',      dmg:11,  mag:55, reload:1400, fireRate:65,  auto:true,  pellets:1, fg:14,
             spread:0.134325, aimSpread:0.04975, speed:15, len:26, kick:1.6, zoom:1.30, scoped:false,
             moveMod:1.05, range:340,  fall:0.83527, sndF:1800, sndD:0.05,
             blurb:'Pure spam. Huge mag, forgiving aim, holds up at range.' },
  shotgun: { name:'M870 SHOTGUN', dmg:24,  mag:10, reload:1900, fireRate:760, auto:false, pellets:9, fg:10,
             spread:0.21,  aimSpread:0.10,  speed:13, len:30, kick:8,  zoom:1.25, scoped:false,
             moveMod:0.92, range:180,  fall:0.25, sndF:520,  sndD:0.17,
             blurb:'Ten-shell tube. Strong up close; damage drops fast with distance.' },
  sniper : { name:'AWM SNIPER',   dmg:204, mag:6,  reload:2300, fireRate:1150,auto:false, pellets:1, pierce:5, fg:1,
             spread:0.28,  aimSpread:0.0,   speed:28, len:42, kick:10, zoom:3.0,  scoped:true,
             moveMod:0.85, range:99999,fall:1.0,  sndF:340,  sndD:0.24,
             blurb:'Full damage at any range, pierces 5. Precise \u2014 no forgiving hits.' },
  /* sidearms */
  m9     : { name:'M9 SIDEARM',   dmg:38,  mag:12, reload:800,  fireRate:200, auto:false, pellets:1,
             spread:0.055, aimSpread:0.006, speed:17, len:22, kick:3,  zoom:1.45, scoped:false,
             moveMod:1.0,  range:340,  fall:0.55, sndF:1400, sndD:0.09,
             blurb:'Reliable semi-auto. Fast handling, honest damage.' },
  revolver:{ name:'.357 PYTHON',  dmg:70,  mag:8,  reload:1500, fireRate:850, auto:false, pellets:1, fg:5,
             spread:0.05,  aimSpread:0.005, speed:19, len:24, kick:5,  zoom:1.50, scoped:false,
             moveMod:1.0,  range:420,  fall:0.65, sndF:800,  sndD:0.13,
             blurb:'Slow heavy hammer. Hits hard, one shot at a time.' },
  g18    : { name:'G18 MACHINE PISTOL', dmg:9,  mag:31, reload:1150, fireRate:75, auto:true, pellets:1,
             spread:0.19,  aimSpread:0.08,  speed:14, len:20, kick:1.6, zoom:1.25, scoped:false,
             moveMod:1.08, range:220,  fall:0.40, sndF:2000, sndD:0.045,
             blurb:'Secondary SMG. Melts anything adjacent.' },
  volt   : { name:'VOLT PISTOL',  dmg:24,  mag:7,  reload:750,  fireRate:145, auto:false, pellets:1, fg:4,
             spread:0.04,  aimSpread:0.008, speed:20, len:24, kick:2, zoom:1.40, scoped:false,
             moveMod:1.0,  range:99999,fall:1.0,  sndF:1600, sndD:0.07,
             energy:true, tracer:'rgba(127,216,255,0.9)',
             blurb:'Bottomless reserve, tiny cell. +15% fire rate, +1 cell.' },
  dart   : { name:'DART PISTOL',  dmg:10,  mag:14, reload:1000, fireRate:230, auto:true,  pellets:1, fg:4,
             spread:0.05,  aimSpread:0.01,  speed:18, len:20, kick:1.4, zoom:1.35, scoped:false,
             poison:true, tracer:'rgba(120,220,120,0.9)',
             moveMod:1.05, range:380,  fall:0.5, sndF:1100, sndD:0.05,
             blurb:'Low hit, but each dart plants a STACKING poison that rots enemies over time.' },
  fireworks:{ name:'FIREWORK LAUNCHER', dmg:0, mag:8,  reload:1900, fireRate:520, auto:false, pellets:1,
             spread:0.05, aimSpread:0.02, speed:11, len:22, kick:4, zoom:1.2, scoped:false, firework:true,
             moveMod:1.0, range:620, fall:1, sndF:700, sndD:0.05,
             blurb:'Lobs firecrackers with a big rainbow burst. 8 in the tube.' },
  /* melee */
  chainsaw:{ name:'CHAINSAW',     melee:true, saw:true, drain:5, dmg:42, mag:Infinity, reload:0, fireRate:130, auto:true,
             pellets:1, spread:0, aimSpread:0, len:18, kick:1, zoom:1.15, scoped:false,
             moveMod:1.05, range:72,  arc:6.3,
             blurb:'Shreds everything nearby, hits hard. E / F / melee RMB: RIP without a forced lunge.' },
  twinsai: { name:'TWIN SAI',      melee:true, dmg:22, mag:Infinity, reload:0, fireRate:150, auto:true,
             pellets:1, spread:0, aimSpread:0, len:14, kick:1.2, zoom:1.12, scoped:false, combo:true, sai:true,
             moveMod:1.12, range:96,  arc:0.6,
             blurb:'Fast dual blades. E / F / melee RMB: 2.5s PARRY sends the next shot toward your aim.' },
  knife  : { name:'KA-BAR KNIFE', melee:true, dmg:48, mag:Infinity, reload:0, fireRate:380, auto:true,
             pellets:1, spread:0, aimSpread:0, len:16, kick:2.5, zoom:1.15, scoped:false,
             moveMod:1.08, range:130, arc:0.35,
             blurb:'Long thrust. E / F / melee RMB: execute EVERYTHING in close range.' },
  bdaggers:{ name:'BURNING DAGGERS', melee:true, dmg:34, mag:Infinity, reload:0, fireRate:340, auto:true,
             pellets:1, spread:0, aimSpread:0, len:15, kick:2, zoom:1.15, scoped:false, fire:true, combo:true,
             moveMod:1.1, range:100, arc:0.785,
             blurb:'Twin flaming blades — left-right combo. E / F / melee RMB: hurl both.' },
  scythe : { name:'REAPER SCYTHE',melee:true, dmg:75, mag:Infinity, reload:0, fireRate:950, auto:true,
             pellets:1, spread:0, aimSpread:0, len:26, kick:5, zoom:1.15, scoped:false,
             moveMod:0.95, range:82,  arc:3.8,
             blurb:'Wide harvest, slow wind-up. E / F / melee RMB: long reaper dash.' },
  hammer : { name:'WAR HAMMER',   melee:true, dmg:80, mag:Infinity, reload:0, fireRate:900, auto:true,
             pellets:1, spread:0, aimSpread:0, len:22, kick:6, zoom:1.15, scoped:false,
             moveMod:0.92, range:70,  arc:2.2, kitBuff:true,
             blurb:'Slow, heavy swings. Carrying it: -30% reload, +5% dmg/range on your whole kit.' },
};
const PRIMARIES   = ['sniper','smg','shotgun','ar'];
const SECONDARIES = ['m9','revolver','g18','volt','dart'];
const TEMP_PRIMARY=['fireworks'], TEMP_SECONDARY=['solarrifle'], TEMP_MELEE=['bdaggers'], TEMP_UTILITY=['beachball'];
const MELEES      = ['chainsaw','knife','scythe','hammer','twinsai'];

/* =========================================================================
   WEAPON VAULT — dev shelf for weapons that exist in code but aren't in the
   game yet. To ACTIVATE one, flip its entry in VAULT_ACTIVE below from false
   to true (one-line change). It then appears in the armory in its slot.
   Each vault weapon needs: a full stats entry in VAULT_WEAPONS, and a line in
   VAULT_SLOTS telling the game which category it belongs to
   ('primary' | 'secondary' | 'melee' | 'utility').
   Utility entries put their stats in VAULT_UTILITIES instead of VAULT_WEAPONS.
   ========================================================================= */
const VAULT_WEAPONS = {
  // EXAMPLE (shelved). Copy this block, rename the key, tune the stats.
  railgun : { name:'ARC RAILGUN', dmg:220, mag:3, reload:1800, fireRate:900, auto:false, pellets:1, pierce:8,
              spread:0.004, aimSpread:0.001, speed:34, len:30, kick:7, zoom:1.5, scoped:true,
              moveMod:0.9, range:1400, fall:1, sndF:1500, sndD:0.09, tracer:'rgba(150,220,255,0.95)',
              blurb:'Hyper-velocity slug. Punches through the whole line.' },
  /* ---- FALL UPDATE set (dormant: flip VAULT_ACTIVE when the season starts) ---- */
  warpwave: { name:'WARPWAVE', dmg:11, mag:100, reload:0, fireRate:110, auto:true, pellets:1, pierce:1,
              spread:0.03, aimSpread:0.01, speed:11, len:18, kick:1.2, zoom:1.15, scoped:false,
              wave:true, energy:true, cell:true, cellRegen:9, cellDelay:700,
              moveMod:1.0, range:520, fall:0.9, sndF:700, sndD:0.05,
              tracer:'rgba(127,216,255,0.95)',
              blurb:'Sine-wave bolts from a 100-cell battery that recharges. E: WARP STUN.' },
  timeturner:{ name:'TIMETURNER', dmg:40, mag:10, reload:1400, fireRate:300, auto:false, pellets:1, pierce:0,
              spread:0.035, aimSpread:0.006, speed:16, len:22, kick:3, zoom:1.4, scoped:false,
              chrono:true, moveMod:1.15, range:480, fall:0.7, sndF:1200, sndD:0.08,
              tracer:'rgba(230,200,120,0.95)',
              blurb:'Time-drag rounds. Every hit cuts the target\u2019s speed 20% \u00b7 stacks.' },
  terafists:{ name:'TERA FISTS', melee:true, dmg:8, mag:Infinity, reload:0, fireRate:160, auto:true,
              pellets:1, spread:0, aimSpread:0, len:12, kick:1.5, zoom:1.1, scoped:false, combo:true, fists:true,
              moveMod:1.1, range:115, arc:0.9,
              blurb:'Long sweeping arc punches. E / F / melee RMB: FLURRY. Recharge by landing normal hits.' },
};
const VAULT_UTILITIES = {
  // EXAMPLE (shelved).
  turret : { name:'AUTO TURRET', cd:30000,
             blurb:'Drops a stationary gun that fires on nearby enemies.' },
  // PORTAL — shelved (swapped out for the Freezer). Flip VAULT_ACTIVE.portal to true to bring it back.
  // PORTAL — now part of the FALL UPDATE set (dormant)
  portal : { name:'PORTAL',       cd:25000,
             blurb:'E: hurl an ENDER PEARL \u2014 you warp to wherever it lands. Max range = firework launcher.' },
  // TIME CAPSULE — shelved dormant (no longer in the fall lineup)
  timecapsule : { name:'TIME CAPSULE', cd:45000,
             blurb:'Freeze the moment: enemies & their shots crawl at 25% for 15s. Ends the instant you move.' },
};
// which category each vaulted key belongs to
const VAULT_SLOTS = {
  railgun:'primary',
  turret:'utility',
  portal:'utility',
  warpwave:'primary',
  timeturner:'secondary',
  terafists:'melee',
  timecapsule:'utility',
};
// >>> FLIP TO true TO ACTIVATE A SHELVED WEAPON <<<
const VAULT_ACTIVE = {
  railgun:  false,     // sold in the gem shop
  turret:   false,     // sold in the gem shop
  warpwave:   false,   // FALL UPDATE
  timeturner: false,   // FALL UPDATE
  terafists:  false,   // FALL UPDATE
  portal:     false,   // FALL UPDATE
  timecapsule:false,   // shelved dormant
};
// Unreleased next-season equipment is never part of the public roster. Admins
// can inspect it in the editor and can equip it only while Test Mode is active.
const FALL_KEYS=['warpwave','timeturner','terafists','portal'];
/* utilities: G/RMB to quick-use; equip the Medkit and LMB for its long heal */
const UTILITIES = {
  medkit : { name:'FIELD MEDKIT', cd:75000,
             blurb:'Quick 5% heal, or equip [4] + LMB for a 20% heal over 8s. Recharge by killing enemies.' },
  grenade: { name:'FRAG GRENADE', cd:20000,
             blurb:'Tap to throw at your crosshair. Big blast, friendly to you only.' },
  freezer: { name:'FREEZER',      cd:25000,
             blurb:'Tap: freeze all enemies in a wide radius for 5s. They take half damage, but the first hit thaws them.' },
  redball: { name:'RED BALL',     cd:11000,
             blurb:'Bouncy decoy, lives 3s. Enemies chase it; light contact damage.' },
  beachball:{ name:'BEACH BALL',  cd:16000,
             blurb:'Flaming ball — enemies FLEE it and burn on touch. Splits as it bounces.' },
};
const UTILKEYS = ['medkit','grenade','freezer','redball'];
const TEMP_UTIL_KEYS = ['beachball'];

// merge any activated vault weapons into the live rosters (runs after all rosters exist)
(function activateVault(){
  const rosters = { primary:PRIMARIES, secondary:SECONDARIES, melee:MELEES };
  for(const key in VAULT_ACTIVE){
    if(FALL_KEYS.includes(key)) continue;            // next season stays admin-preview only
    if(!VAULT_ACTIVE[key]) continue;
    const slot = VAULT_SLOTS[key];
    if(slot==='utility'){
      if(VAULT_UTILITIES[key]) UTILITIES[key]=VAULT_UTILITIES[key];
      if(!UTILKEYS.includes(key)) UTILKEYS.push(key);
    } else {
      if(VAULT_WEAPONS[key]) WEAPONS[key]=VAULT_WEAPONS[key];
      const r=rosters[slot];
      if(r && !r.includes(key)) r.push(key);
    }
  }
})();
const WKEYS = [...PRIMARIES, ...SECONDARIES, ...MELEES, ...TEMP_PRIMARY, ...TEMP_SECONDARY, ...TEMP_MELEE];
