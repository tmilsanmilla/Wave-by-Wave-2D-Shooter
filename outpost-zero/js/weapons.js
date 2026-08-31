"use strict";

/* ---------------- weapons ---------------- */
const WEAPONS = {
  /* primaries */
  ar     : { name:'SCAR-H RIFLE', dmg:48,  mag:25, reload:1600, fireRate:145, auto:true,  pellets:1, fg:15.4,
             spread:0.05,  aimSpread:0.016, speed:19, len:34, kick:2.6, zoom:1.55, scoped:false,
             moveMod:0.95, range:620,  fall:0.781, sndF:950,  sndD:0.08, shotSfx:'ar', focusMs:500,
             gimmick:{id:'scar_focus',copy:'After 0.5s idle, the next round uses aimed spread and ignores bloom.'},
             blurb:'Measured full-auto. After 0.5s idle, the next round ignores bloom and uses aimed spread.' },
  solarrifle:{ name:'SOLAR RIFLE', dmg:95, mag:4, reload:3200, fireRate:1400, auto:false, pellets:1, pierce:2, fg:6,
             spread:0.16, aimSpread:0.10, speed:15, len:26, kick:6, zoom:1.15, scoped:false,
             solar:true, fire:true, bounce:5, infinite:true, tracer:'rgba(255,200,70,0.95)',
             moveMod:0.95, range:99999, fall:1, sndF:1100, sndD:0.08, shotSfx:'solarrifle',
             gimmick:{id:'solar_bounce_burn',copy:'Infinite-ammo solar bolts bounce five times, pierce, and ignite.'},
             blurb:'Bouncing solar bolts \u2014 hits ignite, infinite reach & ammo. Slow, kicks hard, wild spread.' },
  smg    : { name:'MP7 SMG',      dmg:11,  mag:55, reload:1400, fireRate:65,  auto:true,  pellets:1, fg:14,
             spread:0.134325, aimSpread:0.04975, speed:15, len:26, kick:1.6, zoom:1.30, scoped:false,
             moveMod:1.05, range:340,  fall:0.83527, sndF:1800, sndD:0.05, shotSfx:'smg', aimMoveMul:0.80,
             gimmick:{id:'mp7_mobile_ads',copy:'Aim while moving at 80% speed instead of 45%.'},
             blurb:'Huge mag and mobile aim: keep 80% movement speed while aiming.' },
  shotgun: { name:'M870 SHOTGUN', dmg:24,  mag:10, reload:1900, fireRate:760, auto:false, pellets:9, fg:10,
             spread:0.21,  aimSpread:0.10,  speed:13, len:30, kick:8,  zoom:1.25, scoped:false,
             moveMod:0.92, range:180,  fall:0.25, sndF:520,  sndD:0.17, shotSfx:'shotgun', selfRecoil:12,
             gimmick:{id:'m870_breach_recoil',copy:'Every blast kicks you 12px backward for spacing and movement tricks.'},
             blurb:'Ten-shell tube. Every blast kicks you backward 12px; damage drops fast with distance.' },
  sniper : { name:'AWM SNIPER',   dmg:160, mag:6,  reload:2300, fireRate:1000,auto:false, pellets:1, pierce:5, fg:1,
             spread:0.28,  aimSpread:0.0,   speed:28, len:42, kick:10, zoom:3.0,  scoped:true,
             moveMod:0.85, range:99999,fall:1.0,  sndF:340,  sndD:0.24, shotSfx:'sniper',
             gimmick:{id:'awm_deadeye',copy:'Perfect scoped accuracy, no falloff, pierces five; unscoped eliminations celebrate.'},
             blurb:'160 damage at any range, pierces 5. Faster follow-up; unscoped eliminations celebrate.' },
  /* sidearms */
  m9     : { name:'M9 SIDEARM',   dmg:38,  mag:12, reload:800,  fireRate:200, auto:false, pellets:1,
             spread:0.055, aimSpread:0.006, speed:17, len:22, kick:3,  zoom:1.45, scoped:false,
             moveMod:1.0,  range:340,  fall:0.55, sndF:1400, sndD:0.09, shotSfx:'m9', quickdrawMs:120,
             gimmick:{id:'m9_quickdraw',copy:'Draws in 120ms instead of 380ms.'},
             blurb:'Reliable semi-auto with a lightning-fast 120ms quick draw.' },
  revolver:{ name:'.357 PYTHON',  dmg:70,  mag:8,  reload:1500, fireRate:850, auto:false, pellets:1, fg:5,
             spread:0.05,  aimSpread:0.005, speed:19, len:24, kick:5,  zoom:1.50, scoped:false,
             moveMod:1.0,  range:420,  fall:0.65, sndF:800,  sndD:0.13, shotSfx:'revolver',
             fan:true, fanGapMs:115, fanLockMs:900, fanDmgMul:0.60,
             gimmick:{id:'python_fan_the_hammer',copy:'E / RMB to aim, then fire to fan every loaded round at 60% damage, using real ammo.'},
             blurb:'Heavy hip-fire; E / RMB then trigger fans the entire loaded magazine at 60% damage.' },
  g18    : { name:'G18 MACHINE PISTOL', dmg:9,  mag:31, reload:1150, fireRate:75, auto:true, pellets:1,
             spread:0.19,  aimSpread:0.08,  speed:14, len:20, kick:1.6, zoom:1.25, scoped:false,
             moveMod:1.08, range:220,  fall:0.40, sndF:2000, sndD:0.045, shotSfx:'g18', frenzyAt:10, frenzyRateMul:0.72,
             gimmick:{id:'g18_final_mag_frenzy',copy:'The final 10 rounds fire 28% faster.'},
             blurb:'Secondary SMG. Its final ten rounds fire 28% faster.' },
  volt   : { name:'VOLT PISTOL',  dmg:24,  mag:7,  reload:750,  fireRate:145, auto:true,  pellets:1, fg:4,
             spread:0.04,  aimSpread:0.008, speed:20, len:24, kick:2, zoom:1.40, scoped:false,
             moveMod:1.0,  range:99999,fall:1.0,  sndF:1600, sndD:0.07, shotSfx:'volt',
             energy:true, tracer:'rgba(127,216,255,0.9)',
             gimmick:{id:'volt_bottomless_cell',copy:'Full-auto, infinite reserve, and no damage falloff at any range; reload its seven-round cell.'},
             blurb:'Full-auto with bottomless reserve and no range falloff; reload its tiny seven-round cell.' },
  dart   : { name:'DART PISTOL',  dmg:10,  mag:14, reload:1000, fireRate:230, auto:true,  pellets:1, fg:4,
             spread:0.05,  aimSpread:0.01,  speed:18, len:20, kick:1.4, zoom:1.35, scoped:false,
             poison:true, tracer:'rgba(120,220,120,0.9)',
             moveMod:1.05, range:380,  fall:0.5, sndF:1100, sndD:0.05, shotSfx:'dart',
             gimmick:{id:'dart_venom',copy:'Each hit adds a stacking poison and refreshes its duration.'},
             blurb:'Low hit, but each dart plants a STACKING poison that rots enemies over time.' },
  fireworks:{ name:'FIREWORK LAUNCHER', dmg:0, mag:3,  reload:2800, fireRate:1000, auto:false, pellets:1,
             spread:0.05, aimSpread:0.02, speed:11, len:22, kick:4, zoom:1.2, scoped:false, firework:true,
             moveMod:1.0, range:450, fall:1, sndF:700, sndD:0.05, shotSfx:'fireworks',
             gimmick:{id:'firework_airburst',copy:'Fixed-fuse shot bursts at the crosshair in a compact rainbow blast.'},
             blurb:'Slow, compact rainbow airbursts. Only 3 in the tube.' },
  /* melee */
  chainsaw:{ name:'CHAINSAW',     melee:true, saw:true, drain:5, dmg:42, mag:Infinity, reload:0, fireRate:130, auto:true,
             pellets:1, spread:0, aimSpread:0, len:18, kick:1, zoom:1.15, scoped:false,
             moveMod:1.05, range:72,  arc:6.3,
             gimmick:{id:'chainsaw_fuel_rip',copy:'Fuel-powered contact shred; RIP grants a brief all-around shred with i-frames.'},
             blurb:'Shreds everything nearby, hits hard. E / F / melee RMB: RIP without a forced lunge.' },
  twinsai: { name:'TWIN SAI',      melee:true, dmg:22, mag:Infinity, reload:0, fireRate:150, auto:true,
             pellets:1, spread:0, aimSpread:0, len:14, kick:1.2, zoom:1.12, scoped:false, combo:true, sai:true,
             moveMod:1.12, range:96,  arc:0.6,
             gimmick:{id:'twin_sai_parry',copy:'Aim-centered dual slashes; Parry reflects every incoming shot during its window.'},
             blurb:'Fast aimed dual blades. E / F / melee RMB: 1s PARRY sends incoming shots toward your aim.' + 
                   ' 2.5s cooldown starts when guard ends.' },
  knife  : { name:'KA-BAR KNIFE', melee:true, dmg:48, mag:Infinity, reload:0, fireRate:380, auto:true,
             pellets:1, spread:0, aimSpread:0, len:16, kick:2.5, zoom:1.15, scoped:false,
             moveMod:1.08, range:130, arc:0.35,
             gimmick:{id:'kabar_execute',copy:'Long thrust; Execute kills every nearby non-boss and maims bosses.'},
             blurb:'Long thrust. E / F / melee RMB: execute EVERYTHING in close range.' },
  bdaggers:{ name:'BURNING DAGGERS', melee:true, dmg:34, mag:Infinity, reload:0, fireRate:340, auto:true,
             pellets:1, spread:0, aimSpread:0, len:15, kick:2, zoom:1.15, scoped:false, fire:true, combo:true,
             moveMod:1.1, range:100, arc:0.785,
             gimmick:{id:'burning_daggers_return',copy:'Alternating burning blades; Hurl sends both out and back. A wall instantly recalls both and resets Hurl.'},
             blurb:'Twin flaming blades — left-right combo. E / F / melee RMB: hurl both; wall contact recalls them for an immediate rethrow.' },
  scythe : { name:'REAPER SCYTHE',melee:true, dmg:75, mag:Infinity, reload:0, fireRate:950, auto:true,
             pellets:1, spread:0, aimSpread:0, len:26, kick:5, zoom:1.15, scoped:false,
             moveMod:0.95, range:82,  arc:3.8,
             gimmick:{id:'reaper_dash',copy:'Wide harvest; Dash cleaves for double damage with i-frames.'},
             blurb:'Wide harvest, slow wind-up. E / F / melee RMB: long reaper dash.' },
  hammer : { name:'WAR HAMMER',   melee:true, dmg:80, mag:Infinity, reload:0, fireRate:900, auto:true,
             pellets:1, spread:0, aimSpread:0, len:22, kick:6, zoom:1.15, scoped:false,
             moveMod:0.92, range:70,  arc:2.2, kitBuff:true,
             gimmick:{id:'war_hammer_kit_slam',copy:'Buffs the whole kit; Slam creates a 360° missile-breaking shockwave.'},
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
              moveMod:0.9, range:1400, fall:1, sndF:1500, sndD:0.09, shotSfx:'railgun', tracer:'rgba(150,220,255,0.95)', phaseWalls:1,
              gimmick:{id:'arc_rail_pierce',copy:'A hyper-velocity slug phases through one wall and punches through eight targets.'},
              blurb:'Hyper-velocity slug. Phases through one wall and punches through eight targets.' },
  /* ---- FALL UPDATE set (dormant: flip VAULT_ACTIVE when the season starts) ---- */
  warpwave: { name:'WARPWAVE', dmg:11, mag:100, reload:0, fireRate:110, auto:true, pellets:1, pierce:1,
              spread:0.03, aimSpread:0.01, speed:11, len:18, kick:1.2, zoom:1.15, scoped:false,
              wave:true, energy:true, cell:true, cellRegen:9, cellDelay:700,
              moveMod:1.0, range:520, fall:0.9, sndF:700, sndD:0.05, shotSfx:'warpwave',
              tracer:'rgba(127,216,255,0.95)',
              gimmick:{id:'warpwave_recharge_stun',copy:'Sine-wave bolts recharge their battery; WARP STUN locks down nearby enemies.'},
              blurb:'Sine-wave bolts from a 100-cell battery that recharges. E: WARP STUN.' },
  timeturner:{ name:'TIMETURNER', dmg:40, mag:10, reload:1400, fireRate:300, auto:false, pellets:1, pierce:0,
              spread:0.035, aimSpread:0.006, speed:16, len:22, kick:3, zoom:1.4, scoped:false,
              chrono:true, moveMod:1.15, range:480, fall:0.7, sndF:1200, sndD:0.08, shotSfx:'timeturner',
              tracer:'rgba(230,200,120,0.95)',
              gimmick:{id:'timeturner_time_drag',copy:'Rounds stack movement slow; TIME DRAG applies four stacks around you.'},
              blurb:'Time-drag rounds. Every hit cuts the target\u2019s speed 20% \u00b7 stacks.' },
  terafists:{ name:'TERA FISTS', melee:true, dmg:8, mag:Infinity, reload:0, fireRate:160, auto:true,
              pellets:1, spread:0, aimSpread:0, len:12, kick:1.5, zoom:1.1, scoped:false, combo:true, fists:true,
              moveMod:1.1, range:115, arc:0.9,
              gimmick:{id:'tera_fists_flurry',copy:'Normal hits charge a rapid lifestealing FLURRY.'},
              blurb:'Long sweeping arc punches. E / F / melee RMB: FLURRY. Recharge by landing normal hits.' },
};
const VAULT_UTILITIES = {
  // EXAMPLE (shelved).
  turret : { name:'AUTO TURRET', cd:30000,
             gimmick:{id:'auto_turret_sentry',copy:'Deploys a stationary sentry that automatically fires at nearby enemies.'},
             blurb:'Drops a stationary gun that fires on nearby enemies.' },
  // PORTAL — shelved (swapped out for the Freezer). Flip VAULT_ACTIVE.portal to true to bring it back.
  // PORTAL — now part of the FALL UPDATE set (dormant)
  portal : { name:'PORTAL',       cd:25000,
             gimmick:{id:'portal_ender_pearl',copy:'Throws an Ender Pearl and teleports you wherever it lands.'},
             blurb:'E: hurl an ENDER PEARL \u2014 you warp to wherever it lands. Max range = firework launcher.' },
  // TIME CAPSULE — shelved dormant (no longer in the fall lineup)
  timecapsule : { name:'TIME CAPSULE', cd:45000,
             gimmick:{id:'time_capsule_stillness',copy:'Clears enemy shots and slows time for 15 seconds, but moving ends it.'},
             blurb:'Freeze the moment: enemies & their shots crawl at 25% for 15s. Ends the instant you move.' },
};
// Public shop definitions must exist on every client even before purchase.
// Ownership controls roster access; definition availability lets an opponent
// render and validate a legitimately owned Railgun without buying it too.
WEAPONS.railgun=VAULT_WEAPONS.railgun;
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
  medkit : { name:'FIELD MEDKIT', cd:75000, rechargeKills:10,
             gimmick:{id:'field_medkit_dual_heal',copy:'Choose a quick 5% heal or an interruptible 20% channel heal.'},
             blurb:'Quick 5% heal, or equip [4] + LMB for a 20% heal over 8s. Recharge by killing enemies.' },
  grenade: { name:'FRAG GRENADE', cd:20000, dmg:300, range:85,
             gimmick:{id:'frag_center_falloff',copy:'A compact timed blast hits hardest at its center, then falls to zero at its edge.'},
             blurb:'Tap to throw at your crosshair. Compact blast, friendly to you only.' },
  freezer: { name:'FREEZER',      cd:12500, speed:11.25, fuseMs:1580, radius:105, freezeMs:2500,
             gimmick:{id:'freezer_brittle_stasis',copy:'Throws a wall-stopped ice charge; frozen targets take half damage and the first hit thaws them.'},
             blurb:'Throws a fast moving ice charge. Its blast freezes exposed targets — including you — for 2.5s.' },
  redball: { name:'RED BALL',     cd:11000,
             gimmick:{id:'red_ball_decoy',copy:'A bouncing decoy attracts non-boss enemies and hurts on contact.'},
             blurb:'Bouncy decoy, lives 3s. Enemies chase it; light contact damage.' },
  beachball:{ name:'BEACH BALL',  cd:16000,
             gimmick:{id:'beach_ball_fission',copy:'A burning repulsor makes enemies flee and splits as it bounces.'},
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
