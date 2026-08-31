"use strict";

/* ---------------- offline arena: one-device 1v1 vs AI ---------------- */
const BOT_AI=Object.freeze({weapon:'ar',damage:48,fireMs:245,reactionMs:575,moveSpeed:2.60,
  retreat:240,approach:535,maxRange:840,forgiveness:8,aimNoise:0.045,shotJitter:0.0165,
  fireAimError:0.065,leadFactor:0.52,maxLeadMs:170,thinkMs:158,turnRate:0.066});
const CPU_AI_LOADOUT=Object.freeze({primary:'ar',secondary:'m9',melee:'knife'});
// Ranked CPU ranged damage has one visible difficulty curve: Impossible reaches
// the normal weapon baseline, while lower tiers deal less. Cadence, range,
// magazines, reloads, equip times, and melee output remain identical.
const CPU_AI_WEAPON_RULES=Object.freeze({
  ar:Object.freeze({damage:BOT_AI.damage,fireMs:BOT_AI.fireMs,maxRange:BOT_AI.maxRange,forgiveness:BOT_AI.forgiveness}),
  m9:Object.freeze({damage:38,fireMs:200,maxRange:440,forgiveness:5}),
  knife:Object.freeze({damage:48,fireMs:380,maxRange:130,forgiveness:0}),
});
function cpuAiRangedDamage(rule,config){
  const base=Math.max(0,+rule?.damage||0),scale=clamp(config?.rangedDamageScale==null?1:+config.rangedDamageScale,.1,1);
  return Math.max(1,Math.round(base*scale));
}
const CPU_AI_KNIFE_ABILITY_RANGE=70,CPU_AI_KNIFE_ABILITY_DAMAGE=180,
  CPU_AI_KNIFE_ABILITY_COOLDOWN_MS=4800,CPU_AI_KNIFE_ABILITY_VISUAL_MS=250;
const CPU_AI_TNT_RETHINK_MS=200,CPU_AI_TNT_SCORE_MIN=45,CPU_AI_TNT_AVOID_PAD=42;
const CPU_AI_MOVE_MIN_MS=550,CPU_AI_MOVE_MAX_MS=1300,CPU_AI_TRACK_JUMP=180;
const CPU_AI_NAV_CLEARANCE=10,CPU_AI_NAV_STEP=12,CPU_AI_NAV_REUSE_MS=450,CPU_AI_STUCK_TICKS=3,CPU_AI_STUCK_RECOVERY_MS=900;
const CPU_AI_HIT_RESPONSE_HOLD_MS=650,CPU_AI_OSCILLATION_WINDOW_MS=900,CPU_AI_OSCILLATION_REVERSALS=3,
  CPU_AI_OSCILLATION_MIN_TRAVEL=24,CPU_AI_OSCILLATION_NET_RATIO=.42;

/* Bot choices use a private round-seeded stream. Gameplay/VFX calls to
   Math.random can no longer change a bot's next dodge or shot, and every
   choice is made only on fixed simulation deadlines. */
function cpuAiSeed(...parts){
  let h=2166136261>>>0;
  const flat=parts.flat?parts.flat(Infinity):parts;
  for(const c of flat.map(v=>String(v??'')).join('|')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
  return h||0x9e3779b9;
}
function cpuAiNext(bot){
  let x=(bot&&bot.aiRng)>>>0;if(!x)x=0x9e3779b9;
  x^=x<<13;x^=x>>>17;x^=x<<5;x>>>=0;
  if(bot)bot.aiRng=x||0x9e3779b9;
  return x/4294967296;
}
function cpuAiRange(bot,min,max){return min+cpuAiNext(bot)*(max-min);}
function cpuAiAngleDelta(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
function cpuAiBotLoadout(bot){
  const raw=bot&&bot.loadout||CPU_AI_LOADOUT;
  return {
    primary:raw.primary==='ar'?'ar':CPU_AI_LOADOUT.primary,
    secondary:raw.secondary==='m9'?'m9':CPU_AI_LOADOUT.secondary,
    melee:raw.melee==='knife'?'knife':CPU_AI_LOADOUT.melee,
  };
}
function cpuAiInitBotWeapons(bot,clock=0){
  if(!bot)return null;
  const kit=cpuAiBotLoadout(bot);bot.loadout=kit;
  bot.aiWeaponMags={ar:WEAPONS.ar.mag,m9:WEAPONS.m9.mag};
  bot.aiWeaponLastShot={ar:0,m9:0,knife:0};
  bot.aiReloadWeapon='';bot.reloadEnd=0;bot.cur=kit.primary;bot.mag=bot.aiWeaponMags[bot.cur];bot.lastShot=0;
  bot.equipEnd=clock+600;bot.aiWeaponThinkAt=clock;bot.aiWeaponLockUntil=clock;
  bot.aiMeleeAbilityReadyAt=clock;
  bot.aiPressureTargetId='';bot.aiPressureBurstUntil=0;bot.aiPressureShotsLeft=0;bot.aiPressureDecisionAt=clock;
  bot.aiSeenTargetId='';bot.aiSeenTargetX=0;bot.aiSeenTargetY=0;bot.aiSeenTargetAt=-Infinity;
  bot.aiParryTargetId='';bot.aiParryVisible=false;bot.aiParryReactAt=0;bot.aiParryWillRespect=false;
  bot.aiParryWillMelee=false;bot.aiParryReacted=false;bot.aiParryCautionUntil=0;
  bot.aiMeleeSide=1;bot.swingSeq=0;bot.swingT=0;bot.swingA=0;bot.swingArc=0;bot.swingR=0;bot.swingDur=0;bot.swingSide=1;
  bot.meleeFxSeq=0;bot.meleeFxKey='';bot.meleeFxStart=0;bot.meleeFxUntil=0;
  bot.meleeFxAngle=0;bot.meleeFxReadyAt=0;bot.meleeFxBlades=[];bot.meleeFxWallRecallSeq=0;
  return bot;
}
function cpuAiSyncBotWeaponState(bot){
  if(!bot)return;
  const key=String(bot.cur||''),w=WEAPONS[key];
  bot.mag=w&&w.melee?Infinity:Math.max(0,+bot.aiWeaponMags?.[key]||0);
  bot.lastShot=Math.max(0,+bot.aiWeaponLastShot?.[key]||0);
}
function cpuAiCompleteBotReload(bot,clock){
  if(!bot)return false;
  if(!bot.aiWeaponMags||!bot.aiWeaponLastShot)cpuAiInitBotWeapons(bot,clock);
  if(!bot.reloadEnd||clock<bot.reloadEnd)return false;
  const key=String(bot.aiReloadWeapon||'');bot.reloadEnd=0;bot.aiReloadWeapon='';
  if(key&&key===bot.cur&&WEAPONS[key]&&!WEAPONS[key].melee){bot.aiWeaponMags[key]=WEAPONS[key].mag;cpuAiSyncBotWeaponState(bot);return true;}
  cpuAiSyncBotWeaponState(bot);return false;
}
function cpuAiSwitchBotWeapon(bot,key,clock,commitMs=650){
  const kit=cpuAiBotLoadout(bot);if(!bot||![kit.primary,kit.secondary,kit.melee].includes(key)||!WEAPONS[key])return false;
  if(bot.cur===key){cpuAiSyncBotWeaponState(bot);return false;}
  // Match player rules: switching cancels, rather than completes, a reload.
  bot.reloadEnd=0;bot.aiReloadWeapon='';bot.cur=key;
  const draw=typeof weaponEquipMs==='function'?weaponEquipMs(key):(key==='m9'?120:380);
  bot.equipEnd=clock+draw;bot.aiWeaponLockUntil=clock+Math.max(draw,commitMs);cpuAiSyncBotWeaponState(bot);return true;
}
function cpuAiStartBotReload(bot,key,clock){
  if(!bot||key!==bot.cur||!WEAPONS[key]||WEAPONS[key].melee||bot.reloadEnd)return false;
  if((+bot.aiWeaponMags?.[key]||0)>=WEAPONS[key].mag)return false;
  bot.aiReloadWeapon=key;bot.reloadEnd=clock+WEAPONS[key].reload;cpuAiSyncBotWeaponState(bot);return true;
}
function cpuAiSpendBotRound(bot,key,clock){
  if(!bot||!bot.aiWeaponMags||!bot.aiWeaponLastShot||WEAPONS[key]?.melee)return false;
  const left=Math.max(0,+bot.aiWeaponMags[key]||0);if(left<1)return false;
  bot.aiWeaponMags[key]=left-1;bot.aiWeaponLastShot[key]=clock;cpuAiSyncBotWeaponState(bot);return true;
}
function cpuAiMeleeClear(bot,target){
  if(!bot||!target)return false;
  if(typeof arenaMeleeLineClear==='function')return arenaMeleeLineClear(bot.x,bot.y,target.x,target.y);
  return !cpuAiLosBlocked(bot.x,bot.y,target.x,target.y);
}
function cpuAiChooseBotWeapon(bot,target,clock,config,parryResponse=null){
  if(!bot||!target)return '';
  config=config&&typeof config==='object'?config:{};
  if(!bot.aiWeaponMags||!bot.aiWeaponLastShot)cpuAiInitBotWeapons(bot,clock);
  cpuAiCompleteBotReload(bot,clock);
  if(clock<(+bot.aiWeaponThinkAt||0))return bot.cur;
  bot.aiWeaponThinkAt=clock+Math.max(70,+config.weaponThinkMs||220);
  const kit=cpuAiBotLoadout(bot),distance=Math.hypot(target.x-bot.x,target.y-bot.y),counterMelee=!!parryResponse?.forceMelee,
    // Draw only when the knife can already connect. Difficulty and a visible
    // Twin Sai guard may improve decision speed, never create a ranged lunge.
    meleeDecisionRange=WEAPONS[kit.melee].range+Math.max(1,+target.r||15),
    meleeClear=distance<=meleeDecisionRange&&cpuAiMeleeClear(bot,target);
  if(meleeClear){
    if(counterMelee||bot.cur===kit.melee||clock>=(+bot.aiWeaponLockUntil||0))
      cpuAiSwitchBotWeapon(bot,kit.melee,clock,counterMelee?Math.max(760,+config.parryMeleeCommitMs||900):760);
    return bot.cur;
  }
  if(bot.cur===kit.melee){
    if(clock<(+bot.aiWeaponLockUntil||0)&&distance<=meleeDecisionRange+20&&cpuAiMeleeClear(bot,target))return bot.cur;
    const fallback=(+bot.aiWeaponMags[kit.primary]||0)>0?kit.primary:
      ((+bot.aiWeaponMags[kit.secondary]||0)>0?kit.secondary:kit.primary);
    cpuAiSwitchBotWeapon(bot,fallback,clock,520);return bot.cur;
  }
  const current=bot.cur,primaryLeft=Math.max(0,+bot.aiWeaponMags[kit.primary]||0),secondaryLeft=Math.max(0,+bot.aiWeaponMags[kit.secondary]||0);
  if(current===kit.primary&&primaryLeft<1){
    // The M9 is an emergency fallback only. A loaded sidearm is used while
    // the empty AR needs attention; no stowed/background reload is granted.
    if(secondaryLeft>0){
      if(clock>=(+bot.aiWeaponLockUntil||0))cpuAiSwitchBotWeapon(bot,kit.secondary,clock,720);
      return bot.cur;
    }
    cpuAiStartBotReload(bot,kit.primary,clock);return bot.cur;
  }
  if(current===kit.secondary&&secondaryLeft<1){
    if(clock>=(+bot.aiWeaponLockUntil||0)){
      cpuAiSwitchBotWeapon(bot,kit.primary,clock,520);
      if(primaryLeft<1)cpuAiStartBotReload(bot,kit.primary,clock);
    }
    return bot.cur;
  }
  // A healthy AR always wins the normal weapon decision. This deliberately
  // removes random sidearm mixups that made the CPU look indecisive.
  if(current===kit.secondary&&clock>=(+bot.aiWeaponLockUntil||0)&&primaryLeft>0)cpuAiSwitchBotWeapon(bot,kit.primary,clock,520);
  cpuAiSyncBotWeaponState(bot);return bot.cur;
}
// Twin Sai counterplay uses only the guard animation that is currently visible
// through line of sight. It never reads the player's cooldown or a future input.
function cpuAiObserveVisibleParry(bot,target,clock,config,activeVisible){
  if(!bot||!target)return{visible:false,holdRanged:false,forceMelee:false};
  const targetId=String(target.id||target.aiId||'player');clock=Number.isFinite(+clock)?+clock:0;
  config=config&&typeof config==='object'?config:{};
  if(activeVisible){
    if(!bot.aiParryVisible||bot.aiParryTargetId!==targetId){
      bot.aiParryTargetId=targetId;bot.aiParryReactAt=clock+Math.max(0,+config.parryReactionMs||180);
      bot.aiParryWillRespect=cpuAiNext(bot)<clamp(config.parryRespectChance==null?.65:+config.parryRespectChance,0,1);
      bot.aiParryWillMelee=cpuAiNext(bot)<clamp(config.parryMeleeChance==null?.5:+config.parryMeleeChance,0,1);
      bot.aiParryReacted=false;
    }
    bot.aiParryVisible=true;
    const reacted=bot.aiParryWillRespect&&clock>=(+bot.aiParryReactAt||0);
    if(reacted)bot.aiParryReacted=true;
    return{visible:true,holdRanged:reacted,forceMelee:reacted&&bot.aiParryWillMelee};
  }
  if(bot.aiParryVisible){
    if(bot.aiParryTargetId===targetId&&bot.aiParryReacted)
      bot.aiParryCautionUntil=clock+Math.max(0,+config.parryReleaseDelayMs||0);
    bot.aiParryVisible=false;bot.aiParryReacted=false;
  }
  return{visible:false,holdRanged:bot.aiParryTargetId===targetId&&clock<(+bot.aiParryCautionUntil||0),forceMelee:false};
}
// Tracking and pressure fire are deliberately observation-limited. Hidden live
// coordinates never update the bot's aim memory, and remembered points are not
// extrapolated after a player reaches cover.
function cpuAiRangedAimSolution(bot,target,clock,config,lead,visible){
  if(!bot||!target)return{x:+bot?.x||0,y:+bot?.y||0,available:false,visible:false,remembered:false};
  const targetId=String(target.id||target.aiId||'player');
  if(visible){
    bot.aiSeenTargetId=targetId;bot.aiSeenTargetX=+target.x||0;bot.aiSeenTargetY=+target.y||0;bot.aiSeenTargetAt=clock;
    return{x:Number.isFinite(+lead?.x)?+lead.x:+target.x||0,y:Number.isFinite(+lead?.y)?+lead.y:+target.y||0,
      available:true,visible:true,remembered:false};
  }
  const memoryMs=Math.max(0,+config?.pressureMemoryMs||0),age=clock-(+bot.aiSeenTargetAt||0);
  if(bot.aiSeenTargetId===targetId&&age>=0&&age<=memoryMs)
    return{x:+bot.aiSeenTargetX||0,y:+bot.aiSeenTargetY||0,available:true,visible:false,remembered:true};
  const angle=Number.isFinite(+bot.angle)?+bot.angle:0;
  return{x:(+bot.x||0)+Math.cos(angle)*80,y:(+bot.y||0)+Math.sin(angle)*80,available:false,visible:false,remembered:false};
}
function cpuAiPressureFireDecision(bot,target,clock,config,options={}){
  if(!bot||!target)return{fire:false,pressure:false};
  const targetId=String(target.id||target.aiId||'player'),hold=!!options.holdRanged;
  if(hold){bot.aiPressureShotsLeft=0;bot.aiPressureBurstUntil=0;return{fire:false,pressure:false};}
  const aimErr=Math.max(0,+options.aimErr||0),base=Math.max(.001,+config?.fireAimError||BOT_AI.fireAimError),
    precise=!!options.available&&!!options.visible&&aimErr<=base;
  if(options.tnt)return{fire:precise,pressure:false};
  if(bot.aiPressureTargetId!==targetId||clock>(+bot.aiPressureBurstUntil||0)||(+bot.aiPressureShotsLeft||0)<1){
    bot.aiPressureTargetId=targetId;bot.aiPressureShotsLeft=0;bot.aiPressureBurstUntil=0;
  }
  const looseError=Math.max(base,+config?.pressureAimError||Math.max(.14,base*2.2)),
    loose=!!options.available&&aimErr<=looseError,active=(+bot.aiPressureShotsLeft||0)>0&&clock<=(+bot.aiPressureBurstUntil||0);
  if(active&&loose)return{fire:true,pressure:true};
  if(options.visible&&loose&&clock>=(+bot.aiPressureDecisionAt||0)){
    bot.aiPressureDecisionAt=clock+Math.max(100,+config?.pressureDecisionMs||450);
    if(cpuAiNext(bot)<clamp(+config?.pressureChance||0,0,1)){
      const min=Math.max(1,Math.floor(+config?.pressureBurstMin||2)),max=Math.max(min,Math.floor(+config?.pressureBurstMax||min));
      bot.aiPressureTargetId=targetId;bot.aiPressureShotsLeft=min+Math.floor(cpuAiNext(bot)*(max-min+1));
      bot.aiPressureBurstUntil=clock+Math.max(250,+config?.pressureBurstMs||750);
      return{fire:true,pressure:true};
    }
  }
  return{fire:precise,pressure:false};
}
function cpuAiRecordPressureShot(bot,decision){
  if(!bot||!decision?.pressure)return;
  bot.aiPressureShotsLeft=Math.max(0,Math.floor(+bot.aiPressureShotsLeft||0)-1);
  if(!bot.aiPressureShotsLeft)bot.aiPressureBurstUntil=0;
}
function cpuAiMeleeMovement(bot,target){
  const w=WEAPONS[bot&&bot.cur];if(!w||!w.melee||!target||!cpuAiMeleeClear(bot,target))return null;
  const dx=target.x-bot.x,dy=target.y-bot.y,d=Math.hypot(dx,dy)||1,hitRange=w.range+(+target.r||0)-5;
  if(d>hitRange)return{x:dx/d,y:dy/d,speedScale:1,phase:'melee_close'};
  const side=bot.aiMeleeSide||1;return{x:-dy/d*side*.42,y:dx/d*side*.42,speedScale:.72,phase:'melee_orbit'};
}
function cpuAiTryBotMelee(bot,target,clock,damage,onHit){
  const key=String(bot&&bot.cur||''),w=WEAPONS[key],rule=CPU_AI_WEAPON_RULES[key];
  if(!bot||!target||!w||!w.melee||!rule||clock<(+bot.equipEnd||0)||bot.reloadEnd)return false;
  const d=Math.hypot(target.x-bot.x,target.y-bot.y),targetRadius=Math.max(1,+target.r||15);
  if(d>w.range+targetRadius||!cpuAiMeleeClear(bot,target))return false;
  const targetAngle=Math.atan2(target.y-bot.y,target.x-bot.x),allow=w.arc/2+Math.asin(Math.min(1,targetRadius/(d+1)))*.8;
  if(Math.abs(cpuAiAngleDelta(targetAngle,bot.angle))>allow||clock-(+bot.aiWeaponLastShot[key]||0)<rule.fireMs)return false;
  bot.aiWeaponLastShot[key]=clock;bot.lastShot=clock;bot.swingSeq=Math.max(0,Math.floor(+bot.swingSeq||0))+1;
  bot.aiMeleeSide=(bot.aiMeleeSide||1)*-1;bot.swingSide=bot.aiMeleeSide;bot.swingT=clock;bot.swingA=targetAngle;
  bot.swingArc=w.arc;bot.swingR=w.range;bot.swingDur=clamp(w.fireRate*.55,90,260);
  if(typeof onHit==='function')onHit(clamp(+damage||rule.damage,0,250),'melee');
  if(typeof sfx==='function')sfx('slash');return true;
}
function cpuAiTryBotMeleeAbility(bot,target,clock,onHit){
  const key=String(bot&&bot.cur||''),w=WEAPONS[key];
  if(!bot||!target||key!=='knife'||!w||!w.melee||clock<(+bot.equipEnd||0)||bot.reloadEnd||
     clock<(+bot.aiMeleeAbilityReadyAt||0))return false;
  const targetRadius=Math.max(1,+target.r||15),distance=Math.hypot(target.x-bot.x,target.y-bot.y);
  if(distance>CPU_AI_KNIFE_ABILITY_RANGE+targetRadius||!cpuAiMeleeClear(bot,target))return false;
  bot.aiMeleeAbilityReadyAt=clock+CPU_AI_KNIFE_ABILITY_COOLDOWN_MS;
  bot.aiWeaponLastShot[key]=clock;bot.lastShot=clock;bot.spinT=clock;
  bot.swingSeq=Math.max(0,Math.floor(+bot.swingSeq||0))+1;bot.swingT=clock;bot.swingA=0;
  bot.swingArc=Math.PI*2;bot.swingR=CPU_AI_KNIFE_ABILITY_RANGE+4;bot.swingDur=180;bot.swingSide=1;
  bot.meleeFxSeq=Math.max(0,Math.floor(+bot.meleeFxSeq||0))+1;bot.meleeFxKey='knife';
  bot.meleeFxStart=clock;bot.meleeFxUntil=clock+CPU_AI_KNIFE_ABILITY_VISUAL_MS;bot.meleeFxAngle=bot.angle||0;
  if(typeof onHit==='function')onHit(CPU_AI_KNIFE_ABILITY_DAMAGE,'melee_ability');
  if(typeof sfx==='function')sfx('crit');return true;
}
function cpuAiObstacleContains(o,x,y,r=0){
  return !!(o&&x+r>=o.x&&x-r<=o.x+o.w&&y+r>=o.y&&y-r<=o.y+o.h);
}
// Ordinary losBlocked correctly treats live TNT as solid. This variant can
// ignore only the TNT being deliberately aimed at while retaining every wall,
// crate, and other live TNT as cover.
function cpuAiLosBlocked(x0,y0,x1,y1,ignoreTntId=''){
  const solids=typeof activeObstacles==='function'?activeObstacles():null;
  if(!Array.isArray(solids))return typeof losBlocked==='function'?losBlocked(x0,y0,x1,y1):false;
  const dx=x1-x0,dy=y1-y0,d=Math.hypot(dx,dy),steps=Math.max(2,Math.ceil(d/12)),skip=String(ignoreTntId||'');
  for(let i=1;i<steps;i++){
    const x=x0+dx*i/steps,y=y0+dy*i/steps;
    for(const o of solids){if(skip&&String(o.id||'')===skip)continue;if(cpuAiObstacleContains(o,x,y))return true;}
  }
  return false;
}
function cpuAiTrackTarget(bot,target,dtms,clock=null){
  if(!bot||!target)return null;
  const id=String(target.id||target.aiId||'player'),x=Number.isFinite(+target.x)?+target.x:0,y=Number.isFinite(+target.y)?+target.y:0;
  if(!bot.aiTracks||typeof bot.aiTracks!=='object')bot.aiTracks=Object.create(null);
  const old=bot.aiTracks[id],observedAt=clock!==null&&Number.isFinite(+clock)?+clock:null,
    elapsedMs=old&&observedAt!==null&&Number.isFinite(+old.observedAt)?Math.max(0,observedAt-(+old.observedAt)):(Number.isFinite(+dtms)?+dtms:16.667),
    ticks=Math.max(.25,elapsedMs/16.667);
  let vx=0,vy=0;
  if(old&&Math.hypot(x-old.x,y-old.y)<=CPU_AI_TRACK_JUMP){
    const sx=clamp((x-old.x)/ticks,-12,12),sy=clamp((y-old.y)/ticks,-12,12);
    vx=(old.vx||0)*.68+sx*.32;vy=(old.vy||0)*.68+sy*.32;
  }
  const track={id,x,y,vx,vy,observedAt:observedAt===null?(old&&Number.isFinite(+old.observedAt)?+old.observedAt+elapsedMs:elapsedMs):observedAt};
  bot.aiTracks[id]=track;return track;
}
function cpuAiLeadPoint(bot,target,weaponId,leadFactor,maxLeadMs){
  const id=String(target&&target.id||target&&target.aiId||'player'),track=bot&&bot.aiTracks&&bot.aiTracks[id],
    tx=track?track.x:+target.x||0,ty=track?track.y:+target.y||0,vx=track?track.vx:0,vy=track?track.vy:0,
    speed=Math.max(.001,typeof weaponBulletSpeed==='function'?weaponBulletSpeed(weaponId):1),dist=Math.hypot(tx-bot.x,ty-bot.y),
    ticks=Math.min(dist/speed*clamp(+leadFactor||0,0,1),Math.max(0,+maxLeadMs||0)/16.667),
    bounds=typeof activeArenaBounds==='function'?activeArenaBounds():{left:0,top:0,right:WORLD.w,bottom:WORLD.h},r=Math.max(1,+target.r||15);
  for(const scale of [1,.75,.5,.25,0]){
    const x=clamp(tx+vx*ticks*scale,bounds.left+r,bounds.right-r),y=clamp(ty+vy*ticks*scale,bounds.top+r,bounds.bottom-r);
    if(!cpuAiLosBlocked(bot.x,bot.y,x,y))return{x,y,leadMs:ticks*scale*16.667,visible:true};
  }
  return{x:clamp(tx,bounds.left+r,bounds.right-r),y:clamp(ty,bounds.top+r,bounds.bottom-r),leadMs:0,visible:false};
}
function cpuAiShotDamageAt(shot,distance){
  const damage=Math.max(0,+shot.damage||0),range=Math.max(1,+shot.rng||1),fall=clamp(+shot.fall||0,0,1);
  if(distance<=range)return damage;
  return damage*(1-(1-fall)*Math.min(1,(distance-range)/range));
}
function cpuAiTntPlan(bot,foes,allies,shot,clock){
  const live=typeof activeArenaTnt==='function'?activeArenaTnt():[],avoid=[];
  foes=Array.isArray(foes)?foes.filter(a=>a&&a.hp>0):[];allies=Array.isArray(allies)?allies.filter(a=>a&&a.hp>0):[];
  let best=null;
  for(const t of live){
    const cx=t.x+t.w/2,cy=t.y+t.h/2,radius=t.radius+CPU_AI_TNT_AVOID_PAD,d=Math.hypot(bot.x-cx,bot.y-cy),
      hp=typeof arenaTntHp==='function'?arenaTntHp(t.id):(+t.hp||ARENA_TNT_HP),durability=clamp(1-hp/Math.max(1,+t.hp||ARENA_TNT_HP),0,1),
      risk=.45+.55*durability;
    avoid.push({id:t.id,x:cx,y:cy,radius,risk});
    if(!foes.length||(Number.isFinite(+shot.maxRange)&&d>+shot.maxRange)||cpuAiLosBlocked(bot.x,bot.y,cx,cy,t.id))continue;
    const hit=cpuAiShotDamageAt(shot,d),shotsToBreak=Math.ceil(hp/Math.max(.1,hit));if(!hit||!Number.isFinite(shotsToBreak))continue;
    let enemyDamage=0,allyDamage=0,enemyKills=0,allyKills=0;
    for(const a of foes){const blast=typeof arenaTntDamage==='function'?arenaTntDamage(a,t):0,dealt=Math.min(a.hp,blast);enemyDamage+=dealt;if(blast>=a.hp)enemyKills++;}
    for(const a of allies){const blast=typeof arenaTntDamage==='function'?arenaTntDamage(a,t):0,dealt=Math.min(a.hp,blast);allyDamage+=dealt;if(blast>=a.hp)allyKills++;}
    if(enemyDamage<=0)continue;
    const selfBlast=typeof arenaTntDamage==='function'?arenaTntDamage(bot,t):0,selfLethal=selfBlast>=bot.hp,
      allFoesDie=foes.every(a=>(typeof arenaTntDamage==='function'?arenaTntDamage(a,t):0)>=a.hp),
      teammateSurvives=allies.some(a=>a!==bot&&String(a.id||'')!==String(bot.id||'')&&(typeof arenaTntDamage==='function'?arenaTntDamage(a,t):0)<a.hp);
    if(selfLethal&&!(allFoesDie&&teammateSurvives))continue;
    const score=enemyDamage+100*enemyKills-1.4*allyDamage-140*allyKills-7*shotsToBreak;
    const candidate={targetId:String(t.id),aimX:cx,aimY:cy,score,shotsToBreak,avoid};
    if(score>=CPU_AI_TNT_SCORE_MIN&&(!best||score>best.score||(score===best.score&&candidate.targetId<best.targetId)))best=candidate;
  }
  return best||{targetId:null,aimX:0,aimY:0,score:-Infinity,shotsToBreak:0,avoid};
}
function cpuAiPositionBlocked(x,y,r=15){
  const bounds=typeof activeArenaBounds==='function'?activeArenaBounds():{left:0,top:0,right:WORLD.w,bottom:WORLD.h};
  if(x-r<bounds.left||x+r>bounds.right||y-r<bounds.top||y+r>bounds.bottom)return true;
  const solids=typeof activeObstacles==='function'?activeObstacles():[];
  return solids.some(o=>cpuAiObstacleContains(o,x,y,r));
}
function cpuAiNavHazardsClear(x0,y0,x1,y1,avoid){
  for(const zone of Array.isArray(avoid)?avoid:[]){
    const radius=Math.max(0,+zone.radius||0);if(!radius)continue;
    const sx=x0-zone.x,sy=y0-zone.y,ex=x1-zone.x,ey=y1-zone.y,startD=Math.hypot(sx,sy),endD=Math.hypot(ex,ey),
      dx=x1-x0,dy=y1-y0,len2=dx*dx+dy*dy,t=len2?clamp(((zone.x-x0)*dx+(zone.y-y0)*dy)/len2,0,1):0,
      closestD=Math.hypot(x0+dx*t-zone.x,y0+dy*t-zone.y);
    // An actor caught in a blast zone may route out, but never along an edge
    // which first moves deeper. Actors already clear may not cut the circle.
    if(startD<radius){
      if(endD<=startD+1) return false;
      const steps=Math.max(2,Math.ceil(Math.hypot(dx,dy)/CPU_AI_NAV_STEP));let previous=startD;
      for(let i=1;i<=steps;i++){
        const d=Math.hypot(x0+dx*i/steps-zone.x,y0+dy*i/steps-zone.y);
        if(d+1<previous)return false;previous=d;
      }
    }else if(closestD<radius)return false;
  }
  return true;
}
function cpuAiMoveSegmentClear(x0,y0,x1,y1,r=15,avoid=[]){
  if(!cpuAiNavHazardsClear(x0,y0,x1,y1,avoid))return false;
  const dx=x1-x0,dy=y1-y0,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/CPU_AI_NAV_STEP));
  for(let i=1;i<=steps;i++)if(cpuAiPositionBlocked(x0+dx*i/steps,y0+dy*i/steps,r))return false;
  return true;
}
function cpuAiNavCandidatePoints(r=15,avoid=[]){
  const bounds=typeof activeArenaBounds==='function'?activeArenaBounds():{left:0,top:0,right:WORLD.w,bottom:WORLD.h},
    solids=typeof activeObstacles==='function'?activeObstacles():[],pad=r+CPU_AI_NAV_CLEARANCE,out=[],seen=new Set();
  const add=(x,y,key)=>{
    x=clamp(x,bounds.left+r+2,bounds.right-r-2);y=clamp(y,bounds.top+r+2,bounds.bottom-r-2);
    const hash=Math.round(x*10)+':'+Math.round(y*10);if(seen.has(hash)||cpuAiPositionBlocked(x,y,r))return;
    if(!cpuAiNavHazardsClear(x,y,x,y,avoid))return;seen.add(hash);out.push({x,y,key});
  };
  // Expanded rectangle corners form a compact visibility graph. They let a
  // bot commit to a wall corner beyond its old short collision probe.
  solids.forEach((o,i)=>{
    if(!o)return;
    add(o.x-pad,o.y-pad,'wall-'+i+'-nw');add(o.x+o.w+pad,o.y-pad,'wall-'+i+'-ne');
    add(o.x-pad,o.y+o.h+pad,'wall-'+i+'-sw');add(o.x+o.w+pad,o.y+o.h+pad,'wall-'+i+'-se');
  });
  return out;
}
function cpuAiCoverPoint(bot,target,avoid=[]){
  if(!bot||!target)return null;
  const candidates=cpuAiNavCandidatePoints(Math.max(1,+bot.r||15),avoid),preferred=330;let best=null;
  for(const point of candidates){
    if(!cpuAiLosBlocked(target.x,target.y,point.x,point.y))continue;
    const travel=Math.hypot(point.x-bot.x,point.y-bot.y),enemyD=Math.hypot(point.x-target.x,point.y-target.y);
    if(travel>620||enemyD<150)continue;
    const score=travel+Math.abs(enemyD-preferred)*.22;
    if(!best||score<best.score-1e-6||(Math.abs(score-best.score)<=1e-6&&point.key<best.key))best={...point,score};
  }
  return best;
}
function cpuAiFindPath(bot,goal,avoid=[],clock=0,allowPortals=true){
  if(!bot||!goal)return null;
  const r=Math.max(1,+bot.r||15),bounds=typeof activeArenaBounds==='function'?activeArenaBounds():{left:0,top:0,right:WORLD.w,bottom:WORLD.h},
    gx=clamp(+goal.x||bot.x,bounds.left+r+2,bounds.right-r-2),gy=clamp(+goal.y||bot.y,bounds.top+r+2,bounds.bottom-r-2);
  if(cpuAiPositionBlocked(gx,gy,r))return null;
  const portals=allowPortals&&typeof activeArenaPortals==='function'&&clock>=(bot.portalLockUntil||0)?activeArenaPortals().slice():[];
  // Most fights do not need a graph at all. Keep the common clear route cheap;
  // Dimension still builds the graph so a useful teleport can beat walking.
  if(!portals.length&&cpuAiMoveSegmentClear(bot.x,bot.y,gx,gy,r,avoid)){
    const path=[{x:bot.x,y:bot.y,key:'start'},{x:gx,y:gy,key:'goal'}];
    return{x:gx,y:gy,path,usesPortal:false,cost:Math.hypot(gx-bot.x,gy-bot.y)};
  }
  const nodes=[{x:bot.x,y:bot.y,key:'start'},{x:gx,y:gy,key:'goal'},...cpuAiNavCandidatePoints(r,avoid)],teleports=[];
  // Portals are directed low-cost graph edges. Walking to an entry is still
  // ordinary movement; only the paired jump receives the shortcut cost.
  portals.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  for(const entry of portals){
    const exit=portals.find(p=>String(p.id)===String(entry.pair));if(!exit)continue;
    const a=Math.atan2(exit.y-entry.y,exit.x-entry.x),clearance=(+exit.r||40)+r+12,
      landing={x:exit.x+Math.cos(a)*clearance,y:exit.y+Math.sin(a)*clearance,key:'portal-land-'+entry.id};
    if(cpuAiPositionBlocked(entry.x,entry.y,r)||cpuAiPositionBlocked(landing.x,landing.y,r)||
       !cpuAiNavHazardsClear(entry.x,entry.y,entry.x,entry.y,avoid)||!cpuAiNavHazardsClear(landing.x,landing.y,landing.x,landing.y,avoid))continue;
    const from=nodes.length;nodes.push({x:entry.x,y:entry.y,key:'portal-enter-'+entry.id,portalId:String(entry.id)});
    const to=nodes.length;nodes.push(landing);teleports.push({from,to,cost:28});
  }
  const special=new Map(teleports.map(edge=>[edge.from,edge])),n=nodes.length,dist=new Array(n).fill(Infinity),prev=new Array(n).fill(-1),used=new Array(n).fill(false);
  dist[0]=0;
  for(let pass=0;pass<n;pass++){
    let at=-1;
    for(let i=0;i<n;i++)if(!used[i]&&(at<0||dist[i]<dist[at]-1e-6||(Math.abs(dist[i]-dist[at])<=1e-6&&nodes[i].key<nodes[at].key)))at=i;
    if(at<0||!Number.isFinite(dist[at])||at===1)break;used[at]=true;
    const relax=(to,cost)=>{const next=dist[at]+cost;if(next<dist[to]-1e-6){dist[to]=next;prev[to]=at;}};
    const jump=special.get(at);if(jump)relax(jump.to,jump.cost);
    for(let to=0;to<n;to++){
      if(to===at||used[to])continue;
      const a=nodes[at],b=nodes[to];if(!cpuAiMoveSegmentClear(a.x,a.y,b.x,b.y,r,avoid))continue;
      let cost=Math.hypot(b.x-a.x,b.y-a.y);
      if(at===0&&clock<(bot.aiStuckUntil||0)){
        const failedX=+bot.aiFailedMoveX||0,failedY=+bot.aiFailedMoveY||0,len=Math.hypot(b.x-a.x,b.y-a.y)||1,failedLen=Math.hypot(failedX,failedY)||1;
        if((b.x-a.x)/len*failedX/failedLen+(b.y-a.y)/len*failedY/failedLen>.72)cost+=900;
      }
      relax(to,cost);
    }
  }
  if(!Number.isFinite(dist[1]))return null;
  const path=[];for(let at=1;at>=0;at=prev[at]){path.push(at);if(at===0)break;if(prev[at]<0)return null;}path.reverse();
  let pick=path[1];for(let i=1;i<path.length;i++){pick=path[i];if(Math.hypot(nodes[pick].x-bot.x,nodes[pick].y-bot.y)>r+5)break;}
  const waypoint=nodes[pick],usesPortal=path.some(i=>nodes[i].portalId);
  return {x:waypoint.x,y:waypoint.y,path:path.map(i=>({x:nodes[i].x,y:nodes[i].y,key:nodes[i].key})),usesPortal,cost:dist[1]};
}
function cpuAiResetMotionWindow(bot,clock,x=bot&&bot.x,y=bot&&bot.y){
  if(!bot)return;
  bot.aiMotionWindowAt=clock;bot.aiMotionAnchorX=+x||0;bot.aiMotionAnchorY=+y||0;
  bot.aiMotionTravel=0;bot.aiMotionReversals=0;bot.aiMotionDx=0;bot.aiMotionDy=0;bot.aiMotionSampleAt=clock;
}
function cpuAiStartMovementRecovery(bot,clock,failedX=bot&&bot.moveX,failedY=bot&&bot.moveY){
  if(!bot)return false;
  bot.aiStuckTicks=0;bot.aiStuckUntil=clock+CPU_AI_STUCK_RECOVERY_MS;
  bot.aiFailedMoveX=+failedX||0;bot.aiFailedMoveY=+failedY||0;bot.aiSide=-(bot.aiSide||1);
  bot.aiTactic='flank';bot.aiTacticUntil=clock;bot.aiTacticMinUntil=clock;bot.aiPlanMoveX=0;bot.aiPlanMoveY=0;
  bot.aiNavPath=[];bot.aiNavUntil=0;bot.aiUsingPortal=false;
  // A recovery is a short direction commitment, so more pellets from the same
  // burst cannot immediately cancel it and start another left/right re-roll.
  bot.aiHitResponseUntil=Math.max(+bot.aiHitResponseUntil||0,bot.aiStuckUntil);
  if(typeof cpuAiClearPeek==='function')cpuAiClearPeek(bot,clock);
  cpuAiResetMotionWindow(bot,clock,bot.x,bot.y);return true;
}
function cpuAiObserveMovement(bot,clock){
  if(!bot)return false;
  if(clock<(+bot.aiDodgeUntil||0)){
    bot.lastThinkX=bot.x;bot.lastThinkY=bot.y;cpuAiResetMotionWindow(bot,clock,bot.x,bot.y);return false;
  }
  const oldX=Number.isFinite(+bot.lastThinkX)?+bot.lastThinkX:+bot.x||0,oldY=Number.isFinite(+bot.lastThinkY)?+bot.lastThinkY:+bot.y||0,
    currentX=+bot.x||0,currentY=+bot.y||0,dx=currentX-oldX,dy=currentY-oldY,moved=Math.hypot(dx,dy),
    trying=Math.hypot(+bot.moveX||0,+bot.moveY||0)>.25;
  bot.lastThinkX=bot.x;bot.lastThinkY=bot.y;
  if(trying&&moved<2)bot.aiStuckTicks=Math.max(0,Math.floor(+bot.aiStuckTicks||0))+1;else bot.aiStuckTicks=0;

  const invalidWindow=!Number.isFinite(+bot.aiMotionWindowAt)||clock<(+bot.aiMotionWindowAt||0)||clock-(+bot.aiMotionWindowAt||0)>CPU_AI_OSCILLATION_WINDOW_MS;
  if(invalidWindow)cpuAiResetMotionWindow(bot,clock,oldX,oldY);
  if(moved>=2){
    const previousLength=Math.hypot(+bot.aiMotionDx||0,+bot.aiMotionDy||0),sampleGap=clock-(+bot.aiMotionSampleAt||clock);
    if(previousLength>=2&&sampleGap>=0&&sampleGap<=CPU_AI_OSCILLATION_WINDOW_MS){
      const dot=(dx*(+bot.aiMotionDx||0)+dy*(+bot.aiMotionDy||0))/(moved*previousLength);
      if(dot<-.65)bot.aiMotionReversals=Math.max(0,Math.floor(+bot.aiMotionReversals||0))+1;
    }
    bot.aiMotionDx=dx;bot.aiMotionDy=dy;bot.aiMotionSampleAt=clock;
    bot.aiMotionTravel=Math.max(0,+bot.aiMotionTravel||0)+moved;
  }
  const net=Math.hypot(currentX-(+bot.aiMotionAnchorX||0),currentY-(+bot.aiMotionAnchorY||0)),travel=Math.max(0,+bot.aiMotionTravel||0),
    oscillating=clock<(+bot.underFireUntil||0)&&Math.max(0,Math.floor(+bot.aiMotionReversals||0))>=CPU_AI_OSCILLATION_REVERSALS&&
      travel>=CPU_AI_OSCILLATION_MIN_TRAVEL&&net<=Math.max(18,travel*CPU_AI_OSCILLATION_NET_RATIO);
  if(oscillating)return cpuAiStartMovementRecovery(bot,clock,dx,dy);
  if(bot.aiStuckTicks>=CPU_AI_STUCK_TICKS)return cpuAiStartMovementRecovery(bot,clock,bot.moveX,bot.moveY);
  return false;
}
function cpuAiPeekDuration(bot,min,max,variance=1){
  min=Math.max(0,+min||0);max=Math.max(min,+max||min);variance=clamp(+variance||0,0,1);
  const middle=(min+max)/2,random=cpuAiRange(bot,min,max);
  return middle+(random-middle)*variance;
}
function cpuAiClearPeek(bot,clock=0,cooldown=true){
  if(!bot)return;
  bot.aiPeekPhase='';bot.aiPeekTargetId='';bot.aiPeekUntil=0;bot.aiPeekWillFake=false;
  if(cooldown)bot.aiPeekCooldownUntil=Math.max(+bot.aiPeekCooldownUntil||0,clock+180);
}
// A punishment is tied only to the brief exposure event, never to a wall,
// coordinate, or named corner. Every corner has the same peeker disadvantage.
function cpuAiRegisterPeekPunishment(bot,clock){
  if(!bot||clock>(+bot.aiPeekWindowUntil||0))return false;
  bot.aiPeekPunishScore=Math.min(4,Math.max(0,+bot.aiPeekPunishScore||0)+1);
  bot.aiPrefirePressureUntil=clock+5200;
  // A capable bot can pull the current shoulder back, but it may recommit at
  // the same location with a different cadence; nothing is blacklisted.
  if(['commit','fake_out'].includes(bot.aiPeekPhase)&&Number.isFinite(+bot.aiPeekDirX)&&Number.isFinite(+bot.aiPeekDirY)){
    bot.aiPeekPhase='fake_back';bot.aiPeekUntil=clock+120;
  }
  return true;
}
// One incoming burst gets one immediate tactical response. Further pellets
// extend the pressure window but do not continuously randomize the bot's route.
// A later, separate burst may trigger a fresh response normally.
function cpuAiRegisterIncomingHit(bot,clock){
  if(!bot)return false;
  clock=Number.isFinite(+clock)?+clock:0;
  bot.underFireUntil=Math.max(+bot.underFireUntil||0,clock+900);
  cpuAiRegisterPeekPunishment(bot,clock);
  const canReplan=clock>=(+bot.aiHitResponseUntil||0)&&clock>=(+bot.aiStuckUntil||0);
  bot.aiHitResponseUntil=Math.max(+bot.aiHitResponseUntil||0,clock+CPU_AI_HIT_RESPONSE_HOLD_MS);
  if(!canReplan)return false;
  // Damage can wake the current plan for an immediate path/aim refresh, but it
  // no longer rolls a brand-new tactic or side in the middle of that plan.
  bot.thinkAt=Number.isFinite(+bot.thinkAt)?Math.min(+bot.thinkAt,clock):clock;
  return true;
}
// Dodging reads only projectiles that have already been spawned. It never
// reads the player's mouse or predicts an unfired shot, so higher tiers react
// faster without gaining hidden information.
function cpuAiProjectileThreats(bot,shots,config){
  if(!bot||!Array.isArray(shots))return [];
  const lookahead=Math.max(0,+config?.dodgeLookaheadMs||0);if(!lookahead)return [];
  const margin=Math.max(0,+config.dodgeMargin||0),botR=Math.max(1,+bot.r||15),out=[];
  for(const shot of shots){
    if(!shot||typeof shot!=='object'||(+shot.life||0)<=0)continue;
    if(bot.team&&shot.team&&String(bot.team)===String(shot.team))continue;
    if(bot.id&&shot.ownerId&&String(bot.id)===String(shot.ownerId))continue;
    const sx=+shot.x,sy=+shot.y,vx=+shot.vx,vy=+shot.vy,v2=vx*vx+vy*vy;
    if(![sx,sy,vx,vy].every(Number.isFinite)||v2<.01)continue;
    const rx=(+bot.x||0)-sx,ry=(+bot.y||0)-sy,rawTicks=(rx*vx+ry*vy)/v2;
    if(rawTicks<-.25)continue;
    const ticks=Math.max(0,rawTicks),impactMs=ticks*16.667;
    if(impactMs>lookahead||impactMs>(+shot.life||0))continue;
    const closestX=sx+vx*ticks,closestY=sy+vy*ticks,miss=Math.hypot((+bot.x||0)-closestX,(+bot.y||0)-closestY),
      projectileR=Math.max(4,Number.isFinite(+shot.dangerRadius)?+shot.dangerRadius:4+Math.max(0,+shot.fg||0)),
      dangerRadius=botR+projectileR+margin;
    if(miss>dangerRadius)continue;
    if(cpuAiProjectilePathBlocked(shot,closestX,closestY))continue;
    out.push({shot,impactMs,miss,dangerRadius,closestX,closestY});
  }
  out.sort((a,b)=>a.impactMs-b.impactMs||a.miss-b.miss);
  return out.slice(0,16);
}
function cpuAiDodgeClearance(bot,threat,x,y,config){
  const shot=threat.shot,speed=Math.max(.1,+config.moveSpeed||BOT_AI.moveSpeed)*Math.max(1,+config.dodgeSpeedScale||1),
    bvx=x*speed,bvy=y*speed,rx=(+bot.x||0)-(+shot.x||0),ry=(+bot.y||0)-(+shot.y||0),
    rvx=bvx-(+shot.vx||0),rvy=bvy-(+shot.vy||0),rv2=rvx*rvx+rvy*rvy,
    horizon=Math.max(0,Math.min(+config.dodgeLookaheadMs||0,+shot.life||0))/16.667,
    ticks=rv2>.001?clamp(-(rx*rvx+ry*rvy)/rv2,0,horizon):0;
  return Math.hypot(rx+rvx*ticks,ry+rvy*ticks)/Math.max(1,threat.dangerRadius);
}
function cpuAiProjectilePathBlocked(shot,x1,y1){
  if(!(+shot?.phaseWalls>0)||typeof activeObstacles!=='function')return cpuAiLosBlocked(+shot?.x||0,+shot?.y||0,x1,y1);
  const solids=activeObstacles();if(!Array.isArray(solids))return cpuAiLosBlocked(+shot.x||0,+shot.y||0,x1,y1);
  const x0=+shot.x||0,y0=+shot.y||0,dx=x1-x0,dy=y1-y0,steps=Math.max(2,Math.ceil(Math.hypot(dx,dy)/8));
  let charges=Math.max(0,Math.floor(+shot.phaseWalls||0)),inside=new Set();
  // A live TNT barrel is never phaseable. A slug already inside one ordinary
  // wall has spent that charge and may finish exiting that same rectangle.
  if(shot.phaseWallActive)for(let j=0;j<solids.length;j++){
    const o=solids[j];if(o&&o.kind!=='tnt'&&cpuAiObstacleContains(o,x0,y0))inside.add(j);
  }
  for(let i=1;i<=steps;i++){
    const x=x0+dx*i/steps,y=y0+dy*i/steps,next=new Set();
    for(let j=0;j<solids.length;j++){
      const o=solids[j];if(!cpuAiObstacleContains(o,x,y))continue;
      if(o.kind==='tnt')return true;next.add(j);
      if(!inside.has(j)){if(charges>0)charges--;else return true;}
    }
    inside=next;
  }
  return false;
}
function cpuAiApplyProjectileDodge(bot,shots,clock,config,tntPlan,allies=[]){
  const none={x:0,y:0,speedScale:1,active:false};if(!bot||!config)return none;
  clock=Number.isFinite(+clock)?+clock:0;
  const avoid=tntPlan&&Array.isArray(tntPlan.avoid)?tntPlan.avoid:[],r=Math.max(1,+bot.r||15),
    plannedDistance=Math.max(.1,+config.moveSpeed||BOT_AI.moveSpeed)*Math.max(1,+config.dodgeSpeedScale||1)*Math.max(100,+config.dodgeCommitMs||220)/16.667+8,
    probe=Math.max(48,+config.dodgeProbe||plannedDistance),safe=(x,y)=>cpuAiMoveSegmentClear(bot.x,bot.y,bot.x+x*probe,bot.y+y*probe,r,avoid);
  if(clock<(+bot.aiDodgeUntil||0)){
    const x=+bot.aiDodgeX||0,y=+bot.aiDodgeY||0;
    if(Math.hypot(x,y)>.9&&safe(x,y))return{x,y,speedScale:Math.max(1,+config.dodgeSpeedScale||1),active:true};
    bot.aiDodgeUntil=clock;
  }
  if((+bot.aiDodgeUntil||0)>0){
    bot.aiDodgeUntil=0;bot.aiDodgeX=0;bot.aiDodgeY=0;bot.aiDodgeThreat=null;bot.aiDodgeReadyAt=0;
    bot.thinkAt=Math.min(+bot.thinkAt||clock,clock);
    cpuAiResetMotionWindow(bot,clock,bot.x,bot.y);
  }
  if(clock<(+bot.aiDodgeCooldownUntil||0))return none;
  if(!(bot.aiDodgeHandled instanceof WeakSet))bot.aiDodgeHandled=new WeakSet();
  // AWM rounds arrive too quickly for a post-muzzle reactive sidestep to be
  // fair. Bots can still avoid them through their existing committed movement,
  // but they cannot inspect a spawned Sniper projectile and dodge afterward.
  const unhandled=Array.isArray(shots)?shots.filter(shot=>shot&&typeof shot==='object'&&
    String(shot.weapon||'')!=='sniper'&&!bot.aiDodgeHandled.has(shot)):[];
  const threats=cpuAiProjectileThreats(bot,unhandled,config);
  if(!threats.length){bot.aiDodgeThreat=null;bot.aiDodgeReadyAt=0;return none;}
  const primary=threats[0];
  if(bot.aiDodgeThreat!==primary.shot){
    bot.aiDodgeThreat=primary.shot;bot.aiDodgeReadyAt=clock+Math.max(0,+config.dodgeReactionMs||0);
    bot.aiDodgeWillReact=cpuAiNext(bot)<clamp(+config.dodgeChance||0,0,1);
    let side=cpuAiNext(bot)<.5?-1:1;
    if(side===(+bot.aiDodgeSide||0)&&Math.max(0,Math.floor(+bot.aiDodgeSideRepeat||0))>=2)side=-side;
    bot.aiDodgePlannedSide=side;
    return none;
  }
  if(clock<(+bot.aiDodgeReadyAt||0))return none;
  if(!bot.aiDodgeWillReact){
    bot.aiDodgeHandled.add(primary.shot);bot.aiDodgeThreat=null;bot.aiDodgeReadyAt=0;
    bot.aiDodgeCooldownUntil=clock+Math.max(0,+config.dodgeCooldownMs||0);return none;
  }
  // Evaluate the whole imminent volley with relative-motion closest approach.
  // One committed direction handles every pellet, preventing robotic A/D spam.
  const shot=primary.shot,shotSpeed=Math.hypot(+shot.vx||0,+shot.vy||0)||1,ux=(+shot.vx||0)/shotSpeed,uy=(+shot.vy||0)/shotSpeed,
    cross=((+bot.x||0)-(+shot.x||0))*(-uy)+((+bot.y||0)-(+shot.y||0))*ux;
  const previous=+bot.aiDodgeSide||0,preferred=Math.abs(cross)>2?(cross<0?-1:1):(+bot.aiDodgePlannedSide||previous||1);
  const start=Math.atan2(uy,ux)+(preferred>0?Math.PI/2:-Math.PI/2),candidates=[];
  for(const offset of [0,-.38,.38,-.78,.78,Math.PI,-Math.PI/2,Math.PI/2]){
    const a=start+offset,x=Math.cos(a),y=Math.sin(a);if(!safe(x,y))continue;
    let score=Infinity,blockedByMate=false;
    for(const threat of threats)score=Math.min(score,cpuAiDodgeClearance(bot,threat,x,y,config));
    for(const mate of Array.isArray(allies)?allies:[]){
      if(!mate||mate===bot||mate.hp<=0)continue;
      const endX=bot.x+x*probe,endY=bot.y+y*probe,segX=endX-bot.x,segY=endY-bot.y,seg2=segX*segX+segY*segY,
        t=seg2?clamp(((mate.x-bot.x)*segX+(mate.y-bot.y)*segY)/seg2,0,1):0,
        md=Math.hypot(bot.x+segX*t-mate.x,bot.y+segY*t-mate.y),clearance=r+Math.max(1,+mate.r||15)+10;
      if(md<clearance){blockedByMate=true;break;}
    }
    if(blockedByMate)continue;
    const oldLen=Math.hypot(+bot.moveX||0,+bot.moveY||0)||1;
    score+=(x*(+bot.moveX||0)+y*(+bot.moveY||0))/oldLen*.035;
    candidates.push({x,y,score});
  }
  candidates.sort((a,b)=>b.score-a.score);const best=candidates[0];
  bot.aiDodgeHandled.add(primary.shot);bot.aiDodgeThreat=null;bot.aiDodgeReadyAt=0;bot.aiDodgePlannedSide=0;
  if(!best){bot.aiDodgeCooldownUntil=clock+Math.max(0,+config.dodgeCooldownMs||0);return none;}
  const lateral=best.x*(-uy)+best.y*ux,actualSide=Math.abs(lateral)>.15?(lateral>0?1:-1):preferred;
  bot.aiDodgeSide=actualSide;bot.aiDodgeSideRepeat=actualSide===previous?Math.max(1,Math.floor(+bot.aiDodgeSideRepeat||1))+1:1;
  const dodgeDuration=Math.max(100,+config.dodgeCommitMs||220),planRemaining=Math.max(0,(+bot.aiTacticUntil||clock)-clock),
    planMinimumRemaining=Math.max(0,(+bot.aiTacticMinUntil||clock)-clock);
  bot.aiDodgeX=best.x;bot.aiDodgeY=best.y;bot.aiDodgeUntil=clock+dodgeDuration;
  bot.aiDodgeFireUntil=clock+Math.max(0,+config.dodgeFireHoldMs||0);
  bot.aiDodgeCooldownUntil=bot.aiDodgeUntil+Math.max(0,+config.dodgeCooldownMs||0);
  bot.aiNavPath=[];bot.aiNavUntil=0;bot.aiUsingPortal=false;
  bot.aiTacticUntil=bot.aiDodgeUntil+planRemaining;bot.aiTacticMinUntil=bot.aiDodgeUntil+planMinimumRemaining;
  cpuAiClearPeek(bot,clock,false);cpuAiResetMotionWindow(bot,clock,bot.x,bot.y);
  return{x:best.x,y:best.y,speedScale:Math.max(1,+config.dodgeSpeedScale||1),active:true};
}
function cpuAiPeekWithholdsFire(bot){
  return !!(bot&&['hold','fake_out','fake_back','settle'].includes(bot.aiPeekPhase));
}
function cpuAiApplyPeekBehavior(bot,target,moveX,moveY,clock,config,tntPlan){
  if(!bot||!target)return{x:+moveX||0,y:+moveY||0,speedScale:1,phase:''};
  const rawX=+moveX||0,rawY=+moveY||0,rawLen=Math.hypot(rawX,rawY),targetId=String(target.id||target.aiId||'player'),
    hidden=cpuAiLosBlocked(bot.x,bot.y,target.x,target.y),r=Math.max(1,+bot.r||15),
    avoid=tntPlan&&Array.isArray(tntPlan.avoid)?tntPlan.avoid:[];
  if(bot.aiPeekWasHidden===undefined)bot.aiPeekWasHidden=hidden;
  if(!hidden&&bot.aiPeekWasHidden){bot.aiPeekExposedAt=clock;bot.aiPeekWindowUntil=clock+480;}
  bot.aiPeekWasHidden=hidden;
  if(bot.aiPeekPhase&&bot.aiPeekTargetId!==targetId)cpuAiClearPeek(bot,clock,false);
  const safe=(x,y)=>cpuAiMoveSegmentClear(bot.x,bot.y,bot.x+x*38,bot.y+y*38,r,avoid);
  const output=(x,y,speedScale=1)=>{
    if(Math.hypot(x,y)>.01&&!safe(x,y)){cpuAiClearPeek(bot,clock);return{x:rawX,y:rawY,speedScale:1,phase:''};}
    return{x,y,speedScale,phase:bot.aiPeekPhase||''};
  };
  if(bot.aiPeekPhase){
    const dirX=+bot.aiPeekDirX||0,dirY=+bot.aiPeekDirY||0;
    if(bot.aiPeekPhase==='hold'){
      if(clock<(bot.aiPeekUntil||0))return output(0,0);
      if(bot.aiPeekWillFake){
        bot.aiPeekPhase='fake_out';bot.aiPeekUntil=clock+cpuAiPeekDuration(bot,+config.peekFakeOutMin||65,+config.peekFakeOutMax||105,+config.peekTimingVariance||0);
      }else{
        bot.aiPeekPhase='commit';bot.aiPeekUntil=clock+(+config.peekCommitMs||310);
      }
    }
    if(bot.aiPeekPhase==='fake_out'){
      if(clock<(bot.aiPeekUntil||0))return output(dirX,dirY,+config.peekFakeSpeed||1.05);
      bot.aiPeekPhase='fake_back';bot.aiPeekUntil=clock+cpuAiPeekDuration(bot,90,145,+config.peekTimingVariance||0);
    }
    if(bot.aiPeekPhase==='fake_back'){
      if(clock<(bot.aiPeekUntil||0))return output(-dirX,-dirY,+config.peekFakeSpeed||1.05);
      bot.aiPeekPhase='settle';bot.aiPeekUntil=clock+cpuAiPeekDuration(bot,+config.peekSettleMin||90,+config.peekSettleMax||240,+config.peekTimingVariance||0);
    }
    if(bot.aiPeekPhase==='settle'){
      if(clock<(bot.aiPeekUntil||0))return output(0,0);
      bot.aiPeekPhase='commit';bot.aiPeekUntil=clock+(+config.peekCommitMs||310);
    }
    if(bot.aiPeekPhase==='commit'){
      if(clock<(bot.aiPeekUntil||0))return output(dirX,dirY,+config.peekCommitSpeed||1);
      cpuAiClearPeek(bot,clock);return{x:rawX,y:rawY,speedScale:1,phase:''};
    }
  }
  if(!hidden||rawLen<=.01||clock<(+bot.aiPeekCooldownUntil||0))return{x:rawX,y:rawY,speedScale:1,phase:''};
  const dirX=rawX/rawLen,dirY=rawY/rawLen,probe=54+r;
  // Only intervene when the current movement is about to cross from cover
  // into sight. The same logic applies at every wall and on every map.
  if(cpuAiLosBlocked(bot.x+dirX*probe,bot.y+dirY*probe,target.x,target.y))return{x:rawX,y:rawY,speedScale:1,phase:''};
  const pressured=clock<(+bot.aiPrefirePressureUntil||0),punish=pressured?clamp((+bot.aiPeekPunishScore||0)/4,0,1):0,
    adapt=clamp(+config.prefireAdapt||0,0,1),fakeChance=clamp((+config.peekFakeChance||0)+punish*adapt*.62,0,.92);
  bot.aiPeekPhase='hold';bot.aiPeekTargetId=targetId;bot.aiPeekDirX=dirX;bot.aiPeekDirY=dirY;
  bot.aiPeekWillFake=cpuAiNext(bot)<fakeChance;
  const extra=punish*adapt*(+config.peekPunishHoldMs||260);
  bot.aiPeekUntil=clock+cpuAiPeekDuration(bot,+config.peekHoldMin||70,(+config.peekHoldMax||170)+extra,+config.peekTimingVariance||0);
  return output(0,0);
}
function cpuAiTacticalGoal(bot,target,tactic,side,localMove,avoid){
  const dx=target.x-bot.x,dy=target.y-bot.y,d=Math.hypot(dx,dy)||1,fx=dx/d,fy=dy/d,perpX=-fy*side,perpY=fx*side;
  if(tactic==='cover'){
    const cover=cpuAiCoverPoint(bot,target,avoid);if(cover)return cover;
  }
  if(tactic==='push')return{x:target.x-fx*260,y:target.y-fy*260};
  if(tactic==='retreat')return{x:bot.x-fx*330+perpX*80,y:bot.y-fy*330+perpY*80};
  if(tactic==='orbit')return{x:target.x-fx*340+perpX*190,y:target.y-fy*340+perpY*190};
  if(tactic==='hold')return{x:bot.x+perpX*190-fx*20,y:bot.y+perpY*190-fy*20};
  return{x:target.x+perpX*clamp(d*.3,180,300),y:target.y+perpY*clamp(d*.3,180,300)};
}
function cpuAiPickMove(bot,target,allies,clock,config,tntPlan){
  const dx=target.x-bot.x,dy=target.y-bot.y,d=Math.hypot(dx,dy)||1,fx=dx/d,fy=dy/d,
    routeVariation=clamp(config.routeVariation==null?1:+config.routeVariation,0,1);
  if(!bot.aiTactic||(clock>=(bot.aiTacticUntil||0)&&clock>=(bot.aiTacticMinUntil||0))){
    const recovering=clock<(bot.aiStuckUntil||0),roll=cpuAiNext(bot),blocked=cpuAiLosBlocked(bot.x,bot.y,target.x,target.y),underFire=clock<(bot.underFireUntil||0),
      losing=Number.isFinite(+bot.hp)&&Number.isFinite(+target.hp)&&bot.hp<target.hp*.78;
    if(recovering)bot.aiTactic='flank';
    else if(config.useReactiveCover!==false&&underFire&&losing)bot.aiTactic='cover';
    else if(routeVariation<.3)bot.aiTactic=blocked?'flank':d>(config.approach||520)?'push':d<(config.retreat||230)?'retreat':'orbit';
    else if(blocked)bot.aiTactic='flank';
    else if(d>(config.approach||520))bot.aiTactic=roll<.58?'push':roll<.82?'flank':'orbit';
    else if(d<(config.retreat||230))bot.aiTactic=roll<.60?'retreat':roll<.88?'orbit':'flank';
    else bot.aiTactic=roll<.45?'orbit':roll<.65?'hold':roll<.85?'flank':roll<.925?'push':'retreat';
    if(!recovering&&(!bot.aiSide||cpuAiNext(bot)<routeVariation))bot.aiSide=cpuAiNext(bot)<.5?-1:1;
    const moveMin=Math.max(120,+config.moveCommitMin||CPU_AI_MOVE_MIN_MS),moveMax=Math.max(moveMin,+config.moveCommitMax||CPU_AI_MOVE_MAX_MS);
    bot.aiTacticMinUntil=clock+moveMin;bot.aiTacticUntil=clock+cpuAiRange(bot,moveMin,moveMax);
    bot.aiPlanMoveX=0;bot.aiPlanMoveY=0;
  }
  const tactic=bot.aiTactic,side=bot.aiSide||1,bias=tactic==='push'?[1.15,.25]:tactic==='retreat'?[-1.15,.35]:
    tactic==='orbit'?[0,1]:tactic==='hold'?[-.08,.55]:tactic==='cover'?[-.25,.7]:[.55,.85];
  const avoid=tntPlan&&Array.isArray(tntPlan.avoid)?tntPlan.avoid:[],mates=Array.isArray(allies)?allies:[],r=Math.max(1,+bot.r||15);
  if(avoid.length&&typeof recordAiTrainingBotSignal==='function'){
    if(!(bot.aiTrainingTntAvoided instanceof Set))bot.aiTrainingTntAvoided=new Set();
    for(const zone of avoid){
      const id=String(zone&&zone.id||'');if(!id||bot.aiTrainingTntAvoided.has(id))continue;
      if(Math.hypot(bot.x-(+zone.x||0),bot.y-(+zone.y||0))<=Math.max(0,+zone.radius||0)+96){
        bot.aiTrainingTntAvoided.add(id);recordAiTrainingBotSignal(bot,'bot_tnt_avoidances');
      }
    }
  }
  const fixedRoute=config.fixedRoutes===true,angleJitter=fixedRoute?0:.12,scoreJitter=fixedRoute?0:.08;
  let best=null;
  for(const offset of [-Math.PI,-Math.PI*.75,-Math.PI*.5,-Math.PI*.25,0,Math.PI*.25,Math.PI*.5,Math.PI*.75,Math.PI]){
    const a=Math.atan2(fy,fx)+offset+cpuAiRange(bot,-angleJitter,angleJitter),x=Math.cos(a),y=Math.sin(a),probeX=bot.x+x*72,probeY=bot.y+y*72;
    if(cpuAiPositionBlocked(bot.x+x*34,bot.y+y*34,r)||cpuAiPositionBlocked(probeX,probeY,r))continue;
    const forward=x*fx+y*fy,orbit=(x*-fy+y*fx)*side,oldLen=Math.hypot(+bot.aiPlanMoveX||0,+bot.aiPlanMoveY||0),
      inertia=oldLen>.01?(x*(+bot.aiPlanMoveX||0)+y*(+bot.aiPlanMoveY||0))/oldLen*Math.max(0,+config.moveInertia||0):0;
    let score=forward*bias[0]+orbit*bias[1]+inertia+cpuAiRange(bot,-scoreJitter,scoreJitter),unsafe=false;
    for(const hazard of avoid){
      const currentD=Math.hypot(bot.x-hazard.x,bot.y-hazard.y),hd=Math.hypot(probeX-hazard.x,probeY-hazard.y),
        candidateRisk=clamp((hazard.radius-hd)/hazard.radius,0,1);
      // A live barrel's blast radius is a hard navigation constraint. If a bot
      // is already caught inside it, only directions that increase clearance
      // remain viable; from outside, a probe may not enter the danger zone.
      if(currentD<hazard.radius){
        const awayDot=(x*(bot.x-hazard.x)+y*(bot.y-hazard.y))/Math.max(1,currentD);
        if(awayDot<=.01||hd<=currentD+1){unsafe=true;break;}
        else score+=clamp((hd-currentD)/72,0,1)*3;
      }else if(hd<hazard.radius){unsafe=true;break;}
      score-=candidateRisk*hazard.risk*2.4;
    }
    if(unsafe)continue;
    for(const mate of mates){if(!mate||mate===bot||mate.hp<=0)continue;const md=Math.hypot(probeX-mate.x,probeY-mate.y);if(md<80)score-=(80-md)/80*.8;}
    if(!best||score>best.score)best={x,y,score};
  }
  if(!best){const hazard=avoid.slice().sort((a,b)=>Math.hypot(bot.x-a.x,bot.y-a.y)-Math.hypot(bot.x-b.x,bot.y-b.y))[0];
    if(hazard){
      const awayA=Math.atan2(bot.y-hazard.y,bot.x-hazard.x),escapeSide=bot.aiSide||1;
      // If the ideal exit is covered, fan outward along both edges instead of
      // falling back to a vector that walks into the wall (or deeper into TNT).
      for(const raw of [0,.45,-.45,.9,-.9,1.3,-1.3,1.48,-1.48]){
        const a=awayA+raw*escapeSide,x=Math.cos(a),y=Math.sin(a),probeX=bot.x+x*72,probeY=bot.y+y*72;
        if(cpuAiPositionBlocked(bot.x+x*34,bot.y+y*34,r)||cpuAiPositionBlocked(probeX,probeY,r))continue;
        let safe=true;
        for(const zone of avoid){
          const currentD=Math.hypot(bot.x-zone.x,bot.y-zone.y),hd=Math.hypot(probeX-zone.x,probeY-zone.y),
            awayDot=(x*(bot.x-zone.x)+y*(bot.y-zone.y))/Math.max(1,currentD);
          if((currentD<zone.radius&&(awayDot<=.01||hd<=currentD+1))||(currentD>=zone.radius&&hd<zone.radius)){safe=false;break;}
        }
        if(safe){best={x,y};break;}
      }
      if(!best)best={x:0,y:0};
    }
    else best={x:-fx,y:-fy};
  }
  const caught=avoid.some(zone=>Math.hypot(bot.x-zone.x,bot.y-zone.y)<zone.radius);
  if(config.useNavigation!==false&&!caught&&Math.hypot(best.x,best.y)>.01){
    const goal=cpuAiTacticalGoal(bot,target,tactic,side,best,avoid),goalClose=Math.hypot((+bot.aiNavGoalX||0)-goal.x,(+bot.aiNavGoalY||0)-goal.y)<=96,
      samePortalSeq=Math.max(0,Math.floor(+bot.aiNavPortalSeq||0))===Math.max(0,Math.floor(+bot.portalSeq||0));
    let route=null;
    if(Array.isArray(bot.aiNavPath)&&bot.aiNavPath.length>1&&clock<(bot.aiNavUntil||0)&&goalClose&&samePortalSeq){
      let last=bot.aiNavPath.length-1;
      if(bot.aiUsingPortal){const portalAt=bot.aiNavPath.findIndex(p=>String(p.key||'').startsWith('portal-enter-'));if(portalAt>0)last=portalAt;}
      for(let i=last;i>=1;i--){
        const point=bot.aiNavPath[i];if(cpuAiMoveSegmentClear(bot.x,bot.y,point.x,point.y,r,avoid)){
          route={x:point.x,y:point.y,path:bot.aiNavPath,usesPortal:!!bot.aiUsingPortal,cached:true};break;
        }
      }
    }
    if(!route){
      route=cpuAiFindPath(bot,goal,avoid,clock,config.usePortals!==false);
      if(typeof recordAiTrainingBotSignal==='function')recordAiTrainingBotSignal(bot,'bot_path_replans');
      if(route){
        bot.aiNavPath=route.path;bot.aiNavUntil=clock+CPU_AI_NAV_REUSE_MS;bot.aiNavGoalX=goal.x;bot.aiNavGoalY=goal.y;
        bot.aiNavPortalSeq=Math.max(0,Math.floor(+bot.portalSeq||0));
      }
    }
    if(route){
      const rx=route.x-bot.x,ry=route.y-bot.y,rd=Math.hypot(rx,ry)||1;best={x:rx/rd,y:ry/rd,score:best.score};
      bot.aiNavPath=route.path;bot.aiNavWaypointX=route.x;bot.aiNavWaypointY=route.y;bot.aiUsingPortal=route.usesPortal;
    }else{bot.aiNavPath=[];bot.aiNavUntil=0;bot.aiUsingPortal=false;}
  }else{bot.aiNavPath=[];bot.aiNavUntil=0;bot.aiUsingPortal=false;}
  bot.aiPlanMoveX=best.x;bot.aiPlanMoveY=best.y;bot.aiTactic=tactic;
  return{x:best.x,y:best.y,tactic,until:bot.aiTacticUntil,usingPortal:!!bot.aiUsingPortal};
}
const BOT_LADDER_MAX_PROGRESS=10,BOT_LADDER_REFRESH_MS=30000;
const BOT_LADDER_RESULT_STORAGE_KEY='oz_bot_ladder_results_v1',BOT_LADDER_RESULT_ITEM_PREFIX='oz_bot_ladder_result_v1:';
const BOT_LADDER_CANONICAL_STORAGE_KEY='oz_bot_ladder_canonical_v1',BOT_LADDER_CANONICAL_ITEM_PREFIX='oz_bot_ladder_canonical_v1:';
const BOT_LADDER_TOMBSTONE_STORAGE_KEY='oz_bot_ladder_result_tombstones_v1',BOT_LADDER_TRAINING_STORAGE_KEY='oz_ai_training_queue_v1';
const BOT_LADDER_RESULT_QUEUE_MAX=128,BOT_LADDER_TOMBSTONE_MAX=512;
const BOT_LADDER_QUEUE_RETRY_MS=Object.freeze([2000,10000,30000,120000]),BOT_LADDER_RATE_LIMIT_RETRY_MS=31000;
const BOT_DIFFICULTIES=Object.freeze([
  Object.freeze({id:0,key:'beginner',name:'BEGINNER',summary:'STRONG FOUNDATIONS',detail:'Slower fixed routes, regular direct peeks, no prediction, shoots into guards · 50% ranged damage.',
    reactionMs:760,moveSpeed:2.15,aimNoise:.095,shotJitter:.036,fireAimError:.140,leadFactor:0,maxLeadMs:0,thinkMs:230,turnRate:.043,
    rangedDamageScale:.50,allowPrediction:false,
    weaponThinkMs:360,
    pressureAimError:.220,pressureChance:.12,pressureDecisionMs:700,pressureBurstMin:2,pressureBurstMax:2,pressureBurstMs:520,pressureMemoryMs:150,
    parryReactionMs:360,parryRespectChance:0,parryMeleeChance:0,parryMeleeCommitMs:850,parryReleaseDelayMs:0,
    routeVariation:0,fixedRoutes:true,moveCommitMin:1450,moveCommitMax:1450,moveInertia:.60,dodgeChance:.04,dodgeReactionMs:280,dodgeLookaheadMs:300,dodgeCommitMs:190,dodgeCooldownMs:380,dodgeFireHoldMs:160,dodgeSpeedScale:1,dodgeMargin:3,
    peekFakeChance:0,prefireAdapt:0,peekTimingVariance:0,peekHoldMin:125,peekHoldMax:125,peekSettleMin:125,peekSettleMax:125,peekCommitMs:340,peekCommitSpeed:.9}),
  Object.freeze({id:1,key:'easy',name:'EASY',summary:'QUICKER DECISIONS',detail:'Cleaner movement with occasional timing changes and bait peeks · 62.5% ranged damage.',
    reactionMs:540,moveSpeed:2.65,aimNoise:.060,shotJitter:.022,fireAimError:.100,leadFactor:.52,maxLeadMs:205,thinkMs:160,turnRate:.070,
    rangedDamageScale:.625,
    weaponThinkMs:280,
    pressureAimError:.180,pressureChance:.30,pressureDecisionMs:560,pressureBurstMin:2,pressureBurstMax:3,pressureBurstMs:600,pressureMemoryMs:250,
    parryReactionMs:260,parryRespectChance:.50,parryMeleeChance:.22,parryMeleeCommitMs:875,parryReleaseDelayMs:160,
    routeVariation:.36,moveCommitMin:950,moveCommitMax:1500,moveInertia:.52,dodgeChance:.18,dodgeReactionMs:220,dodgeLookaheadMs:380,dodgeCommitMs:210,dodgeCooldownMs:330,dodgeFireHoldMs:135,dodgeSpeedScale:1.02,dodgeMargin:5,
    peekFakeChance:.08,prefireAdapt:.18,peekTimingVariance:.28,peekHoldMin:85,peekHoldMax:180,peekSettleMin:95,peekSettleMax:210,peekCommitSpeed:1.05}),
  Object.freeze({id:2,key:'medium',name:'MEDIUM',summary:'COMPLETE TACTICS',detail:'Recognizes punished entries and changes its next peek timing · 75% ranged damage.',
    reactionMs:400,moveSpeed:2.85,aimNoise:.040,shotJitter:.015,fireAimError:.075,leadFactor:.67,maxLeadMs:270,thinkMs:118,turnRate:.090,
    rangedDamageScale:.75,
    weaponThinkMs:210,
    pressureAimError:.155,pressureChance:.58,pressureDecisionMs:420,pressureBurstMin:3,pressureBurstMax:4,pressureBurstMs:720,pressureMemoryMs:400,
    parryReactionMs:170,parryRespectChance:.75,parryMeleeChance:.55,parryMeleeCommitMs:900,parryReleaseDelayMs:130,
    routeVariation:.66,moveCommitMin:900,moveCommitMax:1450,moveInertia:.58,dodgeChance:.50,dodgeReactionMs:145,dodgeLookaheadMs:500,dodgeCommitMs:230,dodgeCooldownMs:280,dodgeFireHoldMs:110,dodgeSpeedScale:1.08,dodgeMargin:9,
    peekFakeChance:.08,prefireAdapt:.72,peekTimingVariance:.58,peekHoldMin:70,peekHoldMax:220,peekSettleMin:80,peekSettleMax:260,peekPunishHoldMs:300,peekCommitSpeed:1.13}),
  Object.freeze({id:3,key:'hard',name:'HARD',summary:'RELENTLESS TACTICIAN',detail:'Dodges live fire, varies timing, baits shots, and commits wide · 87.5% ranged damage.',
    reactionMs:240,moveSpeed:3.18,aimNoise:.022,shotJitter:.006,fireAimError:.047,leadFactor:.85,maxLeadMs:370,thinkMs:78,turnRate:.135,
    rangedDamageScale:.875,
    weaponThinkMs:140,
    pressureAimError:.130,pressureChance:.88,pressureDecisionMs:300,pressureBurstMin:3,pressureBurstMax:5,pressureBurstMs:850,pressureMemoryMs:550,
    parryReactionMs:90,parryRespectChance:.95,parryMeleeChance:.90,parryMeleeCommitMs:950,parryReleaseDelayMs:90,
    routeVariation:.90,moveCommitMin:1100,moveCommitMax:1750,moveInertia:.78,dodgeChance:.90,dodgeReactionMs:80,dodgeLookaheadMs:650,dodgeCommitMs:250,dodgeCooldownMs:190,dodgeFireHoldMs:90,dodgeSpeedScale:1.18,dodgeMargin:14,
    peekFakeChance:.42,prefireAdapt:.88,peekTimingVariance:.92,peekHoldMin:45,peekHoldMax:280,peekSettleMin:55,peekSettleMax:300,peekPunishHoldMs:340,peekFakeSpeed:1.12,peekCommitSpeed:1.23}),
  Object.freeze({id:4,key:'impossible',name:'IMPOSSIBLE',summary:'ELITE EVASIVE EXECUTION',detail:'Full weapon damage with elite dodges, guard counters, varied peeks, and committed pressure.',
    reactionMs:100,moveSpeed:3.45,aimNoise:.012,shotJitter:.0020,fireAimError:.040,leadFactor:.95,maxLeadMs:500,thinkMs:40,turnRate:.195,
    rangedDamageScale:1,
    weaponThinkMs:90,
    pressureAimError:.115,pressureChance:1,pressureDecisionMs:240,pressureBurstMin:4,pressureBurstMax:6,pressureBurstMs:950,pressureMemoryMs:700,
    parryReactionMs:50,parryRespectChance:1,parryMeleeChance:1,parryMeleeCommitMs:1000,parryReleaseDelayMs:65,
    routeVariation:1,moveCommitMin:1250,moveCommitMax:1900,moveInertia:.92,dodgeChance:1,dodgeReactionMs:50,dodgeLookaheadMs:800,dodgeCommitMs:260,dodgeCooldownMs:120,dodgeFireHoldMs:60,dodgeSpeedScale:1.30,dodgeMargin:20,
    peekFakeChance:.62,prefireAdapt:1,peekTimingVariance:1,peekHoldMin:30,peekHoldMax:330,peekSettleMin:40,peekSettleMax:340,peekPunishHoldMs:380,peekFakeSpeed:1.18,peekCommitSpeed:1.32}),
]);
// Tactical releases are a separate axis from Beginner–Impossible execution.
// Releases are cumulative, immutable, and allowlisted in both client and SQL.
const BOT_MODEL_RELEASES=Object.freeze([
  Object.freeze({id:'scout-v1',name:'SCOUT V1',improved:'Randomized strafing and useful long-range fire.',
    usePrediction:false,useNavigation:false,useStuckRecovery:false,useReactiveCover:false,useTnt:false,usePortals:false}),
  Object.freeze({id:'ranger-v2',name:'RANGER V2',improved:'Added target tracking and predictive aim.',
    usePrediction:true,useNavigation:false,useStuckRecovery:false,useReactiveCover:false,useTnt:false,usePortals:false}),
  Object.freeze({id:'pathfinder-v3',name:'PATHFINDER V3',improved:'Added wall-aware routes and recovery when a bot gets stuck.',
    usePrediction:true,useNavigation:true,useStuckRecovery:true,useReactiveCover:false,useTnt:false,usePortals:false}),
  Object.freeze({id:'sentinel-v4',name:'SENTINEL V4',improved:'Added reactive cover plus TNT avoidance and detonation.',
    usePrediction:true,useNavigation:true,useStuckRecovery:true,useReactiveCover:true,useTnt:true,usePortals:false}),
  Object.freeze({id:'apex-v5',name:'APEX V5',improved:'Added portal routing and the complete tactical decision set.',
    usePrediction:true,useNavigation:true,useStuckRecovery:true,useReactiveCover:true,useTnt:true,usePortals:true}),
]);
const LATEST_BOT_MODEL_ID='apex-v5',BOT_MODEL_REFRESH_MS=30000;
let activeBotModelId=LATEST_BOT_MODEL_ID,activeBotModelRevision=0,activeBotModelUpdatedAt='';
let botModelSyncState='default',botModelFetchedAt=0,botModelFetchPromise=null,botModelAdminRows=[];
let botLadder={tier:0,progress:0,winStreak:0,lossStreak:0,wins:0,losses:0,revision:0,updatedAt:''};
let botLadderCanonical={tier:0,progress:0,winStreak:0,lossStreak:0,wins:0,losses:0,revision:0,updatedAt:''};
let botLadderUserId='',botLadderLoaded=false,botLadderSyncState='guest',botLadderFetchedAt=0;
let botLadderServerLoaded=false,botLadderCanonicalCached=false,botLadderRpcMissing=false;
let botLadderFetchPromise=null,botLadderRequestVersion=0,botLadderLaunchPending='',botLadderLaunchVersion=0,botLadderPendingResult=null;
let botLadderResultQueue=[],botLadderResultQueueLoaded=false,botLadderQueueStorageReady=null;
let botLadderCanonicalStorageReady=null;
let botLadderQueueFlushPromise=null,botLadderQueueFlushRequested=false,botLadderQueueRetryTimer=null,botLadderQueueRetryLevel=0;
let botLadderTombstones=[],botLadderTombstonesLoaded=false,botLadderSyncEventsBound=false;
let botLadderProjectionBlocked=false,botLadderReservedMatchOwner='',botLadderReservedMatchId='';
const botLadderTrainingRecoverySnapshots=new Map();
const botLadderRuntimeMatches=new Map();

function botDifficulty(value=botLadder.tier){
  const tier=clamp(Math.floor(+value||0),0,BOT_DIFFICULTIES.length-1);
  return BOT_DIFFICULTIES[tier];
}
function botDifficultyName(value=botLadder.tier){return botDifficulty(value).name;}
function botModelRelease(value=activeBotModelId){
  const id=String(value||'').trim().toLowerCase();
  return BOT_MODEL_RELEASES.find(model=>model.id===id)||BOT_MODEL_RELEASES.find(model=>model.id===LATEST_BOT_MODEL_ID);
}
function botModelPointerRow(data){return Array.isArray(data)?data[0]||null:(data&&typeof data==='object'?data:null);}
function applyActiveBotModelPointer(raw){
  raw=botModelPointerRow(raw);if(!raw)return botModelRelease();
  const id=String(raw.active_model_id||raw.model_id||'').toLowerCase(),allowed=BOT_MODEL_RELEASES.some(model=>model.id===id);
  if(!allowed)return botModelRelease();
  const revision=Math.max(0,Math.floor(+raw.revision||+raw.active_revision||0));
  if(revision<activeBotModelRevision)return botModelRelease();
  activeBotModelId=id;activeBotModelRevision=revision;
  activeBotModelUpdatedAt=String(raw.updated_at||'');return botModelRelease();
}
async function refreshActiveBotModel(force=false){
  if(botModelFetchPromise)return botModelFetchPromise;
  if(!sb||typeof sb.rpc!=='function'){botModelSyncState='default';return botModelRelease();}
  if(!force&&botModelFetchedAt&&Date.now()-botModelFetchedAt<BOT_MODEL_REFRESH_MS)return botModelRelease();
  botModelSyncState='syncing';let request;
  request=(async()=>{
    try{
      const {data,error}=await sb.rpc('get_outpost_zero_bot_model');if(error)throw error;
      applyActiveBotModelPointer(data);botModelFetchedAt=Date.now();botModelSyncState='ready';
    }catch(e){botModelSyncState='default';}
    finally{if(botModelFetchPromise===request)botModelFetchPromise=null;}
    return botModelRelease();
  })();
  botModelFetchPromise=request;return request;
}
async function refreshBotModelHistory(force=false){
  if(!isMainAdmin())return [];
  if(force)await refreshActiveBotModel(true);else await refreshActiveBotModel(false);
  if(!sb||typeof sb.rpc!=='function'){botModelAdminRows=[];return botModelAdminRows;}
  try{
    const {data,error}=await sb.rpc('list_outpost_zero_bot_models');if(error)throw error;
    botModelAdminRows=Array.isArray(data)?data.filter(row=>BOT_MODEL_RELEASES.some(model=>model.id===String(row&&row.model_id||''))):[];
    const live=botModelAdminRows.find(row=>row&&row.active===true);if(live)applyActiveBotModelPointer(live);
  }catch(e){botModelAdminRows=[];}
  return botModelAdminRows.slice();
}
async function activateBotModelRelease(modelId){
  if(!isMainAdmin()||!sb||typeof sb.rpc!=='function')return {accepted:false,reason:'unavailable'};
  const id=String(modelId||'').toLowerCase();
  if(!BOT_MODEL_RELEASES.some(model=>model.id===id))return {accepted:false,reason:'invalid_model'};
  const {data,error}=await sb.rpc('activate_outpost_zero_bot_model',{p_model_id:id});if(error)throw error;
  const row=botModelPointerRow(data)||{};
  if(row.accepted===false&&String(row.reason||'')!=='already_active')return row;
  applyActiveBotModelPointer(row);botModelFetchedAt=Date.now();botModelSyncState='ready';
  await refreshBotModelHistory(false);return row;
}
function normalizeBotLadder(raw){
  raw=raw&&typeof raw==='object'?raw:{};
  const whole=(value,max=Number.MAX_SAFE_INTEGER)=>{
    const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(0,Math.floor(n))):0;
  },tier=whole(raw.tier!=null?raw.tier:raw.difficulty,4),streak=value=>{
    const rawValue=Number(value);if(!Number.isFinite(rawValue))return 0;
    const normalized=Math.floor(rawValue);return normalized>=0&&normalized<=2?normalized:0;
  };
  // A persisted streak is always the number of wins/losses toward the next
  // three-result trigger: 0, 1, or 2. Older Impossible rows could contain 3;
  // treating that completed cycle as 0 repairs their local cache immediately.
  return {tier,progress:whole(raw.progress,tier===4?BOT_LADDER_MAX_PROGRESS:BOT_LADDER_MAX_PROGRESS-1),
    winStreak:streak(raw.win_streak!=null?raw.win_streak:raw.winStreak),
    lossStreak:streak(raw.loss_streak!=null?raw.loss_streak:raw.lossStreak),
    wins:whole(raw.wins),losses:whole(raw.losses),revision:whole(raw.revision),
    updatedAt:typeof raw.updated_at==='string'?raw.updated_at:(typeof raw.updatedAt==='string'?raw.updatedAt:'')};
}
function botLadderOwnerId(value){
  value=String(value||'').trim();
  return value&&value.length<=128&&!/[^A-Za-z0-9_-]/.test(value)?value:'';
}
function botLadderResultUuid(value){
  value=String(value||'').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)?value:'';
}
function normalizeBotLadderQueueEntry(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.v!==1)return null;
  const owner=botLadderOwnerId(raw.owner),matchId=botLadderResultUuid(raw.matchId),difficulty=Number(raw.difficulty),queuedAt=Number(raw.queuedAt);
  if(!owner||!matchId||typeof raw.won!=='boolean'||!Number.isInteger(difficulty)||difficulty<0||difficulty>4||
     !Number.isSafeInteger(queuedAt)||queuedAt<=0)return null;
  const status=raw.status==='conflict'?'conflict':raw.status==='recovery'?'recovery':'pending',conflictReason=status==='conflict'&&
    ['difficulty_mismatch','duplicate_conflict'].includes(String(raw.conflictReason||''))?String(raw.conflictReason):'';
  if(status==='conflict'&&!conflictReason)return null;
  return {v:1,owner,matchId,won:raw.won,difficulty,queuedAt,status,conflictReason};
}
function cleanBotLadderResultQueue(entries){
  const clean=[],seen=new Set();
  for(const raw of Array.isArray(entries)?entries:[]){
    const entry=normalizeBotLadderQueueEntry(raw);if(!entry)continue;
    const key=entry.owner+'|'+entry.matchId;if(seen.has(key))continue;seen.add(key);clean.push(entry);
  }
  clean.sort((a,b)=>a.queuedAt-b.queuedAt||a.matchId.localeCompare(b.matchId));
  // Never truncate already-durable receipts. The per-owner cap is enforced
  // before a new match is admitted, so normalization cannot erase another
  // account's later result.
  return clean;
}
function botLadderResultItemKey(owner,matchId){return BOT_LADDER_RESULT_ITEM_PREFIX+botLadderOwnerId(owner)+':'+botLadderResultUuid(matchId);}
function botLadderResultItemStatus(owner,matchId){
  try{const raw=JSON.parse(localStorage.getItem(botLadderResultItemKey(owner,matchId))||'null');return raw&&raw.v===1?String(raw.status||''):'';}catch(e){return '';}
}
function readStoredBotLadderResults(){
  const rows=new Map();let legacy=[];
  try{const parsed=JSON.parse(localStorage.getItem(BOT_LADDER_RESULT_STORAGE_KEY)||'[]');if(Array.isArray(parsed))legacy=parsed;}catch(e){}
  for(const raw of legacy){const entry=normalizeBotLadderQueueEntry(raw);if(entry)rows.set(botLadderQueueKey(entry.owner,entry.matchId),entry);}
  try{
    const keys=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&key.startsWith(BOT_LADDER_RESULT_ITEM_PREFIX))keys.push(key);}
    for(const key of keys){
      let raw=null;try{raw=JSON.parse(localStorage.getItem(key)||'null');}catch(e){}
      const owner=botLadderOwnerId(raw&&raw.owner),matchId=botLadderResultUuid(raw&&raw.matchId),receiptKey=botLadderQueueKey(owner,matchId);
      if(raw&&raw.v===1&&owner&&matchId&&raw.status==='acked'){rows.delete(receiptKey);continue;}
      const entry=normalizeBotLadderQueueEntry(raw);if(entry)rows.set(receiptKey,entry);
    }
  }catch(e){}
  return cleanBotLadderResultQueue([...rows.values()]);
}
function writeBotLadderResultItem(entry){
  entry=normalizeBotLadderQueueEntry(entry);if(!entry)return false;const key=botLadderResultItemKey(entry.owner,entry.matchId),serialized=JSON.stringify(entry);
  try{
    const prior=JSON.parse(localStorage.getItem(key)||'null');
    // An acknowledged UUID is terminal. A stale tab may never turn its old
    // in-memory pending copy back into a live projected receipt.
    if(prior&&prior.v===1&&prior.status==='acked')return false;
    localStorage.setItem(key,serialized);return localStorage.getItem(key)===serialized;
  }catch(e){return false;}
}
function writeBotLadderQueueIndex(entries){
  const serialized=JSON.stringify(cleanBotLadderResultQueue(entries));
  try{localStorage.setItem(BOT_LADDER_RESULT_STORAGE_KEY,serialized);return localStorage.getItem(BOT_LADDER_RESULT_STORAGE_KEY)===serialized;}catch(e){return false;}
}
function persistBotLadderResultQueue(entries){
  const clean=cleanBotLadderResultQueue(entries);
  // Each immutable receipt has its own key, so two tabs cannot overwrite each
  // other's read/append/write array. The compact array is only a legacy index.
  for(const entry of clean)if(!writeBotLadderResultItem(entry)){botLadderQueueStorageReady=false;return false;}
  const merged=cleanBotLadderResultQueue([...readStoredBotLadderResults(),...clean]);
  if(!writeBotLadderQueueIndex(merged)&&!merged.length){botLadderQueueStorageReady=false;return false;}
  botLadderResultQueue=merged;botLadderResultQueueLoaded=true;botLadderQueueStorageReady=true;return true;
}
function loadBotLadderResultQueue(force=false){
  if(botLadderResultQueueLoaded&&!force)return botLadderResultQueue.slice();
  const stored=readStoredBotLadderResults();botLadderResultQueue=stored;botLadderResultQueueLoaded=true;
  // Migrate a legacy array to one immutable key per receipt. Writing an empty
  // index also serves as the storage availability probe before ranked play.
  persistBotLadderResultQueue(stored);return botLadderResultQueue.slice();
}
function botLadderQueueEntries(owner=botLadderUserId){
  owner=botLadderOwnerId(owner);return loadBotLadderResultQueue().filter(entry=>entry.owner===owner);
}
function botLadderQueueCount(owner=botLadderUserId){return botLadderQueueEntries(owner).length;}
function botLadderQueueHasConflict(owner=botLadderUserId){return botLadderQueueEntries(owner).some(entry=>entry.status==='conflict');}
function botLadderQueueHasRecovery(owner=botLadderUserId){return botLadderQueueEntries(owner).some(entry=>entry.status==='recovery');}
function botLadderQueueBlocksPlay(owner=botLadderUserId){return botLadderQueueEntries(owner).some(entry=>entry.status==='conflict'||entry.status==='recovery');}
function botLadderQueueKey(owner,matchId){return botLadderOwnerId(owner)+'|'+botLadderResultUuid(matchId);}
function botLadderNextQueuedAt(owner,clock=Date.now()){
  owner=botLadderOwnerId(owner);if(!owner)return 0;
  const latest=loadBotLadderResultQueue(true).filter(entry=>entry.owner===owner)
    .reduce((value,entry)=>Math.max(value,entry.queuedAt),0),candidate=Math.floor(Number(clock));
  if(latest>=Number.MAX_SAFE_INTEGER)return 0;
  return Math.max(Number.isSafeInteger(candidate)&&candidate>0?candidate:1,latest+1);
}
function enqueueBotLadderResult(entry){
  entry=normalizeBotLadderQueueEntry(entry);if(!entry)return false;
  const queue=loadBotLadderResultQueue(true),key=botLadderQueueKey(entry.owner,entry.matchId),existing=queue.find(item=>botLadderQueueKey(item.owner,item.matchId)===key);
  if(existing){if(existing.won!==entry.won||existing.difficulty!==entry.difficulty)return false;markBotLadderTombstone(entry.owner,entry.matchId);return true;}
  if(botLadderResultItemStatus(entry.owner,entry.matchId)==='acked')return false;
  if(queue.filter(item=>item.owner===entry.owner).length>=BOT_LADDER_RESULT_QUEUE_MAX)return false;
  if(!persistBotLadderResultQueue([...queue,entry]))return false;
  markBotLadderTombstone(entry.owner,entry.matchId);return true;
}
function removeBotLadderQueuedResult(owner,matchId){
  owner=botLadderOwnerId(owner);matchId=botLadderResultUuid(matchId);const key=botLadderQueueKey(owner,matchId),queue=loadBotLadderResultQueue(true);
  if(!queue.some(entry=>botLadderQueueKey(entry.owner,entry.matchId)===key))return true;
  // Keep this tiny terminal marker instead of pruning it: a tab suspended for
  // months could otherwise wake with an old legacy index and resurrect an
  // already-credited result. If storage ever fills, new ranked play fails
  // closed; an acknowledged win is never traded for silent cleanup.
  const ack={v:1,owner,matchId,status:'acked',acknowledgedAt:Date.now()},itemKey=botLadderResultItemKey(owner,matchId),serialized=JSON.stringify(ack);
  try{localStorage.setItem(itemKey,serialized);if(localStorage.getItem(itemKey)!==serialized)throw new Error('AI ladder acknowledgement verification failed.');}
  catch(e){botLadderQueueStorageReady=false;return false;}
  const next=queue.filter(entry=>botLadderQueueKey(entry.owner,entry.matchId)!==key);writeBotLadderQueueIndex(next);
  botLadderResultQueue=readStoredBotLadderResults();botLadderResultQueueLoaded=true;botLadderQueueStorageReady=true;return !botLadderResultQueue.some(entry=>botLadderQueueKey(entry.owner,entry.matchId)===key);
}
function quarantineBotLadderQueuedResult(owner,matchId,reason){
  const key=botLadderQueueKey(owner,matchId),queue=loadBotLadderResultQueue(true),at=queue.findIndex(entry=>botLadderQueueKey(entry.owner,entry.matchId)===key);
  if(at<0||!['difficulty_mismatch','duplicate_conflict'].includes(String(reason||'')))return false;
  const next=queue.slice();next[at]=Object.assign({},next[at],{status:'conflict',conflictReason:String(reason)});
  if(!writeBotLadderResultItem(next[at])){botLadderQueueStorageReady=false;return false;}writeBotLadderQueueIndex(next);
  botLadderResultQueue=readStoredBotLadderResults();botLadderResultQueueLoaded=true;return botLadderResultQueue.some(entry=>botLadderQueueKey(entry.owner,entry.matchId)===key&&entry.status==='conflict');
}
function markBotLadderQueueReconciling(owner){
  owner=botLadderOwnerId(owner);if(!owner)return false;const queue=loadBotLadderResultQueue(true),next=[];let changed=false;
  for(const entry of queue){
    const replacement=entry.owner===owner&&entry.status==='pending'?Object.assign({},entry,{status:'recovery'}):entry;
    if(replacement!==entry){changed=true;if(!writeBotLadderResultItem(replacement)){botLadderQueueStorageReady=false;return false;}}
    next.push(replacement);
  }
  if(changed)writeBotLadderQueueIndex(next);botLadderResultQueue=readStoredBotLadderResults();botLadderResultQueueLoaded=true;
  return !botLadderQueueEntries(owner).some(entry=>entry.status==='pending');
}
function markBotLadderResultReconciling(owner,matchId){
  const key=botLadderQueueKey(owner,matchId),queue=loadBotLadderResultQueue(true),at=queue.findIndex(entry=>botLadderQueueKey(entry.owner,entry.matchId)===key);
  if(at<0)return botLadderResultItemStatus(owner,matchId)==='acked';if(queue[at].status==='recovery')return true;if(queue[at].status!=='pending')return false;
  const replacement=Object.assign({},queue[at],{status:'recovery'});if(!writeBotLadderResultItem(replacement)){botLadderQueueStorageReady=false;return false;}
  const next=queue.slice();next[at]=replacement;writeBotLadderQueueIndex(next);botLadderResultQueue=readStoredBotLadderResults();botLadderResultQueueLoaded=true;
  return botLadderResultQueue.some(entry=>botLadderQueueKey(entry.owner,entry.matchId)===key&&entry.status==='recovery');
}
function restoreBotLadderResultPending(owner,matchId){
  const key=botLadderQueueKey(owner,matchId),queue=loadBotLadderResultQueue(true),at=queue.findIndex(entry=>botLadderQueueKey(entry.owner,entry.matchId)===key);
  if(at<0)return false;if(queue[at].status==='pending')return true;if(queue[at].status!=='recovery')return false;
  const replacement=Object.assign({},queue[at],{status:'pending'});if(!writeBotLadderResultItem(replacement)){botLadderQueueStorageReady=false;return false;}
  const next=queue.slice();next[at]=replacement;writeBotLadderQueueIndex(next);botLadderResultQueue=readStoredBotLadderResults();botLadderResultQueueLoaded=true;
  return botLadderResultQueue.some(entry=>botLadderQueueKey(entry.owner,entry.matchId)===key&&entry.status==='pending');
}
function cleanBotLadderTombstones(raw){
  const out=[],seen=new Set();
  for(const item of Array.isArray(raw)?raw:[]){
    const owner=botLadderOwnerId(item&&item.owner),matchId=botLadderResultUuid(item&&item.matchId),key=owner+'|'+matchId;
    if(!owner||!matchId||seen.has(key))continue;seen.add(key);out.push({owner,matchId});
  }
  return out.slice(-BOT_LADDER_TOMBSTONE_MAX);
}
function loadBotLadderTombstones(force=false){
  if(botLadderTombstonesLoaded&&!force)return botLadderTombstones.slice();let raw=[];
  try{const parsed=JSON.parse(localStorage.getItem(BOT_LADDER_TOMBSTONE_STORAGE_KEY)||'[]');if(Array.isArray(parsed))raw=parsed;}catch(e){}
  botLadderTombstones=cleanBotLadderTombstones(raw);botLadderTombstonesLoaded=true;return botLadderTombstones.slice();
}
function saveBotLadderTombstones(entries){
  const clean=cleanBotLadderTombstones(entries);
  try{localStorage.setItem(BOT_LADDER_TOMBSTONE_STORAGE_KEY,JSON.stringify(clean));botLadderTombstones=clean;botLadderTombstonesLoaded=true;return true;}catch(e){return false;}
}
function markBotLadderTombstone(owner,matchId){
  owner=botLadderOwnerId(owner);matchId=botLadderResultUuid(matchId);if(!owner||!matchId)return false;
  const rows=loadBotLadderTombstones(),key=owner+'|'+matchId;if(rows.some(row=>row.owner+'|'+row.matchId===key))return true;
  return saveBotLadderTombstones([...rows,{owner,matchId}]);
}
function botLadderTrainingRecoveryEntries(owner){
  owner=botLadderOwnerId(owner);if(!owner)return [];let raw=[];
  try{const parsed=JSON.parse(localStorage.getItem(BOT_LADDER_TRAINING_STORAGE_KEY)||'[]');if(Array.isArray(parsed))raw=parsed;}catch(e){}
  const tombstones=new Set(loadBotLadderTombstones().filter(row=>row.owner===owner).map(row=>row.matchId)),out=[];
  for(const item of raw){
    if(!item||item.v!==1||item.owner!==owner||!['ai1v1','ai2v2'].includes(item.mode)||item.owner==='guest')continue;
    const matchId=botLadderResultUuid(item.eventId),difficulty=Number(item.difficulty),queuedAt=Number(item.queuedAt);
    if(!matchId||tombstones.has(matchId)||botLadderResultItemStatus(owner,matchId)==='acked'||typeof item.won!=='boolean'||!Number.isInteger(difficulty)||difficulty<0||difficulty>4||!Number.isInteger(queuedAt)||queuedAt<=0)continue;
    out.push({v:1,owner,matchId,won:item.won,difficulty,queuedAt});
  }
  return cleanBotLadderResultQueue(out);
}
function snapshotBotLadderTrainingRecovery(owner){
  owner=botLadderOwnerId(owner);if(!owner)return [];
  const snapshot=botLadderTrainingRecoveryEntries(owner);botLadderTrainingRecoverySnapshots.set(owner,snapshot);return snapshot.slice();
}
function admitBotLadderTrainingRecovery(owner,status='recovery'){
  owner=botLadderOwnerId(owner);
  if(!owner||!['pending','recovery'].includes(status))return 0;
  const candidates=botLadderTrainingRecoverySnapshots.get(owner)||[];if(!candidates.length)return 0;
  const old=loadBotLadderResultQueue(true),keys=new Set(old.map(entry=>botLadderQueueKey(entry.owner,entry.matchId))),added=[];
  for(const entry of candidates){
    if(keys.has(botLadderQueueKey(entry.owner,entry.matchId))||botLadderResultItemStatus(owner,entry.matchId)==='acked')continue;
    if(old.filter(item=>item.owner===owner).length+added.length>=BOT_LADDER_RESULT_QUEUE_MAX)break;
    added.push(Object.assign({},entry,{status}));
  }
  if(added.length&&!persistBotLadderResultQueue([...old,...added]))return 0;
  for(const entry of candidates){
    if(added.some(item=>item.matchId===entry.matchId)||keys.has(botLadderQueueKey(entry.owner,entry.matchId)))markBotLadderTombstone(owner,entry.matchId);
  }
  return added.length;
}
function loadBotLadderCanonicalCache(owner){
  owner=botLadderOwnerId(owner);if(!owner)return null;let row=null,rows=[];
  try{row=JSON.parse(localStorage.getItem(BOT_LADDER_CANONICAL_ITEM_PREFIX+owner)||'null');}catch(e){}
  if(!(row&&row.v===1&&botLadderOwnerId(row.owner)===owner)){
    try{const parsed=JSON.parse(localStorage.getItem(BOT_LADDER_CANONICAL_STORAGE_KEY)||'[]');if(Array.isArray(parsed))rows=parsed;}catch(e){}
    row=rows.find(item=>item&&item.v===1&&botLadderOwnerId(item.owner)===owner)||null;
  }
  return row?normalizeBotLadder(row.state):null;
}
function saveBotLadderCanonicalCache(owner,state){
  owner=botLadderOwnerId(owner);if(!owner)return false;let rows=[];const next=normalizeBotLadder(state),existing=loadBotLadderCanonicalCache(owner);
  // AI 01 revisions are monotonic even across demotions. A delayed tab may not
  // overwrite a newer durable canonical row with an older server response.
  const chosen=existing&&!botLadderSnapshotNewer(next,existing)?existing:next,
    row={v:1,owner,state:chosen,savedAt:Date.now()},serialized=JSON.stringify(row);
  try{
    localStorage.setItem(BOT_LADDER_CANONICAL_ITEM_PREFIX+owner,serialized);
    if(localStorage.getItem(BOT_LADDER_CANONICAL_ITEM_PREFIX+owner)!==serialized)throw new Error('AI ladder canonical verification failed.');
  }catch(e){botLadderCanonicalStorageReady=false;return false;}
  try{const parsed=JSON.parse(localStorage.getItem(BOT_LADDER_CANONICAL_STORAGE_KEY)||'[]');if(Array.isArray(parsed))rows=parsed;}catch(e){}
  rows=rows.filter(item=>item&&item.v===1&&botLadderOwnerId(item.owner)&&botLadderOwnerId(item.owner)!==owner).slice(-7);
  rows.push(row);try{localStorage.setItem(BOT_LADDER_CANONICAL_STORAGE_KEY,JSON.stringify(rows));}catch(e){}
  botLadderCanonicalStorageReady=true;return true;
}
function advanceBotLadderState(raw,won){
  const state=normalizeBotLadder(raw),next=Object.assign({},state);let delta=0,promoted=false,demoted=false;
  if(won){
    const completedWinCycle=next.winStreak>=2;
    next.wins++;next.winStreak=completedWinCycle?0:next.winStreak+1;next.lossStreak=0;
    if(next.progress<BOT_LADDER_MAX_PROGRESS){next.progress++;delta=1;}
    if(next.tier<4&&(completedWinCycle||next.progress>=BOT_LADDER_MAX_PROGRESS)){
      next.tier++;next.progress=0;next.winStreak=0;next.lossStreak=0;promoted=true;
    }
  }else{
    const completedLossCycle=next.lossStreak>=2;
    next.losses++;next.winStreak=0;next.lossStreak=completedLossCycle?0:next.lossStreak+1;
    if(completedLossCycle){
      if(next.progress>0){next.progress--;delta=-1;}
      else if(next.tier>0){next.tier--;next.progress=9;delta=-1;demoted=true;}
    }
  }
  return {state:normalizeBotLadder(next),delta,promoted,demoted};
}
function rebuildProjectedBotLadder(){
  const owner=botLadderOwnerId(botLadderUserId);let projected=normalizeBotLadder(botLadderCanonical);
  botLadderProjectionBlocked=false;
  for(const entry of botLadderQueueEntries(owner)){
    // A frozen match can only count at its starting tier. Stop projection at a
    // conflict and let the server return the canonical mismatch decision.
    if(entry.status==='conflict'||entry.status==='recovery'||entry.difficulty!==projected.tier){botLadderProjectionBlocked=true;break;}
    projected=advanceBotLadderState(projected,entry.won).state;
  }
  botLadder=projected;return normalizeBotLadder(botLadder);
}
function currentBotLadder(){return normalizeBotLadder(botLadder);}
function botLadderRpcRow(data){return Array.isArray(data)?data[0]||null:(data&&typeof data==='object'?data:null);}
function botLadderSnapshotNewer(next,current){
  if(next.revision!==current.revision)return next.revision>current.revision;
  const a=Date.parse(next.updatedAt||''),b=Date.parse(current.updatedAt||'');
  return Number.isFinite(a)&&(!Number.isFinite(b)||a>=b);
}
function applyBotLadderSnapshot(raw,expectedUserId,cachePersisted=false){
  const liveId=authUser&&String(authUser.id||'');
  if(!liveId||String(expectedUserId||liveId)!==liveId||botLadderUserId!==liveId)return currentBotLadder();
  const next=normalizeBotLadder(raw),current=normalizeBotLadder(botLadderCanonical);
  // Tier and progress can legitimately decrease. The server revision, not a
  // monotonic score comparison, decides which concurrent response is newest.
  // AI 01 revisions are monotonic, so even the first fresh read must not let a
  // delayed lower-revision response downgrade the durable owner cache.
  if((botLadderServerLoaded||botLadderCanonicalCached)&&!botLadderSnapshotNewer(next,current)){
    botLadderLoaded=true;botLadderServerLoaded=true;botLadderCanonicalCached=false;botLadderCanonicalStorageReady=true;return rebuildProjectedBotLadder();
  }
  botLadderCanonical=next;botLadderLoaded=true;botLadderServerLoaded=true;botLadderCanonicalCached=false;
  if(!cachePersisted)saveBotLadderCanonicalCache(liveId,next);return rebuildProjectedBotLadder();
}
function prepareBotLadderForAccount(userId){
  userId=String(userId||'');
  if(userId===botLadderUserId)return currentBotLadder();
  botLadderRequestVersion++;botLadderLaunchVersion++;botLadderLaunchPending='';botLadderPendingResult=null;botLadderFetchPromise=null;
  botLadderReservedMatchOwner='';botLadderReservedMatchId='';
  loadBotLadderResultQueue();loadBotLadderTombstones();botLadderUserId=userId;
  if(userId)snapshotBotLadderTrainingRecovery(userId);
  const cached=userId?loadBotLadderCanonicalCache(userId):null;
  botLadderCanonical=normalizeBotLadder(cached||{});botLadderServerLoaded=false;botLadderCanonicalCached=!!cached;botLadderRpcMissing=false;
  botLadderCanonicalStorageReady=null;
  botLadderLoaded=!userId||!!cached||botLadderQueueCount(userId)>0;rebuildProjectedBotLadder();
  botLadderFetchedAt=0;botLadderSyncState=userId?(botLadderQueueHasConflict(userId)?'conflict':botLadderQueueHasRecovery(userId)?'reconciling':'idle'):'guest';return currentBotLadder();
}
function botLadderReady(){
  const liveId=authUser&&String(authUser.id||'');
  return !!(liveId&&botLadderLoaded&&botLadderUserId===liveId);
}
function botLadderReadyForMatch(){
  const owner=botLadderOwnerId(authUser&&authUser.id);
  return botLadderReady()&&botLadderSyncState!=='syncing'&&botLadderQueueStorageReady!==false&&
    botLadderCanonicalStorageReady!==false&&!botLadderQueueBlocksPlay(botLadderUserId)&&!botLadderProjectionBlocked&&
    botLadderQueueCount(botLadderUserId)<BOT_LADDER_RESULT_QUEUE_MAX&&botLadderSecureMatchReady(owner);
}
async function refreshBotLadder(force=false){
  const expectedUserId=authUser&&String(authUser.id||'');
  if(expectedUserId!==botLadderUserId)prepareBotLadderForAccount(expectedUserId);
  if(!expectedUserId){botLadderSyncState='guest';return currentBotLadder();}
  // Coalesce same-account reads. A deferred match must never observe request N
  // finish, launch read-only, and then have a newer request N+1 publish the
  // canonical tier a moment later.
  if(botLadderFetchPromise)return botLadderFetchPromise;
  if(!sb||typeof sb.rpc!=='function'){
    botLadderLoaded=true;rebuildProjectedBotLadder();botLadderSyncState=botLadderQueueHasConflict(expectedUserId)?'conflict':botLadderQueueHasRecovery(expectedUserId)?'reconciling':botLadderQueueCount(expectedUserId)?'queued':'offline';
    if(!botLadderQueueHasConflict(expectedUserId))scheduleBotLadderQueueRetry();return currentBotLadder();
  }
  if(!force&&botLadderLoaded&&Date.now()-botLadderFetchedAt<BOT_LADDER_REFRESH_MS)return currentBotLadder();
  const requestVersion=++botLadderRequestVersion;botLadderSyncState='syncing';
  let request;
  request=(async()=>{
    try{
      const {data,error}=await sb.rpc('get_outpost_zero_bot_ladder');if(error)throw error;
      const row=botLadderRpcRow(data);if(!row)throw new Error('AI ladder returned no account state.');
      if(requestVersion===botLadderRequestVersion&&authUser&&String(authUser.id||'')===expectedUserId){
        botLadderRpcMissing=false;
        // A prior submit may have committed even when its response was lost.
        // Before applying this fresh canonical row, make every local pending
        // receipt unprojected and blocking until replay proves accepted/duplicate.
        if(!markBotLadderQueueReconciling(expectedUserId)){
          botLadderLoaded=true;botLadderSyncState='storage_error';return currentBotLadder();
        }
        applyBotLadderSnapshot(row,expectedUserId);
        if(botLadderCanonicalStorageReady===false){botLadderSyncState='storage_error';return currentBotLadder();}
        // An older build may have synced this exact match to AI 01 while its
        // AI 03 evidence remained queued. Submit as unprojected recovery first:
        // duplicate proves prior credit; accepted supplies canonical credit.
        admitBotLadderTrainingRecovery(expectedUserId,'recovery');botLadderTrainingRecoverySnapshots.delete(expectedUserId);
        rebuildProjectedBotLadder();botLadderFetchedAt=Date.now();
        botLadderSyncState=botLadderQueueHasConflict(expectedUserId)?'conflict':botLadderQueueHasRecovery(expectedUserId)?'reconciling':botLadderQueueCount(expectedUserId)?'queued':'ready';
        Promise.resolve().then(()=>flushBotLadderResultQueue());
      }
    }catch(e){
      if(requestVersion===botLadderRequestVersion&&authUser&&String(authUser.id||'')===expectedUserId){
        botLadderRpcMissing=botLadderMissingRpcError(e);botLadderLoaded=true;
        if(botLadderRpcMissing)admitBotLadderTrainingRecovery(expectedUserId,botLadderCanonicalCached?'recovery':'pending');
        rebuildProjectedBotLadder();botLadderSyncState=botLadderQueueHasConflict(expectedUserId)?'conflict':botLadderQueueHasRecovery(expectedUserId)?'reconciling':botLadderQueueCount(expectedUserId)?'queued':'offline';
        if(!botLadderQueueHasConflict(expectedUserId))scheduleBotLadderQueueRetry();
      }
    }
    finally{if(botLadderFetchPromise===request)botLadderFetchPromise=null;}
    return currentBotLadder();
  })();
  botLadderFetchPromise=request;return request;
}
function fetchBotLadder(force=false){return refreshBotLadder(force);}
function createBotLadderMatchId(){
  const secure=typeof crypto!=='undefined'?crypto:null;
  try{if(secure&&typeof secure.randomUUID==='function'){
    const id=botLadderResultUuid(secure.randomUUID());if(id)return id;
  }}catch(e){}
  try{
    if(secure&&typeof secure.getRandomValues==='function'){
      const bytes=new Uint8Array(16);secure.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
      const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
      return botLadderResultUuid(hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20));
    }
  }catch(e){}return '';
}
function reserveBotLadderMatchId(owner){
  owner=botLadderOwnerId(owner);if(!owner)return '';
  if(botLadderReservedMatchOwner===owner&&botLadderResultUuid(botLadderReservedMatchId))return botLadderReservedMatchId;
  const id=createBotLadderMatchId();botLadderReservedMatchOwner=id?owner:'';botLadderReservedMatchId=id;return id;
}
function takeBotLadderMatchId(owner){
  owner=botLadderOwnerId(owner);const id=reserveBotLadderMatchId(owner);
  if(id&&botLadderReservedMatchOwner===owner){botLadderReservedMatchOwner='';botLadderReservedMatchId='';return id;}
  return '';
}
function botLadderSecureMatchReady(owner=botLadderOwnerId(authUser&&authUser.id)){
  owner=botLadderOwnerId(owner);return !owner||!!reserveBotLadderMatchId(owner);
}
function botLadderProgressForTier(tier,state=botLadder){
  state=normalizeBotLadder(state);tier=clamp(Math.floor(+tier||0),0,4);
  return tier<state.tier?BOT_LADDER_MAX_PROGRESS:tier===state.tier?state.progress:0;
}
function botLadderProgressText(state=botLadder){
  state=normalizeBotLadder(state);
  return botDifficultyName(state.tier)+' · SCORE '+state.progress+'/'+BOT_LADDER_MAX_PROGRESS+' · WIN STREAK '+state.winStreak+'/3 · LOSS STREAK '+state.lossStreak+'/3';
}
function initializeBotLadderMatch(match,mode,difficulty,adminTest=false,modelId=activeBotModelId){
  const normalizedMode=String(mode||'ai1v1'),eligibleMode=normalizedMode==='ai1v1'||normalizedMode==='ai2v2',startState=currentBotLadder(),
    rankingAllowed=!adminTest&&eligibleMode&&!(typeof testMode!=='undefined'&&!!testMode)&&botLadderReadyForMatch(),
    accountId=rankingAllowed?botLadderOwnerId(authUser&&authUser.id):'',
    matchId=accountId?takeBotLadderMatchId(accountId):'',canSubmit=!!(accountId&&matchId);
  match.botLadderMode=normalizedMode;match.botDifficulty=accountId?startState.tier:clamp(Math.floor(+difficulty||0),0,4);
  match.botModelId=botModelRelease(modelId).id;
  match.botAdminTest=!!adminTest;match.botTestMode=typeof testMode!=='undefined'&&!!testMode;
  match.botLadderAccountId=accountId;match.botLadderReadOnly=!canSubmit || match.botTestMode;
  match.botLadderStartState=startState;match.botLadderResultState=startState;match.botLadderRecorded=false;match.botLadderCompetitiveStarted=false;
  match.botLadderMatchId=matchId;match.botLadderSubmitAttempts=0;
  match.botLadderSubmitInFlight=false;match.botLadderSubmitDone=!canSubmit;match.botLadderRetryTimer=null;
  match.botLadderSubmitWon=null;match.botLadderSubmitResponse=null;
  match.botLadderSyncStatus=adminTest?'admin_test':match.botTestMode?'test_mode':canSubmit?'ready':authUser?(botLadderQueueStorageReady===false?'save_unavailable':'offline'):'guest';
  match.botLadderDelta=0;match.botLadderPromoted=false;match.botLadderDemoted=false;
  if(canSubmit)botLadderRuntimeMatches.set(botLadderQueueKey(accountId,matchId),match);
  if(typeof initializeAiTrainingMatch==='function')initializeAiTrainingMatch(match);
  return match;
}
function botLadderMissingRpcError(error){
  const text=[error&&error.code,error&&error.message,error&&error.details,error&&error.hint,error].filter(Boolean).join(' ').toLowerCase();
  return /pgrst202|schema cache|could not find[^\n]*function|function[^\n]*get_outpost_zero_bot_ladder[^\n]*does not exist/.test(text);
}
function finishBotLadderSubmission(match,status){
  if(!match)return;if(match.botLadderRetryTimer){clearTimeout(match.botLadderRetryTimer);match.botLadderRetryTimer=null;}
  match.botLadderSubmitInFlight=false;match.botLadderSubmitDone=true;if(status)match.botLadderSyncStatus=status;
  if(botLadderPendingResult===match)botLadderPendingResult=null;
}
function botLadderMatchForfeitEligible(match){
  return !!(match&&match.botLadderCompetitiveStarted===true&&!match.botAdminTest&&!match.botTestMode&&!match.botLadderRecorded&&
    !match.botLadderSubmitDone&&botLadderOwnerId(match.botLadderAccountId)&&botLadderResultUuid(match.botLadderMatchId)&&
    (match.botLadderMode==='ai1v1'||match.botLadderMode==='ai2v2'));
}
function markBotLadderMatchStarted(match){
  if(!match||match.botLadderRecorded||match.botLadderSubmitDone)return false;
  match.botLadderCompetitiveStarted=true;return botLadderMatchForfeitEligible(match);
}
function recordBotLadderForfeit(match,options={}){
  if(!botLadderMatchForfeitEligible(match))return false;
  match.botLadderForfeitReason=String(options&&options.reason||'left_match').slice(0,32);
  return recordCompletedBotLadderMatch(false,match,options);
}
function cancelBotLadderSubmission(match,options={}){
  if(!match||match.botLadderSubmitDone)return;
  if(recordBotLadderForfeit(match,options))return;
  if(match.botLadderRecorded)return; // a completed result owns a durable retry even after the arena closes
  if(match.botLadderRetryTimer){clearTimeout(match.botLadderRetryTimer);match.botLadderRetryTimer=null;}
  if(!match.botLadderSubmitInFlight){finishBotLadderSubmission(match,'cancelled');botLadderRuntimeMatches.delete(botLadderQueueKey(match.botLadderAccountId,match.botLadderMatchId));}
}
function clearBotLadderQueueRetry(){if(botLadderQueueRetryTimer){clearTimeout(botLadderQueueRetryTimer);botLadderQueueRetryTimer=null;}}
function scheduleBotLadderQueueRetry(rateLimited=false){
  const owner=botLadderOwnerId(authUser&&authUser.id);if(!owner||!botLadderQueueCount(owner)||botLadderQueueHasConflict(owner)||botLadderQueueRetryTimer)return false;
  const index=Math.min(botLadderQueueRetryLevel,BOT_LADDER_QUEUE_RETRY_MS.length-1),base=BOT_LADDER_QUEUE_RETRY_MS[index],
    delay=rateLimited?Math.max(BOT_LADDER_RATE_LIMIT_RETRY_MS,base):base;
  botLadderQueueRetryLevel=Math.min(botLadderQueueRetryLevel+1,BOT_LADDER_QUEUE_RETRY_MS.length-1);
  botLadderQueueRetryTimer=setTimeout(()=>{botLadderQueueRetryTimer=null;
    void refreshBotLadder(true).finally(()=>flushBotLadderResultQueue());
  },delay);return true;
}
function botLadderQueuedOutcome(match,won){
  const outcome=advanceBotLadderState(match.botLadderStartState,won),liveOwner=botLadderOwnerId(authUser&&authUser.id),owner=botLadderOwnerId(match.botLadderAccountId);
  match.botLadderDelta=outcome.delta;match.botLadderPromoted=outcome.promoted;match.botLadderDemoted=outcome.demoted;
  match.botLadderResultState=liveOwner===owner&&botLadderUserId===owner?rebuildProjectedBotLadder():outcome.state;return outcome;
}
function persistCompletedBotLadderMatch(match,options={}){
  if(!match||!match.botLadderRecorded||!match.botLadderAccountId||!match.botLadderMatchId)return false;
  const deferSync=options&&options.deferSync===true||match.botLadderDeferSync===true;
  if(deferSync)match.botLadderDeferSync=true;
  if(!match.botLadderQueuedAt)match.botLadderQueuedAt=botLadderNextQueuedAt(match.botLadderAccountId);
  const entry={v:1,owner:match.botLadderAccountId,matchId:match.botLadderMatchId,won:!!match.botLadderSubmitWon,
    difficulty:match.botDifficulty,queuedAt:match.botLadderQueuedAt};
  if(!entry.queuedAt||!enqueueBotLadderResult(entry)){
    match.botLadderSubmitDone=false;match.botLadderSyncStatus=botLadderQueueCount(entry.owner)>=BOT_LADDER_RESULT_QUEUE_MAX?'queue_full':'save_failed';
    botLadderPendingResult=match;
    if(!match.botLadderRetryTimer)match.botLadderRetryTimer=setTimeout(()=>{match.botLadderRetryTimer=null;persistCompletedBotLadderMatch(match);},2500);
    return false;
  }
  botLadderQueuedOutcome(match,entry.won);finishBotLadderSubmission(match,
    botLadderOwnerId(authUser&&authUser.id)===entry.owner&&!deferSync?(botLadderSyncState==='ready'?'queued':'queued_offline'):'queued_owner');
  if(botLadderOwnerId(authUser&&authUser.id)===entry.owner&&!deferSync){botLadderSyncState='queued';void flushBotLadderResultQueue();}
  return true;
}
function recordCompletedBotLadderMatch(won,match,options={}){
  if(!match||match.botLadderRecorded)return false;match.botLadderRecorded=true;match.botLadderSubmitWon=!!won;match.botLadderResultState=currentBotLadder();
  if(match.botAdminTest){finishBotLadderSubmission(match,'admin_test');return true;}
  if(match.botTestMode){finishBotLadderSubmission(match,'test_mode');return true;}
  if(!match.botLadderAccountId||!match.botLadderMatchId){finishBotLadderSubmission(match,authUser?'offline':'guest');return true;}
  persistCompletedBotLadderMatch(match,options);return true;
}
function activeLocalBotLadderMatch(){
  if(typeof isBotArena==='function'&&isBotArena())return arena;
  if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2())return partyCpuMatch;
  return null;
}
function prepareBotLadderForAuthChange(nextUserId){
  const previousUserId=botLadderOwnerId(authUser&&authUser.id),next=botLadderOwnerId(nextUserId);
  if(previousUserId===next)return false;
  const match=activeLocalBotLadderMatch();if(!match)return false;
  // Supabase has already changed its internal JWT by the time the auth event
  // reaches this callback. Persist owner A's forfeit synchronously, but never
  // issue an RPC that could run under owner B's token.
  cancelBotLadderSubmission(match,{deferSync:true,reason:'account_changed'});
  if(typeof isBotArena==='function'&&isBotArena()&&typeof leaveArena==='function')leaveArena('CPU match ended because the account changed.',false);
  else if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()&&typeof offlineCpu2v2Leave==='function')
    offlineCpu2v2Leave('CPU match ended because the account changed.',false);
  return true;
}
function handleBotLadderPageExit(event){
  // A persisted pagehide is only a BFCache suspension; returning must resume
  // the same match without a phantom loss. Reload/close uses persisted=false.
  if(event&&event.persisted===true)return false;
  const match=activeLocalBotLadderMatch();if(!match)return false;
  return !!recordBotLadderForfeit(match,{deferSync:true,reason:'page_exit'});
}
function botLadderRuntimeMatch(entry){return botLadderRuntimeMatches.get(botLadderQueueKey(entry&&entry.owner,entry&&entry.matchId))||null;}
function publishBotLadderQueueStatus(entry,status,row=null,cloudFinal=false){
  const match=botLadderRuntimeMatch(entry);if(!match)return;
  if(row&&status==='accepted'){
    match.botLadderSubmitResponse=row;match.botLadderDelta=clamp(Math.floor(+row.delta||0),-1,1);
    match.botLadderPromoted=row.promoted===true;match.botLadderDemoted=row.demoted===true;
  }else if(row)match.botLadderSubmitResponse=row;
  const liveOwner=botLadderOwnerId(authUser&&authUser.id);
  match.botLadderResultState=liveOwner===entry.owner&&botLadderUserId===entry.owner?currentBotLadder():match.botLadderResultState;
  finishBotLadderSubmission(match,status);if(cloudFinal)botLadderRuntimeMatches.delete(botLadderQueueKey(entry.owner,entry.matchId));
}
async function flushBotLadderResultQueue(){
  if(botLadderQueueFlushPromise){botLadderQueueFlushRequested=true;return botLadderQueueFlushPromise;}
  let request;
  request=(async()=>{
    const owner=botLadderOwnerId(authUser&&authUser.id);if(!owner)return {sent:0,queued:0};
    if(!sb||typeof sb.rpc!=='function'||(typeof navigator!=='undefined'&&navigator.onLine===false)){
      botLadderSyncState=botLadderQueueHasConflict(owner)?'conflict':botLadderQueueHasRecovery(owner)?'reconciling':botLadderQueueCount(owner)?'queued':'offline';
      if(!botLadderQueueHasConflict(owner))scheduleBotLadderQueueRetry();return {sent:0,queued:botLadderQueueCount(owner)};
    }
    let sent=0;
    while(true){
      if(botLadderOwnerId(authUser&&authUser.id)!==owner){botLadderQueueFlushRequested=true;break;}
      const entry=botLadderQueueEntries(owner)[0];if(!entry)break;
      if(entry.status==='conflict'){botLadderSyncState='conflict';break;}
      const match=botLadderRuntimeMatch(entry);if(match)match.botLadderSubmitAttempts++;
      try{
        const {data,error}=await sb.rpc('submit_outpost_zero_bot_ladder',{
          p_match_id:entry.matchId,p_won:entry.won,p_difficulty:entry.difficulty});if(error)throw error;
        if(botLadderOwnerId(authUser&&authUser.id)!==owner){botLadderQueueFlushRequested=true;break;}
        const row=botLadderRpcRow(data);if(!row)throw new Error('AI ladder submission returned no account state.');
        const reason=String(row.reason||''),accepted=row.accepted===true||reason==='accepted'||reason==='duplicate';
        if(accepted){
          const wasPending=entry.status==='pending';
          if(!markBotLadderResultReconciling(owner,entry.matchId)){
            rebuildProjectedBotLadder();botLadderSyncState='storage_error';publishBotLadderQueueStatus(entry,'storage_error');scheduleBotLadderQueueRetry();break;
          }
          rebuildProjectedBotLadder();
          // Cache the credited canonical state before acknowledging the local
          // receipt. If this write fails, duplicate replay remains safe and an
          // offline reload still has the original unacknowledged receipt.
          if(!saveBotLadderCanonicalCache(owner,row)){
            if(wasPending)restoreBotLadderResultPending(owner,entry.matchId);rebuildProjectedBotLadder();
            botLadderSyncState='storage_error';publishBotLadderQueueStatus(entry,'storage_error');scheduleBotLadderQueueRetry();break;
          }
          const durableCanonical=loadBotLadderCanonicalCache(owner)||normalizeBotLadder(row);
          if(!removeBotLadderQueuedResult(owner,entry.matchId)){publishBotLadderQueueStatus(entry,'queued_offline');scheduleBotLadderQueueRetry();break;}
          applyBotLadderSnapshot(durableCanonical,owner,true);botLadderFetchedAt=Date.now();botLadderRpcMissing=false;
          publishBotLadderQueueStatus(entry,reason==='duplicate'?'duplicate':'accepted',row,true);sent++;botLadderQueueRetryLevel=0;continue;
        }
        if(reason==='rate_limited'){
          applyBotLadderSnapshot(row,owner);
          if(botLadderCanonicalStorageReady===false){botLadderSyncState='storage_error';publishBotLadderQueueStatus(entry,'storage_error');scheduleBotLadderQueueRetry();break;}
          publishBotLadderQueueStatus(entry,'queued_rate_limited');scheduleBotLadderQueueRetry(true);break;
        }
        if(reason==='difficulty_mismatch'||reason==='duplicate_conflict'){
          // The server did not prove that this exact receipt was credited. Keep
          // it durably quarantined and stop later results from passing it.
          if(!quarantineBotLadderQueuedResult(owner,entry.matchId,reason)){publishBotLadderQueueStatus(entry,'queued_offline');scheduleBotLadderQueueRetry();break;}
          applyBotLadderSnapshot(row,owner);publishBotLadderQueueStatus(entry,reason,row);botLadderSyncState='conflict';break;
        }
        publishBotLadderQueueStatus(entry,'queued_offline',row);scheduleBotLadderQueueRetry();break;
      }catch(e){
        botLadderRpcMissing=botLadderMissingRpcError(e);botLadderSyncState=entry.status==='recovery'?'reconciling':'queued';
        publishBotLadderQueueStatus(entry,'queued_offline');scheduleBotLadderQueueRetry();break;
      }
    }
    const queued=botLadderQueueCount(owner);
    if(!queued){clearBotLadderQueueRetry();botLadderQueueRetryLevel=0;if(botLadderUserId===owner)botLadderSyncState='ready';}
    else if(botLadderUserId===owner&&botLadderSyncState!=='storage_error')botLadderSyncState=botLadderQueueHasConflict(owner)?'conflict':botLadderQueueHasRecovery(owner)?'reconciling':'queued';
    return {sent,queued};
  })();
  botLadderQueueFlushPromise=request;
  try{return await request;}finally{
    if(botLadderQueueFlushPromise===request)botLadderQueueFlushPromise=null;
    const again=botLadderQueueFlushRequested;botLadderQueueFlushRequested=false;if(again)Promise.resolve().then(()=>flushBotLadderResultQueue());
  }
}
async function submitBotLadderResult(matchId,won,difficulty,match){
  if(!match||String(match.botLadderMatchId||'')!==String(matchId||'')||match.botDifficulty!==clamp(Math.floor(+difficulty||0),0,4))return null;
  if(!match.botLadderRecorded)recordCompletedBotLadderMatch(!!won,match);
  else if(match.botLadderSyncStatus==='save_failed'||match.botLadderSyncStatus==='queue_full')persistCompletedBotLadderMatch(match);
  await flushBotLadderResultQueue();return match.botLadderSubmitResponse||null;
}
function bindBotLadderSyncEvents(){
  if(botLadderSyncEventsBound)return false;botLadderSyncEventsBound=true;loadBotLadderResultQueue();loadBotLadderTombstones();
  const resume=()=>{if(!authUser)return;clearBotLadderQueueRetry();botLadderQueueRetryLevel=0;void refreshBotLadder(true).finally(()=>flushBotLadderResultQueue());};
  const storageChanged=event=>{
    const key=String(event&&event.key||''),owner=botLadderOwnerId(authUser&&authUser.id);if(!owner||botLadderUserId!==owner)return;
    const receiptEvent=key===BOT_LADDER_RESULT_STORAGE_KEY||key.startsWith(BOT_LADDER_RESULT_ITEM_PREFIX),
      canonicalEvent=key===BOT_LADDER_CANONICAL_ITEM_PREFIX+owner;
    if(!receiptEvent&&!canonicalEvent)return;
    if(canonicalEvent){
      if(!markBotLadderQueueReconciling(owner)){botLadderSyncState='storage_error';return;}
      const cached=loadBotLadderCanonicalCache(owner);if(cached){botLadderCanonicalStorageReady=true;applyBotLadderSnapshot(cached,owner,true);}
    }
    botLadderResultQueueLoaded=false;loadBotLadderResultQueue(true);
    rebuildProjectedBotLadder();botLadderSyncState=botLadderQueueHasConflict(owner)?'conflict':botLadderQueueHasRecovery(owner)?'reconciling':botLadderQueueCount(owner)?'queued':botLadderServerLoaded?'ready':'offline';
    if(botLadderQueueCount(owner)&&!botLadderQueueHasConflict(owner))void flushBotLadderResultQueue();
  };
  if(typeof window!=='undefined'&&window.addEventListener){
    window.addEventListener('online',resume);window.addEventListener('focus',resume);window.addEventListener('storage',storageChanged);
  }
  if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume();});
  return true;
}
function botLadderMatchSettled(match){return !!(match&&match.botLadderSubmitDone&&!match.botLadderSubmitInFlight&&!match.botLadderRetryTimer);}
function botLadderHasPendingResult(){return !!(botLadderPendingResult&&!botLadderMatchSettled(botLadderPendingResult));}
function botLadderMatchResultText(match){
  const state=normalizeBotLadder(match&&match.botLadderResultState||botLadder),progress=botLadderProgressText(state),status=String(match&&match.botLadderSyncStatus||'');
  if(status==='admin_test')return 'ADMIN TEST · ACCOUNT LADDER UNCHANGED';
  if(status==='test_mode')return 'TEST MODE · RESULT WILL NOT CHANGE YOUR LADDER';
  if(status==='guest')return 'BEGINNER · SIGN IN TO SYNC YOUR LADDER';
  if(status==='save_unavailable')return 'DEVICE SAVE UNAVAILABLE · LADDER MATCH BLOCKED';
  if(status==='storage_error')return 'RESULT SAFE · DEVICE RECONCILIATION BLOCKED';
  if(status==='save_failed'||status==='queue_full')return 'RESULT NOT SAFE YET · KEEP THIS PAGE OPEN';
  if(status==='offline')return 'LADDER OFFLINE · RESULT NOT RECORDED';
  if(status==='queued'||status==='queued_offline'||status==='queued_owner'||status==='queued_rate_limited'){
    const prefix=match&&match.botLadderPromoted?'PROMOTED TO '+botDifficultyName(state.tier):match&&match.botLadderDemoted?'RANKED DOWN TO '+botDifficultyName(state.tier):
      match&&match.botLadderDelta<0?'3-LOSS PENALTY · -1 SCORE':match&&match.botLadderDelta>0?'WIN +1 SCORE':'RESULT SAVED';
    return prefix+' · '+progress+' · SAVED ON THIS DEVICE · WILL SYNC';
  }
  if(status==='difficulty_mismatch'||status==='duplicate_conflict')return 'RESULT CONFLICT · RECEIPT KEPT ON THIS DEVICE · '+progress;
  if(match&&match.botLadderPromoted)return 'PROMOTED TO '+botDifficultyName(state.tier)+' · '+progress;
  if(match&&match.botLadderDemoted)return 'RANKED DOWN TO '+botDifficultyName(state.tier)+' · '+progress;
  if(match&&match.botLadderDelta<0)return '3-LOSS PENALTY · -1 SCORE · '+progress;
  if(match&&match.botLadderDelta>0)return 'WIN +1 SCORE · '+progress;
  return progress;
}
function arenaBotTuning(difficulty=botLadder.tier,modelId=activeBotModelId){
  // Difficulty controls execution plus a bounded ranged-damage handicap. The
  // frozen tactical release controls which cumulative decisions exist, except
  // that Beginner deliberately never predicts movement even on newer models.
  const tier=botDifficulty(difficulty),tuning=Object.assign({},BOT_AI,tier,botModelRelease(modelId));
  if(tier.allowPrediction===false)tuning.usePrediction=false;
  return Object.freeze(tuning);
}
function isBotArena(){ return !!(arena&&arena.mode==='bot'); }
function isLocalArena(){ return isBotArena()||(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()); }
function arenaMeId(){ return isBotArena()?LOCAL_DUEL_PLAYER:(authUser&&authUser.id); }
function arenaOpponentId(){ return isBotArena()?LOCAL_DUEL_BOT:(arena&&arena.opponent&&arena.opponent.id); }
function startAiLearningBotTest(selectedModelId){
  if(!isMainAdmin()){ closeAiLearning(); sfx('dry'); return false; }
  const model=botModelRelease(selectedModelId),difficulty=4,savedLoadout=Object.assign({},loadout),
    usable=(key,fallback)=>key&&WEAPONS[key]&&!(typeof isLocked==='function'&&isLocked(key))?key:fallback;
  loadout={primary:usable(loadout.primary,'ar'),secondary:usable(loadout.secondary,'m9'),
    melee:usable(loadout.melee,'knife'),utility:null};
  aiLearningOpen=false; adminUsed=true;
  startBotArena({adminTest:true,difficulty,modelId:model.id,adminTestSeed:'outpost-zero-ai-model-comparison-v3',
    returnToAiLearning:true,returnPage:selPage,savedLoadout});
  return true;
}
function restartAiLearningBotTest(match=arena){
  if(!match||!match.botAdminTest||!isMainAdmin()) return false;
  startBotArena({adminTest:true,difficulty:4,modelId:match.botModelId,
    adminTestSeed:match.botAdminTestSeed||'outpost-zero-ai-model-comparison-v3',returnToAiLearning:true,
    returnPage:match.botAdminReturnPage||'hub',savedLoadout:Object.assign({},match.botAdminSavedLoadout||loadout)});
  return true;
}
function deferBotLadderMatchStart(mode,start){
  mode=String(mode||'ai1v1');
  const accountId=authUser&&String(authUser.id||'');
  if(botLadderLaunchPending)return true;
  const launchVersion=++botLadderLaunchVersion;botLadderLaunchPending=mode;
  const originArena=arena,originPartyCpu=typeof partyCpuMatch!=='undefined'?partyCpuMatch:null,
    fromBotResult=mode==='ai1v1'&&isBotArena()&&arena.phase==='match_end',
    fromTeamResult=mode==='ai2v2'&&typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()&&partyCpuMatch.phase==='match_end';
  if(arena)arena.status=accountId?'SYNCING AI MODEL + LADDER…':'SYNCING AI MODEL…';
  const ladderRequest=accountId?refreshBotLadder(true):Promise.resolve(currentBotLadder());
  void Promise.all([ladderRequest,refreshActiveBotModel(true)]).then(()=>{
    const liveAccountId=authUser&&String(authUser.id||'')||'';
    if(launchVersion!==botLadderLaunchVersion||botLadderLaunchPending!==mode||liveAccountId!==accountId)return;
    botLadderLaunchPending='';
    // Leaving the loadout screen while the RPC is in flight cancels launch.
    // A late cloud response may update the account cache but cannot start play.
    const fromLoadout=pendingGameMode===mode&&selPage==='loadout',
      botResultStill=fromBotResult&&arena===originArena&&isBotArena()&&arena.phase==='match_end',
      teamResultStill=fromTeamResult&&partyCpuMatch===originPartyCpu&&isLocalCpu2v2()&&partyCpuMatch.phase==='match_end';
    const originStill=fromBotResult?botResultStill:fromTeamResult?teamResultStill:fromLoadout;
    if(!originStill)return;
    start();
  });
  return true;
}
function cancelBotLadderLaunch(){botLadderLaunchVersion++;botLadderLaunchPending='';}
function startBotArena(options){
  options=options&&typeof options==='object'?options:{};
  if(typeof requireResolvedUsernameForGameplay==='function'&&!requireResolvedUsernameForGameplay()) return false;
  if(typeof arenaLoadoutReady==='function'&&!arenaLoadoutReady()){
    if(arena)arena.status='Pick three published weapons you can use before starting.';
    if(typeof sfx==='function')sfx('dry');return false;
  }
  const adminTest=options.adminTest===true&&typeof isMainAdmin==='function'&&isMainAdmin();
  if(!adminTest&&options.ladderReady!==true&&typeof deferBotLadderMatchStart==='function'&&
     deferBotLadderMatchStart('ai1v1',()=>startBotArena(Object.assign({},options,{ladderReady:true}))))return true;
  if(!adminTest&&authUser&&!(typeof testMode!=='undefined'&&!!testMode)&&!botLadderReadyForMatch()){
    if(arena)arena.status=botLadderQueueStorageReady===false?'CPU ladder needs device storage before it can safely start.':
      !botLadderSecureMatchReady()?'Secure CPU result save is unavailable in this browser.':'CPU ladder is still syncing. Try Start again.';
    if(typeof sfx==='function')sfx('dry');return false;
  }
  const difficulty=adminTest?4:(botLadderReadyForMatch()?botLadder.tier:0),
    modelId=adminTest?botModelRelease(options.modelId).id:botModelRelease(activeBotModelId).id;
  // A normal signed-in match waits once for the canonical account row. During
  // an outage it uses the owner-only cached/projected tier and creates a stable
  // receipt before play; admin comparisons remain explicitly non-scoring.
  if(arena&&isBotArena()&&typeof cancelBotLadderSubmission==='function')cancelBotLadderSubmission(arena);
  if(arena&&(arena.queueChannel||arena.matchChannel)) leaveArena('',false);
  else if(arena&&arena.savedUtility!==undefined) loadout.utility=arena.savedUtility;
  arena=freshArena('Offline 1v1 vs AI ready.');
  arena.mode='bot'; arena.phase='lobby'; arena.active=true;
  initializeBotLadderMatch(arena,'ai1v1',difficulty,adminTest,modelId);
  arena.botAdminTestSeed=adminTest?String(options.adminTestSeed||'outpost-zero-ai-model-comparison-v3'):'';
  arena.botAdminReturnToLearning=adminTest&&options.returnToAiLearning===true;
  arena.botAdminReturnPage=String(options.returnPage||'hub');
  arena.botAdminSavedLoadout=adminTest?Object.assign({},options.savedLoadout||loadout):null;
  arena.botModelId=modelId;
  arena.botTuning=arenaBotTuning(difficulty,modelId);
  arena.scores={[LOCAL_DUEL_PLAYER]:0,[LOCAL_DUEL_BOT]:0};
  arena.savedUtility=loadout.utility; loadout.utility=null;
  arena.opponent={id:LOCAL_DUEL_BOT,name:'OUTPOST BOT',r:15,hp:ARENA_HP,
    loadout:Object.assign({},CPU_AI_LOADOUT),cur:CPU_AI_LOADOUT.primary,
    x:1520,y:900,tx:1520,ty:900,angle:Math.PI};
  if(startGame()===false){leaveArena('A selected weapon is no longer available.',false);return false;}
  practiceMode='arena'; arena.active=true;
  if(typeof arenaStartMapVote==='function') arenaStartMapVote();
  else arenaBotStartRound();
  return true;
}
function arenaBotStartRound(){
  if(!isBotArena()||!arena.opponent) return;
  resetHeldGameplayInput();
  resetWeaponGimmickState();
  clearCameraShake();
  arena.round++; arena.roundResolved=false; arena.phase='countdown'; arena.nextRoundAt=0;
  arena.roundStartAt=now+3000; arena.roundEndAt=arena.roundStartAt+ARENA_ROUND_MS;
  perks.maxhp=ARENA_HP; player.hp=ARENA_HP; player.hurtCd=0; player.hurtFlash=0;
  bullets=[]; ebullets=[]; enemies=[]; particles=[]; pickups=[]; damageNumbers=[]; grenades=[]; pearls=[]; balls=[]; flames=[]; freezeFx=[];
  abilityCD={}; quickReadyT=0; sawFuel=100; sawLock=false; daggersOut=null; comboStep=0; comboNextT=0;
  parryUntil=0; parrySeq=0; teraHitCharge=15; fistFlurryUntil=0; sawChargeUntil=0;
  player.cur=loadout.primary; player.reloadEnd=0; player.equipEnd=now+600; player.bloom=0; player.lastShot=0;
  for(const k of [loadout.primary,loadout.secondary,loadout.melee]) if(k&&WEAPONS[k]){
    player.mags[k]=magSize(k); player.reserve[k]=(WEAPONS[k].melee||WEAPONS[k].energy||WEAPONS[k].infinite)?Infinity:magSize(k)*5;
  }
  if(typeof arenaResetMapRuntime==='function') arenaResetMapRuntime();
  const tuning=arena.botTuning||arenaBotTuning(arena.botDifficulty,arena.botModelId), b=arena.opponent,
    left=typeof duelArenaSpawn==='function'?duelArenaSpawn(0):{x:880,y:900,angle:0},
    right=typeof duelArenaSpawn==='function'?duelArenaSpawn(1):{x:1520,y:900,angle:Math.PI};
  player.x=left.x; player.y=left.y; cam.x=player.x;cam.y=player.y;
  zoom=typeof duelArenaFitZoom==='function'?duelArenaFitZoom():1;
  const seedIdentity=arena.botAdminTest?(arena.botAdminTestSeed||'outpost-zero-ai-difficulty-comparison-v2'):
    (arena.mapVoteId||arena.matchEpoch),
    aiSeed=cpuAiSeed(seedIdentity,arena.round,arena.mapId||'arena',b.id);
  Object.assign(b,{x:right.x,y:right.y,tx:right.x,ty:right.y,angle:right.angle,hp:ARENA_HP,
    reloadEnd:0,lastShot:0,flash:0,hitT:0,thinkAt:now,aimNoiseAt:now,
    aiRng:aiSeed,aiTracks:Object.create(null),aiTactic:'',aiTacticUntil:now,aiTacticMinUntil:now,aiSide:1,
    aiPlanMoveX:0,aiPlanMoveY:0,tntThinkAt:now,tntPlan:null,
    aimNoise:0,strafe:1,strafeUntil:now,
    reactionAt:arena.roundStartAt+tuning.reactionMs,moveX:0,moveY:0,lastThinkX:right.x,lastThinkY:right.y,
    aiStuckTicks:0,aiStuckUntil:0,aiFailedMoveX:0,aiFailedMoveY:0,aiNavPath:[],aiNavUntil:0,aiUsingPortal:false,
    aiHitResponseUntil:0,aiMotionWindowAt:now,aiMotionAnchorX:right.x,aiMotionAnchorY:right.y,
    aiMotionTravel:0,aiMotionReversals:0,aiMotionDx:0,aiMotionDy:0,aiMotionSampleAt:now,
    aiPeekPhase:'',aiPeekTargetId:'',aiPeekUntil:0,aiPeekCooldownUntil:0,aiPeekWasHidden:undefined,
    aiPeekExposedAt:0,aiPeekWindowUntil:0,aiPeekPunishScore:0,aiPrefirePressureUntil:0,
    aiDodgeThreat:null,aiDodgeReadyAt:0,aiDodgeWillReact:false,aiDodgeUntil:0,aiDodgeCooldownUntil:0,aiDodgeFireUntil:0,
    aiDodgeX:0,aiDodgeY:0,aiDodgeSide:0,aiDodgeSideRepeat:0,aiDodgePlannedSide:0,aiDodgeHandled:new WeakSet(),
    aiTrainingTntAvoided:new Set(),aiTrainingWallAt:0,
    lastPlayerX:player.x,lastPlayerY:player.y,playerVx:0,playerVy:0});
  cpuAiInitBotWeapons(b,now);
  b.strafe=cpuAiNext(b)<.5?-1:1;b.strafeUntil=now+cpuAiRange(b,900,1500);
  state='play'; menuOpen=false; aiming=false; rmbAim=false;
  waveMsg='ROUND '+arena.round+' — GET READY'; waveMsgT=now+2800; sfx('wave');
}
function arenaBotRoundTick(){
  if(!isBotArena()||!arena.active) return;
  if(arena.phase==='countdown'&&now>=arena.roundStartAt){
    arena.phase='fight';markBotLadderMatchStarted(arena); aiming=false; rmbAim=false;
    if(typeof duelArenaFitZoom==='function') zoom=duelArenaFitZoom();
    waveMsg='FIGHT'; waveMsgT=now+800;
  }
  if(arena.phase==='fight'&&now>=arena.roundEndAt){
    const bhp=arena.opponent?arena.opponent.hp:0;
    arenaBotResolve(arenaTimeoutWinner(LOCAL_DUEL_PLAYER,player.hp,LOCAL_DUEL_BOT,bhp),'timeout');
  }
  if(arena.phase==='round_end'&&arena.nextRoundAt&&now>=arena.nextRoundAt) arenaBotStartRound();
}
function arenaBotResolve(winnerId,reason='knockout'){
  if(!isBotArena()||arena.roundResolved||arena.phase!=='fight') return;
  arena.roundResolved=true;
  if(winnerId) arena.scores[winnerId]=(arena.scores[winnerId]||0)+1;
  const over=winnerId&&(arena.scores[winnerId]||0)>=ARENA_TARGET;
  if(!arena.botAdminTest&&typeof arenaRecordDailyOutcome==='function')
    arenaRecordDailyOutcome(LOCAL_DUEL_PLAYER,winnerId,reason,!!over,true);
  // A knockout can happen from inside a projectile loop. Defer cleanup until
  // that update finishes so a shotgun's remaining pellets cannot read a slot
  // from an array that was replaced mid-loop.
  arena.clearProjectiles=true;
  if(over){
    if(typeof recordCompletedAiTrainingMatch==='function')recordCompletedAiTrainingMatch(winnerId===LOCAL_DUEL_PLAYER,arena);
    recordCompletedBotLadderMatch(winnerId===LOCAL_DUEL_PLAYER,arena);
    arena.phase='match_end'; arena.active=false; arena.nextRoundAt=0;
    if(arena.savedUtility!==undefined){ loadout.utility=arena.savedUtility; arena.savedUtility=undefined; }
    practiceMode='arena'; state='select'; selPage='arena'; menuOpen=false; aiming=false; rmbAim=false;
    pendingGameMode='ai1v1'; modeBoardMode='endless';
    arena.status=winnerId===LOCAL_DUEL_PLAYER?'YOU BEAT THE BOT!':'THE BOT WON. RUN IT BACK!';
    sfx(winnerId===LOCAL_DUEL_PLAYER?'pickup':'die');
  } else {
    arena.phase='round_end'; arena.nextRoundAt=now+2600;
    waveMsg=winnerId?(winnerId===LOCAL_DUEL_PLAYER?'ROUND WON':'ROUND LOST'):'ROUND DRAW'; waveMsgT=now+2200;
    sfx(winnerId===LOCAL_DUEL_PLAYER?'pickup':'die');
  }
}
function arenaHitOpponent(dmg,kind,meta){
  if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()) return;
  if(!isBotArena()){
    const hit=clamp(+dmg||0,0,ARENA_HP); if(!hit) return;
    arenaSendHit(hit,kind,meta); return;
  }
  if(!arenaCanAct()||!arena.opponent||arena.roundResolved) return;
  const hit=clamp(+dmg||0,0,ARENA_HP); if(!hit) return;
  const before=Math.max(0,+arena.opponent.hp||0),dealt=Math.min(before,hit);
  if(typeof recordAiTrainingSignal==='function')recordAiTrainingSignal(arena,'bot_damage_taken',dealt);
  arena.opponent.hp=Math.max(0,arena.opponent.hp-hit);arena.opponent.hitT=now+90;
  cpuAiRegisterIncomingHit(arena.opponent,now);
  addDamageNumber(arena.opponent,dealt,kind==='crit'||kind==='parry');
  if(arena.opponent.hp<=0){
    triggerUnscopedSniperKillCelebration(before,arena.opponent.hp,
      {weapon:'sniper',unscopedShot:kind==='unscoped_sniper'});
    arenaBotResolve(LOCAL_DUEL_PLAYER);
  }
}
function arenaBotHitPlayer(dmg,kind='shot'){
  if(!isBotArena()||!arenaCanAct()||arena.roundResolved) return;
  const hit=clamp(+dmg||0,0,ARENA_HP); if(!hit) return;
  // Twin Sai reflects projectiles. A physical knife swing is handled by the
  // normal melee spacing/LOS rules and cannot be converted into a bullet.
  if(!String(kind||'').startsWith('melee')&&now<parryUntil){
    if(typeof spawnTwinSaiReflection==='function')spawnTwinSaiReflection(player.x,player.y,hit);
    burst(player.x,player.y,'#bfe8ff',10,4);addShake(3);sfx('hit');
    waveMsg='TWIN SAI PARRY';waveMsgT=now+900;return;
  }
  const dealt=Math.min(Math.max(0,+player.hp||0),hit);
  if(typeof recordAiTrainingSignal==='function'){
    recordAiTrainingSignal(arena,'bot_hits');recordAiTrainingSignal(arena,'bot_damage_dealt',dealt);
  }
  damagePlayerHp(hit); player.hurtFlash=1; player.hurtCd=140;
  burst(player.x,player.y,'#d05548',6,3); addShake(3); sfx('hurt');
  if(player.hp<=0) arenaBotResolve(LOCAL_DUEL_BOT);
}
function arenaBotFlushProjectiles(){
  if(!isLocalArena()||!arena.clearProjectiles) return;
  bullets.length=0; ebullets.length=0; grenades.length=0; pearls.length=0;
  balls.length=0; flames.length=0; freezeFx.length=0;
  daggersOut=null; splitBalls.length=0; arena.clearProjectiles=false;
}
function updateArenaBot(dtms){
  if(!isBotArena()||!arenaCanAct()||!arena.opponent) return;
  const tuning=arena.botTuning||arenaBotTuning(arena.botDifficulty,arena.botModelId),b=arena.opponent,dt=dtms/16.667,
    targetVisible=!cpuAiLosBlocked(b.x,b.y,player.x,player.y),guardVisible=targetVisible&&now<parryUntil&&now>=parryUntil-TWIN_SAI_PARRY_MS,
    parryResponse=cpuAiObserveVisibleParry(b,player,now,tuning,guardVisible);
  cpuAiCompleteBotReload(b,now);cpuAiChooseBotWeapon(b,player,now,tuning,parryResponse);
  const weaponKey=String(b.cur||CPU_AI_LOADOUT.primary),w=WEAPONS[weaponKey]||WEAPONS.ar,
    weaponRule=CPU_AI_WEAPON_RULES[weaponKey]||CPU_AI_WEAPON_RULES.ar,isMelee=!!w.melee,
    shotSpeed=isMelee?0:weaponBulletSpeed(weaponKey),maxRange=Math.min(+tuning.maxRange||weaponRule.maxRange,weaponRule.maxRange),
    rangedDamage=isMelee?weaponRule.damage:cpuAiRangedDamage(weaponRule,tuning);
  if(targetVisible&&tuning.usePrediction)cpuAiTrackTarget(b,player,dtms,now);

  const tntShot={damage:rangedDamage,rng:w.range||1,fall:w.fall||1,maxRange};
  if(!isMelee&&tuning.useTnt&&now>=(b.tntThinkAt||0)){
    b.tntThinkAt=now+CPU_AI_TNT_RETHINK_MS;
    b.tntPlan=cpuAiTntPlan(b,[player],[b],tntShot,now);
  }else if(isMelee||!tuning.useTnt)b.tntPlan=null;

  if(now>=b.thinkAt){
    if(tuning.useStuckRecovery&&cpuAiObserveMovement(b,now)){
      b.aiTacticUntil=now;if(typeof recordAiTrainingBotSignal==='function')recordAiTrainingBotSignal(b,'bot_stuck_recoveries');
    }
    b.thinkAt=now+tuning.thinkMs;
    if(now>=b.aimNoiseAt){b.aimNoise=cpuAiRange(b,-tuning.aimNoise,tuning.aimNoise);b.aimNoiseAt=now+cpuAiRange(b,450,750);}
    const move=cpuAiPickMove(b,player,[b],now,tuning,b.tntPlan);b.moveX=move.x;b.moveY=move.y;
  }

  const lead=isMelee?{x:player.x,y:player.y,leadMs:0,visible:cpuAiMeleeClear(b,player)}:
    (targetVisible?cpuAiLeadPoint(b,player,weaponKey,tuning.usePrediction?tuning.leadFactor:0,tuning.usePrediction?tuning.maxLeadMs:0):null),
    rangedAim=isMelee?null:cpuAiRangedAimSolution(b,player,now,tuning,lead,targetVisible),
    liveTnt=typeof activeArenaTnt==='function'?activeArenaTnt():[],
    plannedTnt=b.tntPlan&&b.tntPlan.targetId?liveTnt.find(t=>String(t.id)===String(b.tntPlan.targetId)):null;
  let aimX=isMelee?lead.x:rangedAim.x,aimY=isMelee?lead.y:rangedAim.y,aimTntId='';
  if(plannedTnt&&!cpuAiLosBlocked(b.x,b.y,b.tntPlan.aimX,b.tntPlan.aimY,plannedTnt.id)){
    aimX=b.tntPlan.aimX;aimY=b.tntPlan.aimY;aimTntId=String(plannedTnt.id);
  }
  const desired=Math.atan2(aimY-b.y,aimX-b.x)+(isMelee?0:(b.aimNoise||0));
  const turn=Math.atan2(Math.sin(desired-b.angle),Math.cos(desired-b.angle));
  b.angle+=clamp(turn,-tuning.turnRate*dt,tuning.turnRate*dt);
  const dodge=typeof cpuAiApplyProjectileDodge==='function'?cpuAiApplyProjectileDodge(b,bullets,now,tuning,b.tntPlan,[b]):{active:false},
    meleeMove=!dodge.active?cpuAiMeleeMovement(b,player):null,
    peek=dodge.active?dodge:(meleeMove||cpuAiApplyPeekBehavior(b,player,b.moveX,b.moveY,now,tuning,b.tntPlan)),
    tacticSpeed=dodge.active?1:b.aiTactic==='hold'?.38:b.aiTactic==='flank'?.94:b.aiTactic==='cover'?.9:1,spd=tuning.moveSpeed*tacticSpeed*peek.speedScale*dt,
    moveStartX=b.x,moveStartY=b.y,nx=b.x+peek.x*spd,ny=b.y+peek.y*spd,
    blockedX=pointInRects(nx,b.y),blockedY=pointInRects(b.x,ny);
  if(!blockedX) b.x=nx;
  if(!blockedY) b.y=ny;
  clampActorToArena(b); collideRects(b); clampActorToArena(b);
  if(typeof recordAiTrainingBotSignal==='function'){
    recordAiTrainingBotSignal(b,'bot_distance_px',Math.hypot(b.x-moveStartX,b.y-moveStartY));
    if((blockedX||blockedY)&&now>=(b.aiTrainingWallAt||0)){
      b.aiTrainingWallAt=now+250;recordAiTrainingBotSignal(b,'bot_wall_contacts');
    }
  }
  const usedPortal=typeof arenaPortalStep==='function'&&arenaPortalStep(b,now);
  if(usedPortal&&typeof recordAiTrainingBotSignal==='function')recordAiTrainingBotSignal(b,'bot_portal_uses');
  const pdx=b.x-player.x,pdy=b.y-player.y,rr=b.r+player.r+3,d2=pdx*pdx+pdy*pdy;
  if(d2>0&&d2<rr*rr){ const d=Math.sqrt(d2),p=(rr-d)/d; b.x+=pdx*p; b.y+=pdy*p; }
  clampActorToArena(b); b.tx=b.x; b.ty=b.y;

  if(now<b.reactionAt||now<(+b.aiDodgeFireUntil||0)||now<(+b.equipEnd||0)||b.reloadEnd||cpuAiPeekWithholdsFire(b))return;
  if(isMelee){
    if(cpuAiTryBotMeleeAbility(b,player,now,(damage,kind)=>arenaBotHitPlayer(damage,kind)))return;
    cpuAiTryBotMelee(b,player,now,weaponRule.damage,(damage,kind)=>arenaBotHitPlayer(damage,kind));return;
  }
  // A TNT plan is cheap to cache for movement, but its safety is rechecked at
  // the actual firing boundary so a player entering the blast cannot be read as
  // permission to execute a stale detonation plan.
  if(aimTntId){
    b.tntPlan=cpuAiTntPlan(b,[player],[b],tntShot,now);b.tntThinkAt=now+CPU_AI_TNT_RETHINK_MS;
    const fresh=liveTnt.find(t=>String(t.id)===String(b.tntPlan.targetId));
    if(fresh){aimTntId=String(fresh.id);aimX=b.tntPlan.aimX;aimY=b.tntPlan.aimY;}
    else{aimTntId='';aimX=rangedAim.x;aimY=rangedAim.y;}
  }
  const blocked=aimTntId?cpuAiLosBlocked(b.x,b.y,aimX,aimY,aimTntId):(!rangedAim.available||cpuAiLosBlocked(b.x,b.y,aimX,aimY));
  if(blocked)return;
  const dx=aimX-b.x,dy=aimY-b.y,d=Math.hypot(dx,dy)||1,targetA=Math.atan2(dy,dx),
    aimErr=Math.abs(cpuAiAngleDelta(targetA,b.angle));
  if(d>maxRange)return;
  if((+b.aiWeaponMags?.[weaponKey]||0)<=0){b.aiWeaponThinkAt=now;cpuAiStartBotReload(b,weaponKey,now);return;}
  const interval=weaponRule.fireMs,previous=Math.max(0,+b.aiWeaponLastShot?.[weaponKey]||0);
  if(now-previous<interval) return;
  const fireDecision=cpuAiPressureFireDecision(b,player,now,tuning,{available:aimTntId?true:rangedAim.available,
    visible:aimTntId?true:rangedAim.visible,aimErr,holdRanged:parryResponse.holdRanged,tnt:!!aimTntId});
  if(!fireDecision.fire)return;
  const shotStamp=now;
  if(!cpuAiSpendBotRound(b,weaponKey,shotStamp))return;cpuAiRecordPressureShot(b,fireDecision);b.flash=now+55;
  const a=b.angle+cpuAiRange(b,-tuning.shotJitter,tuning.shotJitter), sx=b.x+Math.cos(a)*7, sy=b.y+Math.sin(a)*7;
  ebullets.push({x:sx,y:sy,vx:Math.cos(a)*shotSpeed,vy:Math.sin(a)*shotSpeed,life:weaponBulletLife(weaponKey,1200),dmg:rangedDamage,
    botArena:true,dist:0,rng:w.range,fall:w.fall,fg:weaponRule.forgiveness,weapon:weaponKey});
  if(typeof recordAiTrainingBotSignal==='function')recordAiTrainingBotSignal(b,'bot_shots');
  if((+b.aiWeaponMags[weaponKey]||0)<=0)b.aiWeaponThinkAt=now;
}
