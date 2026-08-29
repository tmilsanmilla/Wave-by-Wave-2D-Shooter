"use strict";

function meleeAbility(){
  if(state!=='play') return;
  if(practiceMode==='arena'&&!arenaCanAct()){ sfx('dry'); return; }
  const k=player.cur;
  if(typeof isLocked==='function'&&isLocked(k)){
    if(typeof dropUnownedFromLoadout==='function')dropUnownedFromLoadout();sfx('dry');return;
  }
  const ready = now >= (abilityCD[k]||0);
  let activated=false;
  if(k==='scythe'){                                  // reaper dash: far, slow to restore
    if(!ready){ sfx('dry'); return; }
    activated=true;
    let dx=0,dy=0;
    if(keys['w'])dy--; if(keys['s'])dy++; if(keys['a'])dx--; if(keys['d'])dx++;
    if(!dx&&!dy){ const a=aimAngle(); dx=Math.cos(a); dy=Math.sin(a); }
    const m=Math.hypot(dx,dy);
    player.ddx=dx/m; player.ddy=dy/m; player.dashSpd=22;
    player.dashUntil=now+260;
    meleeSwing(Object.assign({}, WEAPONS.scythe, {range:105, arc:4.4}), 2.0);   // one big cleave as it launches
    player.hurtCd=Math.max(player.hurtCd,460);
    abilityCD[k]=now+abilityCdOf(k);
    for(let i=0;i<16;i++) particles.push({x:player.x,y:player.y,
      vx:-player.ddx*rand(1,4)+rand(-1,1), vy:-player.ddy*rand(1,4)+rand(-1,1),
      life:360,max:360,col:'#8fb3c9',size:2.8});
    noiseBurst(0.14,0.25,600);
  } else if(k==='terafists'){                        // FLURRY: recharge by landing normal Tera-Fist hits
    const req=teraHitsRequired(), left=Math.max(0,req-teraHitCharge);
    if(left){
      sfx('dry'); waveMsg='FLURRY \u2014 LAND '+left+' MORE HIT'+(left===1?'':'S'); waveMsgT=now+1400; return;
    }
    activated=true;
    teraHitCharge=0;
    fistFlurryUntil=now+1600; fistNextT=0;
    sfx('crit');
  } else if(k==='knife'){                            // execute: kills EVERYTHING in close range
    const R=70;
    const arenaTargets=arenaMeleeTargetsAt(player.x,player.y,R);
    const targets=practiceMode==='arena'?arenaTargets:enemies.filter(e=>Math.hypot(e.x-player.x,e.y-player.y)-e.r < R);
    if(!targets.length || !ready){ sfx('dry'); return; }
    activated=true;
    for(const best of targets){
      if(practiceMode==='arena'){
        arenaMeleeSpecialHit(best,180*perks.dmg*wm('knife').dmg,'knife');
        burst(best.x,best.y,'#ffe08a',8,4); continue;
      }
      if(!enemies.includes(best)) continue;
      const isBoss=ETYPES[best.type].boss;
      // scales with wave HP: guaranteed kill on non-bosses, 90% on Warlords
      const hdmg = isBoss ? best.maxhp*0.9*perks.dmg : Math.max(180*perks.dmg, best.maxhp);
      damageEnemy(best,hdmg*freezeHit(best),{crit:true}); best.hitT=now+90;
      burst(best.x,best.y,'#ffe08a',14,5);
      if(best.hp<=0) killEnemy(enemies.indexOf(best));
    }
    addShake(6); sfx('crit');
    player.spinT=now;                                // 360 spin animation
    player.swingT=now; player.swingA=0; player.swingArc=6.3; player.swingR=R+4; player.swingDur=180;
    abilityCD[k]=now+abilityCdOf(k);
  } else if(k==='hammer'){                           // ground slam: wide 360 shockwave
    if(!ready){ sfx('dry'); return; }
    activated=true;
    const R=160*wm('hammer').slamR;
    player.swingT=now; player.swingA=0; player.swingArc=6.3; player.swingR=R; player.swingDur=220;
    destroyMissilesInRadius(player.x, player.y, R);   // slam shockwave knocks down missiles
    if(practiceMode==='arena'){
      for(const target of arenaMeleeTargetsAt(player.x,player.y,R)){
        arenaMeleeSpecialHit(target,110*perks.dmg*wm('hammer').dmg,'hammer');
        burst(target.x,target.y,'#d05548',6,4);
      }
    }
    for(let j=enemies.length-1;j>=0;j--){
      const e=enemies[j];
      const d=Math.hypot(e.x-player.x,e.y-player.y);
      if(d < R+e.r){
        damageEnemy(e,110*perks.dmg*freezeHit(e)); e.hitT=now+90;
        const kb = e.stunUntil>now ? 0 : (ETYPES[e.type].boss ? 4 : 26);   // stunned: rooted even when hit
        e.x+=(e.x-player.x)/(d||1)*kb; e.y+=(e.y-player.y)/(d||1)*kb;
        burst(e.x,e.y,ETYPES[e.type].col,6,4);
        if(e.hp<=0) killEnemy(j);
      }
    }
    addShake(10); sfx('die');
    abilityCD[k]=now+abilityCdOf(k);
  } else if(k==='twinsai'){                          // PARRY stance: reflect incoming shots for the full window
    if(!ready){ sfx('dry'); return; }
    activated=true;
    parryUntil=now+TWIN_SAI_PARRY_MS; parrySeq++;    // Party validates one timed activation per cooldown
    // Keep the guard centered on the live crosshair instead of borrowing the
    // chainsaw's full-circle swing animation.
    player.swingT=now; player.swingA=aimAngle(); player.swingSide=1; player.swingArc=0.6; player.swingR=60; player.swingDur=160;
    for(let i=0;i<14;i++) particles.push({x:player.x,y:player.y,
      vx:Math.cos(i/14*TAU)*rand(1.5,4), vy:Math.sin(i/14*TAU)*rand(1.5,4),
      life:340,max:340,col:'#bfe8ff',size:2.6});
    sfx('swap');
    abilityCD[k]=now+abilityCdOf(k);
  } else if(k==='chainsaw'){                         // RIP: constant nearby damage + i-frames, with no forced lunge
    if(!ready){ sfx('dry'); return; }
    activated=true;
    sawChargeUntil=now+400; sawChargeTick=0; sawChargeDmg=42; sawChargeR=72;
    player.hurtCd=Math.max(player.hurtCd,550);       // i-frames through the whole RIP
    abilityCD[k]=now+abilityCdOf(k);
    noiseBurst(0.2,0.3,300);
  } else if(k==='bdaggers'){                         // hurl both flaming blades straight at the crosshair
    if(!ready || daggersOut){ sfx('dry'); return; }
    activated=true;
    const a=aimAngle();
    abilityCD[k]=now+abilityCdOf(k);
    daggersOut = { t:now+1500, end:abilityCD[k], blades:[] }; // fixed 3s cooldown
    // both blades fly along the exact aim line, offset only slightly side-to-side so they don't overlap
    for(const perp of [-6, 6]){
      const ox=Math.cos(a+Math.PI/2)*perp, oy=Math.sin(a+Math.PI/2)*perp;
      daggersOut.blades.push({x:player.x+ox, y:player.y+oy,
                              vx:Math.cos(a)*15, vy:Math.sin(a)*15,
                              returning:false, hits:new Set()});
    }
    sfx('slash');
  }
  // Count only an ability that actually activated. A dry/cooldown/out-of-range
  // press returns above and cannot pass the hands-on tutorial drill.
  if(tutorialOn&&activated){
    if(typeof tutorialRecordMeleeAbility==='function') tutorialRecordMeleeAbility();
    else tutMeleeUsed=true;
  }
}
