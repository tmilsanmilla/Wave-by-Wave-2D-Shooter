"use strict";

/* ---------------- helpers ---------------- */
function screenToWorld(sx,sy){
  return { x: cam.x + (sx - W/2)/zoom, y: cam.y + (sy - H/2)/zoom };
}
function worldToScreen(wx,wy){
  return { x: (wx-cam.x)*zoom+W/2, y: (wy-cam.y)*zoom+H/2 };
}
function centerCameraOnPlayer(){
  if(!player||!Number.isFinite(+player.x)||!Number.isFinite(+player.y))return false;
  cam.x=+player.x;cam.y=+player.y;return true;
}
function swayScreen(){
  const w = WEAPONS[player.cur];
  const s = aiming ? (w.scoped ? 1 : 0.35) : 0;
  return {
    x: (Math.sin(now*0.0011)*10 + Math.sin(now*0.0027)*5) * s,
    y: (Math.cos(now*0.0009)*8  + Math.sin(now*0.0023)*4) * s,
  };
}
function aimAngle(){
  const sw = swayScreen();
  const t = screenToWorld(mouse.x + sw.x, mouse.y + sw.y);
  return Math.atan2(t.y - player.y, t.x - player.x);
}
function effSpread(){
  const w = WEAPONS[player.cur];
  let base = (aiming ? w.aimSpread : w.spread) * wm(player.cur).spread;
  // revolver: low accuracy while moving or fanning the hammer
  if(w.fan){
    const moving = now-(player.moveT||0) < 140;
    if(moving || fanShots>0 || now<fanBurstUntil) base += 0.13;
  }
  return (base + player.bloom * (aiming ? 0.3 : 1)) * perks.acc;
}
function dmgMul(b){
  let mul=1;
  if(b.dist>b.rng){
    const t=Math.min(1,(b.dist-b.rng)/b.rng);   // linear falloff from range to 2x range
    mul=1-(1-b.fall)*t;
  }
  if(Number.isFinite(+b.closeRange)&&b.dist<=+b.closeRange) mul*=Number.isFinite(+b.closeMult)?+b.closeMult:1;
  return mul;
}
function addShake(m){
  if(practiceMode==='arena') return;                      // keep online fights clear and inexpensive
  shakeMag = Math.min(18, shakeMag + m);
}
function clearCameraShake(){
  shakeMag=0; shakeX=0; shakeY=0;
}
const DAMAGE_SUM_RESET_MS=1500, DAMAGE_SUM_FADE_MS=350;
// Floating damage feedback is one rolling total per target. Every outgoing
// damage type joins the same white/yellow sum; incoming HP loss keeps its own
// red sum. A 1.5-second gap ends the streak and the next hit starts from zero.
function addDamageNumber(target,amount,crit=false,mergeMs=55,mergeKey='direct',incoming=false){
  const dmg=Math.max(0,+amount||0); if(!target||!dmg) return 0;
  const incomingHit=!!incoming;
  let recent=null;
  for(let i=damageNumbers.length-1;i>=0;i--){
    const n=damageNumbers[i];
    if(n.target!==target||!!n.incoming!==incomingHit) continue;
    const idle=now-(Number.isFinite(+n.lastAt)?+n.lastAt:+n.createdAt||0);
    if(!recent&&idle>=0&&idle<DAMAGE_SUM_RESET_MS) recent=n;
    else if(idle>=DAMAGE_SUM_RESET_MS) damageNumbers.splice(i,1);
  }
  if(recent){
    recent.amount+=dmg; recent.life=recent.max; recent.lastAt=now;
    recent.x=+target.x||0; recent.y=(+target.y||0)-(target.r||15)-7;
    recent.crit=recent.crit||!!crit; recent.mergeKey=String(mergeKey||'direct');
    return dmg;
  }
  const seq=damageNumbers.length%3;
  damageNumbers.push({target,amount:dmg,x:(+target.x||0)+(seq-1)*5,
    y:(+target.y||0)-(target.r||15)-7,vy:-0.28,life:DAMAGE_SUM_RESET_MS,max:DAMAGE_SUM_RESET_MS,
    createdAt:now,lastAt:now,mergeKey:String(mergeKey||'direct'),crit:!!crit,incoming:incomingHit});
  if(damageNumbers.length>64) damageNumbers.splice(0,damageNumbers.length-64);
  return dmg;
}
function damageEnemy(e,amount,options={}){
  if(!e) return 0;
  const dmg=Math.max(0,+amount||0), before=Math.max(0,+e.hp||0); if(!dmg||!before) return 0;
  const dealt=Math.min(before,dmg);
  e.hp-=dmg;
  addDamageNumber(e,dealt,!!options.crit,Number.isFinite(+options.mergeMs)?+options.mergeMs:55,options.kind||'direct');
  return dealt;
}
const UNSCOPED_SNIPER_CELEBRATION_MS=1800, UNSCOPED_SNIPER_CONFIRM_MAX=200;
// The caller must prove this exact shot moved a live target to zero. Capturing
// scope state on the projectile keeps weapon swaps and late impacts honest.
function triggerUnscopedSniperKillCelebration(beforeHp,afterHp,source={}){
  const before=+beforeHp,after=+afterHp;
  if(!(before>0&&after<=0)||!source||source.weapon!=='sniper'||source.unscopedShot!==true)return false;
  if(!unscopedSniperCelebration||typeof unscopedSniperCelebration!=='object')
    unscopedSniperCelebration={startAt:0,until:0,serial:0,seen:new Set()};
  if(!(unscopedSniperCelebration.seen instanceof Set))unscopedSniperCelebration.seen=new Set();
  const confirmationId=String(source.confirmationId||'').slice(0,160);
  if(confirmationId&&unscopedSniperCelebration.seen.has(confirmationId))return false;
  if(confirmationId){
    unscopedSniperCelebration.seen.add(confirmationId);
    if(unscopedSniperCelebration.seen.size>UNSCOPED_SNIPER_CONFIRM_MAX)
      unscopedSniperCelebration.seen=new Set([...unscopedSniperCelebration.seen].slice(-100));
  }
  unscopedSniperCelebration.startAt=now;
  unscopedSniperCelebration.until=now+UNSCOPED_SNIPER_CELEBRATION_MS;
  unscopedSniperCelebration.serial=(unscopedSniperCelebration.serial||0)+1;
  if(typeof burst==='function'&&player&&Number.isFinite(+player.x)&&Number.isFinite(+player.y))
    burst(player.x,player.y,'#ffe08a',18,5.5);
  return true;
}
// One authoritative hook for local HP loss. It reports only the HP that was
// actually removed, so armor, lethal overkill, and repeated network state
// packets can never inflate the red incoming-damage number.
function damagePlayerHp(amount,options={}){
  const dmg=Math.max(0,+amount||0), before=Math.max(0,+player.hp||0); if(!dmg||!before) return 0;
  const dealt=Math.min(before,dmg);
  player.hp=Math.max(0,before-dmg);
  addDamageNumber(player,dealt,false,Number.isFinite(+options.mergeMs)?+options.mergeMs:55,options.kind||'incoming',true);
  return dealt;
}
function tickDamageNumbers(dtms){
  const dt=dtms/16.667;
  for(let i=damageNumbers.length-1;i>=0;i--){
    const n=damageNumbers[i]; n.life-=dtms; n.y+=n.vy*dt;
    if(n.life<=0) damageNumbers.splice(i,1);
  }
}
function drawDamageNumbers(){
  if(!damageNumbers.length) return;
  ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='800 '+(15/zoom)+'px ui-monospace,Consolas,monospace';
  for(const n of damageNumbers){
    ctx.globalAlpha=clamp(n.life/DAMAGE_SUM_FADE_MS,0,1);
    ctx.lineWidth=3/zoom; ctx.strokeStyle='rgba(8,10,5,0.9)';
    const label=n.amount.toFixed(1);
    if(typeof ctx.strokeText==='function') ctx.strokeText(label,n.x,n.y);
    ctx.fillStyle=n.incoming?'#ff766d':(n.crit?'#ffe08a':'#ffffff'); ctx.fillText(label,n.x,n.y);
  }
  ctx.globalAlpha=1; ctx.restore();
}
function collideRects(e){
  for(const o of activeObstacles()){
    const cx = clamp(e.x, o.x, o.x+o.w), cy = clamp(e.y, o.y, o.y+o.h);
    let dx=e.x-cx, dy=e.y-cy;
    const d2 = dx*dx+dy*dy;
    if(d2 < e.r*e.r){
      if(d2===0){ e.y = o.y - e.r; continue; }
      const d = Math.sqrt(d2), push = (e.r-d)/d;
      e.x += dx*push; e.y += dy*push;
    }
  }
}
function pointInRects(x,y){
  for(const o of activeObstacles())
    if(x>=o.x && x<=o.x+o.w && y>=o.y && y<=o.y+o.h) return true;
  return false;
}
// Returns true only when a projectile must stop or ricochet. A phase-enabled
// slug spends one charge on wall entry, remains intangible inside that same
// wall, and rearms ordinary collision only after it has exited the geometry.
// Arena fences and TNT are handled before this helper and are never bypassed.
function projectileHitsSolidWall(b){
  const inside=pointInRects(b.x,b.y);
  if(!inside){ b.phaseWallActive=false; return false; }
  if(b.phaseWallActive) return false;
  if(Number.isFinite(+b.phaseWalls)&&b.phaseWalls>0){
    b.phaseWalls=Math.max(0,Math.floor(+b.phaseWalls)-1);
    b.phaseWallActive=true;
    return false;
  }
  return true;
}
// true if a wall blocks the straight line from (x0,y0) to (x1,y1)
function losBlocked(x0,y0,x1,y1){
  const dx=x1-x0, dy=y1-y0, d=Math.hypot(dx,dy);
  const steps=Math.max(2, Math.ceil(d/12));
  for(let i=1;i<steps;i++){
    const t=i/steps;
    if(pointInRects(x0+dx*t, y0+dy*t)) return true;
  }
  return false;
}
function burst(x,y,col,n,pow){
  if(practiceMode==='arena') n=Math.min(n,2);             // Arena favors readable hits over particle storms
  for(let i=0;i<n;i++){
    const a=rand(0,TAU), s=rand(0.5,pow);
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(280,520),max:520,col,size:rand(1.5,3.5)});
  }
}

/* ---------------- game flow ---------------- */
function cancelFanTheHammer(clearLock=false){
  fanShots=0; fanNextT=0;
  if(clearLock) fanBurstUntil=0;
}
function resetWeaponGimmickState(){
  weaponLastShotAt=Object.create(null);
  cancelFanTheHammer(true);
}
function startGame(){
  if(typeof requireResolvedUsernameForGameplay==='function'&&!requireResolvedUsernameForGameplay()) return false;
  resetHeldGameplayInput();
  resetWeaponGimmickState();
  clearCameraShake();
  selPage='hub';
  perks={dmg:1,rate:1,reload:1,mag:1,range:1,spd:1,maxhp:100,pierce:0,acc:1,velo:1,dash:0,autoAll:0,surge:0,secondWind:0,crit:0,noBloom:0,explode:0,medkitHeal:25,armor:1};
  perkCounts={}; upgradeOffered=false; upgradeChoices=[]; wmods={}; utilMods={}; bossBounty=false;
  surgeT=0; windReadyWave=0; dashReadyT=0; sawFuel=100; sawLock=false; player.lastSaw=0;
  flameFuel=100; flameLock=false; daggersOut=null; splitBalls=[]; flames=[]; comboStep=0; comboNextT=0; freezeFx=[];
  timeStopUntil=0; timeStopArm=0; fistFlurryUntil=0; fistNextT=0; teraHitCharge=teraHitsRequired(); parryUntil=0; parrySeq=0;
  sawChargeUntil=0; sawChargeTick=0; abilityCD={}; quickReadyT=0; player.dashSpd=14; player.spinT=0; player.animT=0;
  utilReadyT=0; medChan=0; medChanHeal=0; medKillCharge=medKillsRequired(); medDropKillAcc=0; medStash=0; balls=[]; grenades=[]; pearls=[]; utilityOut=false;
  player.dashUntil=0; player.regenT=0; player.ddx=0; player.ddy=0; player.swingDur=130;
  player.x=WORLD.w/2; player.y=WORLD.h/2; player.hp=perks.maxhp;
  player.cur=loadout.primary;
  player.mags={};
  // early access to next season's set is for trying it out, not for setting records
  unrankedRun = [loadout.primary, loadout.secondary, loadout.melee, loadout.utility]
                  .some(k => k && FALL_KEYS.includes(k));
  // WAR HAMMER in the loadout buffs the entire kit
  if(loadout.melee==='hammer' && WEAPONS.hammer && WEAPONS.hammer.kitBuff){
    perks.reload*=0.70; perks.dmg*=1.05; perks.range*=1.05;
  }
  for(const k of WKEYS) player.mags[k]=magSize(k);
  player.reserve={};
  for(const k of WKEYS) player.reserve[k] = (WEAPONS[k].melee || WEAPONS[k].energy || WEAPONS[k].infinite) ? Infinity : magSize(k)*5;
  player.reloadEnd=0; player.equipEnd=now+EQUIP_WAIT; player.lastShot=0;
  player.bloom=0; player.hurtCd=0; player.hurtFlash=0;
  aiming=false; rmbAim=false;
  bullets=[]; ebullets=[]; enemies=[]; particles=[]; pickups=[]; damageNumbers=[]; spawnQueue=[];
  wave=0; score=0; kills=0; betweenTimer=1400; prevBest=hiScore;
  practiceMode=null; practiceSpawns=[];
  powerUsed={}; invincUntil=0; waveSkipPending=0; coinTimeAcc=0; killCoinAcc=0; waveCoinBank=0;
  coinTrickles=[]; coinTricklePopT=0; chestRewardOpen=null; powerMenuOpen=false; respawnPromptT=0;
  adminOpen=false; adminUsed = testMode ? true : false;
  cam.x=player.x; cam.y=player.y; zoom=1;
  state='play';
  goFullscreen();
}
function goFullscreen(){
  try{
    const el=document.documentElement;
    if(!document.fullscreenElement){
      (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen || function(){}).call(el);
    }
  }catch(e){}
}
function bossComposition(w){
  // capped counts per type: red<=15, blue<=7, yellow<=3, purple<=1
  // introduction schedule: red @5, blue @15, yellow @20, purple @30 -> all four by wave 30
  const idx=w/5;
  const red    = Math.min(15, Math.ceil(idx*0.8));
  const blue   = w>=15 ? Math.min(7, Math.max(1, idx-2)) : 0;
  const yellow = w>=20 ? Math.min(3, Math.max(1, Math.floor((idx-3)/2))) : 0;
  const purple = w>=30 ? 1 : 0;                      // KING boss: 1 per wave from wave 30 on
  return {boss:red, bossBlue:blue, bossYellow:yellow, bossPurple:purple};
}
function nextWave(){
  wave++;
  const bossWave = wave%5===0;
  waveMsg = bossWave ? 'WAVE '+wave+' \u2014 WARLORDS INBOUND' : 'WAVE '+wave;
  waveMsgT=now+2200;
  sfx('wave');
  const count = bossWave ? Math.min(10, 3+wave) : Math.min(26, 4 + wave*2);
  const normals=[];
  for(let i=0;i<count;i++){
    let pool=['grunt'];
    if(wave>=2) pool.push('runner','runner');
    if(wave>=3) pool.push('gunner');
    if(wave>=4) pool.push('brute');
    if(wave>=5) pool.push('gunner','runner');
    if(wave>=8) pool.push('seeker');
    if(wave>=12) pool.push('seeker');
    if(wave>=20) pool.push('arty');
    if(wave>=26) pool.push('arty');
    normals.push(pool[(Math.random()*pool.length)|0]);
  }
  if(!bossWave){ for(const n of normals) spawnQueue.push(n); return; }
  // boss wave: interleave bosses ~2 at a time between chunks of normals so they stack up slowly
  const comp=bossComposition(wave);
  const bossList=[];
  for(const k in comp) for(let i=0;i<comp[k];i++) bossList.push(k);
  // shuffle bosses so types mix, but keep purple last (the king arrives at the end)
  bossList.sort(()=>Math.random()-0.5);
  const ki=bossList.indexOf('bossPurple');
  if(ki>=0){ bossList.splice(ki,1); bossList.push('bossPurple'); }
  const pairs=Math.ceil(bossList.length/2);
  const chunk=Math.max(1, Math.floor(normals.length/(pairs+1)));
  let ni=0;
  for(let pIdx=0; pIdx<pairs; pIdx++){
    for(let c=0;c<chunk && ni<normals.length;c++) spawnQueue.push(normals[ni++]);
    spawnQueue.push(bossList[pIdx*2]);
    if(bossList[pIdx*2+1]) spawnQueue.push(bossList[pIdx*2+1]);
  }
  while(ni<normals.length) spawnQueue.push(normals[ni++]);
}
function spawnOne(type){
  let x,y,tries=0;
  do{
    const side=(Math.random()*4)|0;
    if(side===0){ x=rand(60,WORLD.w-60); y=50; }
    else if(side===1){ x=rand(60,WORLD.w-60); y=WORLD.h-50; }
    else if(side===2){ x=50; y=rand(60,WORLD.h-60); }
    else { x=WORLD.w-50; y=rand(60,WORLD.h-60); }
    tries++;
  } while(dist2(x,y,player.x,player.y) < 550*550 && tries<12);
  const t=ETYPES[type], hpMul=(1+(wave-1)*0.047)*DIFFS[diffMode].hp;
  enemies.push({ type, x, y, r:t.r, hp:t.hp*hpMul, maxhp:t.hp*hpMul,
                 spd:t.spd*rand(0.9,1.1), fireT:now+rand(400,1400), hitT:0,
                 burnUntil:0, burnActiveUntil:0, fleeUntil:0, frozenUntil:0,
                 deflectNext:now+8000, deflectUntil:0, chargeNext:now+18000, chargeUntil:0, chargeGo:0, stunUntil:0, chronoStacks:0,
                 mode:'chase', modeT:0, ringT:now+2500, dashT:now+5500, streamT:now+1500, missileT:now+3000, cvx:0, cvy:0, dragUntil:0 });
}
function spawnPracticeEnemy(sp, id){
  const t=ETYPES[sp.type], hpMul=DIFFS[diffMode].hp;      // baseline (wave-1) strength
  enemies.push({ type:sp.type, x:sp.x, y:sp.y, r:t.r, hp:t.hp*hpMul, maxhp:t.hp*hpMul,
                 spd:t.spd, fireT:now+rand(400,1400), hitT:0,
                 burnUntil:0, burnActiveUntil:0, fleeUntil:0, frozenUntil:0,
                 deflectNext:now+8000, deflectUntil:0, chargeNext:now+18000, chargeUntil:0, chargeGo:0, stunUntil:0, chronoStacks:0,
                 mode:'chase', modeT:0, ringT:now+2500, dashT:now+5500, streamT:now+1500, missileT:now+3000,
                 cvx:0, cvy:0, dragUntil:0, spawnId:id, practiceStill:sp.still });
  sp.alive=true;
  burst(sp.x, sp.y, '#8d949c', 8, 3);
}
let tryLoadoutBackup=null, tryBorrowedWeaponKey=null, tryBorrowedUtilityKey=null;
let practicePickOpen=false, practicePickKey=null, practicePickRects=[], soloPractice=false, practiceReturnPage='practice';
const PRACTICE_MODES=[
  {id:'range', name:'SHOOTING RANGE', d:'one of every enemy \u00b7 they stand still'},
  {id:'dps',   name:'DPS DUMMY',      d:'measure your damage per second'},
  {id:'boss',  name:'WARLORD',        d:'fight a boss one on one'},
];
function openPracticePick(k, returnPage=selPage){
  practicePickKey=k; practiceReturnPage=String(returnPage||selPage||'practice'); practicePickOpen=true;
}
function drawPracticePick(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(400,W-24), ph=Math.min(300,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0a0c07'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  const def=WEAPONS[practicePickKey]||VAULT_WEAPONS[practicePickKey]||UTILITIES[practicePickKey]||VAULT_UTILITIES[practicePickKey]||{};
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#cfe0a8'; ctx.font='700 16px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('\uD83C\uDFAF '+(def.name||practicePickKey), pw-24), W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText('you will carry this weapon only \u00b7 pick a mode', W/2, py+42);
  practicePickRects=[];
  const x0=px+16, rw=pw-32; let y=py+56;
  for(const m of PRACTICE_MODES){
    const h=44;
    practicePickRects.push({x:x0,y,w:rw,h,id:'m:'+m.id});
    const hv=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+h;
    ctx.fillStyle=hv?'rgba(167,193,94,0.32)':'rgba(167,193,94,0.12)'; ctx.fillRect(x0,y,rw,h);
    ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#cfe0a8'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(m.name, rw-16), W/2, y+h/2-8);
    ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(m.d, rw-16), W/2, y+h/2+9);
    ctx.textBaseline='alphabetic';
    y+=h+8;
  }
  const cbw=Math.min(140,pw-40), cbh=26, cbx=W/2-cbw/2, cby=py+ph-36;
  practicePickRects.push({x:cbx,y:cby,w:cbw,h:cbh,id:'cancel'});
  const chv=mouse.x>=cbx&&mouse.x<=cbx+cbw&&mouse.y>=cby&&mouse.y<=cby+cbh;
  ctx.fillStyle=chv?'#d05548':'rgba(208,85,72,0.14)'; ctx.fillRect(cbx,cby,cbw,cbh);
  ctx.strokeStyle='#d05548'; ctx.lineWidth=1; ctx.strokeRect(cbx+0.5,cby+0.5,cbw,cbh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=chv?'#101208':'#e0a8a0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText('CANCEL', W/2, cby+cbh/2);
  ctx.textAlign='left'; ctx.textBaseline='top';
}
function practicePickClick(){
  for(const r of practicePickRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      const id=String(r.id||'');
      if(id==='cancel'){ practicePickOpen=false; sfx('swap'); return; }
      if(id.indexOf('m:')===0){ practicePickOpen=false; tryWeaponOnRange(practicePickKey, id.slice(2)); return; }
      return;
    }
  }
}
function tryWeaponOnRange(k, mode){
  const w=WEAPONS[k]||VAULT_WEAPONS[k], isUtil=UTILKEYS.includes(k)||TEMP_UTILITY.includes(k)||VAULT_UTILITIES[k];
  if(!w && !isUtil) return;
  tryLoadoutBackup={primary:loadout.primary, secondary:loadout.secondary, melee:loadout.melee, utility:loadout.utility};
  tryBorrowedWeaponKey=null; tryBorrowedUtilityKey=null;
  if(!WEAPONS[k] && VAULT_WEAPONS[k]){ WEAPONS[k]=VAULT_WEAPONS[k]; tryBorrowedWeaponKey=k; } // borrow it for the range only
  if(isUtil && !UTILITIES[k] && VAULT_UTILITIES[k]){ UTILITIES[k]=VAULT_UTILITIES[k]; tryBorrowedUtilityKey=k; }
  if(isUtil) loadout.utility=k;
  else if(PRIMARIES.includes(k)||TEMP_PRIMARY.includes(k)||VAULT_SLOTS[k]==='primary') loadout.primary=k;
  else if(SECONDARIES.includes(k)||TEMP_SECONDARY.includes(k)||VAULT_SLOTS[k]==='secondary') loadout.secondary=k;
  else loadout.melee=k;
  // practising a single weapon means carrying ONLY that weapon
  if(isUtil){ loadout.primary=null; loadout.secondary=null; loadout.melee=null; }
  else if(loadout.primary===k){ loadout.secondary=null; loadout.melee=null; loadout.utility=null; }
  else if(loadout.secondary===k){ loadout.primary=null; loadout.melee=null; loadout.utility=null; }
  else { loadout.primary=null; loadout.secondary=null; loadout.utility=null; }
  soloPractice=true;
  if(!isUtil) tryStartWeapon=k;
  sfx('swap');
  if(startPractice(mode||'range')===false) restoreTryLoadout();
}
let tryStartWeapon=null;
function restoreTryLoadout(){
  soloPractice=false;
  if(tryLoadoutBackup)
    loadout={primary:tryLoadoutBackup.primary, secondary:tryLoadoutBackup.secondary,
             melee:tryLoadoutBackup.melee, utility:tryLoadoutBackup.utility};
  if(tryBorrowedWeaponKey&&WEAPONS[tryBorrowedWeaponKey]===VAULT_WEAPONS[tryBorrowedWeaponKey]) delete WEAPONS[tryBorrowedWeaponKey];
  if(tryBorrowedUtilityKey&&UTILITIES[tryBorrowedUtilityKey]===VAULT_UTILITIES[tryBorrowedUtilityKey]) delete UTILITIES[tryBorrowedUtilityKey];
  tryLoadoutBackup=null; tryStartWeapon=null; tryBorrowedWeaponKey=null; tryBorrowedUtilityKey=null; practiceReturnPage='practice';
}
function startPractice(mode){
  // fill any empty loadout slots so practice always has working weapons,
  // except when practising one weapon on its own
  if(!soloPractice){
    if(!loadout.primary)   loadout.primary='smg';
    if(!loadout.secondary) loadout.secondary='m9';
    if(!loadout.melee)     loadout.melee='knife';
  }
  if(startGame()===false) return false;
  practiceMode=mode; practiceSpawns=[]; dpsLog=[]; dpsPrevHp=0; dpsTotal=0; dpsStart=0;
  // Per-card Practice deliberately clears the other loadout slots. Always
  // select the requested weapon (including melee), or keep a safe hidden gun
  // under a utility and put that utility in hand immediately.
  if(tryStartWeapon){
    player.cur=tryStartWeapon; player.equipEnd=0;
    // Vault/shop previews can be borrowed after WKEYS was built, so startGame
    // has never created their magazine or reserve entries.
    player.mags[tryStartWeapon]=magSize(tryStartWeapon);
    player.reserve[tryStartWeapon]=Infinity;
  }
  else if(soloPractice && loadout.utility){ player.cur='m9'; player.equipEnd=0; utilityOut=true; }
  for(const k of WKEYS) player.reserve[k]=Infinity;       // endless ammo on the range
  const cx=WORLD.w/2, cy=WORLD.h/2;
  player.x=cx-380; player.y=cy; cam.x=player.x; cam.y=player.y;
  if(mode==='range'){
    const TYPES=['grunt','runner','brute','gunner','seeker','arty'];
    TYPES.forEach((tp,i)=> practiceSpawns.push({type:tp, x:cx+40+(i%3)*150, y:cy-150+Math.floor(i/3)*300, still:true, alive:false, respawnAt:0}));
    waveMsg='SHOOTING RANGE \u2014 targets respawn in 3s'; waveMsgT=now+3000;
  } else if(mode==='dps'){
    practiceSpawns.push({type:'dummy', x:cx+60, y:cy, still:true, alive:false, respawnAt:0});
    waveMsg='DPS DUMMY \u2014 integrity never breaks'; waveMsgT=now+3000;
  } else if(mode==='boss'){
    practiceSpawns.push({type:'boss',       x:cx+300, y:cy-260, still:false, alive:false, respawnAt:0});
    practiceSpawns.push({type:'bossBlue',   x:cx+300, y:cy+260, still:false, alive:false, respawnAt:0});
    practiceSpawns.push({type:'bossYellow', x:cx+520, y:cy-260, still:false, alive:false, respawnAt:0});
    practiceSpawns.push({type:'bossPurple', x:cx+520, y:cy+260, still:false, alive:false, respawnAt:0});
    waveMsg='WARLORD PRACTICE \u2014 you respawn on death'; waveMsgT=now+3200;
  }
  for(let i=0;i<practiceSpawns.length;i++) spawnPracticeEnemy(practiceSpawns[i], i);
  return true;
}
