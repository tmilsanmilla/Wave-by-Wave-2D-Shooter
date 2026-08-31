"use strict";

/* ---------------- render: world ---------------- */
function hostileProjectileCollisionRadius(projectile){
  const b=projectile||{};
  if(Number.isFinite(+b.dangerRadius))return Math.max(3,Math.min(32,+b.dangerRadius));
  if(b.h)return Math.max(9,Number.isFinite(+b.r)?+b.r:0);
  if(b.king)return 8;
  if(b.botArena)return Math.max(3,Math.min(16,3+(Number.isFinite(+b.fg)?Math.max(0,+b.fg):0)));
  if(b.team==='B')return 4;
  return 3;
}
function hostileProjectileProfile(projectile,source){
  if(source==='firework')return {danger:'#ff3f36',tail:30,diamond:true};
  if(projectile&&projectile.h)return {danger:'#ff3f36',tail:34};
  if(projectile&&projectile.king)return {danger:'#ff275f',tail:25};
  if(source==='remote')return {danger:'#ff3b34',tail:30};
  if(source==='cpu')return {danger:'#ff3b34',tail:28};
  if(projectile&&projectile.botArena)return {danger:'#ff3b34',tail:32};
  return {danger:'#ff4438',tail:27};
}
function drawHostileProjectileCue(projectile,source='enemy'){
  const b=projectile||{},x=+b.x,y=+b.y,vx=+b.vx||0,vy=+b.vy||0;
  if(!Number.isFinite(x)||!Number.isFinite(y))return false;
  const profile=hostileProjectileProfile(b,source),scale=1/Math.max(0.05,+zoom||1);
  const speed=Math.hypot(vx,vy),ux=speed?vx/speed:0,uy=speed?vy/speed:0;
  const tail=profile.tail*scale;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  // Hostile rounds use the same clean tracer language as ordinary rounds,
  // recolored red. Never surround a hostile projectile with a warning ring.
  ctx.strokeStyle=profile.danger;ctx.lineWidth=3.2*scale;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-ux*tail,y-uy*tail);ctx.stroke();
  if(profile.diamond){
    const d=4.1*scale;ctx.fillStyle=profile.danger;ctx.beginPath();
    ctx.moveTo(x,y-d);ctx.lineTo(x+d,y);ctx.lineTo(x,y+d);ctx.lineTo(x-d,y);ctx.closePath();ctx.fill();
  }
  ctx.restore();return true;
}
function drawRemoteShotVisuals(list,hostile=false){
  if(!Array.isArray(list)||!list.length)return;
  if(hostile){for(const b of list)drawHostileProjectileCue(b,'remote');return;}
  ctx.save();ctx.lineCap='round';
  for(const b of list){
    const speed=Math.hypot(+b.vx||0,+b.vy||0),ux=speed?b.vx/speed:0,uy=speed?b.vy/speed:0;
    ctx.strokeStyle=b.col||'rgba(127,216,255,.9)';ctx.lineWidth=3.2/zoom;
    ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-ux*22,b.y-uy*22);ctx.stroke();
    ctx.strokeStyle='#eaf8ff';ctx.lineWidth=1.2/zoom;
    ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-ux*12,b.y-uy*12);ctx.stroke();
  }
  ctx.restore();
}
function drawRemoteFireworkExplosionVisuals(list){
  if(!Array.isArray(list)||!list.length)return;
  const scale=1/Math.max(0.05,+zoom||1);ctx.save();
  for(const fx of list){
    if(!fx||!Number.isFinite(+fx.x)||!Number.isFinite(+fx.y))continue;
    const max=Math.max(1,+fx.maxLife||650),progress=clamp(1-(+fx.life||0)/max,0,1),alpha=1-progress;
    ctx.strokeStyle='rgba(24,3,4,'+(0.9*alpha)+')';ctx.lineWidth=7*scale;
    ctx.beginPath();ctx.arc(fx.x,fx.y,(10+42*progress)*scale,0,TAU);ctx.stroke();
    ctx.strokeStyle='rgba(255,63,54,'+(0.96*alpha)+')';ctx.lineWidth=4*scale;
    ctx.beginPath();ctx.arc(fx.x,fx.y,(10+42*progress)*scale,0,TAU);ctx.stroke();
    ctx.fillStyle='rgba(255,223,157,'+(0.8*alpha)+')';ctx.beginPath();ctx.arc(fx.x,fx.y,(6*(1-progress)+1)*scale,0,TAU);ctx.fill();
  }
  ctx.restore();
}
function freezerVisualReach(x,y,angle,radius){
  if(typeof pointInRects!=='function')return radius;
  for(let d=4;d<=radius;d+=4)if(pointInRects(x+Math.cos(angle)*d,y+Math.sin(angle)*d))return Math.max(0,d-4);
  return radius;
}
function meleeWeaponPalette(hostile=false){
  return hostile
    ? {shaft:'#8b201e',blade:'#ff3b34',edge:'#ff8b80',grip:'#5a1111',bright:'#ff6b61',housing:'#731b19',bar:'#ff3b34',teeth:'#40090a'}
    : {shaft:'#5a6b52',blade:'#a9c4d6',edge:'#8fb3c9',grip:'#3a4239',bright:'#c9d6e2',housing:'#3a4a54',bar:'#8fb3c9',teeth:'#25313a'};
}
// Drawn at the origin and facing +X. Both local and remote actors call this
// exact geometry; hostile ownership changes only the palette.
function drawMeleeWeaponSilhouette(key,hostile=false,parryActive=false){
  const p=meleeWeaponPalette(hostile);ctx.lineCap='round';
  if(key==='scythe'){
    ctx.strokeStyle=p.shaft;ctx.lineWidth=3.4;ctx.beginPath();ctx.moveTo(2,7);ctx.lineTo(36,-7);ctx.stroke();
    ctx.strokeStyle=p.blade;ctx.lineWidth=3.8;ctx.beginPath();ctx.arc(30,-16,12,.45,2.7);ctx.stroke();
    ctx.strokeStyle=p.edge;ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(30,-16,8.5,.55,2.6);ctx.stroke();
  }else if(key==='knife'){
    ctx.strokeStyle=p.grip;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(12,0);ctx.stroke();
    ctx.fillStyle=p.bright;ctx.beginPath();ctx.moveTo(12,-3);ctx.lineTo(38,0);ctx.lineTo(12,3);ctx.closePath();ctx.fill();
  }else if(key==='hammer'){
    ctx.strokeStyle=p.shaft;ctx.lineWidth=3.6;ctx.beginPath();ctx.moveTo(4,5);ctx.lineTo(26,-7);ctx.stroke();
    ctx.fillStyle=p.blade;ctx.save();ctx.translate(26,-7);ctx.rotate(.5);ctx.fillRect(-5,-10,10,20);ctx.restore();
  }else if(key==='bdaggers'){
    for(const side of [-1,1]){
      ctx.save();ctx.translate(0,side*5);ctx.rotate(side*.1);
      ctx.strokeStyle=p.grip;ctx.lineWidth=3.2;ctx.beginPath();ctx.moveTo(3,0);ctx.lineTo(11,0);ctx.stroke();
      ctx.fillStyle=p.bright;ctx.beginPath();ctx.moveTo(10,-2.8);ctx.lineTo(34,0);ctx.lineTo(10,2.8);ctx.closePath();ctx.fill();ctx.restore();
    }
  }else if(key==='terafists'){
    for(const side of [-1,1]){
      const y=side*6;ctx.fillStyle=p.housing;ctx.fillRect(5,y-4,13,8);ctx.fillStyle=p.bright;
      for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(19+i*4,y,3.2,0,TAU);ctx.fill();}
      ctx.strokeStyle=p.edge;ctx.lineWidth=1.6;ctx.strokeRect(6,y-3,10,6);
    }
  }else if(key==='twinsai'){
    const guard=parryActive ? .34+Math.sin(now*.02)*.035 : 0;
    for(const side of [-1,1]){
      ctx.save();ctx.rotate(side*guard);ctx.translate(0,side*5);
      ctx.strokeStyle=p.grip;ctx.lineWidth=3.4;ctx.beginPath();ctx.moveTo(3,0);ctx.lineTo(12,0);ctx.stroke();
      ctx.fillStyle=p.bright;ctx.beginPath();ctx.moveTo(11,-2.5);ctx.lineTo(35,0);ctx.lineTo(11,2.5);ctx.closePath();ctx.fill();
      ctx.strokeStyle=p.edge;ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(18,-6);ctx.moveTo(13,0);ctx.lineTo(18,6);ctx.stroke();ctx.restore();
    }
  }else if(key==='chainsaw'){
    ctx.fillStyle=p.housing;ctx.fillRect(3,-4.5,11,9);
    ctx.fillStyle=p.bar;ctx.fillRect(14,-2.8,18,5.6);
    ctx.fillStyle=p.teeth;const jig=(!hostile&&typeof player!=='undefined'&&now-player.lastSaw<160)?(now>>5)%2:0;
    for(let i=0;i<4;i++)ctx.fillRect(15+i*4.4,((i+jig)%2?-4.8:2.4),2.6,2.4);
  }else{
    ctx.strokeStyle=p.grip;ctx.lineWidth=3.4;ctx.beginPath();ctx.moveTo(3,0);ctx.lineTo(12,0);ctx.stroke();
    ctx.fillStyle=p.bright;ctx.beginPath();ctx.moveTo(11,-2.5);ctx.lineTo(31,0);ctx.lineTo(11,2.5);ctx.closePath();ctx.fill();
  }
}
function drawMeleeAbilityVisual(actor,clock,hostile=false,localActor=false){
  if(!actor)return false;
  const key=String(actor.meleeFxKey||''),max=MELEE_ABILITY_VISUAL_MS[key],until=+actor.meleeFxUntil||0;
  if(!max||clock>=until)return false;
  const start=Number.isFinite(+actor.meleeFxStart)?+actor.meleeFxStart:until-max;
  const elapsed=clamp(clock-start,0,max),progress=clamp(elapsed/max,0,1),fade=1-progress;
  const x=+actor.x||0,y=+actor.y||0,raw=Number.isFinite(+actor.meleeFxAngle)?+actor.meleeFxAngle:(+actor.angle||0);
  const angle=Math.atan2(Math.sin(raw),Math.cos(raw)),main=hostile?'255,59,52':'191,232,255';
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  if(key==='scythe'){
    ctx.strokeStyle='rgba('+main+','+(0.25+fade*.55)+')';ctx.lineWidth=5/zoom;ctx.beginPath();
    ctx.moveTo(x-Math.cos(angle)*12,y-Math.sin(angle)*12);ctx.lineTo(x-Math.cos(angle)*(55+progress*35),y-Math.sin(angle)*(55+progress*35));ctx.stroke();
    for(let i=1;i<=3;i++){
      ctx.save();ctx.globalAlpha=Math.max(.12,(.6-i*.12)*fade);ctx.translate(x-Math.cos(angle)*i*14,y-Math.sin(angle)*i*14);
      ctx.rotate(angle);drawMeleeWeaponSilhouette('scythe',hostile,false);ctx.restore();
    }
  }else if(key==='knife'){
    ctx.strokeStyle='rgba('+main+','+(.85*fade)+')';ctx.lineWidth=4/zoom;ctx.beginPath();ctx.arc(x,y,52+progress*20,0,TAU);ctx.stroke();
    ctx.translate(x,y);ctx.rotate(angle+progress*TAU);ctx.globalAlpha=.35+.65*fade;drawMeleeWeaponSilhouette('knife',hostile,false);
  }else if(key==='hammer'){
    const shock=18+142*Math.sqrt(progress);ctx.strokeStyle='rgba('+main+','+(.9*fade)+')';ctx.lineWidth=(6-2*progress)/zoom;
    ctx.beginPath();ctx.arc(x,y,shock,0,TAU);ctx.stroke();ctx.translate(x,y);ctx.rotate(angle-.8+progress*1.2);
    ctx.globalAlpha=.45+.55*fade;drawMeleeWeaponSilhouette('hammer',hostile,false);
  }else if(key==='chainsaw'){
    ctx.setLineDash([7/zoom,4/zoom]);ctx.lineDashOffset=-elapsed*.08;ctx.strokeStyle='rgba('+main+','+(.5+.35*fade)+')';ctx.lineWidth=4/zoom;
    ctx.beginPath();ctx.arc(x,y,70+Math.sin(clock*.05)*3,0,TAU);ctx.stroke();ctx.setLineDash([]);
    ctx.translate(x,y);ctx.rotate(angle+progress*TAU*2);drawMeleeWeaponSilhouette('chainsaw',hostile,false);
  }else if(key==='bdaggers'){
    // Local Hurl already draws the authoritative moving blades. Other screens
    // receive the two live blade positions; the fallback keeps the cue visible
    // during the first state packet or when playing against an older client.
    if(localActor&&typeof daggersOut!=='undefined'&&daggersOut){ctx.restore();return true;}
    const live=Array.isArray(actor.meleeFxBlades)&&actor.meleeFxBlades.length===2?actor.meleeFxBlades:null;
    const travel=165*(progress<.5?progress*2:(1-progress)*2),returning=progress>=.5;
    for(let i=0;i<2;i++){
      const side=i?1:-1,b=live&&live[i];
      // Use the most recent validated coordinates without extrapolating them
      // through a wall between 50 ms state updates.
      const px=b?b.x:x+Math.cos(angle)*travel+Math.cos(angle+Math.PI/2)*side*7;
      const py=b?b.y:y+Math.sin(angle)*travel+Math.sin(angle+Math.PI/2)*side*7;
      const bladeAngle=b?Math.atan2(b.vy,b.vx):angle+(returning?Math.PI:0);
      ctx.save();ctx.translate(px,py);ctx.rotate(bladeAngle);ctx.fillStyle=hostile?'#ff3b34':'#a9c4d6';
      ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-6,3.5);ctx.lineTo(-6,-3.5);ctx.closePath();ctx.fill();
      ctx.fillStyle=hostile?'#7a1715':'#5a6b52';ctx.fillRect(-10,-2,-6,4);ctx.restore();
    }
  }else if(key==='terafists'){
    const jab=Math.floor(elapsed/90)%2===0?1:-1,pulse=8+Math.sin(elapsed*.07)*5;
    ctx.strokeStyle='rgba('+main+','+(.38+.28*fade)+')';ctx.lineWidth=3/zoom;ctx.beginPath();ctx.arc(x,y,38+pulse,0,TAU);ctx.stroke();
    ctx.translate(x+Math.cos(angle)*pulse,y+Math.sin(angle)*pulse);ctx.rotate(angle+jab*.12);drawMeleeWeaponSilhouette('terafists',hostile,false);
  }
  ctx.restore();return true;
}
function drawMeleeSwingPath(x,y,angle,arc,range,progress){
  ctx.beginPath();
  if(arc<.6){
    ctx.moveTo(x+Math.cos(angle)*12,y+Math.sin(angle)*12);
    const thrustR=range*(.8+.25*progress);
    ctx.lineTo(x+Math.cos(angle)*thrustR,y+Math.sin(angle)*thrustR);
  }else{
    const sweepR=range*(.7+.3*progress);
    ctx.arc(x,y,sweepR,angle-arc/2,angle+arc/2);
  }
  ctx.stroke();
}
function drawPartyCpuActors(){
  if(!isCpuTeamArena())return;
  const actors=[],localId=cpuTeamLocalId(),clock=cpuTeamClock();
  for(const h of Object.values(partyCpuMatch.humans))if(h.id!==localId)actors.push(h);
  actors.push(...partyCpuMatch.bots);
  for(const e of actors){
    if(e.hp<=0)continue;
    const ally=e.team==='A',a=e.angle||0,r=e.r||15,wk=WEAPONS[e.cur]||WEAPONS.ar,len=Math.min(38,wk.len||24);
    const swingDur=Math.max(1,+e.swingDur||130),swingProgress=e.swingT&&(clock-e.swingT)>=0&&(clock-e.swingT)<swingDur?(clock-e.swingT)/swingDur:null;
    let weaponAngle=a;
    if(swingProgress!==null){
      const ease=swingProgress<.25?-(swingProgress/.25)*.35:-.35+((swingProgress-.25)/.75)*1.35;
      weaponAngle+=(e.swingSide||1)*(e.swingArc||1.2)*.5*ease;
    }
    ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(e.x+3,e.y+5,r,r*.7,0,0,TAU);ctx.fill();
    ctx.fillStyle=ally?'#5b9bd5':'#d05548';ctx.beginPath();ctx.arc(e.x,e.y,r,0,TAU);ctx.fill();
    ctx.strokeStyle=ally?'#9dd7ff':'#ff8b80';ctx.lineWidth=2/zoom;ctx.stroke();
    const partyParryActive=ally&&clock<(e.parryUntil||0)&&partyCpuMatch.loadouts&&
      partyCpuMatch.loadouts[e.id]&&partyCpuMatch.loadouts[e.id].melee==='twinsai';
    if(partyParryActive){
      ctx.strokeStyle='#bfe8ff';ctx.lineWidth=3/zoom;ctx.beginPath();ctx.arc(e.x,e.y,r+10,0,TAU);ctx.stroke();
    }
    if(partyParryActive){
      ctx.save();ctx.translate(e.x,e.y);ctx.rotate(weaponAngle);drawMeleeWeaponSilhouette('twinsai',false,true);ctx.restore();
    }else if(wk.melee){
      ctx.save();ctx.translate(e.x,e.y);ctx.rotate(weaponAngle);drawMeleeWeaponSilhouette(e.cur,!ally,false);ctx.restore();
    }else{
      ctx.strokeStyle=weaponColor(e.cur,ally?'#bde7ff':'#e0a8a0');ctx.lineWidth=5/zoom;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(e.x+Math.cos(a)*6,e.y+Math.sin(a)*6);ctx.lineTo(e.x+Math.cos(a)*(len+8),e.y+Math.sin(a)*(len+8));ctx.stroke();
    }
    if(!partyParryActive&&clock<(e.flash||0)){ctx.fillStyle='#ffd98a';ctx.beginPath();ctx.arc(e.x+Math.cos(a)*(len+10),e.y+Math.sin(a)*(len+10),4,0,TAU);ctx.fill();}
    drawMeleeAbilityVisual(e,clock,!ally,false);
    if(swingProgress!==null){
      const attackA=Number.isFinite(+e.swingA)?+e.swingA:a,attackArc=e.swingArc||wk.arc||.5,attackR=e.swingR||wk.range||55;
      ctx.strokeStyle=(ally?'rgba(191,232,255,':'rgba(255,59,52,')+(.8*(1-swingProgress)).toFixed(3)+')';ctx.lineWidth=4/zoom;
      drawMeleeSwingPath(e.x,e.y,attackA,attackArc,attackR,swingProgress);
    }
    // Teammate status helps coordination. Enemy CPUs intentionally expose no
    // name, exact health bar, damage flash, or hit-confirmation information.
    if(ally){
      ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(e.x-31,e.y-r-23,62,6);ctx.fillStyle='#7fd8ff';ctx.fillRect(e.x-31,e.y-r-23,62*clamp(e.hp/PARTY_CPU_HP,0,1),6);
      ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillStyle='#cdeeff';ctx.font='700 9px ui-monospace,Consolas,monospace';ctx.fillText(String(e.name||'ALLY').slice(0,16),e.x,e.y-r-27);
      ctx.textAlign='left';ctx.textBaseline='alphabetic';
    }
  }
  for(const b of partyCpuMatch.shots){
    if(b.team!=='A')continue;
    const a=Math.atan2(b.vy,b.vx);
    ctx.strokeStyle='#7fd8ff';ctx.lineWidth=2.2/zoom;ctx.beginPath();ctx.moveTo(b.x-Math.cos(a)*8,b.y-Math.sin(a)*8);ctx.lineTo(b.x+Math.cos(a)*2,b.y+Math.sin(a)*2);ctx.stroke();
  }
  drawRemoteShotVisuals(partyCpuMatch.visualShots);
}
function drawArenaOpponentWorld(){
  if(practiceMode!=='arena') return;
  if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()){drawPartyCpuActors();return;}
  if(!arena.opponent) return;
  const e=arena.opponent, a=e.angle||0, r=e.r||15;
  const remoteParryActive=now<(e.parryUntil||0)&&e.loadout&&e.loadout.melee==='twinsai';
  // Exact opponent health is result information, never live combat intel.
  // This applies equally to Casual 1v1 and every local 1v1 bot difficulty.
  const showOpponentHp=arena.phase==='round_end'||arena.phase==='match_end';
  const showOpponentName=!isBotArena()||showOpponentHp;
  const showOpponentHitFlash=!isBotArena();
  const swingDur=Math.max(1,+e.swingDur||130),swingProgress=e.swingT&&(now-e.swingT)>=0&&(now-e.swingT)<swingDur?(now-e.swingT)/swingDur:null;
  let weaponAngle=a;
  if(swingProgress!==null){
    const ease=swingProgress<.25?-(swingProgress/.25)*.35:-.35+((swingProgress-.25)/.75)*1.35;
    weaponAngle+=(e.swingSide||1)*(e.swingArc||1.2)*.5*ease;
  }
  ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(e.x+3,e.y+5,r,r*.7,0,0,TAU); ctx.fill();
  ctx.fillStyle=showOpponentHitFlash&&now<(e.hitT||0)?'#ffffff':'#d05548'; ctx.beginPath(); ctx.arc(e.x,e.y,r,0,TAU); ctx.fill();
  ctx.strokeStyle='#ff8b80'; ctx.lineWidth=2/zoom; ctx.stroke();
  if(remoteParryActive){
    const remain=clamp(((e.parryUntil||0)-now)/TWIN_SAI_PARRY_MS,0,1);
    ctx.strokeStyle='rgba(255,107,97,'+(0.45+remain*.45)+')';ctx.lineWidth=3/zoom;ctx.beginPath();
    ctx.arc(e.x,e.y,r+10+Math.sin(now*.018)*2,0,TAU);ctx.stroke();
  }
  const wk=WEAPONS[e.cur]||WEAPONS.ar, len=Math.min(38,wk.len||24);
  const remoteUtility=e.utilityOut&&e.loadout&&typeof casualArenaUtilityKey==='function'
    ?casualArenaUtilityKey(e.loadout.utility,false):'';
  if(remoteParryActive){
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(weaponAngle);drawMeleeWeaponSilhouette('twinsai',true,true);ctx.restore();
  }else if(remoteUtility){
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(weaponAngle);drawUtilIcon(14,0,remoteUtility,'#ff8bc2',.8);ctx.restore();
  }else if(wk.melee){
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(weaponAngle);drawMeleeWeaponSilhouette(e.cur,true,false);ctx.restore();
  }else{
    ctx.strokeStyle=weaponColor(e.cur,'#e0a8a0');ctx.lineWidth=5/zoom;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(e.x+Math.cos(weaponAngle)*6,e.y+Math.sin(weaponAngle)*6);ctx.lineTo(e.x+Math.cos(weaponAngle)*(len+8),e.y+Math.sin(weaponAngle)*(len+8));ctx.stroke();
  }
  if(!remoteParryActive&&now<(e.flash||0)){
    ctx.fillStyle='#ffd98a'; ctx.beginPath(); ctx.arc(e.x+Math.cos(a)*(len+10),e.y+Math.sin(a)*(len+10),4,0,TAU); ctx.fill();
  }
  drawMeleeAbilityVisual(e,now,true,false);
  if(swingProgress!==null){
    const attackA=Number.isFinite(+e.swingA)?+e.swingA:a,attackArc=e.swingArc||wk.arc||.5,attackR=e.swingR||wk.range||55;
    ctx.strokeStyle='rgba(255,59,52,'+(.8*(1-swingProgress)).toFixed(3)+')';ctx.lineWidth=4/zoom;
    drawMeleeSwingPath(e.x,e.y,attackA,attackArc,attackR,swingProgress);
  }
  if(showOpponentHp){
    ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(e.x-31,e.y-r-23,62,6);
    ctx.fillStyle='#d05548'; ctx.fillRect(e.x-31,e.y-r-23,62*clamp(e.hp/ARENA_HP,0,1),6);
  }
  if(showOpponentName){
    ctx.textAlign='center'; ctx.textBaseline='bottom'; ctx.fillStyle='#ffd9d2'; ctx.font='700 9px ui-monospace,Consolas,monospace';
    ctx.fillText(String(e.name||'OPPONENT').slice(0,16),e.x,e.y-r-27);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  }
}
function drawHostileProjectileWorldPass(playBounds){
  const bounds=playBounds||activeArenaBounds();
  ctx.save();ctx.beginPath();ctx.rect(bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top);ctx.clip();
  for(const b of ebullets)drawHostileProjectileCue(b,b&&b.h?'homing':b&&b.king?'king':'enemy');
  if(practiceMode==='arena'){
    if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()){
      for(const b of partyCpuMatch.shots)if(b&&b.team==='B')drawHostileProjectileCue(b,'cpu');
    }else{
      drawRemoteShotVisuals(arena.remoteShots,true);
      if(Array.isArray(arena.remoteFireworks))for(const b of arena.remoteFireworks)drawHostileProjectileCue(b,'firework');
      drawRemoteFireworkExplosionVisuals(arena.remoteFireworkFx);
    }
  }
  ctx.restore();
}
function collectLiveHostileProjectiles(){
  const result=[],add=(list,accept)=>{
    if(!Array.isArray(list))return;
    for(const b of list)if(b&&Number.isFinite(+b.x)&&Number.isFinite(+b.y)&&
      (!Number.isFinite(+b.life)||+b.life>0)&&(!accept||accept(b)))result.push(b);
  };
  add(ebullets);
  if(practiceMode==='arena'){
    if(typeof isCpuTeamArena==='function'&&isCpuTeamArena())add(partyCpuMatch.shots,b=>b.team==='B');
    else{add(arena.remoteShots);add(arena.remoteFireworks);}
  }
  return result;
}
function drawScopedHostileProjectileCues(){
  const weapon=WEAPONS[player.cur];
  if(state!=='play'||!aiming||!weapon||!weapon.scoped)return 0;
  const bounds=activeArenaBounds(),visible=collectLiveHostileProjectiles();let drawn=0;
  ctx.save();ctx.lineJoin='round';
  for(const b of visible){
    const x=+b.x,y=+b.y;
    if(x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom)continue;
    const point=worldToScreen(x,y),sx=+point.x,sy=+point.y;
    // This is not an off-screen warning system: only an already-visible live
    // projectile gets its same red tracer repeated above the scope vignette.
    if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<0||sx>W||sy<0||sy>H)continue;
    const speed=Math.hypot(+b.vx||0,+b.vy||0),ux=speed?(+b.vx||0)/speed:0,uy=speed?(+b.vy||0)/speed:0;
    ctx.strokeStyle='#ff3b34';ctx.lineWidth=3.2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx-ux*24,sy-uy*24);ctx.stroke();drawn++;
  }
  ctx.restore();return drawn;
}
function drawWorld(){
  ctx.fillStyle='#101208';
  ctx.fillRect(0,0,W,H);

  const duelView=isArenaMapBattlefield(),playBounds=activeArenaBounds(),mapId=activeArenaMapId();
  // Rendering enforces the same invariant even while countdowns, menus, or
  // other gameplay modals freeze simulation. Scope zoom and map edges never
  // move the local player away from the exact screen center.
  centerCameraOnPlayer();
  if(duelView&&arena.phase!=='fight') zoom=duelArenaFitZoom();
  ctx.save();
  ctx.translate(W/2,H/2);
  ctx.scale(zoom,zoom);
  ctx.translate(-cam.x,-cam.y);
  if(duelView){
    ctx.beginPath();
    ctx.rect(playBounds.left,playBounds.top,playBounds.right-playBounds.left,playBounds.bottom-playBounds.top);
    ctx.clip();
    ctx.fillStyle=mapId==='dimension'?'#100d1d':mapId==='construction'?'#17150f':'#101208';
    ctx.fillRect(playBounds.left,playBounds.top,playBounds.right-playBounds.left,playBounds.bottom-playBounds.top);
  }

  // grid
  const hw=W/2/zoom, hh=H/2/zoom;
  const worldLeft=duelView?playBounds.left:0, worldTop=duelView?playBounds.top:0;
  const worldRight=duelView?playBounds.right:WORLD.w, worldBottom=duelView?playBounds.bottom:WORLD.h;
  const x0=Math.max(worldLeft,cam.x-hw), x1=Math.min(worldRight,cam.x+hw);
  const y0=Math.max(worldTop,cam.y-hh), y1=Math.min(worldBottom,cam.y+hh);
  ctx.strokeStyle=mapId==='dimension'?'rgba(166,105,255,0.10)':mapId==='construction'?'rgba(205,172,95,0.09)':'rgba(140,160,90,0.07)'; ctx.lineWidth=1/zoom;
  ctx.beginPath();
  for(let x=Math.floor(x0/80)*80;x<=x1;x+=80){ ctx.moveTo(x,y0); ctx.lineTo(x,y1); }
  for(let y=Math.floor(y0/80)*80;y<=y1;y+=80){ ctx.moveTo(x0,y); ctx.lineTo(x1,y); }
  ctx.stroke();

  // world border
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=3/zoom;
  ctx.strokeRect(playBounds.left,playBounds.top,playBounds.right-playBounds.left,playBounds.bottom-playBounds.top);
  ctx.strokeStyle='rgba(232,182,88,0.15)'; ctx.lineWidth=10/zoom;
  ctx.strokeRect(playBounds.left,playBounds.top,playBounds.right-playBounds.left,playBounds.bottom-playBounds.top);

  // Dimension portals sit below actors and projectiles, but above the floor.
  for(const p of activeArenaPortals()){
    const pulse=1+Math.sin(now*0.008+(p.id.charCodeAt(p.id.length-1)||0))*0.1;
    ctx.fillStyle=p.color+'2b'; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*pulse,0,TAU); ctx.fill();
    ctx.strokeStyle=p.color; ctx.lineWidth=4/zoom; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*pulse,0,TAU); ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.6)'; ctx.lineWidth=1.5/zoom; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*.58/pulse,0,TAU); ctx.stroke();
  }

  // Obstacles use the same collision rectangles rendered here. Construction
  // swaps concrete walls for timber crates and live TNT blocks.
  for(const o of activeObstacles()){
    if(o.kind==='tnt'){
      const hp=arenaTntHp(o.id),ratio=clamp(hp/ARENA_TNT_HP,0,1),barY=o.y-10/zoom,barH=5/zoom;
      ctx.fillStyle='#a9322b'; ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.strokeStyle='#ff806e'; ctx.lineWidth=2/zoom; ctx.strokeRect(o.x,o.y,o.w,o.h);
      ctx.fillStyle='#e8b658'; ctx.fillRect(o.x,o.y+o.h*.18,o.w,o.h*.12); ctx.fillRect(o.x,o.y+o.h*.70,o.w,o.h*.12);
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff1c0';ctx.font='800 '+(10/zoom)+'px ui-monospace,Consolas,monospace';
      ctx.fillText('TNT',o.x+o.w/2,o.y+o.h/2);ctx.textAlign='left';ctx.textBaseline='alphabetic';
      if(hp<ARENA_TNT_HP){
        ctx.strokeStyle='rgba(55,10,8,.9)';ctx.lineWidth=1.5/zoom;ctx.beginPath();
        ctx.moveTo(o.x+o.w*.28,o.y+o.h*.08);ctx.lineTo(o.x+o.w*.48,o.y+o.h*.40);ctx.lineTo(o.x+o.w*.36,o.y+o.h*.62);
        if(ratio<=.5){ctx.moveTo(o.x+o.w*.76,o.y+o.h*.16);ctx.lineTo(o.x+o.w*.58,o.y+o.h*.48);ctx.lineTo(o.x+o.w*.72,o.y+o.h*.82);}
        ctx.stroke();
      }
      ctx.fillStyle='rgba(0,0,0,.78)';ctx.fillRect(o.x,barY,o.w,barH);
      ctx.fillStyle=ratio>.5?'#e8b658':ratio>.25?'#ff9b3d':'#ff5f50';ctx.fillRect(o.x,barY,o.w*ratio,barH);
      ctx.strokeStyle='#ffcf78';ctx.lineWidth=1/zoom;ctx.strokeRect(o.x,barY,o.w,barH);
      ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillStyle='#fff1c0';ctx.font='800 '+(7/zoom)+'px ui-monospace,Consolas,monospace';
      ctx.fillText(Math.ceil(hp)+'/'+ARENA_TNT_HP,o.x+o.w/2,barY-2/zoom);ctx.textAlign='left';ctx.textBaseline='alphabetic';
    } else if(o.kind==='crate'){
      ctx.fillStyle='#6b4a28'; ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.strokeStyle='#bb8750'; ctx.lineWidth=3/zoom; ctx.strokeRect(o.x,o.y,o.w,o.h);
      ctx.strokeStyle='rgba(45,25,12,.7)';ctx.lineWidth=4/zoom;ctx.beginPath();
      ctx.moveTo(o.x,o.y);ctx.lineTo(o.x+o.w,o.y+o.h);ctx.moveTo(o.x+o.w,o.y);ctx.lineTo(o.x,o.y+o.h);ctx.stroke();
    } else {
      ctx.fillStyle=o.kind==='dimension'?'#24203b':'#262620'; ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.strokeStyle=o.kind==='dimension'?'#7456a8':'#4a4634'; ctx.lineWidth=2/zoom; ctx.strokeRect(o.x,o.y,o.w,o.h);
      ctx.strokeStyle=o.kind==='dimension'?'rgba(142,100,210,.45)':'rgba(74,70,52,0.5)';
      ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(o.x+o.w,o.y+o.h);ctx.moveTo(o.x+o.w,o.y);ctx.lineTo(o.x,o.y+o.h);ctx.stroke();
    }
  }

  // A TNT blast is brief but unmistakable. The authoritative damage is applied
  // once by arenaApplyTntDetonation; this is presentation only.
  for(const fx of (arena&&arena.tntFx)||[]){
    const age=now-fx.t;if(age<0||age>720)continue;
    const q=clamp(age/720,0,1),rr=fx.r*(.18+.82*q);
    ctx.fillStyle='rgba(255,116,35,'+(0.32*(1-q))+')';ctx.beginPath();ctx.arc(fx.x,fx.y,rr,0,TAU);ctx.fill();
    ctx.strokeStyle='rgba(255,222,118,'+(0.95*(1-q))+')';ctx.lineWidth=5/zoom;ctx.beginPath();ctx.arc(fx.x,fx.y,rr,0,TAU);ctx.stroke();
  }

  // pickups
  for(const p of pickups){
    const pulse=1+Math.sin(now*0.006)*0.15;
    if(p.type==='ammo'){
      // 2x-size ammo crate
      ctx.fillStyle='#c9973b';
      ctx.fillRect(p.x-18*pulse,p.y-12*pulse,36*pulse,24*pulse);
      ctx.strokeStyle='#5a4318'; ctx.lineWidth=2/zoom;
      ctx.strokeRect(p.x-18*pulse,p.y-12*pulse,36*pulse,24*pulse);
      ctx.fillStyle='#5a4318';
      ctx.fillRect(p.x-10,p.y-8,5,16); ctx.fillRect(p.x-1,p.y-8,5,16); ctx.fillRect(p.x+8,p.y-8,5,16);
    } else if(p.type==='fuel'){
      // fire emoji
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font=Math.round(22*pulse)+'px serif';
      ctx.fillText('\uD83D\uDD25', p.x, p.y);
      ctx.restore();
      ctx.textBaseline='top';
    } else if(p.type==='chest'){
      // glowing weapon-mod chest
      ctx.fillStyle='rgba(255,210,77,'+(0.25+0.15*Math.sin(now*0.008))+')';
      ctx.beginPath(); ctx.arc(p.x,p.y,16*pulse,0,TAU); ctx.fill();
      ctx.fillStyle='#7a4c1e';
      ctx.fillRect(p.x-11,p.y-8,22,16);
      ctx.fillStyle='#a5722f';
      ctx.fillRect(p.x-11,p.y-8,22,6);
      ctx.fillStyle='#ffd24d';
      ctx.fillRect(p.x-2.5,p.y-3,5,7);
      ctx.strokeStyle='#4a2c10'; ctx.lineWidth=1.5/zoom;
      ctx.strokeRect(p.x-11,p.y-8,22,16);
    } else {
      // 1.5x medkit: white box with a red cross
      const s=1.5*pulse;
      ctx.fillStyle='#f2f2ee';
      ctx.fillRect(p.x-11*s,p.y-11*s,22*s,22*s);
      ctx.strokeStyle='#b8b8b0'; ctx.lineWidth=1.5/zoom;
      ctx.strokeRect(p.x-11*s,p.y-11*s,22*s,22*s);
      ctx.fillStyle='#d03a30';
      ctx.fillRect(p.x-8*s,p.y-2.5*s,16*s,5*s);
      ctx.fillRect(p.x-2.5*s,p.y-8*s,5*s,16*s);
    }
  }

  // Projectiles are clipped to the same gold fence used by physics. Long
  // tracer tails therefore cannot visually poke outside after a ricochet.
  ctx.save();
  ctx.beginPath(); ctx.rect(playBounds.left,playBounds.top,playBounds.right-playBounds.left,playBounds.bottom-playBounds.top); ctx.clip();

  // ender pearls
  for(const p of pearls){
    ctx.fillStyle='rgba(63,217,163,0.35)';
    ctx.beginPath(); ctx.arc(p.x-p.vx*1.6, p.y-p.vy*1.6, 3, 0, TAU); ctx.fill();
    ctx.fillStyle='#3fd9a3';
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.fill();
    ctx.fillStyle='#0e2a20';
    ctx.beginPath(); ctx.arc(p.x+1.5, p.y-1.5, 1.8, 0, TAU); ctx.fill();
  }
  // grenades
  for(const g of grenades){
    if(g.freezer){
      const speed=Math.hypot(g.vx,g.vy)||1,ux=g.vx/speed,uy=g.vy/speed;
      ctx.strokeStyle=g.remoteUtility?'rgba(136,211,239,.75)':'rgba(191,239,255,.78)';ctx.lineWidth=5/zoom;
      ctx.beginPath();ctx.moveTo(g.x,g.y);ctx.lineTo(g.x-ux*18,g.y-uy*18);ctx.stroke();
      ctx.fillStyle=g.remoteUtility?'#79cbe9':'#bfefff';ctx.beginPath();ctx.arc(g.x,g.y,7,0,TAU);ctx.fill();
      ctx.strokeStyle='#f1fbff';ctx.lineWidth=2/zoom;ctx.beginPath();ctx.arc(g.x,g.y,4,0,TAU);ctx.stroke();
      continue;
    }
    // Hostile utility uses a red body, but never a ring/halo (the projectile
    // itself is the cue, consistent with hostile bullets).
    ctx.fillStyle=g.remoteUtility?'#7a302c':'#3a4a2c';
    ctx.beginPath(); ctx.arc(g.x,g.y,7,0,TAU); ctx.fill();
    const fl=(g.t-now)/700;
    ctx.fillStyle = ((now>>7)&1) ? '#e8b658' : '#d05548';
    ctx.beginPath(); ctx.arc(g.x,g.y-9,2.5,0,TAU); ctx.fill();
  }
  // The expanding ice front is ray-clipped by solid geometry, so neither the
  // blast nor its visual appears on the far side of a wall.
  for(const fz of freezeFx){
    const p=clamp((now-fz.t)/600,0,1);
    const wanted=fz.r*(0.18+0.82*p),samples=72;
    ctx.save();ctx.globalAlpha=(1-p)*0.82;ctx.fillStyle='rgba(130,215,250,.18)';ctx.strokeStyle='#bfefff';ctx.lineWidth=4/zoom;
    ctx.beginPath();
    for(let s=0;s<=samples;s++){
      const a=s/samples*TAU,rr=fz.wallClipped?Math.min(wanted,freezerVisualReach(fz.x,fz.y,a,fz.r)):wanted,
        x=fz.x+Math.cos(a)*rr,y=fz.y+Math.sin(a)*rr;
      if(!s)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  }
  // flame spray
  for(const f of flames){
    const a=clamp(f.life/230,0,1);
    ctx.fillStyle='rgba(255,'+Math.round(120+120*a)+',40,'+(0.5*a)+')';
    ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,TAU); ctx.fill();
    ctx.fillStyle='rgba(255,220,120,'+(0.6*a)+')';
    ctx.beginPath(); ctx.arc(f.x,f.y,f.r*0.5,0,TAU); ctx.fill();
  }
  // balls
  for(const b of balls){
    const rr = b.fire ? Math.max(6,11-(b.gen||0)*2) : 9;
    if(b.fire){
      const fl=1+Math.sin(now*0.02)*0.15;
      ctx.fillStyle='#ff5a2c';
      ctx.beginPath(); ctx.arc(b.x,b.y,rr*fl,0,TAU); ctx.fill();
      ctx.fillStyle='#ffd24d';
      ctx.beginPath(); ctx.arc(b.x,b.y,rr*0.55,0,TAU); ctx.fill();
    } else {
      ctx.fillStyle='#d05548';
      ctx.beginPath(); ctx.arc(b.x,b.y,rr,0,TAU); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(b.x-3,b.y-3,2.5,0,TAU); ctx.fill();
    }
  }

  // thrown burning daggers
  if(daggersOut){
    for(const bl of daggersOut.blades){
      const a=Math.atan2(bl.vy,bl.vx);
      ctx.save(); ctx.translate(bl.x,bl.y); ctx.rotate(a);
      ctx.fillStyle='#ff6a2c';
      ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(-5,3); ctx.lineTo(-5,-3); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#ffd24d';
      ctx.beginPath(); ctx.arc(-5,0,2,0,TAU); ctx.fill();
      ctx.restore();
    }
  }

  // player bullets
  for(const b of bullets){
    ctx.strokeStyle=b.col||'rgba(232,182,88,0.85)'; ctx.lineWidth=3.2/zoom;
    ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(b.x-b.vx*1.7,b.y-b.vy*1.7); ctx.stroke();
    ctx.strokeStyle='#fff5da'; ctx.lineWidth=1.2/zoom;
    ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(b.x-b.vx*0.9,b.y-b.vy*0.9); ctx.stroke();
  }
  ctx.restore();

  // enemies
  for(const e of enemies){
    const t=ETYPES[e.type];
    const flash = now<e.hitT;
    const frozen = e.frozenUntil>now;
    ctx.fillStyle = flash ? '#ffffff' : frozen ? '#8fd0ee' : t.col;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,TAU); ctx.fill();
    ctx.strokeStyle = frozen ? 'rgba(200,240,255,0.9)' : 'rgba(0,0,0,0.45)'; ctx.lineWidth=2.5/zoom; ctx.stroke();
    if(frozen){                                    // frost shell + crystal glints
      ctx.strokeStyle='rgba(230,250,255,0.7)'; ctx.lineWidth=1.5/zoom;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r+3,0,TAU); ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,0.85)';
      ctx.fillRect(e.x-e.r*0.4,e.y-e.r*0.5,2,2); ctx.fillRect(e.x+e.r*0.3,e.y+e.r*0.2,2,2);
    }
    if(e.deflectUntil>now){                        // BLUE deflection: color-shifting shield
      const hue=(now*0.4)%360;
      ctx.strokeStyle='hsl('+hue+',90%,70%)'; ctx.lineWidth=3.5/zoom;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r+7+Math.sin(now*0.02)*2,0,TAU); ctx.stroke();
    }
    if(e.dragUntil>now){                           // TIMETURNER drag: amber time ring
      ctx.strokeStyle='rgba(230,200,120,0.8)'; ctx.lineWidth=2/zoom;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r+4,0,TAU); ctx.stroke();
    }
    const a=Math.atan2(player.y-e.y,player.x-e.x);
    ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(e.x+Math.cos(a)*e.r*0.55, e.y+Math.sin(a)*e.r*0.55, e.r*0.3,0,TAU);
    ctx.fill();
    if(t.ranged){
      ctx.strokeStyle='#1c2b33'; ctx.lineWidth=4/zoom;
      ctx.beginPath(); ctx.moveTo(e.x,e.y);
      ctx.lineTo(e.x+Math.cos(a)*(e.r+10), e.y+Math.sin(a)*(e.r+10)); ctx.stroke();
    }
    if(t.boss){
      ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=2.5/zoom;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r*0.6,0,TAU); ctx.stroke();
      if(e.mode==='wind'){
        const wp=1-Math.max(0,(e.modeT-now))/550;
        ctx.strokeStyle='rgba(224,90,80,'+(0.7*wp).toFixed(2)+')'; ctx.lineWidth=3/zoom;
        ctx.beginPath(); ctx.arc(e.x,e.y,e.r+8+wp*12,0,TAU); ctx.stroke();
      }
    }
    if(e.hp<e.maxhp){
      const bw=e.r*2;
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.fillRect(e.x-bw/2,e.y-e.r-9,bw,4);
      ctx.fillStyle='#d05548';
      ctx.fillRect(e.x-bw/2,e.y-e.r-9,bw*Math.max(0,e.hp/e.maxhp),4);
    }
  }

  // particles
  for(const p of particles){
    ctx.globalAlpha=Math.max(0,p.life/p.max);
    ctx.fillStyle=p.col;
    ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);
  }
  ctx.globalAlpha=1;

  drawArenaOpponentWorld();

  // player
  const w=WEAPONS[player.cur], ang=aimAngle(),localParryActive=now<parryUntil&&now>=parryUntil-TWIN_SAI_PARRY_MS&&loadout.melee==='twinsai';
  if(typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen()){
    ctx.strokeStyle='rgba(191,239,255,0.92)';ctx.lineWidth=4/zoom;ctx.beginPath();
    ctx.arc(player.x,player.y,player.r+12+Math.sin(now*.012)*2,0,TAU);ctx.stroke();
  }
  if(localParryActive){                              // Twin Sai parry remains visibly active
    const remain=clamp((parryUntil-now)/TWIN_SAI_PARRY_MS,0,1);
    ctx.strokeStyle='rgba(191,232,255,'+(0.45+remain*0.45)+')';
    ctx.lineWidth=3/zoom; ctx.beginPath();
    ctx.arc(player.x,player.y,player.r+10+Math.sin(now*0.018)*2,0,TAU); ctx.stroke();
  }
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(player.x+3,player.y+5,player.r,player.r*0.7,0,0,TAU); ctx.fill();
  ctx.save();
  ctx.translate(player.x,player.y);
  let spinA=0;
  if(player.spinT && now-player.spinT<250) spinA=((now-player.spinT)/250)*TAU;
  ctx.rotate(ang+spinA);
  // the equip flourish belongs to the WEAPON: spin it about its own middle,
  // inside its own transform so the player's body never moves with it
  const fl=equipFlourish();
  const sw=(w.melee && !utilityOut) ? meleeSwingPhase() : null;
  ctx.save();
  if(fl){
    const pivot=18;                              // roughly the middle of the held weapon
    ctx.translate(pivot, fl.lift);
    ctx.rotate(fl.rot);
    if(fl.scale!==1) ctx.scale(fl.scale, fl.scale);
    ctx.translate(-pivot, 0);
  }
  if(sw!==null){
    // sweep the blade through the swing arc: wind up behind, whip across, settle.
    const arc=player.swingArc||1.2;
    const side=player.swingSide||Math.sign(player.swingA-aimAngle())||1; // which way this swing goes
    const ease=sw<0.25 ? -(sw/0.25)*0.35                     // short wind-up
                       : -0.35 + ((sw-0.25)/0.75)*1.35;      // then the sweep through
    const thrust=(player.swingArc<0.6);                      // knife-style stab, not a sweep
    if(thrust){
      ctx.translate(Math.sin(sw*Math.PI)*9, 0);              // lunge out and back
    } else {
      ctx.rotate(side*arc*0.5*ease);
      ctx.translate(Math.sin(sw*Math.PI)*3, 0);
    }
  }
  if(localParryActive){                         // quick-melee parry keeps both Sai visible for the full guard
    drawMeleeWeaponSilhouette('twinsai',false,true);
  } else if(utilityOut){                         // utility in hand
    drawUtilIcon(14, 0, loadout.utility, '#c98fb8', 0.8);
  } else if(w.melee){                            // shared local/remote melee geometry
    drawMeleeWeaponSilhouette(player.cur,false,false);
  } else if(w.solar){                            // solar rifle: long barrel + glowing solar core
    ctx.fillStyle='#3a3320';                      // stock/body
    ctx.fillRect(-4,-3,10,6);
    ctx.fillStyle='#2a2f1c';                       // long barrel
    ctx.fillRect(6,-2.4,22,4.8);
    // glowing solar core near the receiver
    const gl=0.75+Math.sin(now*0.02)*0.25;
    ctx.fillStyle='rgba(255,180,50,'+gl+')';
    ctx.beginPath(); ctx.arc(4,0,4,0,TAU); ctx.fill();
    ctx.fillStyle='rgba(255,240,160,'+gl+')';
    ctx.beginPath(); ctx.arc(4,0,2,0,TAU); ctx.fill();
    // charged muzzle glow
    if(now<player.flash){
      ctx.fillStyle='rgba(255,210,90,0.9)';
      ctx.beginPath(); ctx.arc(30,0,5,0,TAU); ctx.fill();
    }
  } else {
    ctx.fillStyle='#2a2f1c';                     // gun
    ctx.fillRect(4,-3.2,w.len,6.4);
    ctx.fillStyle='#454e2c';
    ctx.fillRect(4,-3.2,w.len*0.45,6.4);
    if(now<player.flash){                        // muzzle flash
      ctx.fillStyle='rgba(255,220,130,0.9)';
      ctx.beginPath();
      ctx.moveTo(w.len+2,0); ctx.lineTo(w.len+16,-6); ctx.lineTo(w.len+22,0); ctx.lineTo(w.len+16,6);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();                                 // end of the weapon-only transform
  ctx.fillStyle='#a7c15e';                       // body
  ctx.beginPath(); ctx.arc(0,0,player.r,0,TAU); ctx.fill();
  ctx.strokeStyle='#39421f'; ctx.lineWidth=3/zoom; ctx.stroke();
  ctx.fillStyle='#39421f';                       // helmet stripe
  ctx.beginPath(); ctx.arc(0,0,player.r*0.55,-0.9,0.9); ctx.lineTo(0,0); ctx.closePath(); ctx.fill();
  ctx.restore();

  drawMeleeAbilityVisual(player,now,false,true);

  // Incoming ordnance is deliberately the last world-space combat layer, so
  // enemy bodies, the local player, and dense wave effects cannot cover the
  // red tracer during the short reaction window before impact.
  drawHostileProjectileWorldPass(playBounds);

  // melee swing arc — animation length tracks the weapon's swing speed
  const swingDur = player.swingDur || 130;
  if(player.swingT && now-player.swingT<swingDur){
    const pr=(now-player.swingT)/swingDur;
    ctx.strokeStyle='rgba(232,217,168,'+(0.8*(1-pr)).toFixed(3)+')';
    ctx.lineWidth=4/zoom;
    drawMeleeSwingPath(player.x,player.y,player.swingA,player.swingArc,player.swingR,pr);
  }

  // reload arc
  if(player.reloadEnd>now){
    const frac = 1-(player.reloadEnd-now)/(w.reload*perks.reload);
    ctx.strokeStyle='#e8b658'; ctx.lineWidth=3.5/zoom;
    ctx.beginPath(); ctx.arc(player.x,player.y,player.r+9,-Math.PI/2,-Math.PI/2+frac*TAU); ctx.stroke();
  }
  if(now<surgeT){
    ctx.strokeStyle='rgba(224,138,60,0.85)'; ctx.lineWidth=2.5/zoom;
    ctx.beginPath(); ctx.arc(player.x,player.y,player.r+14,0,TAU); ctx.stroke();
  }
  if(medChan){
    const frac=Math.min(1,(now-medChan)/MED_CHANNEL_MS);
    ctx.strokeStyle='#5ec46a'; ctx.lineWidth=4/zoom;
    ctx.beginPath(); ctx.arc(player.x,player.y,player.r+18,-Math.PI/2,-Math.PI/2+frac*TAU); ctx.stroke();
  }
  drawDamageNumbers();
  ctx.restore();
}

/* ---------------- render: HUD ---------------- */
function touchWeaponSelectorLayout(count){
  count=Math.max(1,Math.min(4,Math.floor(+count||1)));
  const arenaMini=typeof isArenaMapBattlefield==='function'&&isArenaMapBattlefield();
  const short=H<430, tutorial=!!tutorialOn;
  // Keep one vertical rail at the extreme top-left in every touch layout. It
  // stays left of the Campaign minimap and top-right actions. On a short
  // landscape it narrows to x=8..48, just clear of the movement-stick circle.
  const timeStopped=typeof now==='number'&&typeof timeStopUntil==='number'&&now<timeStopUntil;
  const x=W<360||short?8:14, y=tutorial||arenaMini?158:(timeStopped?86:64);
  const w=short?40:Math.min(84,W<360?80:84),h=28,gap=4;
  return {x,y,w,h,gap,columns:1,rows:count,width:w,height:count*h+(count-1)*gap};
}
function drawHUD(){
  const w=WEAPONS[player.cur];
  const sw=swayScreen();
  const cxs=mouse.x+sw.x, cys=mouse.y+sw.y;
  const scoped = aiming && w.scoped;

  // aim vignette / scope
  if(aiming){
    if(scoped){
      const R=Math.min(W,H)*0.30;
      ctx.fillStyle='rgba(4,5,2,0.94)';
      ctx.beginPath(); ctx.rect(0,0,W,H); ctx.arc(cxs,cys,R,0,TAU); ctx.fill('evenodd');
      const g=ctx.createRadialGradient(cxs,cys,R*0.2,cxs,cys,R);
      g.addColorStop(0,'rgba(150,190,140,0.05)');
      g.addColorStop(1,'rgba(20,40,20,0.28)');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(cxs,cys,R,0,TAU); ctx.fill();
      ctx.strokeStyle='#0a0c08'; ctx.lineWidth=10;
      ctx.beginPath(); ctx.arc(cxs,cys,R,0,TAU); ctx.stroke();
      ctx.strokeStyle='#e8b658'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(cxs,cys,R-6,0,TAU); ctx.stroke();
      // reticle
      ctx.strokeStyle='rgba(20,25,15,0.95)'; ctx.lineWidth=1.4;
      ctx.beginPath();
      ctx.moveTo(cxs-R,cys); ctx.lineTo(cxs+R,cys);
      ctx.moveTo(cxs,cys-R); ctx.lineTo(cxs,cys+R);
      ctx.stroke();
      ctx.fillStyle='rgba(20,25,15,0.95)';
      for(let i=1;i<=3;i++){
        const o=R*0.22*i;
        for(const s of [-1,1]){
          ctx.fillRect(cxs+o*s-1.5,cys-4,3,8);
          ctx.fillRect(cxs-4,cys+o*s-1.5,8,3);
        }
      }
      ctx.fillStyle='#d05548';
      ctx.beginPath(); ctx.arc(cxs,cys,2.2,0,TAU); ctx.fill();
    } else {
      const g=ctx.createRadialGradient(cxs,cys,Math.min(W,H)*0.22,W/2,H/2,Math.max(W,H)*0.75);
      g.addColorStop(0,'rgba(0,0,0,0)');
      g.addColorStop(1,'rgba(0,0,0,0.5)');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    }
  }

  // crosshair (hidden inside sniper scope, and while any menu/popup is open)
  if(!scoped && state==='play' && !menuOpen && !powerMenuOpen && !respawnPromptT && !adminOpen){
    const gap = 7 + effSpread()*230*zoom;
    const L=9;
    ctx.strokeStyle='#e8d9a8'; ctx.lineWidth=1.6;
    ctx.beginPath();
    ctx.moveTo(cxs-gap-L,cys); ctx.lineTo(cxs-gap,cys);
    ctx.moveTo(cxs+gap,cys);   ctx.lineTo(cxs+gap+L,cys);
    ctx.moveTo(cxs,cys-gap-L); ctx.lineTo(cxs,cys-gap);
    ctx.moveTo(cxs,cys+gap);   ctx.lineTo(cxs,cys+gap+L);
    ctx.stroke();
    ctx.fillStyle='#e8d9a8';
    ctx.fillRect(cxs-1,cys-1,2,2);
  }

  // hurt flash
  if(player.hurtFlash>0){
    ctx.fillStyle='rgba(180,30,30,'+(0.35*player.hurtFlash)+')';
    ctx.fillRect(0,0,W,H);
  }

  // The sniper vignette intentionally hides most of the world, but never an
  // incoming projectile whose center is already on screen. Draw after the hurt
  // flash as well, so the red fullscreen wash cannot erase the tracer.
  if(scoped)drawScopedHostileProjectileCues();

  const pad=18;
  // score / wave
  ctx.textAlign='left'; ctx.textBaseline='top';
  if(practiceMode==='arena'){
    if(typeof isCpuTeamArena==='function'&&isCpuTeamArena()){
      const clock=cpuTeamClock(),timer=partyCpuMatch.phase==='countdown'?Math.ceil((partyCpuMatch.roundStartAt-clock)/1000):Math.ceil((partyCpuMatch.roundEndAt-clock)/1000);
      const scoreLine='YOUR TEAM  '+(partyCpuMatch.scores.allies||0)+'  \u2014  '+(partyCpuMatch.scores.cpus||0)+'  CPUs';
      ctx.textAlign='center';ctx.fillStyle='#bfa8ff';ctx.font='700 '+clamp(Math.floor(W/30),13,24)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(scoreLine,W-110),W/2,pad);
      ctx.fillStyle=partyCpuMatch.phase==='fight'?'#cdd6b0':'#ffd24d';ctx.font='700 12px ui-monospace,Consolas,monospace';
      const status='ROUND '+partyCpuMatch.round+'  \u00b7  FIRST TO 5  \u00b7  '+(partyCpuMatch.phase==='countdown'?('STARTS IN '+Math.max(1,timer)):partyCpuMatch.phase==='fight'?('TIME '+Math.max(0,timer)+'s'):'ROUND COMPLETE');
      ctx.fillText(fitLine(status,W-36),W/2,pad+32);ctx.textAlign='left';
    } else {
    const myId=arenaMeId(), oppId=arenaOpponentId();
    const me=myId?(arena.scores[myId]||0):0, them=oppId?(arena.scores[oppId]||0):0;
    const clock=isBotArena()?now:Date.now(), timer=arena.phase==='countdown'?Math.ceil((arena.roundStartAt-clock)/1000):Math.ceil((arena.roundEndAt-clock)/1000);
    const scoreLine='YOU  '+me+'  \u2014  '+them+'  '+String((arena.opponent&&arena.opponent.name)||'OPPONENT').slice(0,12);
    ctx.textAlign='center'; ctx.fillStyle='#e8b658'; ctx.font='700 '+clamp(Math.floor(W/30),13,24)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(scoreLine,W-110),W/2,pad);
    ctx.fillStyle=arena.networkHold?'#ff8b80':(arena.phase==='fight'?'#cdd6b0':'#ffd24d'); ctx.font='700 12px ui-monospace,Consolas,monospace';
    const roundLine=arena.networkHold?'OPPONENT RECONNECTING \u00b7 MATCH HELD':('ROUND '+arena.round+'  \u00b7  FIRST TO 5  \u00b7  '+(arena.phase==='countdown'?('STARTS IN '+Math.max(1,timer)):arena.phase==='fight'?('TIME '+Math.max(0,timer)+'s'):'ROUND COMPLETE'));
    ctx.fillText(fitLine(roundLine,W-36),W/2,pad+32);
    ctx.textAlign='left';
    }
    const hudMapId=typeof activeArenaMapId==='function'?activeArenaMapId():(arena.mapId||'arena');
    ctx.textAlign='center';ctx.fillStyle='#8a9268';ctx.font='700 '+(W<360?8:10)+'px ui-monospace,Consolas,monospace';
    ctx.fillText('MAP \u00b7 '+arenaMapName(hudMapId),W/2,pad+50);ctx.textAlign='left';
    if(typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen()){
      ctx.textAlign='center';ctx.fillStyle='#bfefff';ctx.font='700 11px ui-monospace,Consolas,monospace';
      const frozenUntil=Math.max(typeof playerFrozenUntil==='number'?playerFrozenUntil:0,+arena.utilityFrozenUntil||0);
      ctx.fillText('FROZEN '+Math.max(0,(frozenUntil-now)/1000).toFixed(1)+'s \u00b7 FIRST HIT THAWS',W/2,pad+66);ctx.textAlign='left';
    }
  } else {
    ctx.fillStyle='#e8b658'; ctx.font='700 22px ui-monospace,Consolas,monospace';
    ctx.fillText('SCORE '+score, pad, pad);
    ctx.fillStyle='#8a9268'; ctx.font='13px ui-monospace,Consolas,monospace';
  if(practiceMode){
    ctx.fillText({range:'\uD83C\uDFAF SHOOTING RANGE', dps:'\uD83C\uDFAF DPS DUMMY', tracking:'\uD83C\uDFAF TRACKING DUMMY', boss:'\uD83C\uDFAF WARLORD PRACTICE'}[practiceMode]+' \u2014 ESC for menu', pad, pad+28);
    if(practiceMode==='dps'){
      const elapsed = dpsStart ? Math.max(0.5,(now-dpsStart)/1000) : 0;
      const avg = dpsStart ? dpsTotal/elapsed : 0;
      ctx.textAlign='center';
      ctx.fillStyle='#ffd24d'; ctx.font='700 30px ui-monospace,Consolas,monospace';
      ctx.fillText(Math.round(avg)+' AVG DPS', W/2, pad);
      ctx.fillStyle='#8a9268'; ctx.font='12px ui-monospace,Consolas,monospace';
      ctx.fillText('stop firing 3s to reset \u00b7 INTEGRITY \u221E', W/2, pad+38);
      ctx.textAlign='left';
    }
  } else {
    const medLeft=Math.max(1,medDropKillsRequired()-medDropKillAcc);
    ctx.fillText(fitLine('WAVE '+Math.max(1,wave)+'   KILLS '+kills+'   MED IN '+medLeft+'   STASH '+medStash+'/'+MED_STASH_MAX+' [H]   BEST '+hiScore,W-pad*2), pad, pad+28);
  }
  }
  if(now<timeStopUntil){
    ctx.fillStyle='rgba(100,180,240,0.06)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#7fd8ff'; ctx.font='700 13px ui-monospace,Consolas,monospace';
    ctx.fillText('\u23F3 TIME CAPSULE '+Math.ceil((timeStopUntil-now)/1000)+'s', pad, pad+50);
  }

  // health
  const hbW=230, hbY=H-92;
  ctx.fillStyle='#8a9268'; ctx.font='11px ui-monospace,Consolas,monospace';
  ctx.fillText('INTEGRITY '+Math.ceil(player.hp)+' / '+perks.maxhp, pad, hbY-15);
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(pad,hbY,hbW,13);
  ctx.fillStyle = player.hp>perks.maxhp*0.35 ? '#a7c15e' : '#d05548';
  ctx.fillRect(pad,hbY,hbW*player.hp/perks.maxhp,13);
  ctx.strokeStyle='#4a4634'; ctx.lineWidth=1; ctx.strokeRect(pad+0.5,hbY+0.5,hbW,13);

  // weapon block
  const mag=Math.floor(player.mags[player.cur]);
  ctx.fillStyle = utilityOut ? '#c98fb8' : w.melee ? '#8fb3c9' : '#cdd6b0';
  ctx.font='700 16px ui-monospace,Consolas,monospace';
  ctx.fillText(utilityOut ? UTILITIES[loadout.utility].name : w.name, pad, H-62);
  ctx.font='700 30px ui-monospace,Consolas,monospace';
  ctx.fillStyle = w.saw ? (sawLock ? '#d05548' : '#e8b658') : (mag===0 ? '#d05548' : '#e8b658');
  const ammoTxt = utilityOut
                ? (loadout.utility==='medkit' ? (medKillCharge>=medKillsRequired()?'MEDKIT READY':(medKillsRequired()-medKillCharge)+' KILLS')
                   : now<utilReadyT ? 'RECHARGING' : 'READY')
                : w.infinite ? (player.reloadEnd>now ? 'RELOADING' : '\u2600 '+mag+' / \u221E')
                : w.saw ? (sawLock ? 'RECHARGING' : 'FUEL '+Math.ceil(sawFuel)+'%')
                : w.melee ? 'MELEE'
                : (player.reloadEnd>now ? 'RELOADING' : ((isFinite(mag)?mag:'\u221E')+' / '+(isFinite(player.reserve[player.cur])?player.reserve[player.cur]:'\u221E')));
  ctx.fillText(ammoTxt, pad, H-42);
  // slots: 1 primary / 2 sidearm / 3 melee / 4 utility. On touch these are
  // real top-left selectors; desktop keeps the original bottom HUD exactly.
  // Per-card Practice intentionally carries exactly one item. Keep its real
  // 1/2/3/4 hotkey while omitting the empty slots; dereferencing a null slot
  // used to abort drawHUD after drawWorld had painted a seemingly black frame.
  const slots=[
    {key:loadout.primary,number:1,utility:false},
    {key:loadout.secondary,number:2,utility:false},
    {key:loadout.melee,number:3,utility:false},
    {key:loadout.utility,number:4,utility:true},
  ].filter(slot=>slot.key);
  touchButtons=[]; touchWeaponSelectorBounds=null;
  const touchSlots=touchUI?touchWeaponSelectorLayout(slots.length):null;
  if(touchSlots) touchWeaponSelectorBounds={x:touchSlots.x,y:touchSlots.y,w:touchSlots.width,h:touchSlots.height};
  for(let i=0;i<slots.length;i++){
    const col=touchSlots?i%touchSlots.columns:i, row=touchSlots?Math.floor(i/touchSlots.columns):0;
    const x=touchSlots?touchSlots.x+col*(touchSlots.w+touchSlots.gap):pad+i*66;
    const y=touchSlots?touchSlots.y+row*(touchSlots.h+touchSlots.gap):H-102-40, slot=slots[i], k=slot.key;
    const slotW=touchSlots?touchSlots.w:60, slotH=touchSlots?touchSlots.h:20;
    const isU = slot.utility;
    const cur = isU ? utilityOut : (!utilityOut && k===player.cur);
    const pressed=touchSlots&&pressedBtn===String(slot.number);
    ctx.fillStyle = pressed ? 'rgba(232,182,88,0.5)' : cur ? 'rgba(232,182,88,0.22)' : 'rgba(0,0,0,0.55)';
    ctx.fillRect(x,y,slotW,slotH);
    ctx.strokeStyle = pressed||cur ? '#e8b658' : '#4a4634';
    ctx.strokeRect(x+0.5,y+0.5,slotW,slotH);
    ctx.fillStyle = pressed||cur ? '#e8b658' : '#8a9268';
    ctx.font=(touchSlots?'700 11px':'11px')+' ui-monospace,Consolas,monospace';
    ctx.fillText(String(slot.number), x+6, y+(touchSlots?8:5));
    ctx.textAlign='right';
    const SLOT_TAG={timeturner:'TIME', warpwave:'WARP', terafists:'TERA', portal:'PORTAL', solarrifle:'SOLAR'};
    const tag = SLOT_TAG[k] || (isU ? UTILITIES[k] : WEAPONS[k]).name.split(' ')[0];
    if(!touchSlots||slotW>=52) ctx.fillText(touchSlots?fitLine(tag,slotW-24):tag, x+slotW-6, y+(touchSlots?8:5));
    ctx.textAlign='left';
    if(touchSlots) touchButtons.push({key:String(slot.number),x,y,w:slotW,h:slotH});
  }

  // cooldown bars — laid out in fixed non-overlapping columns, right of the slot chips
  let cdX = pad + slots.length*66 + 16;
  const CDW=104;                                // column stride (70px bar + gap, wide enough for labels)
  const cdFits=()=>cdX+96<=W-pad;               // narrow screens: drop columns that would run off
  // melee ability charge/cooldown (E/F, or RMB while that melee is held)
  if((w.melee || player.cur==='warpwave' || player.cur==='timeturner') && cdFits()){
    let frac, lbl;
    if(player.cur==='warpwave'){
      lbl='E: STUN';
      const cdMax=abilityCdOf('warpwave')||1;
      frac=clamp(1-((abilityCD.warpwave||0)-now)/cdMax, 0, 1);
    } else if(player.cur==='timeturner'){
      lbl='E: DRAG';
      const cdMax=abilityCdOf('timeturner')||1;
      frac=clamp(1-((abilityCD.timeturner||0)-now)/cdMax, 0, 1);
    } else if(player.cur==='bdaggers'){
      lbl='E/F/RMB: HURL';
      const cdMax=abilityCdOf('bdaggers')||1;
      frac=clamp(1-((abilityCD.bdaggers||0)-now)/cdMax,0,1);
    } else if(player.cur==='terafists'){
      const req=teraHitsRequired(), left=Math.max(0,req-teraHitCharge);
      frac=clamp(teraHitCharge/req,0,1);
      lbl=left ? left+' HIT'+(left===1?'':'S') : 'FLURRY READY';
    } else if(player.cur==='twinsai' && now<parryUntil&&now>=parryUntil-TWIN_SAI_PARRY_MS){
      const left=Math.max(0,parryUntil-now);
      frac=clamp(left/TWIN_SAI_PARRY_MS,0,1);
      lbl='PARRY '+(left/1000).toFixed(1)+'s';
    } else {
      const cdMax=abilityCdOf(player.cur)||1;
      frac=clamp(1-((abilityCD[player.cur]||0)-now)/cdMax, 0, 1);
      lbl = player.cur==='scythe' ? 'E/F/RMB: DASH' : player.cur==='knife' ? 'E/F/RMB: CRIT' : player.cur==='hammer' ? 'E/F/RMB: SLAM' : player.cur==='twinsai' ? 'E/F/RMB: PARRY' : 'E/F/RMB: RIP';
    }
    ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace'; ctx.textAlign='left';
    ctx.fillText(lbl, cdX, H-124);
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(cdX, H-112, 70, 6);
    ctx.fillStyle = frac>=1 ? '#a7c15e' : '#6b7455';
    ctx.fillRect(cdX, H-112, 70*frac, 6);
    cdX += CDW;
  }
  // utility recharge
  if(loadout.utility && cdFits()){
    const u=UTILITIES[loadout.utility];
    const isMed=loadout.utility==='medkit';
    const medReq=isMed?medKillsRequired():1;
    const frac = isMed ? clamp(medKillCharge/medReq,0,1) : clamp(1-(utilReadyT-now)/utilityCdOf(loadout.utility), 0, 1);
    ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace'; ctx.textAlign='left';
    ctx.fillText('G/RMB: '+u.name.split(' ').pop(), cdX, H-124);
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(cdX, H-112, 70, 6);
    ctx.fillStyle = frac>=1 ? '#c98fb8' : '#6b7455';
    ctx.fillRect(cdX, H-112, 70*frac, 6);
    if(isMed){
      if(medChan){
        ctx.fillStyle='#5ec46a';
        ctx.fillText('HEALING '+Math.max(0,Math.ceil((MED_CHANNEL_MS-(now-medChan))/1000))+'s', cdX, H-100);
      } else if(medChanHeal){
        ctx.fillStyle='#5ec46a'; ctx.fillText('QUICK HEAL',cdX,H-100);
      } else {
        const left=Math.max(0,medReq-medKillCharge);
        ctx.fillStyle=left?'#6b7455':'#5ec46a';
        ctx.fillText(left?(left+' KILL'+(left===1?'':'S')):'READY',cdX,H-100);
      }
    }
    cdX += CDW;
  }
  // dash indicator
  if(perks.dash && cdFits()){
    const cdFrac = clamp(1-(dashReadyT-now)/2200, 0, 1);
    ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace'; ctx.textAlign='left';
    ctx.fillText('DASH', cdX, H-124);
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(cdX, H-112, 70, 6);
    ctx.fillStyle = cdFrac>=1 ? '#a7c15e' : '#6b7455';
    ctx.fillRect(cdX, H-112, 70*cdFrac, 6);
    cdX += CDW;
  }
  // hint
  ctx.textAlign='right';
  ctx.fillStyle='rgba(138,146,104,0.8)'; ctx.font='11px ui-monospace,Consolas,monospace';
  if(W>=900){
    const help=practiceMode==='arena'
      ? 'WASD move · LMB fire · R reload · 1-3 / Q swap · E/F melee ability · melee RMB ability · ESC menu'
      : 'WASD move · LMB fire · '+(utilityOut&&loadout.utility==='medkit'?'RMB quick med':'E scope / melee ability')+' · R reload · 1-4 / Q swap · G/RMB utility'+(perks.dash?' · SPACE dash':'')+' · F quick melee ability · ESC menu';
    ctx.fillText(fitLine(help,W-pad-300),W-pad,H-26);
  }
  ctx.textAlign='left';

  // touch controls
  if(touchUI){
    // movement joystick, bottom-left
    const st=sticks.move;
    const center=touchMoveStickCenter(),gx=center.x,gy=center.y;
    ctx.globalAlpha=st.id!==null?0.5:0.22;
    ctx.strokeStyle='#cdd6b0'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(gx,gy,STICK_R,0,TAU); ctx.stroke();
    ctx.fillStyle='#cdd6b0';
    ctx.beginPath(); ctx.arc(gx+st.dx,gy+st.dy,24,0,TAU); ctx.fill();
    ctx.globalAlpha=1;

    const iconBtn=(key,cx,cy,R,draw,active)=>{
      touchButtons.push({key,x:cx,y:cy,r:R});
      const pressed = pressedBtn===key || active;
      ctx.fillStyle = pressed ? 'rgba(232,182,88,0.5)' : 'rgba(8,10,5,0.6)';
      ctx.beginPath(); ctx.arc(cx,cy,R,0,TAU); ctx.fill();
      ctx.strokeStyle = pressed ? '#e8b658' : '#8a9268'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(cx,cy,R,0,TAU); ctx.stroke();
      ctx.strokeStyle = pressed ? '#101208' : '#cdd6b0'; ctx.fillStyle=ctx.strokeStyle;
      ctx.lineWidth=2.4; draw(cx,cy);
    };

    // --- bottom-right: big AIM (crosshair) + RELOAD (cycle) ---
    const R=40, bx=W-72;
    iconBtn('e', bx, H-118, R, (cx,cy)=>{
      ctx.beginPath(); ctx.arc(cx,cy,13,0,TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx-19,cy); ctx.lineTo(cx-5,cy); ctx.moveTo(cx+5,cy); ctx.lineTo(cx+19,cy);
      ctx.moveTo(cx,cy-19); ctx.lineTo(cx,cy-5); ctx.moveTo(cx,cy+5); ctx.lineTo(cx,cy+19);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx,cy,2,0,TAU); ctx.fill();
    }, aiming);
    iconBtn('rld', bx, H-210, R, (cx,cy)=>{
      ctx.beginPath(); ctx.arc(cx,cy,13,0.5,Math.PI*1.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx+9,cy-10); ctx.lineTo(cx+13,cy-4); ctx.lineTo(cx+6,cy-5); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx,cy,13,Math.PI+0.5,Math.PI*2.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx-9,cy+10); ctx.lineTo(cx-13,cy+4); ctx.lineTo(cx-6,cy+5); ctx.stroke();
    }, player.reloadEnd>now);
    if(perks.dash){
      iconBtn('dsh', bx, H-302, R, (cx,cy)=>{
        ctx.beginPath(); ctx.moveTo(cx-12,cy); ctx.lineTo(cx+5,cy); ctx.lineTo(cx-1,cy-6);
        ctx.moveTo(cx+5,cy); ctx.lineTo(cx-1,cy+6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx+7,cy-7); ctx.lineTo(cx+13,cy); ctx.lineTo(cx+7,cy+7); ctx.stroke();
      }, now<(dashReadyT||0));
    }

    // --- top-right icon row: melee ability, utility, and carried medkit ---
    const rY=124, rR=30;
    let rx=W-14-rR;
    // FIST — activate the equipped melee's special in every playable mode.
    iconBtn('f', rx, rY, rR, (cx,cy)=>{
      ctx.lineWidth=2.2;
      ctx.strokeRect(cx-9,cy-8,18,11);                 // fist block
      ctx.beginPath();
      for(let i=0;i<4;i++){ const fx=cx-7+i*4.6; ctx.moveTo(fx,cy-8); ctx.lineTo(fx,cy-11); }
      ctx.moveTo(cx-9,cy+3); ctx.lineTo(cx-9,cy+8); ctx.lineTo(cx+3,cy+8); // thumb/wrist
      ctx.stroke();
    }, !!(loadout.melee&&((loadout.melee==='terafists'&&teraHitCharge<teraHitsRequired())||now<(abilityCD[loadout.melee]||0))));
    rx-=rR*2+10;
    // GRENADE — utility (G), only when one is equipped
    if(loadout.utility){
      iconBtn('g', rx, rY, rR, (cx,cy)=>{
        ctx.beginPath(); ctx.arc(cx,cy+3,9,0,TAU); ctx.stroke();      // body
        ctx.strokeRect(cx-4,cy-11,8,5);                               // top cap
        ctx.beginPath(); ctx.moveTo(cx+5,cy-9); ctx.lineTo(cx+10,cy-13); ctx.stroke(); // pin
      }, utilityOut);
      rx-=rR*2+10;
    }
    // Stashed world medkits are usable with every loadout. Arena never has
    // campaign drops, so keep that mode's already-busy controls unchanged.
    if(practiceMode!=='arena'){
      iconBtn('med', rx, rY, rR, (cx,cy)=>{
        ctx.fillRect(cx-11,cy-3,22,6); ctx.fillRect(cx-3,cy-11,6,22);
        ctx.font='700 8px ui-monospace,Consolas,monospace'; ctx.textAlign='center';
        ctx.fillText('MED '+medStash,cx,cy+18); ctx.textAlign='left';
      }, false);
    }

    // top-right HP + ammo panel (below the icon row)
    const pw2=150, pxp=W-pw2-14, pyp=rY+rR+12;
    ctx.fillStyle='rgba(8,10,5,0.55)'; ctx.fillRect(pxp,pyp,pw2,54);
    ctx.strokeStyle='#4a4634'; ctx.strokeRect(pxp+0.5,pyp+0.5,pw2,54);
    ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace'; ctx.textAlign='left';
    ctx.fillText('HP', pxp+8, pyp+7);
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(pxp+30,pyp+6,pw2-40,9);
    ctx.fillStyle = player.hp>perks.maxhp*0.35 ? '#a7c15e' : '#d05548';
    ctx.fillRect(pxp+30,pyp+6,(pw2-40)*clamp(player.hp/perks.maxhp,0,1),9);
    const wq=WEAPONS[player.cur];
    ctx.fillStyle='#cdd6b0'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    let atxt;
    if(utilityOut) atxt = loadout.utility==='medkit' ? (medKillCharge>=medKillsRequired()?'MEDKIT READY':(medKillsRequired()-medKillCharge)+' KILLS') : (now<utilReadyT?'RECHARGING':'READY');
    else if(wq.saw) atxt = sawLock?'RECHARGING':'FUEL '+Math.ceil(sawFuel)+'%';
    else if(wq.melee) atxt='MELEE';
    else atxt = player.reloadEnd>now ? 'RELOADING' : ((isFinite(player.mags[player.cur])?player.mags[player.cur]:'\u221E')+' / '+(isFinite(player.reserve[player.cur])?player.reserve[player.cur]:'\u221E'));
    ctx.fillText(atxt, pxp+8, pyp+26);
    ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText((utilityOut?UTILITIES[loadout.utility].name:wq.name), pxp+8, pyp+42);
  }

  // minimap
  const miniDuel=isArenaMapBattlefield(), miniBounds=activeArenaBounds();
  const mapLeft=miniDuel?miniBounds.left:0, mapTop=miniDuel?miniBounds.top:0;
  const mapRight=miniDuel?miniBounds.right:WORLD.w, mapBottom=miniDuel?miniBounds.bottom:WORLD.h;
  const mapW=mapRight-mapLeft, mapH=mapBottom-mapTop;
  const compactMini=miniDuel&&(touchUI||W<600);
  const mmW=compactMini?100:150, mmH=mmW*mapH/mapW, mmX=compactMini?pad:W-pad-mmW, mmY=pad+42;
  ctx.fillStyle='rgba(8,10,5,0.75)'; ctx.fillRect(mmX,mmY,mmW,mmH);
  ctx.strokeStyle='#4a4634'; ctx.strokeRect(mmX+0.5,mmY+0.5,mmW,mmH);
  const sx=mmW/mapW, sy=mmH/mapH;
  ctx.fillStyle='#33332a';
  for(const o of activeObstacles()) ctx.fillRect(mmX+(o.x-mapLeft)*sx,mmY+(o.y-mapTop)*sy,Math.max(2,o.w*sx),Math.max(2,o.h*sy));
  for(const e of enemies){
    ctx.fillStyle=ETYPES[e.type].col;
    const ms = ETYPES[e.type].boss ? 6 : 3;
    ctx.fillRect(mmX+(e.x-mapLeft)*sx-ms/2,mmY+(e.y-mapTop)*sy-ms/2,ms,ms);
  }
  ctx.fillStyle='#a7c15e';
  ctx.fillRect(mmX+(player.x-mapLeft)*sx-2,mmY+(player.y-mapTop)*sy-2,4,4);
  ctx.strokeStyle='rgba(232,182,88,0.5)';
  const rawVw=W/zoom*sx, rawVh=H/zoom*sy;
  const vw=Math.min(mmW,rawVw), vh=Math.min(mmH,rawVh);
  const viewX=clamp(mmX+(cam.x-mapLeft)*sx-vw/2,mmX,mmX+mmW-vw);
  const viewY=clamp(mmY+(cam.y-mapTop)*sy-vh/2,mmY,mmY+mmH-vh);
  ctx.save();ctx.beginPath();ctx.rect(mmX,mmY,mmW,mmH);ctx.clip();
  ctx.strokeRect(viewX,viewY,vw,vh);ctx.restore();

  // boss bar
  const bossE = enemies.find(e=>ETYPES[e.type].boss);
  if(bossE){
    const bw2=Math.min(420,W*0.4), bx=W/2-bw2/2, by=16;
    ctx.textAlign='center';
    const nb=enemies.filter(e=>ETYPES[e.type].boss).length;
    ctx.fillStyle='#c23a3a'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.fillText(nb>1 ? 'WARLORD  (\u00d7'+nb+')' : 'WARLORD', W/2, by-2);
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(bx,by+13,bw2,10);
    ctx.fillStyle='#c23a3a'; ctx.fillRect(bx,by+13,bw2*Math.max(0,bossE.hp/bossE.maxhp),10);
    ctx.strokeStyle='#4a4634'; ctx.strokeRect(bx+0.5,by+13.5,bw2,10);
    ctx.textAlign='left';
  }

  // wave banner
  if(now<waveMsgT){
    const a=Math.min(1,(waveMsgT-now)/500);
    ctx.globalAlpha=a;
    ctx.textAlign='center';
    ctx.fillStyle='#e8b658'; ctx.font='700 '+(isBotArena()&&H<430?26:42)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(waveMsg, W/2, H*0.2);
    ctx.globalAlpha=1;
  }

  ctx.textAlign='left';
}

function drawUnscopedSniperKillCelebration(){
  const fx=unscopedSniperCelebration;
  if(!fx||now>=fx.until)return;
  const age=Math.max(0,now-fx.startAt),left=Math.max(0,fx.until-now);
  const enter=clamp(age/180,0,1),exit=clamp(left/420,0,1),alpha=Math.min(enter,exit);
  const y=clamp(H*0.17,72,112),spread=72+18*Math.sin(Math.min(1,age/500)*Math.PI);
  ctx.save();ctx.globalAlpha=alpha;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.strokeStyle='#ffe08a';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(W/2-spread-52,y);ctx.lineTo(W/2-spread,y);ctx.lineTo(W/2-spread+13,y-9);
  ctx.moveTo(W/2+spread+52,y);ctx.lineTo(W/2+spread,y);ctx.lineTo(W/2+spread-13,y-9);ctx.stroke();
  ctx.fillStyle='rgba(12,14,8,.72)';ctx.fillRect(W/2-92,y-18,184,36);
  ctx.strokeStyle='rgba(255,224,138,.65)';ctx.strokeRect(W/2-91.5,y-17.5,183,35);
  ctx.fillStyle='#ffe08a';ctx.font='900 20px ui-monospace,Consolas,monospace';ctx.fillText('NO-SCOPE!',W/2,y-3);
  ctx.fillStyle='#fff4cf';ctx.font='700 8px ui-monospace,Consolas,monospace';ctx.fillText('AWM ELIMINATION',W/2,y+11);
  ctx.restore();
}
