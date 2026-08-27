"use strict";

/* ---------------- upgrades ---------------- */
const MED_KILLS_REQUIRED=10, MED_DROP_KILLS_BASE=20, MED_STASH_MAX=5, TERA_HITS_REQUIRED=15, MED_CHANNEL_MS=8000;
let perks={dmg:1,rate:1,reload:1,mag:1,range:1,spd:1,maxhp:100,pierce:0,acc:1,velo:1,dash:0,autoAll:0,surge:0,secondWind:0,crit:0,noBloom:0,explode:0,medkitHeal:25,armor:1};
let perkCounts={}, upgradeChoices=[], upgradeRects=[], upgradeOffered=false;
let surgeT=0, windReadyWave=0, dashReadyT=0, sawFuel=100, sawLock=false, sawChargeUntil=0, sawChargeTick=0;
let flameFuel=100, flameLock=false, daggersOut=null, splitBalls=[], flames=[], comboStep=0, comboNextT=0, freezeFx=[];
let timeStopUntil=0, timeStopArm=0, fistFlurryUntil=0, fistNextT=0, teraHitCharge=15, parryUntil=0, parrySeq=0;
let abilityCD={}, quickReadyT=0, sawChargeDmg=28, sawChargeR=72;
let utilReadyT=0, medChan=0, medChanHeal=0, medKillCharge=MED_KILLS_REQUIRED, medDropKillAcc=0, medStash=0, balls=[], grenades=[], pearls=[], utilityOut=false;
const ABILITY_CD={scythe:9600, knife:4800, chainsaw:16000, hammer:8000, bdaggers:3000, terafists:0, twinsai:6400, warpwave:18000, timeturner:12000};
const TWIN_SAI_PARRY_MS=2500;
let wmods={}, utilMods={}, bossBounty=false;
function wm(k){ return wmods[k] || (wmods[k]={dmg:1,rate:1,mag:1,pellets:0,pierce:0,drain:1,cdAdd:1,slamR:1,range:1,fall:1,spread:1,arc:1}); }
function um(k){ return utilMods[k] || (utilMods[k]={cd:1}); }
function abilityCdOf(k){ return Math.max(1500, (ABILITY_CD[k]||0) * wm(k).cdAdd); }
function utilityCdOf(k){ return UTILITIES[k].cd*um(k).cd; }
function medKillsRequired(){ return Math.max(5,Math.ceil(MED_KILLS_REQUIRED*um('medkit').cd)); }
function medDropKillsRequired(){ return MED_DROP_KILLS_BASE; }
function teraHitsRequired(){ return Math.max(8,Math.ceil(TERA_HITS_REQUIRED*wm('terafists').cdAdd)); }
const ROMAN=['','I','II','III'];
const WEAPON_MODS=[];
const MOD_KEYS=[...new Set([...Object.keys(WEAPONS),...Object.keys(UTILITIES)])];
for(const k of MOD_KEYS){
  const isUtil=!!UTILITIES[k], isMelee=!isUtil&&!!WEAPONS[k].melee;
  const base=isUtil?'UTILITY CORE':isMelee?'MELEE EDGE':'WEAPON TUNING';
  for(let tier=1;tier<=3;tier++){
    const n=(isUtil?UTILITIES[k].name:WEAPONS[k].name)+' '+base+' '+ROMAN[tier];
    const prev=tier>1?(isUtil?UTILITIES[k].name:WEAPONS[k].name)+' '+base+' '+ROMAN[tier-1]:null;
    WEAPON_MODS.push({wkey:k,n,base,tier,req:prev,
      d:isUtil?(k==='medkit'?('needs '+[0,12,16,20][tier]+'% fewer kills'):('cooldown '+[0,12,16,20][tier]+'% faster')):
        isMelee?('+'+[0,12,16,20][tier]+'% damage, faster swing and ability'):
                ('+'+[0,12,16,20][tier]+'% damage, magazine and range'),
      f:()=>{
        if(isUtil) um(k).cd*=[0,.88,.84,.80][tier];
        else if(isMelee){ wm(k).dmg*=[0,1.12,1.16,1.20][tier]; wm(k).rate*=[0,.94,.91,.88][tier]; wm(k).cdAdd*=[0,.94,.91,.88][tier]; }
        else { wm(k).dmg*=[0,1.12,1.16,1.20][tier]; wm(k).mag*=[0,1.08,1.12,1.16][tier]; wm(k).range*=[0,1.06,1.09,1.12][tier]; }
      }});
  }
}
function availableEquipmentMods(keys){
  return WEAPON_MODS.filter(m=>keys.includes(m.wkey) && (!m.req||perkCounts[m.req]) && !perkCounts[m.n]);
}
const magSize = k => Math.round(WEAPONS[k].mag*perks.mag*wm(k).mag);
const TIER_CHAINS=[
  {n:'HOLLOW POINTS', ds:['+15% weapon damage','+20% more weapon damage','+25% more weapon damage'], fs:[()=>perks.dmg*=1.15,()=>perks.dmg*=1.20,()=>perks.dmg*=1.25]},
  {n:'TRIGGER JOB', ds:['+12% fire rate','+16% more fire rate','+20% more fire rate'], fs:[()=>perks.rate*=0.89,()=>perks.rate*=0.84,()=>perks.rate*=0.80]},
  {n:'LIGHT BOOTS', ds:['+10% move speed','+15% more move speed','+20% more move speed'], fs:[()=>perks.spd*=1.10,()=>perks.spd*=1.15,()=>perks.spd*=1.20]},
  {n:'SPEED LOADER', ds:['reload 20% faster','reload 25% faster again','reload 30% faster again'], fs:[()=>perks.reload*=0.80,()=>perks.reload*=0.75,()=>perks.reload*=0.70]},
  {n:'EXTENDED MAGS', ds:['+30% magazine size','+40% more magazine size','+50% more magazine size'], fs:[()=>perks.mag*=1.30,()=>perks.mag*=1.40,()=>perks.mag*=1.50]},
  {n:'MATCH BARREL', ds:['25% tighter spread','35% tighter spread again','removes recoil bloom'], fs:[()=>perks.acc*=0.75,()=>perks.acc*=0.65,()=>perks.noBloom=1]},
  {n:'KEVLAR WEAVE', ds:['take 20% less damage','take 25% less damage again','take 30% less and unlock Second Wind'], fs:[()=>perks.armor*=0.80,()=>perks.armor*=0.75,()=>{perks.armor*=0.70;perks.secondWind=1;}]},
  {n:'FRAG SHELLS', ds:['enemies explode on death','explosions deal +50% damage','explosions deal double damage'], fs:[()=>perks.explode=1,()=>perks.explode=1.5,()=>perks.explode=2]},
];
const UPGRADES=[];
for(const c of TIER_CHAINS) for(let tier=1;tier<=3;tier++){
  const n=c.n+' '+ROMAN[tier];
  UPGRADES.push({n,base:c.n,tier,d:c.ds[tier-1],f:c.fs[tier-1],once:true,
                 req:tier>1?c.n+' '+ROMAN[tier-1]:null});
}
function rollUpgrades(){
  const out=[];
  if(bossBounty){
    const mine=[loadout.primary, loadout.secondary, loadout.melee, loadout.utility].filter(Boolean);
    const mods=availableEquipmentMods(mine);
    while(out.length<4 && mods.length) out.push(mods.splice((Math.random()*mods.length)|0,1)[0]);
    if(out.length) return out;          // mod level: ONLY weapon mods, nothing else
    bossBounty=false;                   // no applicable mods left — fall back to perks
  }
  const pool=UPGRADES.filter(u => (!u.req || perkCounts[u.req]) && !(u.once && perkCounts[u.n]));
  while(out.length<4 && pool.length) out.push(pool.splice((Math.random()*pool.length)|0,1)[0]);
  return out;
}
function chooseUpgrade(i){
  const u=upgradeChoices[i]; if(!u) return;
  u.f(); perkCounts[u.n]=(perkCounts[u.n]||0)+1;
  bossBounty=false;
  sfx('pickup');
  waveMsg=u.n+' ACQUIRED'; waveMsgT=now+1800;
  state='play'; betweenTimer=2200;
  mouse.down=false; fireSuppressT=now+300;   // the click that chose the upgrade must not fire the gun
}
function clickUpgrade(){
  const inR=(r)=>r&&mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h;
  // if the powerups popup is already open on the upgrade screen, its clicks come first
  if(powerMenuOpen){ powerMenuClick(); return; }
  if(inR(upgradePowerRect)){ powerMenuOpen=true; sfx('swap'); return; }
  if(inR(upgradeAdRect)){ try{ window.open(LLR_URL,'_blank','noopener'); }catch(e){} sfx('swap'); return; }
  if(inR(upgradeDonateRect)){ try{ window.open(MOVES_URL,'_blank','noopener'); }catch(e){} sfx('swap'); return; }
  for(let i=0;i<upgradeRects.length;i++){
    const r=upgradeRects[i];
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){ chooseUpgrade(i); return; }
  }
}
function doDash(){
  if(!perks.dash || state!=='play' || now<dashReadyT) return;
  let dx=0,dy=0;
  if(keys['w'])dy--; if(keys['s'])dy++; if(keys['a'])dx--; if(keys['d'])dx++;
  if(!dx&&!dy){ const a=aimAngle(); dx=Math.cos(a); dy=Math.sin(a); }
  const m=Math.hypot(dx,dy);
  player.ddx=dx/m; player.ddy=dy/m;
  player.dashSpd=14; player.dashUntil=now+150; dashReadyT=now+2200;
  player.hurtCd=Math.max(player.hurtCd,320);           // i-frames
  for(let i=0;i<10;i++) particles.push({x:player.x,y:player.y,
    vx:-player.ddx*rand(1,3)+rand(-0.8,0.8), vy:-player.ddy*rand(1,3)+rand(-0.8,0.8),
    life:300,max:300,col:'#a7c15e',size:2.5});
  noiseBurst(0.1,0.2,800);
}
function menuClick(){
  const hit=o=>o && mouse.x>=o.x && mouse.x<=o.x+o.w && mouse.y>=o.y && mouse.y<=o.y+o.h;
  if(hit(menuRects.resume)){ menuOpen=false; sfx('swap'); return; }
  if(hit(menuRects.account)){
    if(authUser&&typeof openAccountSettings==='function')openAccountSettings(); // keep GAME MENU paused behind Settings
    else if(typeof toggleAuth==='function')void toggleAuth(); // keep GAME MENU paused behind sign-in
    sfx('swap');return;
  }
  if(hit(menuRects.report)){ openReport(); sfx('swap'); return; }
  if(hit(menuRects.exit)){
    if(typeof isPartyCpuMatch==='function'&&isPartyCpuMatch()){ partyCpuAbort('You left the Party CPU match.',true); sfx('swap'); return; }
    if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()){ offlineCpu2v2Leave('Left Offline 2v2.',false); sfx('swap'); return; }
    if(isBotArena()){ leaveArena('Left Offline 1v1.',false); sfx('swap'); return; }
    if(practiceMode==='arena'){ leaveArena('You left the Arena.',true); sfx('swap'); return; }
    const returnPage=tutorialOn?'howto':practiceMode?(soloPractice?(practiceReturnPage||'practice'):'practice'):'hub';
    menuOpen=false; state='select'; selPage=returnPage; practiceMode=null; tutorialTeardown(); restoreTryLoadout(); aiming=false; rmbAim=false; sfx('swap'); return;
  }
  if(hit(menuRects.music)){ dragSlider='music'; setSliderFromMouse(); return; }
  if(hit(menuRects.sfx)){ dragSlider='sfx'; setSliderFromMouse(); return; }
}
function setSliderFromMouse(){
  const o=menuRects[dragSlider]; if(!o) return;
  const v=clamp((mouse.x-o.x)/o.w, 0, 1);
  if(dragSlider==='music'){ musicVol=v; if(musicGain) musicGain.gain.value=v*0.7; }
  else { sfxVol=v; if(sfxGain) sfxGain.gain.value=v; }
  saveMeta();                                        // volumes follow the account too
}
// pull every vault weapon/utility into the live rosters so all categories show everything
function injectVault(){
  for(const k in VAULT_WEAPONS){
    if(!WEAPONS[k]) WEAPONS[k]=VAULT_WEAPONS[k];
    const slot=VAULT_SLOTS[k];
    const r = slot==='primary'?PRIMARIES : slot==='secondary'?SECONDARIES : slot==='melee'?MELEES : null;
    if(r && !r.includes(k)) r.push(k);
    if(!WKEYS.includes(k)) WKEYS.push(k);
  }
  for(const k in VAULT_UTILITIES){
    if(!UTILITIES[k]) UTILITIES[k]=VAULT_UTILITIES[k];
    if(!UTILKEYS.includes(k)) UTILKEYS.push(k);
  }
}
function setTestMode(on){
  if(on && !isAdmin()){ testMode=false; syncFallAccess(); sfx('dry'); return; }
  testMode=!!on;
  if(testMode){ adminUsed=true; injectVault(); }     // admin-only: every weapon free and usable for testing
  else for(const k in VAULT_SLOTS)
    if(FALL_KEYS.includes(k) || !savedWeaponPublished(k)) unpublishVaultKey(k); // restore public roster
  syncFallAccess();
  waveMsg='\uD83E\uDDEA TEST MODE '+(testMode?'ON \u2014 every weapon free':'OFF'); waveMsgT=now+1600;
}
function isStorageKey(k){ return !!(VAULT_WEAPONS[k] || VAULT_UTILITIES[k]); }
