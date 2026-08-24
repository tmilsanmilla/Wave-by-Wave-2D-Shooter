"use strict";

/* ---------------- offline arena: one-device 1v1 vs AI ---------------- */
const BOT_AI=Object.freeze({weapon:'ar',damage:34,fireMs:225,reactionMs:550,moveSpeed:2.65,
  retreat:190,approach:320,maxRange:430,forgiveness:8,aimNoise:0.04,shotJitter:0.015,
  fireAimError:0.06,leadFactor:0.45,maxLeadMs:140});
function isBotArena(){ return !!(arena&&arena.mode==='bot'); }
function isLocalArena(){ return isBotArena()||(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()); }
function arenaMeId(){ return isBotArena()?LOCAL_DUEL_PLAYER:(authUser&&authUser.id); }
function arenaOpponentId(){ return isBotArena()?LOCAL_DUEL_BOT:(arena&&arena.opponent&&arena.opponent.id); }
function startBotArena(){
  // This is a fully local match: no sign-in, channel, score submission, or reward calls.
  if(arena&&(arena.queueChannel||arena.matchChannel)) leaveArena('',false);
  else if(arena&&arena.savedUtility!==undefined) loadout.utility=arena.savedUtility;
  arena=freshArena('Offline 1v1 vs AI ready.');
  arena.mode='bot'; arena.phase='lobby'; arena.active=true;
  arena.scores={[LOCAL_DUEL_PLAYER]:0,[LOCAL_DUEL_BOT]:0};
  arena.savedUtility=loadout.utility; loadout.utility=null;
  arena.opponent={id:LOCAL_DUEL_BOT,name:'OUTPOST BOT',r:15,hp:ARENA_HP,
    loadout:{primary:'ar',secondary:'m9',melee:'knife'},cur:'ar',
    x:1520,y:900,tx:1520,ty:900,angle:Math.PI};
  startGame();
  practiceMode='arena'; arena.active=true;
  if(typeof arenaStartMapVote==='function') arenaStartMapVote();
  else arenaBotStartRound();
}
function arenaBotStartRound(){
  if(!isBotArena()||!arena.opponent) return;
  resetHeldGameplayInput();
  clearCameraShake();
  arena.round++; arena.roundResolved=false; arena.phase='countdown'; arena.nextRoundAt=0;
  arena.roundStartAt=now+3000; arena.roundEndAt=arena.roundStartAt+ARENA_ROUND_MS;
  perks.maxhp=ARENA_HP; player.hp=ARENA_HP; player.hurtCd=0; player.hurtFlash=0;
  bullets=[]; ebullets=[]; enemies=[]; particles=[]; pickups=[]; damageNumbers=[]; grenades=[]; pearls=[]; balls=[]; flames=[]; freezeFx=[];
  abilityCD={}; quickReadyT=0; sawFuel=100; sawLock=false; daggersOut=null; comboStep=0; comboNextT=0;
  fanShots=0; fanNextT=0; fanBurstUntil=0; parryUntil=0; parrySeq=0; teraHitCharge=15; fistFlurryUntil=0; sawChargeUntil=0;
  player.cur=loadout.primary; player.reloadEnd=0; player.equipEnd=now+600; player.bloom=0; player.lastShot=0;
  for(const k of [loadout.primary,loadout.secondary,loadout.melee]) if(k&&WEAPONS[k]){
    player.mags[k]=magSize(k); player.reserve[k]=WEAPONS[k].melee?Infinity:magSize(k)*5;
  }
  if(typeof arenaResetMapRuntime==='function') arenaResetMapRuntime();
  const b=arena.opponent,bw=WEAPONS[BOT_AI.weapon],
    left=typeof duelArenaSpawn==='function'?duelArenaSpawn(0):{x:880,y:900,angle:0},
    right=typeof duelArenaSpawn==='function'?duelArenaSpawn(1):{x:1520,y:900,angle:Math.PI},
    bounds=typeof activeArenaBounds==='function'?activeArenaBounds():{left:600,top:450,right:1800,bottom:1350};
  player.x=left.x; player.y=left.y; cam.x=(bounds.left+bounds.right)/2; cam.y=(bounds.top+bounds.bottom)/2;
  zoom=typeof duelArenaFitZoom==='function'?duelArenaFitZoom():1;
  Object.assign(b,{x:right.x,y:right.y,tx:right.x,ty:right.y,angle:right.angle,hp:ARENA_HP,cur:BOT_AI.weapon,
    mag:bw.mag,reloadEnd:0,lastShot:0,flash:0,hitT:0,thinkAt:now,aimNoiseAt:now,
    aimNoise:0,strafe:Math.random()<0.5?-1:1,strafeUntil:now+rand(900,1500),
    reactionAt:arena.roundStartAt+BOT_AI.reactionMs,moveX:0,moveY:0,lastThinkX:right.x,lastThinkY:right.y,
    lastPlayerX:player.x,lastPlayerY:player.y,playerVx:0,playerVy:0});
  state='play'; menuOpen=false; aiming=false; rmbAim=false;
  waveMsg='ROUND '+arena.round+' — GET READY'; waveMsgT=now+2800; sfx('wave');
}
function arenaBotRoundTick(){
  if(!isBotArena()||!arena.active) return;
  if(arena.phase==='countdown'&&now>=arena.roundStartAt){
    arena.phase='fight'; aiming=false; rmbAim=false;
    if(typeof duelArenaFitZoom==='function') zoom=duelArenaFitZoom();
    waveMsg='FIGHT'; waveMsgT=now+800;
  }
  if(arena.phase==='fight'&&now>=arena.roundEndAt){
    const bhp=arena.opponent?arena.opponent.hp:0;
    arenaBotResolve(player.hp===bhp?null:(player.hp>bhp?LOCAL_DUEL_PLAYER:LOCAL_DUEL_BOT));
  }
  if(arena.phase==='round_end'&&arena.nextRoundAt&&now>=arena.nextRoundAt) arenaBotStartRound();
}
function arenaBotResolve(winnerId){
  if(!isBotArena()||arena.roundResolved||arena.phase!=='fight') return;
  arena.roundResolved=true;
  if(winnerId) arena.scores[winnerId]=(arena.scores[winnerId]||0)+1;
  // A knockout can happen from inside a projectile loop. Defer cleanup until
  // that update finishes so a shotgun's remaining pellets cannot read a slot
  // from an array that was replaced mid-loop.
  arena.clearProjectiles=true;
  const over=winnerId&&(arena.scores[winnerId]||0)>=ARENA_TARGET;
  if(over){
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
function arenaHitOpponent(dmg,kind){
  if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()) return;
  if(!isBotArena()){
    const hit=clamp(+dmg||0,0,ARENA_HP); if(!hit) return;
    arenaSendHit(hit,kind); return;
  }
  if(!arenaCanAct()||!arena.opponent||arena.roundResolved) return;
  const hit=clamp(+dmg||0,0,ARENA_HP); if(!hit) return;
  const dealt=Math.min(Math.max(0,arena.opponent.hp),hit);
  arena.opponent.hp=Math.max(0,arena.opponent.hp-hit); arena.opponent.hitT=now+90;
  addDamageNumber(arena.opponent,dealt,kind==='crit'||kind==='parry');
  if(arena.opponent.hp<=0) arenaBotResolve(LOCAL_DUEL_PLAYER);
}
function arenaBotHitPlayer(dmg){
  if(!isBotArena()||!arenaCanAct()||arena.roundResolved) return;
  const hit=clamp(+dmg||0,0,ARENA_HP); if(!hit) return;
  if(now<parryUntil){
    parryUntil=0;arenaHitOpponent(120,'parry');
    burst(player.x,player.y,'#bfe8ff',10,4);addShake(3);sfx('hit');
    waveMsg='TWIN SAI PARRY';waveMsgT=now+900;return;
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
  const b=arena.opponent, w=WEAPONS[BOT_AI.weapon], dt=dtms/16.667;
  const sampleVx=clamp(player.x-(Number.isFinite(b.lastPlayerX)?b.lastPlayerX:player.x),-16,16);
  const sampleVy=clamp(player.y-(Number.isFinite(b.lastPlayerY)?b.lastPlayerY:player.y),-16,16);
  b.playerVx=(b.playerVx||0)*0.65+sampleVx*0.35; b.playerVy=(b.playerVy||0)*0.65+sampleVy*0.35;
  b.lastPlayerX=player.x; b.lastPlayerY=player.y;
  if(b.reloadEnd&&now>=b.reloadEnd){ b.reloadEnd=0; b.mag=w.mag; }

  if(now>=b.thinkAt){
    const moved=Math.hypot(b.x-(b.lastThinkX||b.x),b.y-(b.lastThinkY||b.y));
    if(moved<2) b.strafe*=-1;
    b.lastThinkX=b.x; b.lastThinkY=b.y; b.thinkAt=now+150;
    if(now>=b.strafeUntil){ if(Math.random()<0.75) b.strafe*=-1; b.strafeUntil=now+rand(900,1500); }
    if(now>=b.aimNoiseAt){ b.aimNoise=rand(-BOT_AI.aimNoise,BOT_AI.aimNoise); b.aimNoiseAt=now+rand(450,750); }
    const dx=player.x-b.x, dy=player.y-b.y, d=Math.hypot(dx,dy)||1;
    const fx=dx/d, fy=dy/d, px=-fy*b.strafe, py=fx*b.strafe;
    const blocked=losBlocked(b.x,b.y,player.x,player.y);
    let forward=blocked?1:(d>BOT_AI.approach?0.72:(d<BOT_AI.retreat?-0.9:0));
    let mx=fx*forward+px*(blocked?0.28:0.82), my=fy*forward+py*(blocked?0.28:0.82);
    const m=Math.hypot(mx,my)||1; b.moveX=mx/m; b.moveY=my/m;
  }

  const actualDx=player.x-b.x,actualDy=player.y-b.y,actualDist=Math.hypot(actualDx,actualDy)||1;
  const shotSpeed=weaponBulletSpeed(BOT_AI.weapon);
  const leadTicks=Math.min((actualDist/shotSpeed)*BOT_AI.leadFactor,BOT_AI.maxLeadMs/16.667);
  const aimBounds=activeArenaBounds();
  const leadX=clamp(player.x+b.playerVx*leadTicks,aimBounds.left+player.r,aimBounds.right-player.r);
  const leadY=clamp(player.y+b.playerVy*leadTicks,aimBounds.top+player.r,aimBounds.bottom-player.r);
  const desired=Math.atan2(leadY-b.y,leadX-b.x)+(b.aimNoise||0);
  const turn=Math.atan2(Math.sin(desired-b.angle),Math.cos(desired-b.angle));
  b.angle+=clamp(turn,-0.07*dt,0.07*dt);
  const spd=BOT_AI.moveSpeed*dt, nx=b.x+b.moveX*spd, ny=b.y+b.moveY*spd;
  if(!pointInRects(nx,b.y)) b.x=nx;
  if(!pointInRects(b.x,ny)) b.y=ny;
  clampActorToArena(b); collideRects(b); clampActorToArena(b);
  if(typeof arenaPortalStep==='function') arenaPortalStep(b,now);
  const pdx=b.x-player.x,pdy=b.y-player.y,rr=b.r+player.r+3,d2=pdx*pdx+pdy*pdy;
  if(d2>0&&d2<rr*rr){ const d=Math.sqrt(d2),p=(rr-d)/d; b.x+=pdx*p; b.y+=pdy*p; }
  clampActorToArena(b); b.tx=b.x; b.ty=b.y;

  if(now<b.reactionAt||b.reloadEnd||losBlocked(b.x,b.y,player.x,player.y)) return;
  const dx=player.x-b.x,dy=player.y-b.y,d=Math.hypot(dx,dy)||1;
  const targetA=Math.atan2(leadY-b.y,leadX-b.x), aimErr=Math.abs(Math.atan2(Math.sin(targetA-b.angle),Math.cos(targetA-b.angle)));
  if(d>BOT_AI.maxRange||aimErr>BOT_AI.fireAimError) return;
  if(b.mag<=0){ b.reloadEnd=now+w.reload; b.cur='ar'; return; }
  const interval=BOT_AI.fireMs;
  if(now-b.lastShot<interval) return;
  b.lastShot=b.lastShot>0&&now-b.lastShot<interval*4?b.lastShot+interval:now;
  b.mag--; b.flash=now+55;
  const a=b.angle+rand(-BOT_AI.shotJitter,BOT_AI.shotJitter), sx=b.x+Math.cos(a)*7, sy=b.y+Math.sin(a)*7;
  ebullets.push({x:sx,y:sy,vx:Math.cos(a)*shotSpeed,vy:Math.sin(a)*shotSpeed,life:weaponBulletLife(BOT_AI.weapon,1200),dmg:BOT_AI.damage,
    botArena:true,dist:0,rng:w.range,fall:w.fall,fg:BOT_AI.forgiveness});
  if(b.mag<=0) b.reloadEnd=now+w.reload;
}
