"use strict";

/* ---------------- combat ---------------- */
function switchWeapon(k){
  if(!k || !WEAPONS[k]) return;                       // sparse single-item Practice loadouts have empty hotkeys
  if(k!==loadout.primary && k!==loadout.secondary && k!==loadout.melee) return;
  if(state!=='play') return;
  if(typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen()){sfx('dry');return;}
  if(typeof isLocked==='function'&&isLocked(k)){
    if(typeof dropUnownedFromLoadout==='function')dropUnownedFromLoadout();
    cancelFanTheHammer();sfx('dry');return;
  }
  resetFireCadence();
  cancelFanTheHammer();
  cancelMedHeal();                                   // swapping away always interrupts either Medkit heal
  if(utilityOut){                                     // stow the utility, even back to the same gun
    utilityOut=false; player.equipEnd=now+weaponEquipMs(k); player.animT=now; sfx('swap');
    if(k===player.cur) return;
  }
  if(k===player.cur) return;
  player.cur=k; player.reloadEnd=0; player.equipEnd=now+weaponEquipMs(k); player.bloom=0;
  player.animT=now;                                  // equip flourish (cosmetic only)
  aiming=false; rmbAim=false;
  if(tutorialOn){
    if(typeof tutorialRecordWeaponSwitch==='function') tutorialRecordWeaponSwitch();
    else tutSwapped=true;
  }
  sfx('swap');
}
function cycleWeapon(){
  const guns=[loadout.primary,loadout.secondary].filter(k=>k&&WEAPONS[k]);
  if(guns.length){
    // Preserve Q's original primary/secondary toggle. With one gun, safely
    // select that same gun (which can still stow a visible utility).
    switchWeapon(player.cur===guns[0]&&guns.length>1?guns[1]:guns[0]);
    return;
  }
  if(loadout.melee&&WEAPONS[loadout.melee]) switchWeapon(loadout.melee);
}
function spawnTwinSaiReflection(x,y,damage,meta){
  meta=meta||{};
  const reflectedDamage=clamp(+damage||0,0,ARENA_HP);if(!reflectedDamage)return null;
  // A parry is a real projectile, not guaranteed damage. Start it at the
  // interception point and use the live crosshair so changing aim between
  // incoming rounds changes each reflected round's path.
  const target=screenToWorld(mouse.x,mouse.y),bounds=activeArenaBounds();
  target.x=clamp(target.x,bounds.left+1,bounds.right-1);
  target.y=clamp(target.y,bounds.top+1,bounds.bottom-1);
  const a=Math.atan2(target.y-y,target.x-x),rootHitId=String(meta.rootHitId||'').slice(0,120);
  const reflected={x,y,vx:Math.cos(a)*22,vy:Math.sin(a)*22,dmg:reflectedDamage,pierce:2,
    life:900,rng:900,dist:0,fall:1,fg:4,col:'#bfe8ff',weapon:'twinsai',parryReflect:true,
    parryRootHitId:rootHitId,parryDepth:1};
  bullets.push(reflected);return reflected;
}
function meleeSwing(w, mul, flurryGenerated=false){
  if(player.equipEnd>now) return;                    // still drawing the weapon
  if(tutorialOn&&typeof tutorialRecordMeleeSwing==='function') tutorialRecordMeleeSwing();
  const arc=w.arc*wm(player.cur).arc;
  let base=aimAngle();
  let swingSide=1;
  // Combo weapons alternate the visible slash. Twin Sai collision stays
  // centered on the crosshair; wide Burning Dagger swings keep their offset.
  if(w.combo){
    swingSide=(comboStep%2===0)?-1:1;
    if(!w.sai)base+=swingSide*arc*0.5;
    comboStep++;
    comboNextT = (comboStep%2===1) ? now+110 : 0;   // queue the second half of the combo
  }
  player.swingT=now; player.swingA=base; player.swingSide=swingSide; player.swingArc=arc; player.swingR=w.range;
  player.swingDur=clamp(w.fireRate*0.55, 90, 260);   // faster weapons = snappier visible swing
  if(typeof arenaBroadcastMelee==='function')arenaBroadcastMelee(player.cur,base,arc,w.range,player.swingDur,swingSide);
  const targets=[];
  for(const e of enemies){
    const d=Math.hypot(e.x-player.x, e.y-player.y);
    if(d > w.range+e.r) continue;   // melee range
    let da=Math.atan2(e.y-player.y, e.x-player.x)-base;
    da=Math.atan2(Math.sin(da),Math.cos(da));
    if(Math.abs(da) <= arc/2 + Math.asin(Math.min(1,e.r/(d+1)))*0.8) targets.push(e);
  }
  let arenaMeleeHit=false;
  if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()&&arenaCanAct()){
    for(const e of partyCpuMatch.bots.filter(b=>b.team==='B'&&b.hp>0)){
      const er=e.r||15,d=Math.hypot(e.x-player.x,e.y-player.y); if(d>w.range+er)continue;
      let da=Math.atan2(e.y-player.y,e.x-player.x)-base;da=Math.atan2(Math.sin(da),Math.cos(da));
      const clear=typeof arenaMeleeLineClear!=='function'||arenaMeleeLineClear(player.x,player.y,e.x,e.y);
      if(clear&&Math.abs(da)<=arc/2+Math.asin(Math.min(1,er/(d+1)))*.8){
        partyCpuHitBot(e,w.dmg*perks.dmg*wm(player.cur).dmg*mul,'melee');arenaMeleeHit=true;
        if(player.cur==='terafists'&&!flurryGenerated) teraHitCharge=Math.min(teraHitsRequired(),teraHitCharge+1);
      }
    }
  } else if(practiceMode==='arena'&&arenaCanAct()&&arena.opponent){
    const e=arena.opponent, er=e.r||15, d=Math.hypot(e.x-player.x,e.y-player.y);
    if(d<=w.range+er){
      let da=Math.atan2(e.y-player.y,e.x-player.x)-base;
      da=Math.atan2(Math.sin(da),Math.cos(da));
      const clear=typeof arenaMeleeLineClear!=='function'||arenaMeleeLineClear(player.x,player.y,e.x,e.y);
      if(clear&&Math.abs(da)<=arc/2+Math.asin(Math.min(1,er/(d+1)))*0.8){
        arenaHitOpponent(w.dmg*perks.dmg*wm(player.cur).dmg*mul,'melee');
        if(player.cur==='terafists'&&!flurryGenerated) teraHitCharge=Math.min(teraHitsRequired(),teraHitCharge+1);
        arenaMeleeHit=true; burst(e.x,e.y,'#d05548',5,3);
      }
    }
  }
  for(const e of targets){
    if(!enemies.includes(e)) continue;          // may already be gone via frag chains
    if(player.cur==='terafists' && !flurryGenerated && practiceMode!=='arena')
      teraHitCharge=Math.min(teraHitsRequired(),teraHitCharge+1);
    let hdmg=w.dmg*perks.dmg*wm(player.cur).dmg*mul, wasCrit=false;
    if(perks.crit && Math.random()<perks.crit){ hdmg*=3; wasCrit=true; burst(e.x,e.y,'#ffe08a',8,4); }
    damageEnemy(e,hdmg*freezeHit(e),{crit:wasCrit}); e.hitT=now+70;
    if(w.fire) igniteEnemy(e, 0);                   // burning daggers ignite on swing
    if(w.fists && now<fistFlurryUntil) player.hp=Math.min(perks.maxhp, player.hp + hdmg*0.125);   // flurry lifesteal: 12.5% of damage dealt
    const d=Math.hypot(e.x-player.x,e.y-player.y)||1;
    const kb = e.stunUntil>now ? 0 : (ETYPES[e.type].boss ? 3 : 14);   // stunned: rooted even when hit
    e.x+=(e.x-player.x)/d*kb; e.y+=(e.y-player.y)/d*kb;      // knockback
    burst(e.x,e.y,ETYPES[e.type].col,5,3);
    if(e.hp<=0) killEnemy(enemies.indexOf(e));
  }
  // melee also swats incoming homing missiles out of the swing arc
  for(let m=ebullets.length-1;m>=0;m--){
    const mb=ebullets[m];
    if(!mb.h) continue;
    const d=Math.hypot(mb.x-player.x, mb.y-player.y);
    if(d > w.range+mb.r+10) continue;
    let da=Math.atan2(mb.y-player.y, mb.x-player.x)-base;
    da=Math.atan2(Math.sin(da),Math.cos(da));
    if(Math.abs(da) <= arc/2 + 0.3){ burst(mb.x,mb.y,'#ff9a4a',10,4); ebullets.splice(m,1); }
  }
  if(targets.length||(arenaMeleeHit&&!(typeof isCpuTeamArena==='function'&&isCpuTeamArena()))) sfx('hit');
  addShake(w.kick); sfx('slash');
}
function equipUtility(){
  if(state!=='play' || !loadout.utility) return;
  if((typeof arenaUtilityUseAllowed==='function'&&!arenaUtilityUseAllowed())||
     (typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen())){sfx('dry');return;}
  if(typeof isLocked==='function'&&isLocked(loadout.utility)){
    if(typeof dropUnownedFromLoadout==='function')dropUnownedFromLoadout();sfx('dry');return;
  }
  resetFireCadence();
  cancelFanTheHammer();
  utilityOut=true;
  player.equipEnd=now+EQUIP_WAIT; aiming=false; rmbAim=false;
  if(tutorialOn&&typeof tutorialRecordUtilityEquipped==='function')tutorialRecordUtilityEquipped();
  sfx('swap');
}
function cancelMedHeal(){
  if(!medChan && !medChanHeal) return false;
  medChan=0; medChanHeal=0; medHealPct=0;
  return true;
}
// A successful heal spends the one ready charge; kills refill it for the next use.
function medBlocked(){
  if(medChan || medChanHeal) return 'busy';
  if(medKillCharge < medKillsRequired()) return 'charging';
  if(player.hp>=perks.maxhp) return 'full';
  return '';
}
function medDeny(why){
  sfx('dry');
  if(why==='charging'){
    const left=Math.max(0,medKillsRequired()-medKillCharge);
    waveMsg='\u2695 MEDKIT \u2014 KILL '+left+' MORE ENEM'+(left===1?'Y':'IES'); waveMsgT=now+1400;
  } else if(why==='busy'){
    waveMsg='\u2695 MEDKIT \u2014 HEAL ALREADY ACTIVE'; waveMsgT=now+1000;
  } else if(why==='full'){
    waveMsg='\u2695 MEDKIT \u2014 INTEGRITY FULL'; waveMsgT=now+1000;
  }
}
// Dropped world medkits are an Endless inventory item, separate from the
// equipped Field Medkit's kill recharge. They can be carried with any loadout.
function collectDroppedMedkit(){
  if(medStash>=MED_STASH_MAX) return false;
  medStash++;
  waveMsg='\u2695 MEDKIT STORED  '+medStash+'/'+MED_STASH_MAX+'  \u00b7  H TO USE'; waveMsgT=now+1800;
  burst(player.x,player.y,'#f2f2ee',10,3); sfx('pickup');
  if(tutorialOn&&typeof tutorialRecordMedkitCollected==='function') tutorialRecordMedkitCollected();
  return true;
}
function useStashedMedkit(){
  if(state!=='play') return false;
  if(medStash<=0){
    waveMsg='\u2695 MEDKIT STASH EMPTY'; waveMsgT=now+1100; sfx('dry'); return false;
  }
  if(player.hp>=perks.maxhp){
    waveMsg='\u2695 MEDKIT \u2014 INTEGRITY FULL'; waveMsgT=now+1100; sfx('dry'); return false;
  }
  medStash--;
  const before=player.hp;
  player.hp=Math.min(perks.maxhp,player.hp+perks.medkitHeal);
  waveMsg='\u2695 MEDKIT USED  +'+Math.ceil(player.hp-before)+' HP  \u00b7  '+medStash+' LEFT'; waveMsgT=now+1500;
  burst(player.x,player.y,'#5ec46a',16,4); sfx('pickup');
  if(tutorialOn&&typeof tutorialRecordMedkitUsed==='function') tutorialRecordMedkitUsed();
  return true;
}
function medFinish(){         // spend the ready charge: quick-heal start or long-heal completion
  medKillCharge=0;
}
function medQuick(){          // E / G: the fast heal, 5% over 1s
  if((typeof arenaUtilityUseAllowed==='function'&&!arenaUtilityUseAllowed())||
     (typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen())){sfx('dry');return;}
  const why=medBlocked(); if(why){ medDeny(why); return; }
  medFinish();                // it grants health immediately over time, so cancellation cannot refund the charge
  medChanHeal=now+1000; medHealPct=0.05;
  if(typeof arenaBroadcastUtility==='function')arenaBroadcastUtility('medkit',{action:'quick'});
  sfx('aim');
}
function medChannelStart(){   // equipped LMB: repeated held/touch events do not toggle it back off
  if(medChan) return;
  if((typeof arenaUtilityUseAllowed==='function'&&!arenaUtilityUseAllowed())||
     (typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen())){sfx('dry');return;}
  const why=medBlocked(); if(why){ medDeny(why); return; }
  medChan=now;
  if(typeof arenaBroadcastUtility==='function')arenaBroadcastUtility('medkit',{action:'channel'});
  waveMsg='\u2695 FIELD MEDKIT \u2014 healing'; waveMsgT=now+1000;
}
function utilQuick(){         // G (or E/LMB-tap when equipped): instant cast at the crosshair
  if(state!=='play' || !loadout.utility) return;
  if((typeof arenaUtilityUseAllowed==='function'&&!arenaUtilityUseAllowed())||
     (typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen())){sfx('dry');return;}
  if(typeof isLocked==='function'&&isLocked(loadout.utility)){
    if(typeof dropUnownedFromLoadout==='function')dropUnownedFromLoadout();sfx('dry');return;
  }
  if(loadout.utility==='medkit'){ medQuick(); return; }
  utilCast(loadout.utility);
}
function utilCast(u){
  if((typeof arenaUtilityUseAllowed==='function'&&!arenaUtilityUseAllowed())||
     (typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen())){sfx('dry');return;}
  if(typeof isLocked==='function'&&isLocked(u)){
    if(typeof dropUnownedFromLoadout==='function')dropUnownedFromLoadout();sfx('dry');return;
  }
  if(now < utilReadyT){ sfx('dry'); return; }
  if(u==='grenade'){
    const a=aimAngle();
    const thrown={x:player.x,y:player.y,vx:Math.cos(a)*14,vy:Math.sin(a)*14,t:now+950,
      arenaUtility:typeof isCasualOnlineArena==='function'&&isCasualOnlineArena()};
    grenades.push(thrown);
    if(thrown.arenaUtility&&typeof arenaBroadcastUtility==='function')
      arenaBroadcastUtility('grenade',{x:thrown.x,y:thrown.y,angle:a});
    utilReadyT=now+utilityCdOf('grenade'); sfx('swap');
    if(tutorialOn&&typeof tutorialRecordUtilityUsed==='function')tutorialRecordUtilityUsed();
  } else if(u==='freezer'){
    const sw=swayScreen();
    const t=screenToWorld(mouse.x+sw.x, mouse.y+sw.y);      // freeze lands at the crosshair
    const bounds=activeArenaBounds();t.x=clamp(t.x,bounds.left,bounds.right);t.y=clamp(t.y,bounds.top,bounds.bottom);
    const R=WEAPONS.chainsaw.range*2;                        // 2x chainsaw attack range
    freezeFx.push({x:t.x, y:t.y, r:R, t:now});               // visual ring
    for(const e of enemies){
      if(dist2(e.x,e.y,t.x,t.y) < R*R){
        e.frozenUntil = now+5000;                            // 5s freeze
        burst(e.x,e.y,'#9fe6ff',6,3);
      }
    }
    if(typeof arenaBroadcastUtility==='function')arenaBroadcastUtility('freezer',{x:t.x,y:t.y});
    utilReadyT=now+utilityCdOf('freezer'); sfx('pickup');      // 25s recharge
  } else if(u==='portal'){
    // ENDER PEARL: hurl a warp pearl toward the crosshair; you teleport to wherever it lands
    const a=aimAngle();
    pearls.push({x:player.x, y:player.y, vx:Math.cos(a)*10, vy:Math.sin(a)*10,
                 dist:0, rng:WEAPONS.fireworks.range});    // max range = firework launcher (620)
    utilReadyT=now+utilityCdOf('portal'); sfx('swap');
  } else if(u==='timecapsule'){
    ebullets.length=0;                                    // wipe every projectile off the field
    timeStopUntil=now+15000; timeStopArm=player.moveT||0; // moving breaks the stillness
    burst(player.x,player.y,'#7fd8ff',24,6); addShake(4);
    waveMsg='\u23F3 TIME CAPSULE \u2014 don\u0027t move'; waveMsgT=now+2400;
    utilReadyT=now+utilityCdOf('timecapsule'); sfx('pickup');
  } else if(u==='redball'){
    const a=aimAngle();
    // launch it out ahead of you so the swarm it lures gathers away from your position
    const sx=player.x+Math.cos(a)*90, sy=player.y+Math.sin(a)*90;
    const ball={x:sx,y:sy,vx:Math.cos(a)*6,vy:Math.sin(a)*6,life:3000,hitT:0,taunt:750,
      arenaUtility:typeof isCasualOnlineArena==='function'&&isCasualOnlineArena()};
    clampProjectileToArena(ball,9); balls.push(ball);
    if(ball.arenaUtility&&typeof arenaBroadcastUtility==='function')ball.utilitySeed=arenaBroadcastUtility('redball',ball)||'';
    utilReadyT=now+utilityCdOf('redball'); sfx('swap');
  } else if(u==='beachball'){
    const a=aimAngle();
    const sx=player.x+Math.cos(a)*80, sy=player.y+Math.sin(a)*80;
    // flaming repel-ball: lives 3s, splits into 2 every 1s, 3 generations
    const ball={x:sx,y:sy,vx:Math.cos(a)*5,vy:Math.sin(a)*5,life:3000,hitT:0,
                flee:true, fire:true, dmg:8, gen:0, splitT:now+1000,
                arenaUtility:typeof isCasualOnlineArena==='function'&&isCasualOnlineArena()};
    clampProjectileToArena(ball,11); balls.push(ball);
    if(ball.arenaUtility&&typeof arenaBroadcastUtility==='function')ball.utilitySeed=arenaBroadcastUtility('beachball',ball)||'';
    utilReadyT=now+utilityCdOf('beachball'); sfx('swap');
  }
}
function spendMedCharge(n){ /* medkit is infinite-use: charges never deplete */ }
function utilRelease(){
  // the slow heal is press-to-start now, so letting go of the mouse must not cancel it
}
let medHealPct=0;
function quickMelee(){
  if(state!=='play' || !loadout.melee) return;
  if(typeof isLocked==='function'&&isLocked(loadout.melee)){
    if(typeof dropUnownedFromLoadout==='function')dropUnownedFromLoadout();sfx('dry');return;
  }
  if(practiceMode==='arena'&&!arenaCanAct()){ sfx('dry'); return; }
  if(typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen()){sfx('dry');return;}
  cancelMedHeal();
  cancelFanTheHammer();
  const stowedUtility=utilityOut;
  utilityOut=false;
  const saved=player.cur, savedEquip=player.equipEnd;
  const meleeKey=loadout.melee;
  player.cur=meleeKey;
  player.equipEnd=0;
  meleeAbility();
  player.cur=saved;
  player.equipEnd=stowedUtility?now+weaponEquipMs(saved):savedEquip;
  if(stowedUtility) player.animT=now;
}

function startReload(){
  if(typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen()){sfx('dry');return;}
  if(typeof isLocked==='function'&&isLocked(player.cur)){
    if(typeof dropExpiredTemporaryLoadout==='function')dropExpiredTemporaryLoadout([player.cur]);
    sfx('dry');return;
  }
  const w=WEAPONS[player.cur];
  if(w.melee) return;
  if(w.cell) return;                                 // battery weapons recharge on their own
  if(player.reloadEnd>now || player.mags[player.cur]>=magSize(player.cur)) return;
  if(player.reserve[player.cur]<=0){ sfx('dry'); return; }
  resetFireCadence();
  cancelFanTheHammer();
  player.reloadEnd = now + w.reload*perks.reload;
  aiming=false; rmbAim=false;
  sfx('reload');
}
function tryFire(carryCadence=false){
  if(state!=='play' || now<fireSuppressT) return false;
  if(practiceMode==='arena' && !arenaCanAct()) return false;
  if(typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen())return false;
  if(typeof isLocked==='function'&&isLocked(player.cur)){
    if(typeof dropExpiredTemporaryLoadout==='function')dropExpiredTemporaryLoadout([player.cur]);
    resetFireCadence();sfx('dry');return false;
  }
  const w=WEAPONS[player.cur];
  if(player.reloadEnd>now || player.equipEnd>now) return false;
  const preShotMag=player.mags[player.cur];
  const frenzyMul=Number.isFinite(+w.frenzyAt)&&preShotMag<=+w.frenzyAt
    ? (Number.isFinite(+w.frenzyRateMul)?+w.frenzyRateMul:1) : 1;
  const shotInterval=w.fireRate*frenzyMul*perks.rate*wm(player.cur).rate*(now<surgeT?0.77:1);
  // Quickdraw has a per-M9 cadence clock: a primary shot must not secretly
  // extend its advertised 120ms draw, while two M9 shots still respect 200ms.
  const weaponCadence=Number.isFinite(+w.quickdrawMs);
  const cadenceLastShot=weaponCadence
    ? (Number.isFinite(+weaponLastShotAt[player.cur])?+weaponLastShotAt[player.cur]:-Infinity)
    : player.lastShot;
  if(now-cadenceLastShot<shotInterval) return false;
  // Held automatic fire keeps the fractional timer remainder instead of losing
  // it to the 60 Hz step. Fresh presses and shots after an idle gap still fire now.
  const shotStamp=carryCadence&&cadenceLastShot>0&&now-cadenceLastShot<shotInterval*4
    ? cadenceLastShot+shotInterval : now;
  if(w.melee){
    if(w.combo && daggersOut){ sfx('dry'); return false; }   // can't swing while daggers are thrown
    if(w.saw){
      if(sawLock || sawFuel<=0){ sawLock=true; player.lastShot=now; sfx('dry'); return false; }
      sawFuel=Math.max(0, sawFuel-w.drain*wm('chainsaw').drain);
      player.lastSaw=now;
      if(sawFuel<=0) sawLock=true;
    }
    player.lastShot=shotStamp;
    meleeSwing(w, 1);
    return true;
  }
  if(player.mags[player.cur]<1){
    player.lastShot=now; sfx('dry'); if(!w.cell) startReload(); return false;
  }
  // fireworks: lobbed firecracker that detonates at the crosshair (within range)
  if(w.firework){
    player.lastShot=shotStamp; player.mags[player.cur]--; if(tutorialOn) tutFired++;
    const sw=swayScreen();
    const tw=screenToWorld(mouse.x+sw.x, mouse.y+sw.y);
    const playBounds=activeArenaBounds();
    const targetX=clamp(tw.x,playBounds.left+12,playBounds.right-12);
    const targetY=clamp(tw.y,playBounds.top+12,playBounds.bottom-12);
    let tdx=targetX-player.x, tdy=targetY-player.y;
    let tdist=Math.hypot(tdx,tdy)||1;
    const maxR=w.range;                                  // do NOT exceed the weapon's range
    if(tdist>maxR){ tdx*=maxR/tdist; tdy*=maxR/tdist; tdist=maxR; }
    const tx=player.x+tdx, ty=player.y+tdy;
    const a=Math.atan2(tdy,tdx);
    const flight=480;                                    // fixed fuse: same detonation time near or far
    const spd=(tdist/flight)*16;                         // scale speed so it always arrives in `flight` ms
    const fireworkShot={x:player.x, y:player.y, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
                        t:now+flight, firework:true, tx, ty};
    grenades.push(fireworkShot);
    // Online damage stays sender-authoritative. This separate packet only lets
    // the opponent simulate the already-fired firecracker as a harmless cue.
    if(typeof arenaBroadcastFirework==='function')arenaBroadcastFirework(player.cur,fireworkShot);
    player.flash=now+55; sfx('shoot',w,player.cur);
    return true;
  }
  const shotWeapon=player.cur;
  const focusedShot=Number.isFinite(+w.focusMs)&&
    (!Number.isFinite(+weaponLastShotAt[shotWeapon])||now-weaponLastShotAt[shotWeapon]>=+w.focusMs);
  const startsFan=!!(w.fan&&aiming&&fanShots<=0&&now>=fanBurstUntil);
  const fanRound=!!(w.fan&&(startsFan||fanShots>0));
  player.lastShot=shotStamp;
  weaponLastShotAt[shotWeapon]=shotStamp;
  player.mags[shotWeapon]--; if(tutorialOn) tutFired++;
  // An aimed Python trigger empties exactly the magazine that was loaded when
  // the fan began. Follow-ups use the same real firing path, but ammo added
  // later cannot extend the captured volley or recursively start another one.
  if(startsFan){
    fanShots=Math.max(0,Math.floor(+player.mags[shotWeapon]||0));
    fanNextT=now+(+w.fanGapMs||115);
    fanBurstUntil=now+(+w.fanLockMs||900);
  }
  const base=aimAngle();
  const sp=focusedShot?w.aimSpread*wm(shotWeapon).spread*perks.acc:effSpread();
  const shotStart=bullets.length;
  const unscopedShot=shotWeapon==='sniper'&&!aiming;
  for(let i=0;i<w.pellets+wm(player.cur).pellets;i++){
    const a = base + (Math.random()-0.5)*2*sp;
    const tx = player.x + Math.cos(base)*6, ty = player.y + Math.sin(base)*6; // spawn at body, not muzzle: point-blank shots connect
    const bulletSpeed=weaponBulletSpeed(player.cur)*perks.velo;
    bullets.push({ x:tx, y:ty, vx:Math.cos(a)*bulletSpeed, vy:Math.sin(a)*bulletSpeed,
                   dmg:w.dmg*(fanRound?(+w.fanDmgMul||1):1)*perks.dmg*wm(player.cur).dmg, pierce:(w.pierce||0)+perks.pierce+wm(player.cur).pierce,
                   life: weaponBulletLife(player.cur,w.range>2000 ? 6000 : 1200), // faster travel, same max distance
                   rng:w.range*wm(player.cur).range*perks.range, fall:1-(1-w.fall)*wm(player.cur).fall, dist:0,
                   bounce: w.bounce||0, fire: !!w.fire, poison:!!w.poison, fg:w.fg||0, wv:!!w.wave, ox:tx, oy:ty, ba:a, chrono:!!w.chrono,
                   wamp: w.wave ? 24*(1+0.5*Math.sin(now/700)) : 0, wk: w.wave ? 0.05*(1+0.4*Math.sin(now/1100+2)) : 0,
                   col:weaponColor(player.cur, w.tracer||null),weapon:shotWeapon,unscopedShot,
                   focusedShot,phaseWalls:Math.max(0,Math.floor(+w.phaseWalls||0)),phaseWallActive:false,
                   closeRange:Number.isFinite(+w.closeRange)?+w.closeRange:0,closeMult:Number.isFinite(+w.closeMult)?+w.closeMult:1 });
  }
  if(Number.isFinite(+w.selfRecoil)&&w.selfRecoil>0){
    player.x-=Math.cos(base)*w.selfRecoil;
    player.y-=Math.sin(base)*w.selfRecoil;
    clampActorToArena(player); collideRects(player); clampActorToArena(player);
  }
  const spawnedShot=bullets.slice(shotStart);
  const partyShotSent=typeof partyCpuBroadcastPlayerShot==='function'&&partyCpuBroadcastPlayerShot(player.cur,spawnedShot);
  if(!partyShotSent&&typeof arenaBroadcastShot==='function')arenaBroadcastShot(player.cur,spawnedShot);
  if(!perks.noBloom) player.bloom = Math.min(0.24, player.bloom + w.kick*0.013);
  player.flash = now + 55;
  addShake(w.kick*0.8);
  sfx('shoot',w,shotWeapon);
  if(player.mags[player.cur]<1 && !w.cell) startReload();
  if(w.cell) player.mags[player.cur]=Math.floor(player.mags[player.cur]);   // keep the readout whole
  return true;
}

/* ---------------- update ---------------- */
function update(dtms){
  const dt = dtms/16.667;
  const w = WEAPONS[player.cur];

  // survival coins: a slow trickle for staying alive (real games only): 2 coins per minute
  if(!practiceMode && state==='play'){
    coinTimeAcc += dtms;
    while(coinTimeAcc >= 60000){ coinTimeAcc -= 60000; addCoins(1); }   // 1 coin every 60s -> 1/min (halved)
  }

  // reload completion
  if(player.reloadEnd && now>=player.reloadEnd){
    const cap=magSize(player.cur);
    const take=Math.min(cap-player.mags[player.cur], player.reserve[player.cur]);
    player.mags[player.cur]+=take; player.reserve[player.cur]-=take;
    player.reloadEnd=0; sfx('loaded');
    if(tutorialOn){
      if(typeof tutorialRecordReloadCompleted==='function') tutorialRecordReloadCompleted();
      else tutReloaded=true;
    }
  }
  // chainsaw battery: slow recharge, hard lockout when drained
  if(sawFuel<100 && now-(player.lastSaw||0)>600){
    sawFuel=Math.min(100, sawFuel + 7*dtms/1000);
    if(sawLock && sawFuel>=100){ sawLock=false; sfx('loaded'); }
  }
  // battery weapons (warpwave): cells trickle back once you stop firing
  for(const k of WKEYS){
    const wk=WEAPONS[k];
    if(!wk || !wk.cell) continue;
    const cap=magSize(k);
    if(player.mags[k]>=cap) continue;
    if(k===player.cur && now-(player.lastShot||0) < wk.cellDelay) continue;   // held weapon must idle first
    const was=player.mags[k];
    player.mags[k]=Math.min(cap, player.mags[k] + wk.cellRegen*dtms/1000);
    if(k===player.cur && was<1 && player.mags[k]>=1) sfx('loaded');           // back in business
  }
  // time capsule shatters the moment you move
  if(now<timeStopUntil && (player.moveT||0)!==timeStopArm){
    timeStopUntil=now;
    waveMsg='\u23F3 TIME RESUMED'; waveMsgT=now+1200; sfx('hit');
  }
  // tera fists flurry: rapid consecutive punches
  if(now<fistFlurryUntil && state==='play' && loadout.melee==='terafists' && now>=fistNextT){
    fistNextT=now+90;
    const held=player.cur, heldEquip=player.equipEnd;
    player.cur='terafists'; player.equipEnd=0;
    meleeSwing(WEAPONS.terafists, 1, true);           // Flurry's own punches cannot recharge Flurry
    player.cur=held; player.equipEnd=heldEquip;
  }
  // revolver fan-the-hammer: rapid follow-up shots
  if(fanShots>0 && now>=fanNextT){
    if(state==='play' && player.cur==='revolver' && player.mags.revolver>0 && player.reloadEnd<=now){
      const rw=WEAPONS.revolver;
      player.lastShot = now - rw.fireRate*perks.rate*wm('revolver').rate;   // bypass the slow hammer
      if(tryFire()){
        fanShots=Math.max(0,fanShots-1);
        if(fanShots>0)fanNextT=now+(+rw.fanGapMs||115);
        else cancelFanTheHammer();
      } else cancelFanTheHammer();
    } else cancelFanTheHammer();
  }
  // full-auto
  if(!utilityOut && (w.auto || perks.autoAll) && mouse.down){
    if(tryFire(mouseFireCadence)&&player.reloadEnd<=now) mouseFireCadence=true;
  }

  // movement
  let mx=0,my=0;
  if(keys['w'])my--; if(keys['s'])my++; if(keys['a'])mx--; if(keys['d'])mx++;
  if(mx||my) player.moveT=now;
  if(sticks.move.id!==null){ mx=sticks.move.dx/STICK_R; my=sticks.move.dy/STICK_R; }
  if(now < player.dashUntil){
    const dx=player.ddx*(player.dashSpd||14)*dt,dy=player.ddy*(player.dashSpd||14)*dt;
    let moved=true;
    if(typeof moveActorSwept==='function') moved=moveActorSwept(player,dx,dy);
    else { player.x+=dx;player.y+=dy; }
    if(!moved) player.dashUntil=now;                 // Scythe and other dashes stop at the first wall
  } else if((mx||my)&&!(typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen())){
    const m=Math.max(1,Math.hypot(mx,my));
    const surgeMul = now<surgeT ? 1.3 : 1;
    const healMul = (medChan||medChanHeal) ? 0.9 : 1;
    const aimMove=Number.isFinite(+w.aimMoveMul)?+w.aimMoveMul:0.45;
    const spd = player.spd * perks.spd * surgeMul * healMul * w.moveMod * (aiming?aimMove:1) * dt;
    player.x += mx/m*spd; player.y += my/m*spd;
  }
  clampActorToArena(player);
  collideRects(player);
  clampActorToArena(player);
  if(isArenaMapBattlefield()) arenaPortalStep(player,now);

  // The Offline 1v1 opponent lives in the same fixed 60 Hz simulation as the
  // player, so low or very high render FPS never changes its speed or fire rate.
  if(isBotArena()) updateArenaBot(dtms);

  // chainsaw RIP: constant damage around the player without forced movement
  if(now < sawChargeUntil && now >= sawChargeTick){
    sawChargeTick = now + 90;
    player.swingT=now; player.swingA=0; player.swingArc=6.3; player.swingR=sawChargeR+4; player.swingDur=130;
    if(practiceMode==='arena'){
      for(const target of arenaMeleeTargetsAt(player.x,player.y,sawChargeR)){
        arenaMeleeSpecialHit(target,sawChargeDmg*perks.dmg*wm('chainsaw').dmg,'chainsaw');
        burst(target.x,target.y,'#d05548',4,3);
      }
    }
    for(let j=enemies.length-1;j>=0;j--){
      const e=enemies[j];
      if(dist2(e.x,e.y,player.x,player.y) < (sawChargeR+e.r)*(sawChargeR+e.r)){
        damageEnemy(e,sawChargeDmg*perks.dmg*freezeHit(e)); e.hitT=now+60;
        burst(e.x,e.y,ETYPES[e.type].col,4,3);
        const d=Math.hypot(e.x-player.x,e.y-player.y)||1;
        const kb=e.stunUntil>now ? 0 : (ETYPES[e.type].boss?2:8);   // stunned: rooted even when hit
        e.x+=(e.x-player.x)/d*kb; e.y+=(e.y-player.y)/d*kb;
        if(e.hp<=0) killEnemy(j);
      }
    }
    sfx('slash');
  }

  // touch: hold anywhere on the field to fire continuously; one tap = one shot (semi-auto)
  if(touchUI){
    if(aimStickId!==null) tapShootUntil=now+120;    // finger still down -> keep firing
    if(now<tapShootUntil){
      const aimScreen=worldToScreen(tapAimX,tapAimY);
      mouse.x=aimScreen.x;mouse.y=aimScreen.y;
      if(utilityOut){
        if(!touchUtilityUsed){ if(loadout.utility==='medkit') medChannelStart(); else utilQuick(); touchUtilityUsed=true; }
      }
      else if(tryFire(touchFireCadence)&&player.reloadEnd<=now) touchFireCadence=true; // carry only within this held touch
    }
  }

  // --- utilities ---
  // medkit long heal: 8s for 20%; damage or switching cancels without spending it
  if(medChan){
    if(now-medChan>=MED_CHANNEL_MS){
      player.hp=Math.min(perks.maxhp, player.hp+perks.maxhp*0.20);
      burst(player.x,player.y,'#5ec46a',16,4); sfx('pickup');
      medChan=0; medFinish();
    }
  }
  // quick heal drip (tap): 5% spread over 1s
  if(medChanHeal){
    if(now>=medChanHeal){
      medChanHeal=0;
    }
    player.hp=Math.min(perks.maxhp, player.hp + perks.maxhp*medHealPct*(dtms/1000));
  }
  // ender pearls: fly to the landing point, then warp the player there
  for(let i=pearls.length-1;i>=0;i--){
    const p=pearls[i];
    let landed=false;
    const stepLen=Math.hypot(p.vx,p.vy)*dt;
    const steps=Math.max(1,Math.ceil(stepLen/6));
    for(let s2=0;s2<steps && !landed;s2++){
      const nx=p.x+p.vx*dt/steps, ny=p.y+p.vy*dt/steps;
      if(pointInRects(nx,ny)){ landed=true; break; }               // wall: land just short of it
      p.x=nx; p.y=ny; p.dist+=stepLen/steps;
      if(projectileOutsideArena(p,20)){                              // active playfield edge
        clampProjectileToArena(p,20); landed=true;
      }
      if(p.dist>=p.rng) landed=true;                               // max range reached
    }
    if(Math.random()<0.5) burst(p.x,p.y,'#3fd9a3',1,1.5);
    if(landed){
      burst(player.x,player.y,'#b45af0',14,5);                     // departure flash
      player.x=p.x; player.y=p.y;
      player.hurtCd=Math.max(player.hurtCd,350);                   // arrival i-frames
      burst(player.x,player.y,'#3fd9a3',18,6); addShake(3); sfx('pickup');
      pearls.splice(i,1);
    }
  }
  // grenades
  for(let i=grenades.length-1;i>=0;i--){
    const g=grenades[i];
    g.x+=g.vx*dt; g.y+=g.vy*dt;
    if(!g.firework){ g.vx*=0.94; g.vy*=0.94; }   // grenades slow down; fireworks hold a straight arc to the target
    const edgeHit=bounceProjectileAtArenaEdge(g,12,g.firework?1:0.5);
    if(edgeHit&&g.firework) g.t=now;              // firecrackers burst on the fence, never beyond it
    if(pointInRects(g.x,g.y)){ g.vx*=-0.5; g.vy*=-0.5; }
    // firecracker detonates on its fixed fuse (consistent timing near or far);
    // the reached-target check only matters as a safety net once the fuse is nearly up
    const reached = g.firework && g.tx!==undefined && now>=g.t-40 && dist2(g.x,g.y,g.tx,g.ty) < 18*18;
    if(now>=g.t || reached){
      const fw=g.firework;
      burst(g.x,g.y, fw?'#ff5a3c':'#e8b658', fw?24:30, fw?6:7); addShake(fw?6:8); sfx('die');
      const rad=fw?85:170;
      destroyMissilesInRadius(g.x, g.y, rad);        // explosions knock down incoming missiles
      for(let j=enemies.length-1;j>=0;j--){
        const e=enemies[j];
        const d2g=dist2(e.x,e.y,g.x,g.y);
        if(d2g<rad*rad){
          const falloff=1-Math.sqrt(d2g)/(rad*1.3);
          damageEnemy(e,(fw ? (ETYPES[e.type].boss?50:75) : (ETYPES[e.type].boss?180:300))*perks.dmg*falloff*freezeHit(e));
          e.hitT=now+80;
          if(e.hp<=0) killEnemy(j);
        }
      }
      if(!fw&&g.arenaUtility&&!g.remoteUtility&&typeof isCasualOnlineArena==='function'&&isCasualOnlineArena()&&arenaCanAct()&&arena.opponent){
        const d2g=dist2(arena.opponent.x,arena.opponent.y,g.x,g.y),clear=typeof losBlocked!=='function'||
          !losBlocked(g.x,g.y,arena.opponent.x,arena.opponent.y);
        if(clear&&d2g<rad*rad){
          const falloff=Math.max(0,1-Math.sqrt(d2g)/(rad*1.3));
          arenaHitOpponent(300*falloff,'utility_grenade');
        }
      } else if(fw&&typeof isCpuTeamArena==='function'&&isCpuTeamArena()&&arenaCanAct()){
        for(const target of partyCpuMatch.bots.filter(b=>b.team==='B'&&b.hp>0)){
          const d2g=dist2(target.x,target.y,g.x,g.y);
          if(d2g<rad*rad){
            const falloff=1-Math.sqrt(d2g)/(rad*1.3);
            partyCpuHitBot(target,65*falloff,'firework');
          }
        }
      } else if(fw&&practiceMode==='arena'&&arenaCanAct()&&arena.opponent){
        const d2g=dist2(arena.opponent.x,arena.opponent.y,g.x,g.y);
        if(d2g<rad*rad){
          const falloff=1-Math.sqrt(d2g)/(rad*1.3);
          arenaHitOpponent(65*falloff,'firework');
        }
      }
      // BIG rainbow firework burst on detonation
      if(fw&&practiceMode!=='arena'){
        const RAINBOW=['#ff3b3b','#ff9a3b','#ffe23b','#4cd964','#34aadc','#5856d6','#ff2d95','#ffffff'];
        // dense scatter of sparks
        for(let s=0;s<70;s++){
          const a=rand(0,TAU), sp=rand(2,11), col=RAINBOW[s%RAINBOW.length];
          particles.push({x:g.x, y:g.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
                          life:rand(500,1000), max:1000, col, size:rand(2,4.5)});
        }
        // two clean expanding rings of colored stars (classic firework shell look)
        for(let ring=0; ring<2; ring++){
          const rn=24, spd=ring?9:6;
          for(let s=0;s<rn;s++){
            const a=(s/rn)*TAU, col=RAINBOW[(s+ring)%RAINBOW.length];
            particles.push({x:g.x, y:g.y, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
                            life:rand(650,900), max:900, col, size:3.4});
          }
        }
        // bright central flash
        for(let s=0;s<12;s++){
          const a=rand(0,TAU);
          particles.push({x:g.x, y:g.y, vx:Math.cos(a)*rand(0.5,3), vy:Math.sin(a)*rand(0.5,3),
                          life:rand(200,360), max:360, col:'#fff2cc', size:rand(3,5)});
        }
        addShake(4);
      }
      grenades.splice(i,1);
    }
  }
  // balls: red (taunt) and beach (flee+fire+split); bounce off world/crates
  for(let i=balls.length-1;i>=0;i--){
    const b=balls[i];
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dtms;
    const br = b.fire ? Math.max(6, 11-(b.gen||0)*2) : 9;
    bounceProjectileAtArenaEdge(b,br,1);
    for(const o of activeObstacles()){
      if(b.x>o.x-8&&b.x<o.x+o.w+8&&b.y>o.y-8&&b.y<o.y+o.h+8){
        const cx=clamp(b.x,o.x,o.x+o.w), cy=clamp(b.y,o.y,o.y+o.h);
        if(Math.abs(b.x-cx)>Math.abs(b.y-cy)) b.vx*=-1; else b.vy*=-1;
        b.x+=b.vx*dt; b.y+=b.vy*dt;
      }
    }
    if(b.fire && Math.random()<0.4) burst(b.x,b.y,'#ff8a2e',1,3);
    if(now>=b.hitT) for(let j=enemies.length-1;j>=0;j--){
      const e=enemies[j];
      if(dist2(e.x,e.y,b.x,b.y)<(e.r+br)*(e.r+br)){
        damageEnemy(e,(b.dmg||8)*perks.dmg*freezeHit(e)); e.hitT=now+60; b.hitT=now+280;
        if(b.fire) igniteEnemy(e, 0);                 // 5/s for 3s residual (spec: burn on touch)
        burst(b.x,b.y, b.fire?'#ff6a2c':'#d05548', 3,2);
        if(e.hp<=0) killEnemy(j);
        break;
      }
    }
    if(now>=b.hitT&&b.arenaUtility&&!b.remoteUtility&&typeof isCasualOnlineArena==='function'&&
       isCasualOnlineArena()&&arenaCanAct()&&arena.opponent&&
       dist2(arena.opponent.x,arena.opponent.y,b.x,b.y)<(arena.opponent.r+br)*(arena.opponent.r+br)){
      arenaHitOpponent((b.dmg||8)*perks.dmg,b.fire?'utility_beachball':'utility_redball');
      b.hitT=now+280;burst(b.x,b.y,b.fire?'#ff6a2c':'#d05548',3,2);
    }
    // beachball splitting: every 1s spawn 2 halved children, 3 generations, 1s life each after split
    if(b.fire && b.splitT && now>=b.splitT && (b.gen||0)<3){
      for(let k=0;k<2;k++){
        const seed=b.arenaUtility&&typeof arenaMapHash==='function'
          ?arenaMapHash(String(b.utilitySeed||'utility')+':'+(b.gen||0)+':'+k):0;
        const a=b.arenaUtility?(seed/4294967296)*TAU:Math.random()*TAU;
        const child={x:b.x,y:b.y,vx:Math.cos(a)*5,vy:Math.sin(a)*5,life:1000,hitT:0,
                     flee:true,fire:true,dmg:(b.dmg||8)/2,gen:(b.gen||0)+1,
                     splitT:(b.gen||0)+1<3 ? now+1000 : 0,
                     arenaUtility:!!b.arenaUtility,remoteUtility:!!b.remoteUtility,hostile:!!b.hostile,
                     utilitySeed:String(b.utilitySeed||'')+':'+(b.gen||0)+':'+k};
        clampProjectileToArena(child,Math.max(6,11-child.gen*2)); balls.push(child);
      }
      burst(b.x,b.y,'#ffb84d',10,5);
      balls.splice(i,1); continue;
    }
    if(b.life<=0) balls.splice(i,1);
  }
  // flamethrower particles
  for(let i=flames.length-1;i>=0;i--){
    const f=flames[i];
    f.x+=f.vx*dt; f.y+=f.vy*dt; f.r+=f.grow*dt; f.life-=dtms;
    // kill at the weapon's actual reach, on wall hit, or when the puff fades
    const past = f.reach && ((f.x-f.ox)*(f.x-f.ox)+(f.y-f.oy)*(f.y-f.oy)) > f.reach*f.reach;
    if(f.life<=0 || past || pointInRects(f.x,f.y) || projectileOutsideArena(f,f.r)) flames.splice(i,1);
  }
  // freeze rings fade out
  for(let i=freezeFx.length-1;i>=0;i--){
    if(now-freezeFx[i].t > 600) freezeFx.splice(i,1);
  }
  // combo follow-up: the second half of a dagger combo
  if(comboNextT && now>=comboNextT && WEAPONS[player.cur].combo && state==='play'){
    comboNextT=0;
    meleeSwing(WEAPONS[player.cur], 1);
  }
  // thrown burning daggers: fly out, then home back to the hand; return at t
  if(daggersOut && now>=daggersOut.end){
    if(typeof finishMeleeAbilityVisual==='function')finishMeleeAbilityVisual('bdaggers');
    daggersOut=null;
  }
  if(daggersOut){
    const back = now>=daggersOut.t;
    for(const bl of daggersOut.blades){
      if(back || bl.returning){
        bl.returning=true;
        const dx=player.x-bl.x, dy=player.y-bl.y, d=Math.hypot(dx,dy)||1;
        bl.vx=dx/d*17; bl.vy=dy/d*17;
      }
      const oldX=bl.x,oldY=bl.y;
      bl.x+=bl.vx*dt; bl.y+=bl.vy*dt;
      const hitWall=pointInRects(bl.x,bl.y)||
        (typeof losBlocked==='function'&&losBlocked(oldX,oldY,bl.x,bl.y));
      if(hitWall){
        bl.x=oldX;bl.y=oldY;bl.returning=true;
        const dx=player.x-bl.x,dy=player.y-bl.y,d=Math.hypot(dx,dy)||1;
        bl.vx=dx/d*17;bl.vy=dy/d*17;
      }
      if(projectileOutsideArena(bl,9)){
        clampProjectileToArena(bl,9); bl.returning=true;
        const dx=player.x-bl.x, dy=player.y-bl.y, d=Math.hypot(dx,dy)||1;
        bl.vx=dx/d*17; bl.vy=dy/d*17;
      }
      if(practiceMode==='arena'&&arenaCanAct()){
        const arenaTargets=typeof isCpuTeamArena==='function'&&isCpuTeamArena()
          ? partyCpuMatch.bots.filter(t=>t.team==='B'&&t.hp>0)
          : (arena&&arena.opponent&&arena.opponent.hp>0?[arena.opponent]:[]);
        for(const target of arenaTargets){
          const hitKey='arena:'+String(target.id||'opponent');
          if(bl.hits.has(hitKey)) continue;
          if(dist2(target.x,target.y,bl.x,bl.y)<((target.r||15)+8)*((target.r||15)+8)){
            // Validate from the flying blade, not from the player's body. At
            // a corner the player-to-target line can be blocked even though
            // the blade made a legitimate contact on the target's side.
            if(arenaMeleeSpecialHit(target,40*perks.dmg*wm('bdaggers').dmg,'bdaggers',bl.x,bl.y)){
              bl.hits.add(hitKey); burst(bl.x,bl.y,'#ff8a2e',5,3);
            }
          }
        }
      }
      // damage + ignite enemies in their path
      for(let j=enemies.length-1;j>=0;j--){
        const e=enemies[j];
        if(bl.hits.has(e)) continue;
        if(dist2(e.x,e.y,bl.x,bl.y)<(e.r+8)*(e.r+8)){
          damageEnemy(e,40*perks.dmg*freezeHit(e)); e.hitT=now+70; igniteEnemy(e,0);
          burst(bl.x,bl.y,'#ff8a2e',5,3);
          bl.hits.add(e);
          if(e.hp<=0) killEnemy(j);
        }
      }
      if(Math.random()<0.5) burst(bl.x,bl.y,'#ff9a4a',1,2);
    }
    // once returning blades reach the player, catch them
    if(daggersOut.blades.every(bl=>bl.returning && dist2(bl.x,bl.y,player.x,player.y)<28*28)){
      if(typeof finishMeleeAbilityVisual==='function')finishMeleeAbilityVisual('bdaggers');
      daggersOut=null;
    }
  }

  player.bloom *= Math.pow(0.94, dt);
  if(player.hurtCd>0) player.hurtCd-=dtms;
  if(player.hurtFlash>0) player.hurtFlash-=dtms*0.002;

  // Zoom changes around the local player in every mode. Keeping the camera
  // target exactly on the player prevents scope/aim from pushing them toward
  // a screen edge and deliberately allows the view beyond a map boundary.
  if(isArenaMapBattlefield()){
    const fit=duelArenaFitZoom();
    const aimZoom=aiming?Math.min(w.zoom||1,1.6):1;
    zoom += (fit*aimZoom-zoom)*Math.min(1,0.11*dt);
  } else {
    const tzoom = aiming ? w.zoom : 1;
    zoom += (tzoom-zoom)*Math.min(1,0.11*dt);
  }
  centerCameraOnPlayer();

  shakeMag*=Math.pow(0.88,dt);
  shakeX=rand(-1,1)*shakeMag/zoom; shakeY=rand(-1,1)*shakeMag/zoom;

  // practice: respawn dead targets after 3s; track DPS on the dummy
  if(practiceMode){
    for(let i=0;i<practiceSpawns.length;i++){
      const sp=practiceSpawns[i];
      if(!sp.alive && now>=sp.respawnAt) spawnPracticeEnemy(sp, i);
    }
    if(practiceMode==='dps'){
      const dm=enemies.find(e=>e.type==='dummy');
      if(dm){
        if(dm.hp<1e8) dm.hp=dm.maxhp;                    // integrity never breaks
        const delta=dpsPrevHp>0 ? dpsPrevHp-dm.hp : 0;
        if(delta>0){ if(!dpsStart) dpsStart=now; dpsTotal+=delta; }
        dpsPrevHp=dm.hp;
        // 3 seconds without firing a shot -> the session resets
        if(dpsStart && now-player.lastShot>3000){ dpsStart=0; dpsTotal=0; }
      }
    }
  }
  // waves
  if(!practiceMode && spawnQueue.length){
    spawnTimer-=dtms;
    if(spawnTimer<=0){ const st=spawnQueue.shift(); spawnOne(st); spawnTimer = ETYPES[st].boss ? 2200 : 330; }
  } else if(!practiceMode && waveSkipPending>0 && !upgradeOffered){
    // WAVE SKIPPER: grant an upgrade with no combat, up to 3 times
    waveSkipPending--;
    taskProgress('waves',1);
    recordWaveCoinReward();
    bossBounty = wave%10===0;
    upgradeOffered=true; upgradeChoices=rollUpgrades(); ebullets=[];
    cancelFanTheHammer();
    if(typeof resetHeldTouchContacts==='function')resetHeldTouchContacts();
    state='upgrade'; sfx('wave');
  } else if(!practiceMode && !enemies.length){
    if(wave>=1 && !upgradeOffered){
      taskProgress('waves',1);
      recordWaveCoinReward(); // bank each clear; pay the whole bank exactly every fifth wave
      bossBounty = wave%10===0;   // weapon-mod level every 10 waves
      upgradeOffered=true; upgradeChoices=rollUpgrades(); ebullets=[];
      cancelFanTheHammer();
      if(typeof resetHeldTouchContacts==='function')resetHeldTouchContacts();
      state='upgrade'; sfx('wave');
    } else {
      betweenTimer-=dtms;
      if(betweenTimer<=0){ nextWave(); betweenTimer=2600; upgradeOffered=false; }
    }
  }

  // enemies
  for(let ei=enemies.length-1; ei>=0; ei--){
    const e=enemies[ei];
    const t=ETYPES[e.type];
    // burn damage-over-time: 18.5/s while actively torched, 7.5/s residual
    if(e.burnUntil>now){
      const dps = e.burnActiveUntil>now ? 12 : 3;   // active 12/s, residual 3/s
      damageEnemy(e,dps*dtms/1000,{mergeMs:300,kind:'burn'});
      if(Math.random()<0.25) burst(e.x+rand(-6,6), e.y+rand(-8,4), '#ff7b2e', 1, 2);
      if(e.hp<=0){ killEnemy(ei); continue; }
    }
    // poison damage-over-time: stacks, each stack ~4/s, decays as it expires
    if(e.poisonUntil>now && (e.poisonStacks||0)>0){
      damageEnemy(e,(e.poisonStacks*4)*dtms/1000,{mergeMs:300,kind:'poison'});
      if(Math.random()<0.2) burst(e.x+rand(-6,6), e.y+rand(-8,4), '#7cdc7c', 1, 1.8);
      if(e.hp<=0){ killEnemy(ei); continue; }
    } else if(e.poisonStacks){ e.poisonStacks=0; }
    // frozen: enemy is locked in place, doesn't move or shoot (still burns)
    if(e.frozenUntil>now){
      if(Math.random()<0.12) burst(e.x+rand(-6,6), e.y+rand(-6,6), '#bfefff', 1, 1.2);
      continue;
    }
    // WARP STUN: locked in place, can't move or shoot; takes FULL damage
    if(e.stunUntil>now){
      if(Math.random()<0.15) burst(e.x+rand(-6,6), e.y+rand(-8,4), '#bfa8ff', 1, 1.4);
      continue;
    }
    // practice range targets stand still and never attack
    if(e.practiceStill) continue;
    // Tracking practice follows the chosen compass direction at a fixed speed.
    // It reflects off the arena boundary and solid scenery instead of chasing
    // or attacking the player, keeping the drill predictable and repeatable.
    if(e.practiceMoving){
      const eSm=enemySpeedMul(e), step=e.spd*dt*eSm, bounds=activeArenaBounds(), margin=e.r+2;
      let dir=Number.isFinite(e.practiceDir)?e.practiceDir:0;
      let vx=Math.cos(dir), vy=Math.sin(dir);
      let nx=e.x+vx*step;
      if(nx<bounds.left+margin||nx>bounds.right-margin||circleHitsRects(nx,e.y,e.r)){
        vx=-vx; dir=Math.atan2(vy,vx); nx=e.x+vx*step;
      }
      if(nx>=bounds.left+margin&&nx<=bounds.right-margin&&!circleHitsRects(nx,e.y,e.r)) e.x=nx;
      let ny=e.y+Math.sin(dir)*step;
      if(ny<bounds.top+margin||ny>bounds.bottom-margin||circleHitsRects(e.x,ny,e.r)){
        vy=-Math.sin(dir); dir=Math.atan2(vy,Math.cos(dir)); ny=e.y+vy*step;
      }
      if(ny>=bounds.top+margin&&ny<=bounds.bottom-margin&&!circleHitsRects(e.x,ny,e.r)) e.y=ny;
      e.practiceDir=Math.atan2(Math.sin(dir),Math.cos(dir));
      e.x=clamp(e.x,bounds.left+margin,bounds.right-margin);
      e.y=clamp(e.y,bounds.top+margin,bounds.bottom-margin);
      collideRects(e);
      continue;
    }
    // red balls taunt (chase); beach balls repel (flee)
    let tx=player.x, ty=player.y, taunted=false;
    if(balls.length && !t.boss){
      let bb=null, bd=Infinity, flee=false;
      for(const b of balls){ const d2b=dist2(e.x,e.y,b.x,b.y); const tr=(b.taunt||500); if(d2b<bd && d2b<tr*tr){bd=d2b;bb=b;flee=b.flee;} }
      if(bb){ if(flee){ tx=2*e.x-bb.x; ty=2*e.y-bb.y; } else { tx=bb.x; ty=bb.y; taunted=true; } }
    }
    const dx=tx-e.x, dy=ty-e.y, d=Math.hypot(dx,dy)||1;
    let vx=dx/d, vy=dy/d;
    if(t.boss){
      if(e.type==='boss'){                       // RED: charges + 3-shot stream + radial rings
        if(e.mode==='wind'){
          vx=0; vy=0;
          if(now>=e.modeT){ e.mode='charge'; e.modeT=now+520; e.cvx=dx/d*9; e.cvy=dy/d*9; }
        } else if(e.mode==='charge'){
          const cSm=enemySpeedMul(e);
          e.x+=e.cvx*dt*cSm; e.y+=e.cvy*dt*cSm; vx=0; vy=0;
          if(now>=e.modeT){ e.mode='chase'; e.dashT=now+6500; }
        } else if(now>=e.dashT){
          e.mode='wind'; e.modeT=now+550;
        }
        if(e.mode!=='charge' && now>=e.streamT){ // constant 3-shot fan at the player
          e.streamT=now+250;
          const pa=Math.atan2(player.y-e.y, player.x-e.x);
          for(const off of [-0.14,0,0.14]){
            const a=pa+off+rand(-0.04,0.04);
            ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*6.5,vy:Math.sin(a)*6.5,life:2400});
          }
        }
        if(now>=e.ringT){                        // shots in every direction
          e.ringT=now+4000;
          for(let i=0;i<14;i++){
            const a=i/14*TAU + rand(-0.05,0.05);
            ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*5.5,vy:Math.sin(a)*5.5,life:2600});
          }
          sfx('shoot',{sndF:300,sndD:0.15});
        }
      } else if(e.type==='bossBlue'){            // BLUE: keeps distance, slow missiles, deflects
        if(d<380){ vx=-vx; vy=-vy; }             // keep distance
        else if(d<520){ vx=0; vy=0; }
        if(now>=e.streamT){                      // constant slow missiles
          e.streamT=now+1300;
          const pa=Math.atan2(player.y-e.y, player.x-e.x);
          fireHoming(e, pa+rand(-0.3,0.3), 3.5, 0.045, 6500, 16);   // faster missiles
        }
        if(now>=e.deflectNext){                  // every 8s: 2s of full bullet deflection
          e.deflectUntil=now+2000;
          e.deflectNext=now+8000+2000;
          burst(e.x,e.y,'#9fd0ff',14,5);
        }
      } else if(e.type==='bossYellow'){          // YELLOW: accurate fast shots + a short capped charge
        // RED charges 9px/frame for 520ms (~281px). Yellow matches that MAX distance but is shorter.
        const RED_CHARGE_DIST = 9 * (520/16.667);   // red's charge distance in px (~281)
        if(now>=e.chargeNext){
          e.chargeUntil=now+430;                    // shorter dash (was 6000ms)
          e.chargeNext=now+18000;
          e.chargeGo=RED_CHARGE_DIST;               // distance budget for this charge
          const a=Math.atan2(player.y-e.y, player.x-e.x);  // lock direction at charge start
          e.cvx=Math.cos(a); e.cvy=Math.sin(a);
          burst(e.x,e.y,'#ffe23b',12,5);
        }
        if(now<e.chargeUntil && (e.chargeGo||0)>0){
          const ySm=enemySpeedMul(e);
          let step=11*dt*ySm;                       // 11 px/frame, half the scythe dash speed
          if(step>e.chargeGo) step=e.chargeGo;      // never exceed red's max distance
          e.chargeGo-=step;
          e.x+=e.cvx*step; e.y+=e.cvy*step; vx=0; vy=0;
        } else if(now>=e.streamT){                  // slower but perfectly accurate high-speed shots
          e.streamT=now+1500;
          const pa=Math.atan2(player.y-e.y, player.x-e.x);
          ebullets.push({x:e.x,y:e.y,vx:Math.cos(pa)*15.75,vy:Math.sin(pa)*15.75,life:2200,dmg:22});   // +50% speed
        }
      } else if(e.type==='bossPurple'){          // PURPLE KING: RED's rate of fire, heavier rounds
        if(now>=e.streamT){                      // constant 3-shot fan like RED, double damage
          e.streamT=now+250;
          const pa=Math.atan2(player.y-e.y, player.x-e.x);
          for(const off of [-0.14,0,0.14]){
            const a=pa+off+rand(-0.04,0.04);
            ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*6.5,vy:Math.sin(a)*6.5,life:2400,dmg:20.7,king:true});
          }
        }
        if(now>=e.ringT){                        // ring in every direction like RED, double damage
          e.ringT=now+4000;
          for(let i=0;i<14;i++){
            const a=i/14*TAU + rand(-0.05,0.05);
            ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*5.5,vy:Math.sin(a)*5.5,life:2600,dmg:20.7,king:true});
          }
          sfx('shoot',{sndF:180,sndD:0.2});
        }
      }
    }
    if(t.ranged && !taunted){
      const near = t.arty?420:300, hold = t.arty?560:430, rng = t.arty?900:640;
      if(d<near){ vx=-vx; vy=-vy; }        // keep distance
      else if(d<hold){ vx=0; vy=0; }
      if(d<rng && now>=e.fireT){
        const a=Math.atan2(dy,dx);
        if(t.arty){                        // spamming 3-missile fan; missiles curve around walls
          e.fireT=now+2600;
          for(const off of [-0.35,0,0.35])
            fireHoming(e, a+off, 4.0, Math.min(0.06, 0.03+(wave-20)*0.001), 5200, 12);
        } else if(t.seeker){               // tracking shots that sharpen every wave
          e.fireT=now+Math.max(1200, 2000-wave*20);
          fireHoming(e, a+rand(-0.2,0.2), 5.2, Math.min(0.06, 0.028+wave*0.0015), 3500, 10);
        } else {
          e.fireT=now+1600;
          const aa=a+rand(-0.06,0.06);
          ebullets.push({x:e.x,y:e.y,vx:Math.cos(aa)*7.5,vy:Math.sin(aa)*7.5,life:2000});
        }
      }
    }
    // enemies head straight at their target; per-axis movement lets them slide
    // along a wall they run into (so they don't jam/stick) without dodging around it
    const eSm=enemySpeedMul(e);
    const nx=e.x+vx*e.spd*dt*eSm, ny=e.y+vy*e.spd*dt*eSm;
    if(!pointInRects(nx, e.y)) e.x=nx;
    if(!pointInRects(e.x, ny)) e.y=ny;
    e.x=clamp(e.x,30,WORLD.w-30); e.y=clamp(e.y,30,WORLD.h-30);
    collideRects(e);
    // don't let enemies stack inside the player
    const pdx=e.x-player.x, pdy=e.y-player.y, prr=e.r+player.r-2, pd2=pdx*pdx+pdy*pdy;
    if(pd2>0 && pd2<prr*prr){ const pd=Math.sqrt(pd2), push=(prr-pd)/pd; e.x+=pdx*push; e.y+=pdy*push; }
    // contact damage — measure the REAL distance to the player, not the taunt target
    if(!t.ranged){
      const cdx=e.x-player.x, cdy=e.y-player.y;
      if(cdx*cdx+cdy*cdy < (e.r+player.r+2)*(e.r+player.r+2) && player.hurtCd<=0) hurtPlayer(t.dmg);
    }
  }
  // Enemy count is deliberately capped, so this exact all-pairs pass stays
  // cheap and never misses a collision after earlier pairs push enemies apart.
  for(let i=0;i<enemies.length;i++) for(let j=i+1;j<enemies.length;j++){
    const a=enemies[i],b=enemies[j];
    const dx=b.x-a.x, dy=b.y-a.y, rr=a.r+b.r, d2=dx*dx+dy*dy;
    if(d2>0&&d2<rr*rr){
      const d=Math.sqrt(d2), p=(rr-d)/d*0.5;
      a.x-=dx*p; a.y-=dy*p; b.x+=dx*p; b.y+=dy*p;
    }
  }

  // player bullets (substepped so fast rounds can't tunnel through close targets)
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    b.life-=dtms;
    let dead = b.life<=0;
    const stepLen = Math.hypot(b.vx,b.vy)*dt;
    const steps = Math.max(1, Math.ceil(stepLen/7));
    for(let s=0; s<steps && !dead; s++){
      b.x+=b.vx*dt/steps; b.y+=b.vy*dt/steps; b.dist+=stepLen/steps;
      if(b.wv){                                   // warpwave: ride a sine wave along the flight axis
        const A=b.wamp||24, K=b.wk||0.05;           // amplitude + period fluctuate per bolt
        b.x=b.ox+Math.cos(b.ba)*b.dist - Math.sin(b.ba)*A*Math.sin(b.dist*K);
        b.y=b.oy+Math.sin(b.ba)*b.dist + Math.cos(b.ba)*A*Math.sin(b.dist*K);
      }
      // visible arena fence: bounce ricochets here; every other shot dies here
      if(projectileOutsideArena(b)){
        if(b.bounce>0){
          const playBounds=activeArenaBounds();
          if(b.x<playBounds.left||b.x>playBounds.right) b.vx*=-1;
          if(b.y<playBounds.top||b.y>playBounds.bottom) b.vy*=-1;
          b.x=clamp(b.x,playBounds.left+1,playBounds.right-1);
          b.y=clamp(b.y,playBounds.top+1,playBounds.bottom-1);
          b.bounce--; burst(b.x,b.y,'#ffd24d',6,3); sfx('hit');
          if(b.hits) b.hits.clear();               // can re-hit enemies after a bounce
          if(b.partyHits) b.partyHits.clear();
          continue;
        }
        dead=true; break;
      }
      // Construction Site TNT absorbs the projectile's real post-falloff
      // damage before the generic solid-rectangle collision consumes it.
      if(isArenaMapBattlefield()&&activeArenaMapId()==='construction'&&
         arenaTryTriggerTntAt(b.x,b.y,'local',4,b.dmg*dmgMul(b))){
        dead=true; break;
      }
      // walls: bounce off the nearest face if bounces remain
      if(projectileHitsSolidWall(b)){
        if(b.bounce>0){
          // reflect off whichever axis penetrated less (approximate face normal)
          const bx=b.x-b.vx*dt/steps, by=b.y-b.vy*dt/steps;   // pre-move position
          if(!pointInRects(bx,b.y)) b.vx*=-1;                 // came in on X
          else if(!pointInRects(b.x,by)) b.vy*=-1;            // came in on Y
          else { b.vx*=-1; b.vy*=-1; }                        // corner
          b.x=bx; b.y=by;
          b.bounce--; burst(b.x,b.y,'#ffd24d',6,3); sfx('hit');
          if(b.hits) b.hits.clear();
          if(b.partyHits) b.partyHits.clear();
          continue;
        }
        dead=true; burst(b.x,b.y,'#c9b26a',4,2.5); break;
      }
      // intercept incoming homing missiles — any hit destroys them instantly
      let hitM=false;
      for(let m=ebullets.length-1;m>=0;m--){
        const mb=ebullets[m];
        if(!mb.h) continue;
        if(dist2(b.x,b.y,mb.x,mb.y) < (mb.r+4)*(mb.r+4)){
          burst(mb.x,mb.y,'#ff9a4a',12,5); sfx('hit');
          ebullets.splice(m,1);
          if(b.pierce>0){ b.pierce--; } else { dead=true; hitM=true; }
          break;
        }
      }
      if(hitM) break;
      // CASUAL ARENA: the shooter detects contact against the synchronized
      // opponent and sends one deduplicated damage event. Campaign perks and
      // status effects are reset/disabled when the round starts.
      if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()&&arenaCanAct()){
        for(const target of partyCpuMatch.bots.filter(x=>x.team==='B'&&x.hp>0)){
          if(b.partyHits&&b.partyHits.has(target.id))continue;
          const rr=(target.r||15)+4+(b.fg||0);
          if(dist2(b.x,b.y,target.x,target.y)<rr*rr){
            partyCpuHitBot(target,b.dmg*dmgMul(b),b.weapon==='sniper'&&b.unscopedShot?'unscoped_sniper':'shot');(b.partyHits||(b.partyHits=new Set())).add(target.id);
            if(b.pierce>0)b.pierce--;else dead=true;
            if(dead)break;
          }
        }
        if(dead)break;
      } else if(practiceMode==='arena' && arenaCanAct() && arena.opponent && !b.arenaHit){
        const ar=arena.opponent.r||15, rr=ar+4+(b.fg||0);
        if(dist2(b.x,b.y,arena.opponent.x,arena.opponent.y)<rr*rr){
          const hdmg=b.dmg*dmgMul(b);
          const hitKind=b.parryReflect?'parry':(b.weapon==='sniper'&&b.unscopedShot?'unscoped_sniper':'shot');
          const hitMeta=b.parryReflect?{rootHitId:b.parryRootHitId,parryDepth:b.parryDepth}:undefined;
          arenaHitOpponent(hdmg,hitKind,hitMeta); b.arenaHit=true;
          burst(b.x,b.y,'#d05548',5,3); sfx('hit');
          if(b.pierce>0) b.pierce--; else dead=true;
          if(dead) break;
        }
      }
      for(let j=enemies.length-1;j>=0;j--){
        const e=enemies[j];
        if(dist2(b.x,b.y,e.x,e.y) < (e.r+4+(b.fg||0))*(e.r+4+(b.fg||0))){
          if(b.hits && b.hits.has(e)) continue;
          if(e.deflectUntil>now){                       // BLUE warlord shield: deflect the bullet
            const na=Math.atan2(b.y-e.y, b.x-e.x)+rand(-0.3,0.3);
            const sp=Math.hypot(b.vx,b.vy);
            b.vx=Math.cos(na)*sp; b.vy=Math.sin(na)*sp;
            b.x=e.x+Math.cos(na)*(e.r+8); b.y=e.y+Math.sin(na)*(e.r+8);
            clampProjectileToArena(b,1);              // a shield beside the fence cannot throw shots outside
            burst(b.x,b.y,'#9fd0ff',5,3); sfx('hit');
            break;                                      // no damage; bullet flies off deflected
          }
          let hdmg=b.dmg*dmgMul(b), wasCrit=false;
          if(!b.parryReflect&&perks.crit && Math.random()<perks.crit){ hdmg*=3; wasCrit=true; burst(b.x,b.y,'#ffe08a',8,4); }
          const beforeHp=Math.max(0,+e.hp||0);
          damageEnemy(e,hdmg*freezeHit(e),{crit:wasCrit}); e.hitT=now+70;
          if(b.fire) igniteEnemy(e, 0.4);            // solar bolts ignite on impact
          if(b.poison) applyPoison(e);               // dart: stack poison DoT
          if(b.chrono){ e.dragUntil=Math.max(e.dragUntil||0, now+1800); e.chronoStacks=Math.min(8,(e.chronoStacks||0)+1); }   // timeturner: -20% speed per hit, stacks
          burst(b.x,b.y, b.poison?'#7cdc7c':ETYPES[e.type].col,5,3);
          sfx('hit');
          if(e.hp<=0){
            triggerUnscopedSniperKillCelebration(beforeHp,e.hp,b);
            killEnemy(j);
          }
          if(b.pierce>0){ b.pierce--; (b.hits||(b.hits=new Set())).add(e); }
          else dead=true;
          break;
        }
      }
    }
    if(dead) bullets.splice(i,1);
  }
  // enemy bullets (h = homing turn rate; missiles fly over crates)
  for(let i=ebullets.length-1;i>=0;i--){
    const b=ebullets[i];
    const ebSm = now<timeStopUntil ? 0.25 : 1;     // time capsule slows enemy shots too
    if(b.h){
      const ta=Math.atan2(player.y-b.y, player.x-b.x);
      let ca=Math.atan2(b.vy,b.vx);
      let da=Math.atan2(Math.sin(ta-ca),Math.cos(ta-ca));
      const mt=b.h*dt*ebSm;
      ca += clamp(da,-mt,mt);
      b.vx=Math.cos(ca)*b.spd; b.vy=Math.sin(ca)*b.spd;
    }
    const moveX=b.vx*dt*ebSm, moveY=b.vy*dt*ebSm;
    const steps=Math.max(1,Math.ceil(Math.hypot(moveX,moveY)/7));
    b.life-=dtms;
    let dead=b.life<=0;
    for(let s=0;s<steps&&!dead;s++){
      b.x+=moveX/steps; b.y+=moveY/steps;
      if(b.botArena) b.dist=(b.dist||0)+Math.hypot(moveX,moveY)/steps;
      const edgeRadius=b.h?(b.r||9):(b.king?8:3);
      if(projectileOutsideArena(b,edgeRadius)){
        clampProjectileToArena(b,edgeRadius); dead=true; break;
      }
      if(b.botArena&&isArenaMapBattlefield()&&activeArenaMapId()==='construction'&&
         arenaTryTriggerTntAt(b.x,b.y,'bot',edgeRadius,(b.dmg||WEAPONS.ar.dmg)*dmgMul(b),LOCAL_DUEL_BOT)){
        dead=true; break;
      }
      if(!b.h&&pointInRects(b.x,b.y)){ dead=true; break; }
      if(now<parryUntil&&now>=parryUntil-TWIN_SAI_PARRY_MS&&
          dist2(b.x,b.y,player.x,player.y)<(player.r+42)*(player.r+42)){
        const incomingDamage=b.botArena?(b.dmg||WEAPONS.ar.dmg)*dmgMul(b):(b.dmg||ETYPES.gunner.dmg);
        spawnTwinSaiReflection(b.x,b.y,incomingDamage);
        burst(b.x,b.y,'#bfe8ff',10,4); sfx('hit'); addShake(3);
        dead=true;                                      // the guard remains active for its full timed window
        break;
      }
      const shotR=3+(b.botArena?(b.fg||0):0);
      if(dist2(b.x,b.y,player.x,player.y)<(player.r+shotR)*(player.r+shotR)){
        dead=true;
        if(b.botArena) arenaBotHitPlayer((b.dmg||WEAPONS.ar.dmg)*dmgMul(b));
        else if(player.hurtCd<=0) hurtPlayer(b.dmg||ETYPES.gunner.dmg);
      }
    }
    if(dead) ebullets.splice(i,1);
  }
  // particles
  if(particles.length>320) particles.splice(0,particles.length-320);
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.96; p.vy*=0.96; p.life-=dtms;
    if(p.life<=0) particles.splice(i,1);
  }
  tickDamageNumbers(dtms);
  // pickups
  for(let i=pickups.length-1;i>=0;i--){
    const p=pickups[i];
    // Pickups stay on the ground until walked over. Dropped medkits go into a
    // five-pack stash even at full health, and wait here when that stash is full.
    const wanted = p.type==='ammo' || p.type==='fuel' || p.type==='chest' ||
                   (p.type==='med' && medStash<MED_STASH_MAX);
    if(wanted && dist2(p.x,p.y,player.x,player.y) < 34*34){
      if(p.type==='ammo'){
        for(const k of [loadout.primary, loadout.secondary]){
          if(isFinite(player.reserve[k])) player.reserve[k]+=magSize(k);
        }
        sfx('ammo');
        if(tutorialOn&&typeof tutorialRecordAmmoCollected==='function') tutorialRecordAmmoCollected();
      } else if(p.type==='fuel'){
        sawFuel=Math.min(100, sawFuel+10);
        if(sawLock&&sawFuel>=100) sawLock=false;
        sfx('ammo');
      } else if(p.type==='chest'){
        // chest reward: an instant weapon mod + 50-300 coins + 0/1/2/3 base gems, scaled 10x
        const r=Math.random();
        const gemDrop = (r<2/3 ? 0 : r<11/12 ? 1 : r<11/12+1/20 ? 2 : 3)*GEM_REWARD_SCALE;
        const coinDrop = p.coins || (50 + ((Math.random()*251)|0));
        if(practiceMode){
          waveMsg='\uD83C\uDF81 CHEST (no rewards in practice)'; waveMsgT=now+2000;
        } else {
          // every chest instantly grants a weapon mod for an equipped weapon
          const mine=[loadout.primary, loadout.secondary, loadout.melee, loadout.utility].filter(Boolean);
          const fresh=availableEquipmentMods(mine);
          let modName='', modTxt='';
          if(fresh.length){
            const m=fresh[(Math.random()*fresh.length)|0];
            m.f(); perkCounts[m.n]=(perkCounts[m.n]||0)+1;
            modName=m.n; modTxt=modName+'  \u00b7  ';
          } else {
            // All named tier paths are complete: the chest still grants a permanent run upgrade.
            const k=mine[(Math.random()*mine.length)|0];
            if(UTILITIES[k]){ um(k).cd*=.95; modName=UTILITIES[k].name+' FIELD TUNING'; }
            else { wm(k).dmg*=1.10; modName=WEAPONS[k].name+' FIELD TUNING'; }
            modTxt=modName+'  \u00b7  ';
          }
          const trickle=startCoinTrickle(coinDrop,'MOD CHEST');
          const awardedGems=gemRewardsEnabled()?gemDrop:0;
          if(!gemRewardsEnabled()){
            waveMsg='\uD83C\uDF81 '+modTxt+'+'+coinDrop+' \uD83E\uDE99 ('+(testMode?'no gems in Test Mode':'sign in for gems')+')'; waveMsgT=now+2600;
          } else {
            if(awardedGems>0) addGems(awardedGems);
            waveMsg='\uD83C\uDF81 '+modTxt+'+'+awardedGems+' \uD83D\uDC8E  +'+coinDrop+' \uD83E\uDE99'; waveMsgT=now+2600;
          }
          if(typeof resetHeldTouchContacts==='function')resetHeldTouchContacts();
          chestRewardOpen={coins:coinDrop,gems:awardedGems,mod:modName,trickle,end:trickle.start+trickle.dur};
        }
        burst(p.x,p.y,'#ffd24d',18,5); sfx('pickup');
        taskProgress('chests',1);
      } else if(p.type==='med'){
        if(!collectDroppedMedkit()) continue;
      }
      pickups.splice(i,1);
    }
  }
}
function hurtPlayer(dmg){
  if(now<invincUntil) return;                       // invincibility powerup: no damage
  cancelMedHeal();                                  // a real hit interrupts both quick and long Medkit heals
  const waveDmg=1+Math.max(0,wave-1)*0.053;
  damagePlayerHp(dmg*waveDmg*perks.armor*DIFFS[diffMode].dmg); player.hurtCd=550; player.hurtFlash=1;
  addShake(6); sfx('hurt');
  if(player.hp<=0){
    cancelFanTheHammer();
    if(practiceMode){
      player.hp=perks.maxhp; player.hurtCd=1500;
      player.x=WORLD.w/2-380; player.y=WORLD.h/2;
      waveMsg='RESPAWNED'; waveMsgT=now+1500;
      burst(player.x,player.y,'#a7c15e',20,5); sfx('pickup');
      return;
    }
    if(perks.secondWind && wave>=windReadyWave){
      windReadyWave=wave+3; player.hp=Math.ceil(perks.maxhp*0.25);
      player.hurtCd=1200;
      waveMsg='SECOND WIND'; waveMsgT=now+1800;
      burst(player.x,player.y,'#a7c15e',24,5); sfx('pickup');
      return;
    }
    // a RESPAWN powerup in stock (and unused this game) -> offer the prompt instead of dying
    if((powerStock.respawn||0)>0 && (powerUsed.respawn||0) < powerupMax('respawn')){
      if(typeof resetHeldTouchContacts==='function')resetHeldTouchContacts();
      player.hp=0; state='play'; menuOpen=true; respawnPromptT=1;   // freeze via a prompt
      sfx('die');
      return;
    }
    player.hp=0; state='over'; sfx('die'); submitScore(hiScore);
  }
}
// spend one of a powerup from stock; returns false if none left or per-game cap hit
function usePowerup(id){
  const max=powerupMax(id);
  if((powerStock[id]||0)<=0) return false;
  if((powerUsed[id]||0)>=max) return false;
  powerStock[id]-=1; powerUsed[id]=(powerUsed[id]||0)+1; saveMeta();
  const pu=POWERUPS.find(x=>x.id===id);
  if(id==='respawn'){
    player.hp=perks.maxhp; player.hurtCd=1500; invincUntil=now+2000;
    respawnPromptT=0; menuOpen=false; state='play';
    burst(player.x,player.y,'#a7c15e',26,6); waveMsg='\uD83D\uDD01 RESPAWNED'; waveMsgT=now+1800;
  } else if(id==='quickmed'){
    player.hp=Math.min(perks.maxhp, player.hp + perks.maxhp*0.33);
    burst(player.x,player.y,'#ff6b8a',16,4); waveMsg='\u2764\uFE0F +33% HP'; waveMsgT=now+1400;
  } else if(id==='invinc'){
    invincUntil=now+15000;
    burst(player.x,player.y,'#ffe23b',20,5); waveMsg='\u2728 INVINCIBLE 15s'; waveMsgT=now+1600;
  } else if(id==='waveskip'){
    waveSkipPending=3;                              // next 3 wave-clears grant upgrades w/o combat
    // clear the field and jump to the upgrade flow immediately
    enemies=[]; ebullets=[]; spawnQueue=[];
    waveMsg='\u23ED\uFE0F WAVE SKIPPER \u2014 3 free upgrades'; waveMsgT=now+2000;
  } else if(id==='airdrop'){
    // Medkits are kill-guaranteed, never random. Airdrops are 99% ammo and a
    // 1% 10-base-gem jackpot (scaled 10x).
    const r=Math.random();
    if(r<0.99){ pickups.push({x:player.x+rand(-30,30),y:player.y+rand(-30,30),type:'ammo'}); waveMsg='\uD83D\uDCE6 AMMO CRATE'; }
    else if(gemRewardsEnabled()){
      const jackpotGems=10*GEM_REWARD_SCALE; addGems(jackpotGems);
      waveMsg='\uD83D\uDCE6 JACKPOT +'+jackpotGems+' \uD83D\uDC8E';
    }
    else waveMsg='\uD83D\uDCE6 JACKPOT \u2014 '+(testMode?'NO GEMS IN TEST MODE':'SIGN IN FOR GEMS');
    waveMsgT=now+1600; burst(player.x,player.y,'#cdd6b0',14,4);
  }
  sfx('pickup');
  return true;
}
function igniteEnemy(e, activeSecs){
  // active window is the hotter spray phase; residual keeps burning 3 more seconds after it ends
  if(activeSecs) e.burnActiveUntil = Math.max(e.burnActiveUntil||0, now + activeSecs*1000);
  const activeEnd = Math.max(e.burnActiveUntil||0, now);
  e.burnUntil = Math.max(e.burnUntil||0, activeEnd + 3000);   // 3 extra seconds of residual burn
}
function applyPoison(e){
  // each dart adds a stack (cap 8); refreshes the 4s poison window
  e.poisonStacks = Math.min(8, (e.poisonStacks||0) + 1);
  e.poisonUntil  = now + 4000;
}
// time effects: capsule field slows everyone to 25%; timeturner cuts speed 20% per hit (stacking)
function enemySpeedMul(e){
  let m=1;
  if(now<timeStopUntil) m*=0.25;
  if(e.dragUntil>now) m*=Math.pow(0.8, e.chronoStacks||1);
  else if(e.chronoStacks) e.chronoStacks=0;          // window lapsed: stacks decay
  return m;
}
// frozen enemies take HALF damage from a discrete hit, and that hit thaws them.
// returns the damage multiplier to apply for this hit.
function freezeHit(e){
  if(e.frozenUntil>now){
    e.frozenUntil=0;                       // first hit unfreezes
    burst(e.x,e.y,'#bfefff',10,4);
    return 0.5;                            // this hit lands at half
  }
  return 1;
}
function killEnemy(j){
  const e=enemies[j], t=ETYPES[e.type];
  burst(e.x,e.y,t.col,16,4.5);
  if(loadout.utility==='medkit' && practiceMode!=='arena' && medKillCharge<medKillsRequired()){
    medKillCharge=Math.min(medKillsRequired(),medKillCharge+1);
    if(medKillCharge>=medKillsRequired()){
      waveMsg='\u2695 MEDKIT READY'; waveMsgT=now+1300; sfx('loaded');
    }
  }
  if(practiceMode){
    // practice kills give no score, loot, or task credit; mark the slot for its 3s respawn
    if(tutorialOn) tutKilled++;                        // the tutorial still counts them
    if(e.spawnId!=null && practiceSpawns[e.spawnId]){
      practiceSpawns[e.spawnId].alive=false;
      practiceSpawns[e.spawnId].respawnAt=now+3000;
    }
  } else {
    score+=t.score; kills++;
    if(!practiceMode && !testMode){ killCoinAcc++; if(killCoinAcc>=20){ killCoinAcc-=20; addCoins(3); } }   // 20 eliminations -> 3 coins (halved; off in test mode)
    if(score>hiScore){ hiScore=score; saveMeta(); }
    if(perks.surge) surgeT=now+3000;
    medDropKillAcc++;
    if(medDropKillAcc>=medDropKillsRequired()){
      medDropKillAcc=0;
      // A boss already guarantees a medkit below; that single pack also
      // satisfies a cadence threshold instead of creating two on one kill.
      if(!t.boss) pickups.push({x:e.x,y:e.y,type:'med'});
    }
    if(Math.random()<0.165) pickups.push({x:e.x+rand(-10,10),y:e.y+rand(-10,10),type:'ammo'});
    taskProgress('kills',1);
    if(t.boss){
      taskProgress('bosses',1);
      pickups.push({x:e.x-32,y:e.y,type:'med'},{x:e.x+32,y:e.y,type:'ammo'},{x:e.x,y:e.y+32,type:'ammo'});
      // weapon-mod CHESTS: purple 100%, yellow 33.3%, blue 10%, red 5%
      const CHEST={boss:[0.05,60], bossBlue:[0.10,120], bossYellow:[0.333,250], bossPurple:[1.0,600]}[e.type];
      if(CHEST && Math.random()<CHEST[0])
        pickups.push({x:e.x,y:e.y-34,type:'chest',coins:CHEST[1]});
    }
  }
  enemies.splice(j,1);
  sfx('die');
  if(perks.explode){
    burst(e.x,e.y,'#e8b658',22,6); addShake(3);
    for(const o of enemies) if(dist2(o.x,o.y,e.x,e.y)<90*90) damageEnemy(o,45*perks.dmg*perks.explode);
    let idx;
    while((idx=enemies.findIndex(o=>o.hp<=0))>=0) killEnemy(idx);
  }
}
