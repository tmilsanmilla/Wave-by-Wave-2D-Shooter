"use strict";

/* ---------------- render: screens ---------------- */
function statBar(x,y,w,label,frac,col){
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.textAlign='left'; ctx.fillText(label,x,y-12);
  ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(x,y,w,6);
  ctx.fillStyle=col; ctx.fillRect(x,y,w*clamp(frac,0.06,1),6);
}
function drawGunIcon(x,y,key,col,sc){
  ctx.save(); ctx.translate(x,y); if(sc&&sc!==1) ctx.scale(sc,sc); ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=3; ctx.lineCap='round';
  ctx.beginPath();
  if(key==='m9'){ ctx.moveTo(-16,0); ctx.lineTo(14,0); ctx.moveTo(-8,0); ctx.lineTo(-11,12); }
  else if(key==='g18'){ ctx.moveTo(-15,0); ctx.lineTo(13,0); ctx.moveTo(-7,0); ctx.lineTo(-9,14); ctx.moveTo(-2,0); ctx.lineTo(-2,8); }
  else if(key==='revolver'){ ctx.moveTo(-14,0); ctx.lineTo(16,0); ctx.moveTo(-6,0); ctx.lineTo(-9,12); ctx.moveTo(1,2); ctx.arc(-3,2,4,0,TAU); }
  else if(key==='volt'){ ctx.moveTo(-15,2); ctx.lineTo(13,2); ctx.moveTo(-7,2); ctx.lineTo(-10,13); ctx.moveTo(6,-2); ctx.arc(2,-4,4,0,TAU); ctx.moveTo(9,-8); ctx.lineTo(12,-11); }
  else if(key==='chainsaw'){ ctx.moveTo(-16,3); ctx.lineTo(-6,3); ctx.moveTo(-6,-2); ctx.lineTo(16,-2); ctx.lineTo(16,4); ctx.lineTo(-6,4); ctx.moveTo(-2,4); ctx.lineTo(0,7); ctx.moveTo(4,4); ctx.lineTo(6,7); ctx.moveTo(10,4); ctx.lineTo(12,7); }
  else if(key==='knife'){ ctx.moveTo(-14,5); ctx.lineTo(-4,5); ctx.moveTo(-4,1); ctx.lineTo(-4,9); ctx.moveTo(-4,5); ctx.lineTo(15,5); ctx.lineTo(8,0); }
  else if(key==='scythe'){ ctx.moveTo(-13,15); ctx.lineTo(7,-9); ctx.moveTo(15,-2); ctx.arc(6,-4,9,0.3,3.0); }
  else if(key==='hammer'){ ctx.moveTo(-14,12); ctx.lineTo(5,-5); ctx.moveTo(2,-13); ctx.rect(2,-13,13,13); }
  else if(key==='twinsai'){ ctx.moveTo(-16,10); ctx.lineTo(10,-12); ctx.moveTo(-10,-12); ctx.lineTo(16,10); ctx.moveTo(-13,-9); ctx.lineTo(-6,-9); ctx.moveTo(13,-9); ctx.lineTo(6,-9); }
  else if(key==='dart'){ ctx.moveTo(-15,2); ctx.lineTo(13,2); ctx.moveTo(-7,2); ctx.lineTo(-10,12); ctx.moveTo(13,2); ctx.lineTo(9,-1); ctx.moveTo(13,2); ctx.lineTo(9,5); }
  else if(key==='ar'){ ctx.moveTo(-24,0); ctx.lineTo(24,0); ctx.moveTo(-4,0); ctx.lineTo(-6,12); ctx.moveTo(-14,0); ctx.lineTo(-16,8); ctx.moveTo(10,0); ctx.lineTo(10,-5); }
  else if(key==='smg'){ ctx.moveTo(-20,0); ctx.lineTo(18,0); ctx.moveTo(-6,0); ctx.lineTo(-6,12); ctx.moveTo(-16,0); ctx.lineTo(-18,9); }
  else if(key==='shotgun'){ ctx.moveTo(-24,0); ctx.lineTo(24,0); ctx.moveTo(-24,4); ctx.lineTo(2,4); ctx.moveTo(-16,4); ctx.lineTo(-19,13); }
  else if(key==='solarrifle'){
    // long barrel
    ctx.moveTo(-16,1); ctx.lineTo(14,1);
    ctx.moveTo(-8,1); ctx.lineTo(-11,11);              // grip
    // solar core = a little sun with rays near the receiver
    ctx.moveTo(-4,1); ctx.arc(-6,1,3,0,TAU);
    for(let s=0;s<8;s++){ const a=s/8*TAU; ctx.moveTo(-6+Math.cos(a)*4,1+Math.sin(a)*4); ctx.lineTo(-6+Math.cos(a)*6.5,1+Math.sin(a)*6.5); }
  }
  else if(key==='warpwave'){
    ctx.moveTo(-16,0);
    for(let i=1;i<=8;i++) ctx.lineTo(-16+i*4, Math.sin(i/8*Math.PI*2)*6);
    ctx.moveTo(-9,7); ctx.lineTo(-12,13);
  }
  else if(key==='timeturner'){
    ctx.moveTo(-7,-10); ctx.lineTo(7,-10); ctx.lineTo(-7,10); ctx.lineTo(7,10); ctx.closePath();
    ctx.moveTo(0,0); ctx.lineTo(0,4);
  }
  else if(key==='terafists'){
    ctx.moveTo(-12,-8); ctx.lineTo(-2,-8); ctx.lineTo(-2,0); ctx.lineTo(-12,0); ctx.closePath();
    ctx.moveTo(2,2); ctx.lineTo(12,2); ctx.lineTo(12,10); ctx.lineTo(2,10); ctx.closePath();
  }
  else if(key==='timecapsule'){
    ctx.arc(0,0,10,0,TAU);
    ctx.moveTo(0,0); ctx.lineTo(0,-6);
    ctx.moveTo(0,0); ctx.lineTo(4,2);
  }
  else if(key==='fireworks'){ ctx.moveTo(-12,10); ctx.lineTo(4,-6); ctx.moveTo(4,-6); ctx.lineTo(2,-12); ctx.moveTo(4,-6); ctx.lineTo(10,-10); ctx.moveTo(4,-6); ctx.lineTo(10,-2); ctx.moveTo(4,-6); ctx.lineTo(-1,-11); }
  else if(key==='bdaggers'){ ctx.moveTo(-14,-6); ctx.lineTo(4,-6); ctx.lineTo(-2,-10); ctx.moveTo(-14,6); ctx.lineTo(4,6); ctx.lineTo(-2,2); }
  else { ctx.moveTo(-30,0); ctx.lineTo(30,0); ctx.moveTo(-12,0); ctx.lineTo(-15,12); ctx.moveTo(2,-2); ctx.arc(6,-6,5,Math.PI*0.75,Math.PI*2.1); }
  ctx.stroke(); ctx.restore();
}
function liveUtilityCopy(k,u){
  if(k==='grenade'){
    const radius=typeof fragBlastRadius==='function'?fragBlastRadius():Math.max(1,+u.range||85),
      damage=typeof fragDamageAtDistance==='function'?fragDamageAtDistance(0):Math.max(0,+u.dmg||300);
    return 'A compact '+radius+'-radius timed blast deals up to '+damage+
      ' damage at its center, then falls to zero at its edge.';
  }
  return u&&u.gimmick&&u.gimmick.copy?String(u.gimmick.copy):String(u&&u.blurb||'');
}
function weaponDetails(k){
  const rows=[];
  // Keep this formatter local: several lightweight UI paths evaluate the
  // details renderer by itself, and gimmick copy should never be an optional
  // external dependency.
  const addGimmick=(def,copy)=>{
    const gimmick=def&&def.gimmick;
    const text=copy===undefined?(gimmick&&gimmick.copy):copy;
    if(text) rows.push(['GIMMICK',String(text)]);
  };
  if(isLocked(k)){
    const shop=GEM_SHOP.find(it=>it.key===k);
    const shopPublished=shop&&(typeof isWeaponPublished!=='function'||isWeaponPublished(k));
    rows.push(['ACCESS',FALL_KEYS.includes(k)?'\u{1F512} ADMIN TEST MODE ONLY':shop
      ? shopPublished?'BUY IN SHOP \u00b7 \uD83D\uDC8E '+shop.cost:'\u{1F512} NOT CURRENTLY LIVE'
      : '\u{1F512} SIGN IN TO UNLOCK']);
  }
  if(FALL_KEYS.includes(k)) rows.push(['\uD83C\uDF42 NEXT SEASON','admins \u00b7 Test Mode/editor only']);
  const slot=typeof storedLoadoutSlot==='function'?storedLoadoutSlot(k):(VAULT_SLOTS[k]||null);
  if(slot==='utility'||UTILKEYS.includes(k)||TEMP_UTILITY.includes(k)){
    const u=UTILITIES[k]||VAULT_UTILITIES[k];
    addGimmick(u,k==='grenade'?liveUtilityCopy(k,u):undefined);
    rows.push(['RECHARGE',k==='medkit' ? medKillsRequired()+' enemy kills' : (u.cd/1000)+'s']);
    if(k==='medkit') rows.push(['QUICK HEAL','G / utility RMB \u00b7 5% max HP over 1s'],['CHANNEL HEAL','equip + LMB \u00b7 20% max HP over 8s'],
      ['HEAL PENALTY','-10% move speed'],['INTERRUPTED BY','taking damage or switching'],['CHARGES','one ready at a time']);
    if(k==='grenade'){
      const radius=typeof fragBlastRadius==='function'?fragBlastRadius():Math.max(1,+u.range||85),
        damage=typeof fragDamageAtDistance==='function'?fragDamageAtDistance(0):Math.max(0,+u.dmg||300),
        bossDamage=typeof fragDamageAtDistance==='function'?fragDamageAtDistance(0,true):damage*0.6;
      rows.push(['DAMAGE','up to '+damage+' at center'],['VS BOSS','up to '+bossDamage],
        ['BLAST RADIUS',''+radius],['FALLOFF','50% halfway · 0 at edge'],['FUSE','0.95s'],['THROW SPEED','14']);
    }
    if(k==='portal') rows.push(['EFFECT','teleport to crosshair'],['I-FRAMES','0.35s']);
    if(k==='timecapsule') rows.push(['\uD83C\uDF42 FALL','coming update'],['EFFECT','enemies & their shots at 25% speed'],
      ['ON CAST','clears every enemy projectile'],['DURATION','15s, ends if you move'],['RECHARGE',''+u.cd/1000+'s']);
    if(k==='freezer') rows.push(['EFFECT','throw a moving ice charge'],['BLAST RADIUS',''+u.radius],
      ['FUSE',''+Math.round(u.fuseMs/10)/100+'s'],['THROW SPEED',''+u.speed],['FREEZE TIME',''+Math.round(u.freezeMs/100)/10+'s'],
      ['WALLS','stop the charge and shield the blast'],['SELF RISK','your blast can freeze you'],
      ['WHILE FROZEN','take half damage, can\u0027t move'],['ON HIT','first hit thaws'],['RECHARGE',''+u.cd/1000+'s']);
    if(k==='redball') rows.push(['LIFETIME','3s'],['TAUNT RADIUS','750'],
      ['CONTACT DMG','8 per 0.28s'],['LURES','all enemies incl. shooters'],['BOSSES','immune to taunt']);
    if(k==='beachball') rows.push(['\uD83D\uDD25 SUMMER','temporary'],['EFFECT','enemies FLEE it'],
      ['CONTACT DMG','8 base + burn'],['BURN','ignites on touch'],['LIFETIME','3s'],
      ['SPLITS','every 1s into 2, 3 generations'],['CHILD DMG','halves each split']);
    return rows;
  }
  const w=WEAPONS[k]||VAULT_WEAPONS[k];
  addGimmick(w);
  if(w.solar){
    rows.push(['\uD83D\uDD25 SEASONAL','temporary'],['TYPE','bouncing solar bolt'],
      ['DAMAGE',''+w.dmg+' \u00b7 pierces '+w.pierce],['BOUNCES',''+w.bounce+' off walls'],
      ['ON HIT','ignites (burn DoT)'],['RANGE','infinite'],['AMMO','infinite (\u221E reserve)'],
      ['FIRE RATE','slow ('+(w.fireRate/1000).toFixed(1)+'s)'],['RELOAD',(w.reload/1000).toFixed(1)+'s'],
      ['SPREAD','wide '+(w.spread*57.3).toFixed(0)+'\u00b0'],['MOVE SPEED',Math.round(w.moveMod*100)+'%']);
    return rows;
  }
  if(w.wave){
    rows.push(['\uD83C\uDF42 FALL','coming update'],['TYPE','sine-wave bolts \u00b7 wave breathes'],
      ['BATTERY',w.mag+' cells \u00b7 +'+w.cellRegen+'/s after '+(w.cellDelay/1000)+'s idle'],
      ['DAMAGE',''+w.dmg+' \u00b7 pierce '+w.pierce],['FIRE','full-auto \u00b7 no reload \u00b7 \u221E ammo'],
      ['E: WARP STUN','stuns radius 160 for 2s \u00b7 full dmg \u00b7 18s cd'],
      ['RANGE',''+w.range],['MOVE SPEED',Math.round(w.moveMod*100)+'%']);
    return rows;
  }
  if(w.chrono){
    rows.push(['\uD83C\uDF42 FALL','coming update'],['TYPE','time-drag rounds'],
      ['ON HIT','-20% speed per hit \u00b7 stacks (max 8) \u00b7 1.8s window'],['DAMAGE',''+w.dmg],
      ['E: TIME DRAG','+4 slow stacks to all in radius 160 \u00b7 3s \u00b7 12s cd'],
      ['MOVE SPEED',Math.round(w.moveMod*100)+'%'],
      ['CHAMBER',''+w.mag],['RANGE',''+w.range]);
    return rows;
  }
  if(w.firework){
    rows.push(['\uD83D\uDD25 SUMMER','temporary'],['TYPE','explosive + burn'],
      ['BLAST DMG','up to 180 (110 boss)'],['BURN','ignites on blast'],
      ['CHAMBER',''+w.mag+' firecrackers'],['RELOAD',(w.reload/1000).toFixed(1)+'s'],['RANGE',''+w.range]);
    return rows;
  }
  if(w.melee){
    rows.push(['DAMAGE',''+w.dmg],
      ['SWING RATE',(1000/w.fireRate).toFixed(2)+'/s  ('+w.fireRate+'ms)'],
      ['DPS',''+Math.round(w.dmg*1000/w.fireRate)],
      ['RANGE',''+w.range],
      ['ARC',Math.round(w.arc*57.3)+'\u00b0'],
      ['MOVE SPEED',Math.round(w.moveMod*100)+'%']);
    if(w.fire) rows.push(['\uD83D\uDD25 SUMMER','temporary'],['ON HIT','ignites (burn DoT)']);
    if(w.saw) rows.push(['FUEL DRAIN','5% per tick (~2.6s/tank)'],
      ['RECHARGE','7%/s idle \u00b7 lockout when empty']);
    const ab={chainsaw:['E / F / MELEE RMB: RIP','0.4s shred \u00b7 NO LUNGE \u00b7 42/90ms \u00b7 i-frames \u00b7 16s'],
              knife:['E / F / MELEE RMB: EXECUTE','kills ALL in range, 90% boss \u00b7 rng 70 \u00b7 4.8s'],
              terafists:['E / F / MELEE RMB: FLURRY','1.6s punches \u00b7 lifesteal \u00b7 recharge with '+TERA_HITS_REQUIRED+' normal hits'],
              scythe:['E / F / MELEE RMB: DASH','far dash + 2\u00d7 cleave \u00b7 i-frames \u00b7 9.6s'],
              hammer:['E / F / MELEE RMB: SLAM','110 dmg \u00b7 radius 160 \u00b7 8s'],
              twinsai:['E / F / MELEE RMB: PARRY','stop firing first \u00b7 cannot attack during 1s guard \u00b7 reflects every shot toward crosshair \u00b7 returns the shot\'s damage 1:1 \u00b7 2.5s cd after guard'],
              bdaggers:['E / F / MELEE RMB: HURL','throw both \u00b7 return in 1.5s \u00b7 ignite']}[k];
    if(ab) rows.push(ab);
    return rows;
  }
  const shot=w.dmg*w.pellets;
  rows.push(['DAMAGE', w.pellets>1 ? w.dmg+' \u00d7 '+w.pellets+' = '+shot : ''+w.dmg],
    ['FIRE RATE',(1000/w.fireRate).toFixed(1)+'/s  ('+w.fireRate+'ms)'],
    ['DPS',''+Math.round(shot*1000/w.fireRate)],
    ['MAG',''+w.mag],
    ['RESERVE', w.cell ? 'recharges' : w.energy ? '\u221E' : (w.mag*5)+'  (5 mags)'],
    ['RELOAD',(w.reload/1000).toFixed(2)+'s'],
    ['RANGE', w.range>2000 ? 'no falloff' : w.range+' \u2192 '+Math.round(w.fall*100)+'% floor at '+w.range*2],
    ['SPREAD',(w.spread*57.3).toFixed(1)+'\u00b0 hip \u00b7 '+(w.aimSpread*57.3).toFixed(1)+'\u00b0 aimed'],
    ['BULLET SPEED',Number(((WEAPONS[k]?weaponBulletSpeed(k):(w.speed||0)*weaponBulletSpeedMul(k))).toFixed(2))+'  (boosted)'],
    ['FIRE MODE', w.auto ? 'full-auto' : 'semi-auto'],
    ['SCOPE ZOOM', w.zoom+'\u00d7'+(w.scoped?' (full scope)':'')],
    ['MOVE SPEED',Math.round(w.moveMod*100)+'%']);
  if(w.pierce) rows.push(['PIERCE',w.pierce+' enemies']);
  if(w.poison) rows.push(['POISON','stacks (max 8) \u00b7 4/s per stack \u00b7 4s each hit refreshes']);
  return rows;
}
function drawDetail(){
  if(!detailKey) return;
  const k=detailKey, slot=typeof storedLoadoutSlot==='function'?storedLoadoutSlot(k):(VAULT_SLOTS[k]||null), isU=slot==='utility';
  const def=isU?(UTILITIES[k]||VAULT_UTILITIES[k]):(WEAPONS[k]||VAULT_WEAPONS[k]);
  if(!def){ detailKey=null; return; }
  const rows=weaponDetails(k);
  ctx.fillStyle='rgba(8,9,5,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(470, W-24), headHt=H<430?76:96;
  const rowH=Math.max(11,Math.min(19,Math.floor((H-24-headHt-16)/Math.max(1,rows.length))));
  const ph=headHt+rows.length*rowH+16;
  const px=W/2-pw/2, py=Math.max(16, H/2-ph/2);
  const closeSize=touchUI?36:32,close={x:px+pw-closeSize-10,y:py+10,w:closeSize,h:closeSize};
  detailRects={panel:{x:px,y:py,w:pw,h:ph},close};
  ctx.fillStyle='#101208'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#4a4634'; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  const cls = slot==='primary'?'PRIMARY':slot==='secondary'?'SIDEARM':slot==='melee'?'MELEE':'UTILITY';
  ctx.textAlign='left';
  ctx.fillStyle='#e8b658'; ctx.font='700 '+(H<430?15:18)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(def.name, Math.max(40,close.x-(px+20)-8)), px+20, py+14);
  ctx.fillStyle=ROLECOL[cls]||'#8a9268'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText(cls, px+20, py+(H<430?32:36));
  // close X
  const hc=mouse.x>=close.x&&mouse.x<=close.x+close.w&&mouse.y>=close.y&&mouse.y<=close.y+close.h;
  ctx.save();
  ctx.fillStyle=hc?'#e8b658':'rgba(0,0,0,0.4)';
  ctx.fillRect(close.x,close.y,close.w,close.h);
  ctx.strokeStyle='#4a4634';ctx.strokeRect(close.x+0.5,close.y+0.5,close.w-1,close.h-1);
  ctx.fillStyle=hc?'#101208':'#8a9268';ctx.font='700 '+(touchUI?15:13)+'px ui-monospace,Consolas,monospace';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('\u2715',close.x+close.w/2,close.y+close.h/2);
  ctx.restore();
  // description
  ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#8a9268'; ctx.font=(H<430?'8':'10')+'px ui-monospace,Consolas,monospace';
  wrapTextClamped(def.blurb, px+20, py+(H<430?46:52), pw-40, H<430?10:13, H<430?2:3); // left-aligned inside the panel
  ctx.strokeStyle='rgba(74,70,52,0.7)';
  ctx.beginPath(); ctx.moveTo(px+16,py+headHt-8); ctx.lineTo(px+pw-16,py+headHt-8); ctx.stroke();
  // stat rows
  for(let i=0;i<rows.length;i++){
    const ry=py+headHt+ i*rowH;
    if(i%2===0){ ctx.fillStyle='rgba(255,255,255,0.025)'; ctx.fillRect(px+12,ry-2,pw-24,rowH); }
    ctx.textAlign='left';  ctx.fillStyle='#8a9268'; ctx.font=(rowH<15?'8':'10')+'px ui-monospace,Consolas,monospace';
    const valW=Math.max(60,(pw-44)*0.52);
    ctx.fillText(fitLine(rows[i][0], pw-44-valW), px+22, ry);
    ctx.textAlign='right'; ctx.fillStyle='#e8d9a8'; ctx.font='700 '+(rowH<15?'8':'11')+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(''+rows[i][1], valW), px+pw-22, ry);
  }
  ctx.textAlign='left';
}
const ROLECOL={PRIMARY:'#e8b658', SIDEARM:'#a7c15e', MELEE:'#8fb3c9', UTILITY:'#c98fb8'};
function selBg(){
  ctx.textBaseline='top';
  ctx.fillStyle='#101208'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(140,160,90,0.05)'; ctx.lineWidth=1;
  ctx.beginPath();
  for(let x=0;x<W;x+=80){ ctx.moveTo(x,0); ctx.lineTo(x,H); }
  for(let y=0;y<H;y+=80){ ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();
  ctx.textAlign='left';
  if(W>=460){                                   // on wide enough screens only (avoids crowding the title on phones)
    ctx.fillStyle='#8a9268'; ctx.font='700 13px ui-monospace,Consolas,monospace';
    ctx.fillText('BEST '+hiScore, 18, 18);
  }
}
let banPageRects=[];
function drawBanPage(){                               // banned from playing: a page of its own
  banPageRects=[];
  ctx.fillStyle='#0b0705'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(208,85,72,0.10)'; ctx.lineWidth=1;
  ctx.beginPath();
  for(let x=0;x<W;x+=80){ ctx.moveTo(x,0); ctx.lineTo(x,H); }
  for(let y=0;y<H;y+=80){ ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();
  const pw=Math.min(460,W-28), px=W/2-pw/2;
  let y=Math.max(40, H*0.16);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#d05548'; ctx.font='700 '+(W<420?26:34)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('ACCESS BLOCKED', W/2, y); y+=30;
  const sc=banScopes();
  const what = sc.includes('device') && !sc.includes('account') ? 'This device is banned'
             : sc.includes('account') ? 'This account is banned' : 'You are banned';
  ctx.fillStyle='#e0a8a0'; ctx.font='700 12px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(what, pw-20), W/2, y); y+=22;
  ctx.fillStyle='#8a9268'; ctx.font='11px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(myBan.until? ('until '+String(myBan.until).slice(0,10)) : 'permanently', pw-20), W/2, y); y+=26;
  if(myBan.note){
    ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText('REASON', W/2, y); y+=14;
    ctx.fillStyle='#cdd6b0'; ctx.font='11px ui-monospace,Consolas,monospace';
    wrapTextClamped(myBan.note, W/2, y, pw-40, 14, 3); y+=14*Math.min(3,Math.ceil(myBan.note.length/48))+16;
  }
  // appeal
  const bw=Math.min(240,pw-40), bh=36, bx=W/2-bw/2;
  if(appealSent){
    ctx.fillStyle='#a7c15e'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText('appeal sent \u2014 an admin will review it', W/2, y+22); y+=44;
  } else {
    banPageRects.push({x:bx,y,w:bw,h:bh,id:'appeal'});
    const hv=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=y&&mouse.y<=y+bh;
    ctx.fillStyle=hv?'#e8b658':'rgba(232,182,88,0.16)'; ctx.fillRect(bx,y,bw,bh);
    ctx.strokeStyle='#e8b658'; ctx.lineWidth=1.5; ctx.strokeRect(bx+0.5,y+0.5,bw,bh);
    ctx.textBaseline='middle';
    ctx.fillStyle=hv?'#101208':'#e8b658'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.fillText('\u2696 APPEAL THIS BAN', W/2, y+bh/2);
    ctx.textBaseline='alphabetic';
    y+=bh+10;
  }
  // sign out, so a device ban does not trap the account
  const sw=Math.min(160,pw-40), sh=26, sx=W/2-sw/2;
  banPageRects.push({x:sx,y,w:sw,h:sh,id:'signout'});
  const shv=mouse.x>=sx&&mouse.x<=sx+sw&&mouse.y>=y&&mouse.y<=y+sh;
  ctx.fillStyle=shv?'rgba(255,255,255,0.14)':'rgba(255,255,255,0.05)'; ctx.fillRect(sx,y,sw,sh);
  ctx.strokeStyle='#5a5648'; ctx.lineWidth=1; ctx.strokeRect(sx+0.5,y+0.5,sw,sh);
  ctx.textBaseline='middle';
  ctx.fillStyle='#cdd6b0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText(authUser?'SIGN OUT':'SIGN IN', W/2, y+sh/2);
  ctx.textBaseline='alphabetic'; y+=sh+16;
  ctx.fillStyle='#5a5648'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('practice and the shop stay closed while this is active', pw-20), W/2, y);
  ctx.textAlign='left';
}
function banPageClick(){
  for(const r of banPageRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.id==='appeal'){ openAppeal(); sfx('swap'); return; }
      if(r.id==='signout'){ if(authUser)requestSignOut('ban');else toggleAuth(); sfx('swap'); return; }
      return;
    }
  }
}
function drawBanNotice(){
  if(!myBan) return;
  const t=banBlurb()+(banBlocksPlay()?'':'  (you can still play)');
  const flash = now<banMsgT;
  const bw=Math.min(560,W-40), bx=W/2-bw/2, by=H-52, bh=34;
  ctx.fillStyle=flash?'rgba(208,85,72,0.42)':'rgba(208,85,72,0.18)'; ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle='#d05548'; ctx.lineWidth=flash?2.5:1.5; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=flash?'#ffd9d2':'#e0a8a0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(t, bw-20), W/2, by+bh/2);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function drawSelect(){
  layoutRects=[];                                         // one registry per frame
  cardRects=[]; detailBtns=[]; catBtns=[]; modeRects=[]; homePlayRects=[]; weaponBrowserRects=[]; socialRects=[]; partyRects=[]; partyModeRects=[]; toolsRects=[]; rankedRects=[]; leaderboardRowRects=[]; modeBoardActionRects=[]; offlineCpuRects=[]; backRect=null;
  adLeftRect=null; adRightRect=null; editHubBtnRect=null; boardPanelRect=null;
  adminHubBtnRect=null; suggestionsHubBtnRect=null; updatesHubBtnRect=null; adminsHubBtnRect=null; msgsHubBtnRect=null; archHubBtnRect=null; lookupBtnRect=null; playersHubBtnRect=null; streakBtnRect=null; wheelBtnRect=null; promoBtnRect=null; shareBtnRect=null;
  // page-scoped hit regions: clear them on every frame so a page you LEFT can never
  // swallow a click meant for the page you are on (stale shop/practice/feed buttons)
  shopRects=[]; shopTabRects=[]; shopWeaponPickerRects=[]; practiceRects=[]; arenaRects=[]; feedXRects=[];
  pendingCancelRect=null;
  tutBtnRect=null; settingsBtnRect=null; shopBtnRect=null; toolsBtnRect=null; pracBtnRect=null; arenaBtnRect=null; tempBtnRect=null; deployRect=null;
  if(typeof socialSetDomPageActive==='function')
    socialSetDomPageActive(selPage==='social'&&!banBlocksPlay()&&!dailyGateOpen&&!firstAccountWelcomeOpen&&!signUpPromptOpen);
  if(banBlocksPlay()){ drawBanPage(); return; }      // blocked accounts see only the ban page
  if(dailyGateOpen){ drawDailyGate(); return; }      // collect before anything else
  if(firstAccountWelcomeOpen){ drawFirstAccountWelcome(); return; }
  if(signUpPromptOpen){ drawSignUpPrompt(); return; }
  if(selPage==='hub') drawHub(); else if(selPage==='weapons') drawWeaponsHome(); else if(selPage==='weaponbrowse') drawWeaponBrowser(); else if(selPage==='modes') drawModes(); else if(selPage==='modeboard') drawModeLeaderboard(); else if(selPage==='offlinecpu') drawOfflineCpuModes(); else if(selPage==='ranked') drawRanked(); else if(selPage==='loadout') drawLoadout(); else if(selPage==='social') drawSocial(); else if(selPage==='party') drawParty(); else if(selPage==='partymodes') drawPartyModes(); else if(selPage==='tools') drawTools(); else if(selPage==='howto') drawHowTo(); else if(selPage==='tutorial') drawTutorial(); else if(selPage==='shop') drawShop(); else if(selPage==='practice') drawPractice(); else if(selPage==='arena') drawArena(); else drawCategory(selPage);
  drawDetail();
  ctx.fillStyle='#e8d9a8'; ctx.beginPath(); ctx.arc(mouse.x,mouse.y,3,0,TAU); ctx.fill();
  ctx.textAlign='left';
}
function slotFor(cat){ const c=CATS.find(c=>c[0]===cat); return c ? c[1] : 'primary'; }
let howToRects=[];
// ---- INTERACTIVE TUTORIAL: learn by doing, with the real HUD visible throughout ----
// Counters are cumulative for the session, while tutStepBase snapshots them at
// the start of every drill. Inputs made during an earlier lesson therefore
// cannot instantly complete a later one (especially important on touch, where
// aiming also fires).
let tutorialOn=false, tutStep=0, tutDone=false, tutStartPos=null, tutFired=0, tutKilled=0,
    tutReloaded=false, tutReloadCount=0, tutSwapped=false, tutSwapCount=0,
    tutMeleeUsed=false, tutMeleeUseCount=0, tutMeleeSwingCount=0,
    tutScopeSeen=false, tutScopeHeldMs=0, tutScopeLastT=0, tutUtilityEquipCount=0, tutUtilityUseCount=0,
    tutAmmoCollected=0, tutMedCollected=0, tutMedUsed=0, tutMoveDistance=0,
    tutLastPos=null, tutAimTargets=new Set(), tutRects=[], tutStepT=0, tutStepBase={},
    tutorialLoadoutBackup=null;
const TUT_STEPS=[
  {id:'move', title:'KEEP MOVING',
   how:'WASD  \u00b7  touch: drag the left movement stick',
   why:'Move for a full drill. Standing still makes you an easy target.',
   watch:'movement: {n}/90 steps'},
  {id:'aim', title:'TRACK THREE TARGETS',
   how:'point the crosshair at three different outlined targets',
   why:'Mouse aims freely. On touch, press and drag on the battlefield.',
   watch:'targets aimed at: {n}/3'},
  {id:'scope', title:'AIM / SCOPE YOUR PRIMARY',
   how:'hold right mouse or press E  \u00b7  touch: tap the crosshair button',
   why:'With a gun out, RMB scopes. G casts a utility, so quick-cast never steals scope.',
   watch:'scope held: {scope}'},
  {id:'shoot', title:'MAGAZINE AMMO',
   how:'fire 12 rounds into the targets',
   why:'HUD: left number = rounds in the magazine; right number = finite reserve ammo.',
   watch:'rounds fired: {n}/12'},
  {id:'reload', title:'RELOAD BEFORE EMPTY',
   how:'press R  \u00b7  touch: tap the reload icon, then wait',
   why:'Reloading moves rounds from reserve into the magazine. Reserve ammo is not infinite.',
   watch:'completed reloads: {n}/1'},
  {id:'shoot-again', title:'FIRE AND RELOAD AGAIN',
   how:'fire 12 more rounds, then reload one more time',
   why:'Practise the full fire/reload cycle now, before enemies fight back.',
   watch:'rounds {shots}/12  \u00b7  reloads {reloads}/1'},
  {id:'ammo', title:'COLLECT AN AMMO CRATE',
   how:'walk over the outlined gold crate',
   why:'Ammo crates refill weapon reserves. They stay on the ground until you collect them.',
   watch:'ammo crates collected: {n}/1'},
  {id:'swap', title:'SWAP WEAPONS THREE TIMES',
   how:'press Q or 1 / 2  \u00b7  touch: tap a numbered slot at the top-left',
   why:'Every weapon has its own magazine and reserve. Swap when one runs low.',
   watch:'successful swaps: {n}/3'},
  {id:'kill', title:'ELIMINATE THREE TARGETS',
   how:'aim, fire, reload, and keep moving',
   why:'Put the controls together. Range targets respawn after three seconds.',
   watch:'targets eliminated: {n}/3'},
  {id:'melee', title:'QUICK MELEE',
   how:'press F from any weapon  \u00b7  touch: tap the fist',
   why:'Quick melee briefly uses your equipped melee ability, then returns to your current weapon.',
   watch:'successful quick melees: {n}/1'},
  {id:'utility', title:'EQUIP AND USE A UTILITY',
   how:'press 4 to equip the grenade, then RMB  \u00b7  G quick-casts it from any weapon',
   why:'RMB uses a utility only while it is visibly in hand. Casual online 1v1 allows utilities; CPU and ranked modes do not.',
   watch:'equipped: {equipped}  \u00b7  cast: {cast}'},
  {id:'med-pickup', title:'STORE A DROPPED MEDKIT',
   how:'watch the outlined white-and-red medkit fly to you',
   why:'Dropped medkits auto-collect into your stash, even at full health. The stash holds up to 15.',
   watch:'medkits stored: {n}/1'},
  {id:'med-use', title:'USE A STASHED MEDKIT',
   how:'press H  \u00b7  touch: tap MED',
   why:'Use a stashed medkit whenever you are hurt. Picking one up does not heal automatically.',
   watch:'stashed medkits used: {n}/1'},
];
function tutorialCounterSnapshot(){
  return {fired:tutFired,killed:tutKilled,reloads:tutReloadCount,swaps:tutSwapCount,
    melee:tutMeleeUseCount,swings:tutMeleeSwingCount,utilityEquip:tutUtilityEquipCount,
    utilityUse:tutUtilityUseCount,ammo:tutAmmoCollected,
    med:tutMedCollected,medUsed:tutMedUsed};
}
function tutorialDelta(key){ return Math.max(0,(tutorialCounterSnapshot()[key]||0)-(tutStepBase[key]||0)); }
function tutorialRecordReloadCompleted(){ if(!tutorialOn) return; tutReloaded=true; tutReloadCount++; }
function tutorialRecordWeaponSwitch(){ if(!tutorialOn) return; tutSwapped=true; tutSwapCount++; }
function tutorialRecordMeleeSwing(){ if(tutorialOn) tutMeleeSwingCount++; }
function tutorialRecordMeleeAbility(){ if(!tutorialOn) return; tutMeleeUsed=true; tutMeleeUseCount++; }
function tutorialRecordUtilityEquipped(){ if(tutorialOn) tutUtilityEquipCount++; }
function tutorialRecordUtilityUsed(){ if(tutorialOn) tutUtilityUseCount++; }
function tutorialRecordAmmoCollected(){ if(tutorialOn) tutAmmoCollected++; }
function tutorialRecordMedkitCollected(){ if(tutorialOn) tutMedCollected++; }
function tutorialRecordMedkitUsed(){ if(tutorialOn) tutMedUsed++; }
function tutorialRestoreLoadout(){
  if(!tutorialLoadoutBackup) return;
  loadout={primary:tutorialLoadoutBackup.primary,secondary:tutorialLoadoutBackup.secondary,
    melee:tutorialLoadoutBackup.melee,utility:tutorialLoadoutBackup.utility};
  utilityOut=false;aiming=false;rmbAim=false;
  tutorialLoadoutBackup=null;
  if(typeof dropUnownedFromLoadout==='function')dropUnownedFromLoadout();
}
function tutorialSpawnPickup(type){
  for(let i=pickups.length-1;i>=0;i--) if(pickups[i].tutorialPickup) pickups.splice(i,1);
  const offsets=[[105,58],[-105,58],[105,-58],[-105,-58],[0,125],[0,-125]];
  let x=player.x,y=player.y;
  for(const [dx,dy] of offsets){
    const tx=clamp(player.x+dx,30,WORLD.w-30),ty=clamp(player.y+dy,30,WORLD.h-30);
    if(Math.hypot(tx-player.x,ty-player.y)<55) continue;
    if(typeof pointInRects==='function'&&pointInRects(tx,ty)) continue;
    x=tx;y=ty;break;
  }
  if(type==='med'&&typeof collectDroppedMedkit==='function') collectDroppedMedkit(x,y);
  else pickups.push({x,y,type,tutorialPickup:true});
}
function tutorialPlaceAbilityTarget(){
  let target=enemies.find(e=>e&&e.hp>0);
  if(!target){
    const i=practiceSpawns.findIndex(sp=>!sp.alive);
    if(i>=0){ practiceSpawns[i].respawnAt=0; spawnPracticeEnemy(practiceSpawns[i],i); target=enemies[enemies.length-1]; }
  }
  if(target){ target.x=clamp(player.x+48,25,WORLD.w-25); target.y=player.y; target.practiceStill=true; }
}
function tutorialBeginStep(){
  tutStepT=now; tutStepBase=tutorialCounterSnapshot();
  const st=TUT_STEPS[tutStep]; if(!st) return;
  if(st.id==='aim') tutAimTargets=new Set();
  if(st.id==='scope'){
    tutScopeSeen=false;tutScopeHeldMs=0;tutScopeLastT=now;utilityOut=false;aiming=false;rmbAim=false;
    if(loadout.primary&&WEAPONS[loadout.primary])switchWeapon(loadout.primary);
  }
  if(st.id==='ammo') tutorialSpawnPickup('ammo');
  if(st.id==='melee') tutorialPlaceAbilityTarget();
  if(st.id==='utility'){
    utilityOut=false;aiming=false;rmbAim=false;
    if(typeof utilReadyT!=='undefined')utilReadyT=0;
  }
  if(st.id==='med-pickup') tutorialSpawnPickup('med');
  if(st.id==='med-use') player.hp=Math.min(player.hp,perks.maxhp*0.55);
}
function startTutorial(){
  // A new account can sign in from an Offline/Online duel result before the
  // first-login welcome opens. Tear that session down before Practice starts,
  // otherwise its Arena identity and exit routing can leak into the tutorial.
  if(typeof partyCpuSessionOpen==='function'&&partyCpuSessionOpen()){
    if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()) offlineCpu2v2Leave('',true);
    else partyCpuAbort('Party CPU match setup was cancelled for the tutorial.',true);
  } else if(arena&&(practiceMode==='arena'||arena.active||arena.queueChannel||arena.matchChannel)) leaveArena('',true);
  soloPractice=false;
  if(typeof tutorialLoadoutBackup!=='undefined'&&!tutorialLoadoutBackup)
    tutorialLoadoutBackup={primary:loadout.primary,secondary:loadout.secondary,
      melee:loadout.melee,utility:loadout.utility};
  // A known kit makes every lesson available and keeps ammo goals identical
  // for new and returning players. Constrained/offline builds can fall back to
  // their equipped equivalent instead of failing on an unavailable definition.
  const trainingPrimary=typeof WEAPONS!=='undefined'&&WEAPONS.smg?'smg':loadout.primary;
  const trainingSecondary=typeof WEAPONS!=='undefined'&&WEAPONS.m9?'m9':loadout.secondary;
  const trainingMelee=typeof WEAPONS!=='undefined'&&WEAPONS.knife?'knife':loadout.melee;
  const trainingUtility=typeof UTILITIES!=='undefined'&&UTILITIES.grenade?'grenade':loadout.utility;
  loadout={primary:trainingPrimary,secondary:trainingSecondary,melee:trainingMelee,utility:trainingUtility};
  startPractice('range');
  tutorialOn=true; tutStep=0; tutDone=false; tutStepT=now;
  tutFired=0; tutKilled=0; tutReloaded=false; tutReloadCount=0; tutSwapped=false; tutSwapCount=0;
  tutMeleeUsed=false; tutMeleeUseCount=0; tutMeleeSwingCount=0; tutAmmoCollected=0;
  tutScopeSeen=false;tutScopeHeldMs=0;tutScopeLastT=now;tutUtilityEquipCount=0;tutUtilityUseCount=0;
  tutMedCollected=0; tutMedUsed=0; tutMoveDistance=0; tutAimTargets=new Set();
  tutStartPos={x:player.x,y:player.y};
  tutLastPos={x:player.x,y:player.y};
  // Practice normally grants infinite ammunition. Tutorial deliberately uses
  // finite reserves so the two-number HUD and ammo crates have real meaning.
  // Five more reserve magazines than the old two-mag allowance. Together
  // with the loaded magazine, each tutorial gun now starts with eight total.
  player.reserve[loadout.primary]=magSize(loadout.primary)*7;
  player.reserve[loadout.secondary]=magSize(loadout.secondary)*7;
  if(typeof medStash!=='undefined') medStash=0;
  if(typeof medkitFlyFx!=='undefined') medkitFlyFx=[];
  if(typeof tutorialBeginStep==='function') tutorialBeginStep();
  waveMsg=''; waveMsgT=0;
}
function tutorialTeardown(){ tutorialOn=false; tutDone=false; tutorialRestoreLoadout(); }
function endTutorial(){
  tutorialOn=false; tutDone=false;
  practiceMode=null; practiceSpawns=[]; enemies=[]; soloPractice=false;
  tutorialRestoreLoadout();
  restoreTryLoadout();
  state='select'; selPage='howto';
}
function tutMoved(){
  return Math.round(tutMoveDistance/8);
}
function tutorialTrackMovement(){
  if(!tutLastPos){ tutLastPos={x:player.x,y:player.y}; return; }
  const d=Math.hypot(player.x-tutLastPos.x,player.y-tutLastPos.y);
  // Ignore respawns/teleports; this drill is about controlled movement.
  if(d>0&&d<45) tutMoveDistance+=d;
  tutLastPos={x:player.x,y:player.y};
}
function tutorialTrackAim(){
  if(!TUT_STEPS[tutStep]||TUT_STEPS[tutStep].id!=='aim') return;
  const wp=screenToWorld(mouse.x,mouse.y);
  let best=null,bestD=Infinity;
  for(const e of enemies){
    const d=Math.hypot(wp.x-e.x,wp.y-e.y);
    if(d<=e.r+34&&d<bestD){ best=e; bestD=d; }
  }
  if(best) tutAimTargets.add(best.spawnId!=null?'spawn:'+best.spawnId:'type:'+best.type);
}
function tutStepDone(){
  const st=TUT_STEPS[tutStep]; if(!st) return false;
  switch(st.id){
    case 'move':        return tutMoved()>=90;
    case 'aim':         return tutAimTargets.size>=3;
    case 'scope':       return tutScopeSeen;
    case 'shoot':       return tutorialDelta('fired')>=12;
    case 'reload':      return tutorialDelta('reloads')>=1;
    case 'shoot-again': return tutorialDelta('fired')>=12&&tutorialDelta('reloads')>=1;
    case 'ammo':        return tutorialDelta('ammo')>=1;
    case 'swap':        return tutorialDelta('swaps')>=3;
    case 'kill':        return tutorialDelta('killed')>=3;
    case 'melee':       return tutorialDelta('melee')>=1;
    case 'utility':     return tutorialDelta('utilityEquip')>=1&&tutorialDelta('utilityUse')>=1;
    case 'med-pickup':  return tutorialDelta('med')>=1&&now-tutStepT>=650;
    case 'med-use':     return tutorialDelta('medUsed')>=1;
  }
  return false;
}
function tutProgressText(){
  const st=TUT_STEPS[tutStep]; if(!st) return '';
  const n = st.id==='move' ? Math.min(90,tutMoved())
          : st.id==='aim' ? Math.min(3,tutAimTargets.size)
          : st.id==='scope' ? (tutScopeSeen?1:0)
          : st.id==='shoot' ? Math.min(12,tutorialDelta('fired'))
          : st.id==='reload' ? Math.min(1,tutorialDelta('reloads'))
          : st.id==='ammo' ? Math.min(1,tutorialDelta('ammo'))
          : st.id==='swap' ? Math.min(3,tutorialDelta('swaps'))
          : st.id==='kill' ? Math.min(3,tutorialDelta('killed'))
          : st.id==='melee' ? Math.min(1,tutorialDelta('melee'))
          : st.id==='utility' ? Math.min(1,tutorialDelta('utilityUse'))
          : st.id==='med-pickup' ? Math.min(1,tutorialDelta('med'))
          : st.id==='med-use' ? Math.min(1,tutorialDelta('medUsed')) : 0;
  return st.watch.replace('{n}',n)
    .replace('{shots}',Math.min(12,tutorialDelta('fired')))
    .replace('{reloads}',Math.min(1,tutorialDelta('reloads')))
    .replace('{scope}',(Math.min(600,tutScopeHeldMs)/1000).toFixed(1)+'s / 0.6s')
    .replace('{equipped}',tutorialDelta('utilityEquip')>=1?'YES':'NO')
    .replace('{cast}',tutorialDelta('utilityUse')>=1?'YES':'NO');
}
function tutorialAdvanceStep(){
  tutStep++;
  if(tutStep>=TUT_STEPS.length){ tutDone=true; sfx('wave'); }
  else { tutorialBeginStep(); sfx('pickup'); }
}
function tutorialUpdate(){
  if(!tutorialOn || tutDone) return;
  tutorialTrackMovement();
  tutorialTrackAim();
  if(TUT_STEPS[tutStep]&&TUT_STEPS[tutStep].id==='scope'){
    const elapsed=clamp(now-tutScopeLastT,0,100);tutScopeLastT=now;
    if(aiming)tutScopeHeldMs+=elapsed;else tutScopeHeldMs=0;
    if(tutScopeHeldMs>=600)tutScopeSeen=true;
  }
  if(tutStepDone()) tutorialAdvanceStep();
}
function drawTutorialOverlay(){
  if(!tutorialOn) return;
  tutRects=[];
  const pw=Math.min(520,W-24), px=W/2-pw/2, py=12;
  if(tutDone){
    const ph=118;
    ctx.fillStyle='rgba(8,12,6,0.94)'; ctx.fillRect(px,py,pw,ph);
    ctx.strokeStyle='#a7c15e'; ctx.lineWidth=2; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#cfe0a8'; ctx.font='700 18px ui-monospace,Consolas,monospace';
    ctx.fillText('\u2713 THAT IS EVERYTHING', W/2, py+28);
    ctx.fillStyle='#8a9268'; ctx.font='11px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('you can keep practising here, or head back', pw-24), W/2, py+50);
    const bw=Math.min(200,pw/2-16), bh=34, by=py+68;
    const mk=(id,lbl,bx,col)=>{
      tutRects.push({x:bx,y:by,w:bw,h:bh,id});
      const hv=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=by&&mouse.y<=by+bh;
      ctx.fillStyle=hv?col:'rgba(255,255,255,0.06)'; ctx.fillRect(bx,by,bw,bh);
      ctx.strokeStyle=col; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
      ctx.fillStyle=hv?'#101208':'#cdd6b0'; ctx.font='700 12px ui-monospace,Consolas,monospace';
      ctx.fillText(lbl, bx+bw/2, by+bh/2);
    };
    mk('stay','KEEP PRACTISING', W/2-bw-8, '#a7c15e');
    mk('quit','\u2039 BACK',        W/2+8,    '#e8b658');
    ctx.textAlign='left'; ctx.textBaseline='top';
    return;
  }
  const st=TUT_STEPS[tutStep]; if(!st) return;
  const ph=104;
  ctx.fillStyle='rgba(8,12,6,0.92)'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#a7c15e'; ctx.lineWidth=2; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  // step counter
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('REQUIRED DRILL '+(tutStep+1)+' OF '+TUT_STEPS.length,pw-170), W/2, py+16);
  ctx.fillStyle='#cfe0a8'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(st.title, pw-24), W/2, py+34);
  ctx.fillStyle='#e8d9a8'; ctx.font='700 12px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(st.how, pw-24), W/2, py+56);
  ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(st.why, pw-24), W/2, py+74);
  ctx.fillStyle='#a7c15e'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(tutProgressText(), pw-24), W/2, py+92);
  // Every drill is required. The whole tutorial can still be exited.
  const sh=22, qw=64, qx=px+pw-qw-8, qy=py+8;
  tutRects.push({x:qx,y:qy,w:qw,h:sh,id:'quit'});
  const qhv=mouse.x>=qx&&mouse.x<=qx+qw&&mouse.y>=qy&&mouse.y<=qy+sh;
  ctx.fillStyle=qhv?'rgba(208,85,72,0.3)':'rgba(208,85,72,0.12)'; ctx.fillRect(qx,qy,qw,sh);
  ctx.strokeStyle='#d05548'; ctx.strokeRect(qx+0.5,qy+0.5,qw,sh);
  ctx.fillStyle='#e0a8a0'; ctx.fillText('\u2039 QUIT', qx+qw/2, qy+sh/2);
  ctx.textAlign='left'; ctx.textBaseline='top';
  // point at the HUD element this step is about, so they can SEE what changes
  const hint=(x,y,label)=>{
    ctx.save();
    ctx.strokeStyle='#a7c15e'; ctx.lineWidth=2;
    ctx.setLineDash&&ctx.setLineDash([5,4]);
    ctx.strokeRect(x-4,y-4,label.w+8,label.h+8);
    ctx.setLineDash&&ctx.setLineDash([]);
    ctx.restore();
  };
  if(st.id==='shoot'||st.id==='reload'||st.id==='shoot-again'){
    if(touchUI) hint(W-164,166,{w:150,h:54});
    else hint(16,H-92,{w:190,h:56});                                  // the ammo block
  }
  if(st.id==='swap'){
    if(touchUI&&touchWeaponSelectorBounds)
      hint(touchWeaponSelectorBounds.x,touchWeaponSelectorBounds.y,
        {w:touchWeaponSelectorBounds.w,h:touchWeaponSelectorBounds.h}); // live 1–4 selector geometry
    else hint(16,H-142,{w:210,h:22});                                  // the weapon slots
  }
  // Outline required world objects and unvisited aim targets. The ring is
  // screen-space, so it remains readable while the camera follows the player.
  const ringWorld=(o,col)=>{
    const sx=(o.x-cam.x)*zoom+W/2, sy=(o.y-cam.y)*zoom+H/2;
    if(sx<-60||sx>W+60||sy<-60||sy>H+60) return;
    ctx.save(); ctx.strokeStyle=col; ctx.lineWidth=3;
    ctx.setLineDash&&ctx.setLineDash([7,5]);
    ctx.beginPath(); ctx.arc(sx,sy,Math.max(22,(o.r||18)*zoom+12),0,TAU); ctx.stroke();
    ctx.setLineDash&&ctx.setLineDash([]); ctx.restore();
  };
  if(st.id==='aim') for(const e of enemies){
    const key=e.spawnId!=null?'spawn:'+e.spawnId:'type:'+e.type;
    ringWorld(e,tutAimTargets.has(key)?'#5ec46a':'#e8b658');
  }
  if(st.id==='ammo'||st.id==='med-pickup'){
    const p=pickups.find(o=>o.tutorialPickup); if(p) ringWorld(p,st.id==='ammo'?'#ffd24d':'#ff766d');
  }
}
function tutorialClick(){
  for(const r of tutRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.id==='quit'){ endTutorial(); sfx('swap'); return true; }
      if(r.id==='stay'){ tutorialOn=false; sfx('swap'); return true; }
      return true;
    }
  }
  return false;
}
function drawTools(){
  selBg(); toolsRects=[]; backRect=null;
  const compact=H<500, margin=W<440?14:24;
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillStyle='#bfa8ff'; ctx.font='700 '+(compact?22:30)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83E\uDDF0 TOOLS',W/2,compact?10:H*0.055);
  ctx.fillStyle='#8a9268';ctx.font=(compact?'9':'11')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('guides, rewards, sharing, and player lookup',W-margin*2),W/2,compact?38:H*0.055+39);

  const items=[
    {id:'howto',title:'\u2753 HOW TO PLAY',sub:'interactive tutorial and full control guide',col:'#8a9268'},
    {id:'code',title:'\uD83C\uDF81 REDEEM CODE',sub:'enter an active Outpost Zero promo code',col:'#a7c15e'},
    {id:'share',title:'\uD83D\uDD17 SHARE INVITE',sub:'send your referral link to a new player',col:'#bfa8ff'},
    {id:'spin',title:'\uD83C\uDFA1 SPIN '+(wheelReady>0?'('+wheelReady+' READY)':wheelCountdown()),sub:'daily reward wheel',col:wheelReady>0?'#e8b658':'#6b6450'},
    {id:'lookup',title:'\uD83D\uDD0D PLAYER LOOKUP',sub:'find a player by username or account email',col:'#7fd8ff'}
  ];
  const backH=compact?34:40,backY=H-backH-(compact?8:14),top=compact?54:H*0.055+64,
    gap=compact?5:9,contentW=Math.min(500,W-margin*2),x=W/2-contentW/2,
    rowH=clamp(Math.floor((backY-top-12-gap*(items.length-1))/items.length),compact?32:40,compact?46:56);
  let y=top;
  for(const item of items){
    const r={id:item.id,x,y,w:contentW,h:rowH};toolsRects.push(r);
    const hot=mouse.x>=x&&mouse.x<=x+contentW&&mouse.y>=y&&mouse.y<=y+rowH;
    ctx.fillStyle=hot?item.col:'rgba(0,0,0,0.42)';ctx.fillRect(x,y,contentW,rowH);
    ctx.strokeStyle=item.col;ctx.lineWidth=1.5;ctx.strokeRect(x+0.5,y+0.5,contentW,rowH);
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=hot?'#101208':'#e8d9a8';
    ctx.font='700 '+(rowH<40?11:14)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(item.title,contentW-28),x+14,y+rowH/2-(rowH<40?0:8));
    if(rowH>=40){
      ctx.fillStyle=hot?'#24291a':'#8a9268';ctx.font=(compact?'8':'9')+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(item.sub,contentW-28),x+14,y+rowH/2+11);
    }
    y+=rowH+gap;
  }
  const backW=Math.min(240,contentW),backX=W/2-backW/2;
  backRect={x:backX,y:backY,w:backW,h:backH};toolsRects.push(Object.assign({id:'back'},backRect));
  const backHot=mouse.x>=backX&&mouse.x<=backX+backW&&mouse.y>=backY&&mouse.y<=backY+backH;
  ctx.fillStyle=backHot?'#e8b658':'rgba(232,182,88,0.14)';ctx.fillRect(backX,backY,backW,backH);
  ctx.strokeStyle='#e8b658';ctx.lineWidth=1;ctx.strokeRect(backX+0.5,backY+0.5,backW,backH);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=backHot?'#101208':'#e8b658';
  ctx.font='700 14px ui-monospace,Consolas,monospace';ctx.fillText('\u2039 BACK',W/2,backY+backH/2);
  ctx.textAlign='left';ctx.textBaseline='top';
}
function drawHowTo(){
  selBg(); howToRects=[]; backRect=null;
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillStyle='#e8b658'; ctx.font='700 '+(W<420?22:28)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('\u2753 HOW TO PLAY', W/2, H*0.06);
  ctx.fillStyle='#8a9268'; ctx.font='11px ui-monospace,Consolas,monospace';
  ctx.textBaseline='middle';
  ctx.fillText(fitLine('pick how you want to learn', W-32), W/2, H*0.06+42);

  const bw=Math.min(400,W-40), bx=W/2-bw/2, bh=76, gap=16;
  let y=Math.max(H*0.06+80, H/2-bh-gap/2-20);
  const big=(id,title,sub,col)=>{
    howToRects.push({x:bx,y,w:bw,h:bh,id});
    const hv=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=y&&mouse.y<=y+bh;
    ctx.fillStyle=hv?col[1]:col[0]; ctx.fillRect(bx,y,bw,bh);
    ctx.strokeStyle=col[2]; ctx.lineWidth=2; ctx.strokeRect(bx+0.5,y+0.5,bw,bh);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle=col[3]; ctx.font='700 15px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(title, bw-24), W/2, y+bh/2-11);
    ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(sub, bw-24), W/2, y+bh/2+12);
    y+=bh+gap;
  };
  big('interactive','\uD83C\uDFAE INTERACTIVE TUTORIAL','learn by doing \u00b7 step by step, nothing can hurt you',
      ['rgba(167,193,94,0.16)','rgba(167,193,94,0.34)','#a7c15e','#cfe0a8']);
  big('text','\uD83D\uDCD6 TEXT GUIDE','every control on one page',
      ['rgba(232,182,88,0.14)','rgba(232,182,88,0.30)','#e8b658','#e8d9a8']);

  const cw=Math.min(240,W-40), ch=40, cx=W/2-cw/2, cy=Math.min(H-ch-16, y+8);
  howToRects.push({x:cx,y:cy,w:cw,h:ch,id:'back'});
  backRect={x:cx,y:cy,w:cw,h:ch};
  const hv=mouse.x>=cx&&mouse.x<=cx+cw&&mouse.y>=cy&&mouse.y<=cy+ch;
  ctx.fillStyle=hv?'#e8b658':'rgba(232,182,88,0.14)'; ctx.fillRect(cx,cy,cw,ch);
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=1; ctx.strokeRect(cx+0.5,cy+0.5,cw,ch);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=hv?'#101208':'#e8b658'; ctx.font='700 14px ui-monospace,Consolas,monospace';
  ctx.fillText('\u2039 BACK', W/2, cy+ch/2);
  ctx.textAlign='left'; ctx.textBaseline='top';
}
function howToClick(){
  for(const r of howToRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.id==='back'){ selPage='hub'; sfx('swap'); return; }
      if(r.id==='text'){ selPage='tutorial'; sfx('swap'); return; }
      if(r.id==='interactive'){ startTutorial(); sfx('wave'); return; }
      return;
    }
  }
}
function drawTutorial(){
  selBg();
  ctx.textAlign='center';
  ctx.fillStyle='#e8b658'; ctx.font='700 26px ui-monospace,Consolas,monospace';
  ctx.fillText('HOW TO PLAY', W/2, H*0.045);
  const L=[
    ['MOVE','WASD keys \u00b7 touch: left joystick'],
    ['SHOOT','left mouse \u00b7 touch: tap / hold the field'],
    ['AIM / SCOPE','hold right mouse or press E with a gun \u00b7 touch: crosshair button'],
    ['RELOAD','R \u00b7 touch: reload button'],
    ['SWAP WEAPON','1-4 or Q \u00b7 touch: top-left 1-4 slots'],
    ['QUICK MELEE','F anytime \u00b7 E/RMB with melee out \u00b7 touch: fist button'],
    ['UTILITY','G quick-casts \u00b7 4 equips \u00b7 RMB uses it while visible \u00b7 Casual 1v1 yes; CPU/Ranked no'],
    ['AMMO','magazine / reserve is limited \u00b7 walk over gold ammo crates to refill reserves'],
    ['MEDKITS','drop every '+MED_DROP_KILLS_BASE+' campaign kills \u00b7 fly to your stash (max '+MED_STASH_MAX+') \u00b7 H / touch MED'],
    ['GEMS \uD83D\uDC8E','unlock published weapons in the Shop \u00b7 earn them from tasks, streaks, chests, and the wheel'],
    ['COINS \uD83E\uDE99','buy colors, equip animations, and pre-run power-ups in the Shop'],
    ['ANIMATIONS','cosmetic weapon-draw flourishes only \u00b7 they never change weapon strength'],
    ['POWER-UPS','pre-buy with coins \u00b7 open POWERUPS on an upgrade screen (or press V) to use stock'],
    ['WAVES','clear a wave \u2192 choose an upgrade'],
    ['MOD LEVELS','every 10th wave offers ONLY weapon mods'],
    ['WARLORDS','every 5th wave \u2014 they trickle in, not all at once'],
    ['  RED','charges you + sprays shots in every direction'],
    ['  BLUE','slow missiles \u00b7 deflects ALL bullets every 8s (2s)'],
    ['  YELLOW','sniper shots \u00b7 +200% speed melee charge every 18s'],
    ['  PURPLE','the KING \u00b7 its shots one-shot you \u2014 DODGE'],
    ['CHESTS','bosses drop them \u2192 coins + a free weapon mod'],
  ];
  const y0=H*0.045+44, lh=Math.min(24,(H-y0-90)/L.length);
  // narrow screens: shrink the type and give each column a real share of the width
  const narrow=W<620;
  const widthFs=narrow?Math.min(12,Math.floor(W/34)):12;
  const fs=Math.max(7,Math.min(widthFs,Math.floor(lh*0.82)));
  ctx.font=fs+'px ui-monospace,Consolas,monospace';
  const split=narrow ? Math.round(W*0.34) : W/2;      // label column ends here
  const labW=split-10, valW=W-split-10;
  const clip=fitLine;
  for(let i=0;i<L.length;i++){
    const y=y0+i*lh;
    ctx.textAlign='right'; ctx.fillStyle='#e8b658';
    ctx.fillText(clip(L[i][0], labW), split-(narrow?6:14), y);
    ctx.textAlign='left'; ctx.fillStyle='#cdd6b0';
    ctx.fillText(clip(L[i][1], valW), split+2, y);
  }
  const bw=260, bh=44, bx=W/2-bw/2, by=Math.min(H-bh-14, y0+L.length*lh+16);
  backRect={x:bx,y:by,w:bw,h:bh};
  const hov=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=by&&mouse.y<=by+bh;
  ctx.fillStyle=hov?'#e8b658':'rgba(232,182,88,0.14)';
  ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle='#e8b658'; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
  ctx.fillStyle=hov?'#101208':'#e8b658'; ctx.font='700 15px ui-monospace,Consolas,monospace';
  ctx.textAlign='center';
  ctx.fillText('\u2039 BACK', W/2, by+(bh-15)/2);
}
const SHOP_WEAPON_PICKER_CATEGORIES=[
  {id:'primary',label:'PRIMARY'},
  {id:'secondary',label:'SECONDARY'},
  {id:'melee',label:'MELEE'},
];
function shopWeaponPickerCategory(k){
  if(PRIMARIES.includes(k)||TEMP_PRIMARY.includes(k)) return 'primary';
  if(SECONDARIES.includes(k)||TEMP_SECONDARY.includes(k)) return 'secondary';
  if(MELEES.includes(k)||TEMP_MELEE.includes(k)) return 'melee';
  return '';
}
function shopWeaponPickerGroups(){
  const groups={primary:[],secondary:[],melee:[]};
  for(const k of WKEYS){
    const cat=shopWeaponPickerCategory(k);
    if(cat&&WEAPONS[k]&&!isLocked(k)&&!groups[cat].includes(k)) groups[cat].push(k);
  }
  return groups;
}
function openShopWeaponPicker(target){
  shopWeaponPickerTarget=target==='anims'?'anims':'cosmetics';
  const current=shopWeaponPickerTarget==='anims'?shopAnimWeapon:shopCosWeapon;
  const groups=shopWeaponPickerGroups(), currentCat=shopWeaponPickerCategory(current);
  shopWeaponPickerCat=currentCat&&groups[currentCat].includes(current)
    ? currentCat
    : (SHOP_WEAPON_PICKER_CATEGORIES.find(cat=>groups[cat.id].length)||SHOP_WEAPON_PICKER_CATEGORIES[0]).id;
  shopWeaponPickerOpen=true;
}
function chooseShopWeapon(k){
  const groups=shopWeaponPickerGroups(), cat=shopWeaponPickerCategory(k);
  if(!cat||!groups[cat].includes(k)) return false;
  if(shopWeaponPickerTarget==='anims') shopAnimWeapon=k;
  else shopCosWeapon=k;
  shopWeaponPickerOpen=false;
  return true;
}
function drawShopWeaponButton(cw,y,target,k){
  const x=W/2-cw/2, h=46, wname=(WEAPONS[k]||{}).name||k||'NONE AVAILABLE';
  const hot=mouse.x>=x&&mouse.x<=x+cw&&mouse.y>=y&&mouse.y<=y+h;
  shopWeaponPickerRects.push({kind:'open',target,x,y,w:cw,h});
  ctx.fillStyle=hot?'rgba(127,216,255,0.18)':'rgba(0,0,0,0.42)'; ctx.fillRect(x,y,cw,h);
  ctx.strokeStyle=hot?'#7fd8ff':'#4a4634'; ctx.lineWidth=hot?2:1; ctx.strokeRect(x+0.5,y+0.5,cw-1,h-1);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=hot?'#bfe8ff':'#7fd8ff'; ctx.font='700 13px ui-monospace,Consolas,monospace';
  ctx.fillText('WEAPONS',W/2,y+15);
  ctx.fillStyle='#cdd6b0'; ctx.font='700 9px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('SELECTED · '+wname+' · TAP TO CHANGE',cw-20),W/2,y+33);
  ctx.textBaseline='alphabetic';
  return y+h+10;
}
function drawShopWeaponPicker(cw,y){
  const x=W/2-cw/2, compact=H<520, groups=shopWeaponPickerGroups();
  if(!groups[shopWeaponPickerCat]||!groups[shopWeaponPickerCat].length){
    const first=SHOP_WEAPON_PICKER_CATEGORIES.find(cat=>groups[cat.id].length);
    if(first) shopWeaponPickerCat=first.id;
  }
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#e8d9a8'; ctx.font='700 '+(compact?15:17)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('CHOOSE A WEAPON',W/2,y+(compact?13:15));
  y+=compact?23:27;

  const gap=6, tabH=compact?26:30, tabW=(cw-gap*2)/3;
  for(let i=0;i<SHOP_WEAPON_PICKER_CATEGORIES.length;i++){
    const cat=SHOP_WEAPON_PICKER_CATEGORIES[i], tx=x+i*(tabW+gap), active=shopWeaponPickerCat===cat.id;
    const hot=mouse.x>=tx&&mouse.x<=tx+tabW&&mouse.y>=y&&mouse.y<=y+tabH;
    shopWeaponPickerRects.push({kind:'category',cat:cat.id,x:tx,y,w:tabW,h:tabH});
    ctx.fillStyle=active?'rgba(232,182,88,0.22)':hot?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.38)'; ctx.fillRect(tx,y,tabW,tabH);
    ctx.strokeStyle=active?'#e8b658':'#4a4634'; ctx.lineWidth=active?2:1; ctx.strokeRect(tx+0.5,y+0.5,tabW-1,tabH-1);
    ctx.fillStyle=active?'#ffe3a0':'#8a9268'; ctx.font='700 '+(tabW<92?8:10)+'px ui-monospace,Consolas,monospace';
    ctx.textBaseline='middle'; ctx.fillText(cat.label+' · '+groups[cat.id].length,tx+tabW/2,y+tabH/2);
  }
  y+=tabH+(compact?7:10);

  const keys=groups[shopWeaponPickerCat]||[];
  if(!keys.length){
    ctx.fillStyle='#6b7455'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.fillText('NO AVAILABLE WEAPONS',W/2,y+24);
    ctx.textBaseline='alphabetic';
    return y+48;
  }
  const cols=compact?3:2, cardGap=compact?5:8, rows=Math.ceil(keys.length/cols);
  const cardW=(cw-cardGap*(cols-1))/cols, room=Math.max(34,H-72-y-cardGap*(rows-1));
  const cardH=clamp(Math.floor(room/rows),compact?34:42,compact?50:58);
  const selected=shopWeaponPickerTarget==='anims'?shopAnimWeapon:shopCosWeapon;
  for(let i=0;i<keys.length;i++){
    const k=keys[i], def=WEAPONS[k], cx=x+(i%cols)*(cardW+cardGap), cy=y+Math.floor(i/cols)*(cardH+cardGap);
    const active=k===selected, hot=mouse.x>=cx&&mouse.x<=cx+cardW&&mouse.y>=cy&&mouse.y<=cy+cardH;
    shopWeaponPickerRects.push({kind:'weapon',key:k,x:cx,y:cy,w:cardW,h:cardH});
    ctx.fillStyle=active?'rgba(167,193,94,0.20)':hot?'rgba(127,216,255,0.13)':'rgba(0,0,0,0.40)'; ctx.fillRect(cx,cy,cardW,cardH);
    ctx.strokeStyle=active?'#a7c15e':hot?'#7fd8ff':'#4a4634'; ctx.lineWidth=active||hot?2:1; ctx.strokeRect(cx+0.5,cy+0.5,cardW-1,cardH-1);
    ctx.fillStyle=active?'#dff2a8':'#e8d9a8'; ctx.font='700 '+(cardW<150?9:11)+'px ui-monospace,Consolas,monospace';
    ctx.textBaseline='middle'; ctx.fillText(fitLine(def.name,cardW-14),cx+cardW/2,cy+cardH/2-(active?6:0));
    if(active){
      ctx.fillStyle='#a7c15e'; ctx.font='700 8px ui-monospace,Consolas,monospace';
      ctx.fillText('✔ SELECTED',cx+cardW/2,cy+cardH/2+9);
    }
  }
  ctx.textBaseline='alphabetic';
  return y+rows*(cardH+cardGap)-cardGap;
}
function drawShopAnims(cw, y){
  const x0=W/2-cw/2;
  const groups=shopWeaponPickerGroups(), pickable=SHOP_WEAPON_PICKER_CATEGORIES.flatMap(cat=>groups[cat.id]);
  if(!shopAnimWeapon || !pickable.includes(shopAnimWeapon)) shopAnimWeapon=pickable[0];
  ctx.textAlign='center'; ctx.fillStyle='#8a9268'; ctx.font='11px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('pick a weapon, then buy how it flourishes when you draw it', W-24), W/2, y);
  y+=14;
  if(!shopAnimWeapon) return y+48;
  y=drawShopWeaponButton(cw,y,'anims',shopAnimWeapon);
  const rowCount=EQUIP_ANIMS.length, rowGap=clamp(Math.floor((H-64-y)*0.02),3,8);
  const rowH=clamp(Math.floor((H-64-y-rowGap*(rowCount-1))/rowCount),28,44);
  for(const a of EQUIP_ANIMS){
    const h=rowH, owned=a.id==='none'||!!animOwned[animKey(shopAnimWeapon,a.id)], eq=animOf(shopAnimWeapon)===a.id;
    shopRects.push({x:x0,y,w:cw,h,kind:'anim',anim:a,wkey:shopAnimWeapon});
    const hv=mouse.x>=x0&&mouse.x<=x0+cw&&mouse.y>=y&&mouse.y<=y+h;
    ctx.fillStyle= eq?'rgba(167,193,94,0.18)':hv?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.35)';
    ctx.fillRect(x0,y,cw,h);
    ctx.strokeStyle= eq?'#a7c15e':'#4a4634'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,cw,h);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle='#cdd6b0'; ctx.font='700 13px ui-monospace,Consolas,monospace';
    ctx.fillText(a.name, x0+14, y+(h<38?h/2:16));
    if(h>=38){
      ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
      ctx.fillText(a.d, x0+14, y+31);
    }
    ctx.textAlign='right'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.fillStyle= eq?'#a7c15e':owned?'#a7c15e':(coins>=a.cost?'#bfe8ff':'#6b7455');
    ctx.fillText(eq?'\u2714 EQUIPPED':owned?'EQUIP':(a.cost+' \uD83E\uDE99'), x0+cw-14, y+h/2);
    ctx.textBaseline='alphabetic';
    y+=h+rowGap;
  }
  ctx.textAlign='center';
  return y;
}
function drawShop(){
  selBg(); shopRects=[]; shopWeaponPickerRects=[];
  const cw=Math.min(460,W-70);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#7fd8ff'; ctx.font='700 22px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83D\uDECD SHOP', W/2, H*0.045);
  ctx.fillStyle='#cdd6b0'; ctx.font='12px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83D\uDC8E '+gems+' gems  \u00b7  \uD83E\uDE99 '+coins+' coins', W/2, H*0.045+26);

  // ---- TAB SWITCHER: WEAPONS (gems) | COSMETICS (coins) | POWERUPS (coins) ----
  const TABS=[['weapons','WEAPONS \uD83D\uDC8E'],['cosmetics','COLORS \uD83E\uDE99'],['anims','ANIMS \uD83E\uDE99'],['powerups','POWERUPS \uD83E\uDE99']];
  const tW=Math.min(126,(W-40)/TABS.length), tH=28, tX=W/2-tW*TABS.length/2, tY=H*0.045+40;
  shopTabRects=[];
  for(let i=0;i<TABS.length;i++){
    const x=tX+i*tW, sel=shopTab===TABS[i][0];
    shopTabRects.push({x,y:tY,w:tW,h:tH,tab:TABS[i][0]});
    const hv=mouse.x>=x&&mouse.x<=x+tW&&mouse.y>=tY&&mouse.y<=tY+tH;
    ctx.fillStyle= sel?'#2a3550':hv?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.35)';
    ctx.fillRect(x,tY,tW,tH);
    ctx.strokeStyle= sel?'#7fd8ff':'#4a4634'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,tY+0.5,tW,tH);
    ctx.fillStyle= sel?'#bfe8ff':'#8a9268'; ctx.font='700 '+(tW<110?9:11)+'px ui-monospace,Consolas,monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(TABS[i][1], x+tW/2, tY+tH/2);
    ctx.textBaseline='alphabetic';
  }

  let y=tY+tH+16;
  // On portrait phones the account/currency badge owns the upper-left lane.
  // Shift every Shop section below it so neither products nor WEAPONS controls
  // are hidden underneath the badge.
  if(W<520&&H>W) y+=50;
  if(shopWeaponPickerOpen)       y=drawShopWeaponPicker(cw,y);
  else if(shopTab==='weapons')   y=drawShopWeapons(cw, y);
  else if(shopTab==='cosmetics') y=drawShopCosmetics(cw, y);
  else if(shopTab==='anims')     y=drawShopAnims(cw, y);
  else                           y=drawShopPowerups(cw, y);

  // BACK button, always a clear gap below content
  const bw=240, bh=40, bx=W/2-bw/2, by=Math.min(H-bh-14, y+14);
  backRect={x:bx,y:by,w:bw,h:bh};
  const hov=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=by&&mouse.y<=by+bh;
  ctx.fillStyle=hov?'#e8b658':'rgba(232,182,88,0.14)'; ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=hov?'#101208':'#e8b658'; ctx.font='700 15px ui-monospace,Consolas,monospace';
  const backLabel=shopWeaponPickerOpen
    ? '\u2039 BACK TO '+(shopWeaponPickerTarget==='anims'?'ANIMS':'COLORS')
    : '\u2039 BACK';
  ctx.fillText(backLabel, W/2, by+bh/2);
  ctx.textBaseline='alphabetic';
}
let shopExpanded=null;                               // which shop row is opened up
function shopStatLine(k){
  const w=WEAPONS[k]||VAULT_WEAPONS[k];
  if(!w) return '';
  const bits=[];
  if(typeof w.dmg==='number') bits.push('DMG '+w.dmg);
  if(typeof w.fireRate==='number') bits.push('RATE '+w.fireRate+'ms');
  if(typeof w.mag==='number') bits.push('MAG '+w.mag);
  if(typeof w.reload==='number' && w.reload) bits.push('RELOAD '+(w.reload/1000)+'s');
  if(typeof w.range==='number') bits.push('RANGE '+Math.round(w.range));
  if(w.pellets>1) bits.push(w.pellets+' PELLETS');
  if(w.pierce) bits.push('PIERCE '+w.pierce);
  return bits.join('   \u00b7   ');
}
function drawShopWeapons(cw, y){
  const x=W/2-cw/2,liveShop=GEM_SHOP.filter(it=>typeof isWeaponPublished!=='function'||isWeaponPublished(it.key));
  if(shopExpanded&&!liveShop.some(it=>it.key===shopExpanded))shopExpanded=null;
  if(!liveShop.length){
    ctx.textAlign='center';
    ctx.fillStyle='#6b7455'; ctx.font='700 15px ui-monospace,Consolas,monospace';
    ctx.fillText('THE SHELVES ARE EMPTY', W/2, y+30);
    return y+50;
  }
  // fit every card in the room between here and the BACK button (which sits ~64px tall at the bottom)
  const n=liveShop.length, avail=H-y-64, gap=Math.max(4, Math.min(12, Math.floor(avail*0.015)));
  // an opened row needs extra height, so take it out of the shared space first
  let openExtra=0;
  if(shopExpanded){
    const wd=WEAPONS[shopExpanded]||VAULT_WEAPONS[shopExpanded]||UTILITIES[shopExpanded]||VAULT_UTILITIES[shopExpanded];
    if(wd){
      ctx.font='10px ui-monospace,Consolas,monospace';
      const room=cw-32; let ln='', cnt=0;
      for(const word of String(wd.blurb||'').split(' ')){
        const test=ln?ln+' '+word:word;
        if(ctx.measureText(test).width>room && ln){ cnt++; ln=word; } else ln=test;
      }
      if(ln) cnt++;
      openExtra = 10 + cnt*14 + (shopStatLine(shopExpanded)?16:0);
    }
  }
  const ch=clamp(Math.floor((avail-openExtra-(n-1)*gap)/n), 24, 64);
  const compact = ch<56;
  for(const it of liveShop){
    const wdef=WEAPONS[it.key]||VAULT_WEAPONS[it.key]||UTILITIES[it.key]||VAULT_UTILITIES[it.key];
    const open = shopExpanded===it.key;
    let extra=0, blurbLines=[], statLine='';
    if(open){
      ctx.font='10px ui-monospace,Consolas,monospace';
      const room=cw-32;
      let line='';
      for(const word of String(wdef.blurb||'').split(' ')){
        const test=line?line+' '+word:word;
        if(ctx.measureText(test).width>room && line){ blurbLines.push(line); line=word; }
        else line=test;
      }
      if(line) blurbLines.push(line);
      statLine=shopStatLine(it.key);
      extra = 10 + blurbLines.length*14 + (statLine?16:0);
    }
    const rh = ch + extra;
    ctx.fillStyle= open ? 'rgba(127,216,255,0.10)' : 'rgba(0,0,0,0.4)'; ctx.fillRect(x,y,cw,rh);
    ctx.strokeStyle= open ? '#7fd8ff' : '#4a4634'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,cw,rh);
    shopRects.push({x,y,w:cw,h:rh,item:it,kind:'expand'});   // the row toggles open/closed
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle='#e8d9a8'; ctx.font='700 14px ui-monospace,Consolas,monospace';
    if(compact){
      // one-line-ish layout: NAME on top, SLOT under it, tight
      const tiny = ch<40;
      ctx.font='700 '+(tiny?12:14)+'px ui-monospace,Consolas,monospace';
      ctx.fillText(wdef.name, x+16, y+ch/2-(tiny?5:6));
      ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
      ctx.fillText(it.slot.toUpperCase(), x+16, y+ch/2+(tiny?6:8));
    } else {
      ctx.fillText(wdef.name, x+16, y+20);
      ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
      ctx.fillText(it.slot.toUpperCase()+(open?'':('  \u00b7  '+fitLine(wdef.blurb, cw-190))), x+16, y+44);
    }
    ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.fillStyle= open ? '#7fd8ff' : '#5a5648'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(open?'\u25B2':'\u25BC', x+cw-140, y+ch/2);
    ctx.textAlign='left';
    if(open){
      let ty=y+ch+4;
      ctx.fillStyle='#cdd6b0'; ctx.font='10px ui-monospace,Consolas,monospace';
      for(const ln of blurbLines){ ctx.fillText(ln, x+16, ty+7); ty+=14; }
      if(statLine){
        ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine(statLine, cw-32), x+16, ty+8);
      }
    }
    // `isLocked` answers whether the weapon may be equipped. An unowned shop
    // offer is intentionally equip-locked, but it must remain purchasable after
    // an admin removes permanent ownership. Publication is the shop boundary.
    const published=typeof isWeaponPublished!=='function'||isWeaponPublished(it.key);
    const owned=published&&!!gemOwned[it.key];
    const b2w=112, b2h=Math.min(32,ch-10), b2x=x+cw-b2w-12, b2y=y+ch/2-b2h/2;
    shopRects.push({x:b2x,y:b2y,w:b2w,h:b2h,item:it,kind:'weapon',enabled:published&&!owned});
    const hv=mouse.x>=b2x&&mouse.x<=b2x+b2w&&mouse.y>=b2y&&mouse.y<=b2y+b2h;
    const can=published&&!owned&&gems>=it.cost;
    ctx.fillStyle = owned ? 'rgba(167,193,94,0.25)' : can ? (hv?'#7fd8ff':'rgba(127,216,255,0.2)') : 'rgba(255,255,255,0.06)';
    ctx.fillRect(b2x,b2y,b2w,b2h);
    ctx.strokeStyle= owned ? '#a7c15e' : can ? '#7fd8ff' : '#5a5648'; ctx.strokeRect(b2x+0.5,b2y+0.5,b2w,b2h);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const label=owned?'OWNED':published?'\uD83D\uDC8E '+it.cost+' BUY':'UNAVAILABLE';
    ctx.fillStyle = owned ? '#a7c15e' : (can&&hv) ? '#101208' : can ? '#cdd6b0' : '#6b7455';
    ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText(label, b2x+b2w/2, b2y+b2h/2);
    y+=rh+gap;
  }
  ctx.textBaseline='alphabetic';
  return y;
}
function drawShopCosmetics(cw, y){
  const x=W/2-cw/2;
  const groups=shopWeaponPickerGroups(), pickable=SHOP_WEAPON_PICKER_CATEGORIES.flatMap(cat=>groups[cat.id]);
  if(!shopCosWeapon || !pickable.includes(shopCosWeapon)) shopCosWeapon=pickable[0];
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
  ctx.textBaseline='alphabetic';
  ctx.fillText(fitLine('choose a weapon, then unlock a color for it \u00b7 '+COSMETIC_COST+' \uD83E\uDE99 each', W-24), W/2, y);
  y+=14;
  if(!shopCosWeapon) return y+48;
  y=drawShopWeaponButton(cw,y,'cosmetics',shopCosWeapon)+6;
  // color swatches grid
  const cols=3, sw=(cw-2*14)/cols, sh=56, gy=12;
  for(let i=0;i<COSMIC_COLORS.length;i++){
    const c=COSMIC_COLORS[i], cxp=x+(i%cols)*(sw+14), cyp=y+Math.floor(i/cols)*(sh+gy);
    const k=cosKey(shopCosWeapon,c.id);
    const owned=!!cosmeticOwned[k], eq=cosmeticEquipped[shopCosWeapon]===c.id;
    shopRects.push({x:cxp,y:cyp,w:sw,h:sh,cos:c,wkey:shopCosWeapon,kind:'cosmetic'});
    const hv=mouse.x>=cxp&&mouse.x<=cxp+sw&&mouse.y>=cyp&&mouse.y<=cyp+sh;
    ctx.fillStyle=hv?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.35)'; ctx.fillRect(cxp,cyp,sw,sh);
    ctx.strokeStyle= eq?c.col:owned?'#a7c15e':'#4a4634'; ctx.lineWidth= eq?2:1; ctx.strokeRect(cxp+0.5,cyp+0.5,sw,sh);
    // swatch
    ctx.fillStyle=c.col; ctx.fillRect(cxp+10,cyp+10,26,26);
    ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=1; ctx.strokeRect(cxp+10.5,cyp+10.5,26,26);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    ctx.fillStyle='#e8d9a8'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.fillText(c.name, cxp+44, cyp+22);
    ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillStyle= eq?'#a7c15e':owned?'#a7c15e':(coins>=COSMETIC_COST?'#bfe8ff':'#6b7455');
    ctx.fillText(eq?'\u2714 EQUIPPED':owned?'EQUIP':(COSMETIC_COST+' \uD83E\uDE99'), cxp+44, cyp+40);
  }
  y+=Math.ceil(COSMIC_COLORS.length/cols)*(sh+gy);
  return y;
}
function drawShopPowerups(cw, y){
  const x=W/2-cw/2, ch=58, gap=10;
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('pre-buy consumables \u00b7 use them from POWERUPS on an upgrade screen (V)', W-24), W/2, y);
  y+=14;
  for(const pu of POWERUPS){
    ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(x,y,cw,ch);
    ctx.strokeStyle='#4a4634'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,cw,ch);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    const ownW=78, buyW=136;                       // reserved on the right
    const textW=cw-28-ownW-buyW;                   // what's left for the name
    ctx.fillStyle='#e8d9a8'; ctx.font='700 14px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(pu.emoji+' '+pu.name, Math.max(60,textW)), x+14, y+18);
    ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(pu.d+'  \u00b7  max '+pu.max+'/game', Math.max(60,cw-28-buyW)), x+14, y+40);
    // owned stock badge
    ctx.fillStyle='#cfe0a8'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    if(textW>=90){ ctx.textAlign='right'; ctx.fillText('owned: '+(powerStock[pu.id]||0), x+cw-buyW-6, y+18); }
    else { ctx.textAlign='left'; ctx.fillText('owned: '+(powerStock[pu.id]||0), x+14, y+56); }
    // BUY button
    const b2w=118, b2h=32, b2x=x+cw-b2w-12, b2y=y+ch/2-b2h/2;
    shopRects.push({x:b2x,y:b2y,w:b2w,h:b2h,pu,kind:'powerup'});
    const hv=mouse.x>=b2x&&mouse.x<=b2x+b2w&&mouse.y>=b2y&&mouse.y<=b2y+b2h;
    const can=coins>=pu.cost;
    ctx.fillStyle=can?(hv?'#e8b658':'rgba(232,182,88,0.18)'):'rgba(255,255,255,0.06)';
    ctx.fillRect(b2x,b2y,b2w,b2h);
    ctx.strokeStyle=can?'#e8b658':'#5a5648'; ctx.lineWidth=1; ctx.strokeRect(b2x+0.5,b2y+0.5,b2w,b2h);
    ctx.textAlign='center'; ctx.fillStyle=can?(hv?'#101208':'#e8d9a8'):'#6b7455';
    ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText('\uD83E\uDE99 '+pu.cost+' BUY', b2x+b2w/2, b2y+b2h/2);
    y+=ch+gap;
  }
  ctx.textBaseline='alphabetic';
  return y;
}
// ---- in-game POWERUPS popup (spend from stock during a run) ----
function drawPowerMenu(){
  ctx.fillStyle='rgba(4,6,3,0.82)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(440,W-60), rowH=54, gap=10;
  const ph=70 + POWERUPS.length*(rowH+gap) + 54;
  const px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='rgba(16,18,8,0.98)'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#e8b658'; ctx.font='700 20px ui-monospace,Consolas,monospace';
  ctx.fillText('\u2728 POWERUPS', W/2, py+30);
  ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
  ctx.fillText('spend your pre-bought stock \u00b7 caps reset each game', W/2, py+50);
  powerMenuRects=[];
  let ry=py+66;
  for(const pu of POWERUPS){
    const have=powerStock[pu.id]||0, used=powerUsed[pu.id]||0, capLeft=pu.max-used;
    const usable = have>0 && capLeft>0;
    ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(px+14,ry,pw-28,rowH);
    ctx.strokeStyle='#4a4634'; ctx.lineWidth=1; ctx.strokeRect(px+14.5,ry+0.5,pw-28,rowH);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle= usable?'#e8d9a8':'#6b7455'; ctx.font='700 13px ui-monospace,Consolas,monospace';
    ctx.fillText(pu.emoji+' '+pu.name, px+26, ry+18);
    ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText('stock '+have+'  \u00b7  used '+used+'/'+pu.max, px+26, ry+38);
    // USE button
    const b2w=100, b2h=34, b2x=px+pw-14-b2w-12, b2y=ry+rowH/2-b2h/2;
    powerMenuRects.push({x:b2x,y:b2y,w:b2w,h:b2h,id:pu.id,usable});
    const hv=mouse.x>=b2x&&mouse.x<=b2x+b2w&&mouse.y>=b2y&&mouse.y<=b2y+b2h;
    ctx.fillStyle= usable?(hv?'#a7c15e':'rgba(167,193,94,0.2)'):'rgba(255,255,255,0.05)';
    ctx.fillRect(b2x,b2y,b2w,b2h);
    ctx.strokeStyle= usable?'#a7c15e':'#5a5648'; ctx.strokeRect(b2x+0.5,b2y+0.5,b2w,b2h);
    ctx.textAlign='center'; ctx.fillStyle= usable?(hv?'#101208':'#cfe0a8'):'#6b7455';
    ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.fillText(have<=0?'NONE':capLeft<=0?'MAXED':'USE', b2x+b2w/2, b2y+b2h/2);
    ry+=rowH+gap;
  }
  // close button
  const cbw=180, cbh=38, cbx=W/2-cbw/2, cby=ry+6;
  powerMenuRects.push({x:cbx,y:cby,w:cbw,h:cbh,id:'__close'});
  const chv=mouse.x>=cbx&&mouse.x<=cbx+cbw&&mouse.y>=cby&&mouse.y<=cby+cbh;
  ctx.fillStyle=chv?'#e8b658':'rgba(232,182,88,0.14)'; ctx.fillRect(cbx,cby,cbw,cbh);
  ctx.strokeStyle='#e8b658'; ctx.strokeRect(cbx+0.5,cby+0.5,cbw,cbh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=chv?'#101208':'#e8b658'; ctx.font='700 13px ui-monospace,Consolas,monospace';
  ctx.fillText('CLOSE (P)', W/2, cby+cbh/2);
  ctx.textBaseline='alphabetic';
}
function powerMenuClick(){
  for(const r of powerMenuRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.id==='__close'){ powerMenuOpen=false; sfx('swap'); return; }
      if(r.usable){ if(usePowerup(r.id)) powerMenuOpen=false; else sfx('dry'); }
      return;
    }
  }
}
// ---- respawn prompt on death (if a respawn is in stock) ----
function drawRespawnPrompt(){
  ctx.fillStyle='rgba(4,6,3,0.85)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(420,W-60), ph=200, px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='rgba(16,18,8,0.98)'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#d05548'; ctx.lineWidth=2; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#d05548'; ctx.font='700 22px ui-monospace,Consolas,monospace';
  ctx.fillText('YOU DIED', W/2, py+40);
  ctx.fillStyle='#cdd6b0'; ctx.font='12px ui-monospace,Consolas,monospace';
  ctx.fillText('you have '+(powerStock.respawn||0)+' \uD83D\uDD01 respawn(s) in stock', W/2, py+66);
  respawnRects=[];
  const bw=pw-60, bh=42;
  const rbx=W/2-bw/2, rby=py+86;
  respawnRects.push({x:rbx,y:rby,w:bw,h:bh,act:'respawn'});
  const rhv=mouse.x>=rbx&&mouse.x<=rbx+bw&&mouse.y>=rby&&mouse.y<=rby+bh;
  ctx.fillStyle=rhv?'#a7c15e':'rgba(167,193,94,0.2)'; ctx.fillRect(rbx,rby,bw,bh);
  ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1; ctx.strokeRect(rbx+0.5,rby+0.5,bw,bh);
  ctx.fillStyle=rhv?'#101208':'#cfe0a8'; ctx.font='700 14px ui-monospace,Consolas,monospace';
  ctx.textBaseline='middle'; ctx.fillText('\uD83D\uDD01 USE RESPAWN', W/2, rby+bh/2); ctx.textBaseline='alphabetic';
  const gbx=W/2-bw/2, gby=rby+bh+12;
  respawnRects.push({x:gbx,y:gby,w:bw,h:bh,act:'giveup'});
  const ghv=mouse.x>=gbx&&mouse.x<=gbx+bw&&mouse.y>=gby&&mouse.y<=gby+bh;
  ctx.fillStyle=ghv?'#d05548':'rgba(208,85,72,0.18)'; ctx.fillRect(gbx,gby,bw,bh);
  ctx.strokeStyle='#d05548'; ctx.strokeRect(gbx+0.5,gby+0.5,bw,bh);
  ctx.fillStyle=ghv?'#101208':'#e0a8a0'; ctx.font='700 13px ui-monospace,Consolas,monospace';
  ctx.textBaseline='middle'; ctx.fillText('END RUN', W/2, gby+bh/2); ctx.textBaseline='alphabetic';
}
function respawnPromptClick(){
  for(const r of respawnRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.act==='respawn'){ if(!usePowerup('respawn')){ if(typeof completeDailyEndlessTaskRun==='function')completeDailyEndlessTaskRun(); respawnPromptT=0; menuOpen=false; state='over'; submitScore(hiScore); } }
      else { if(typeof completeDailyEndlessTaskRun==='function')completeDailyEndlessTaskRun(); respawnPromptT=0; menuOpen=false; state='over'; sfx('die'); submitScore(hiScore); }
      return;
    }
  }
}
function drawPractice(){
  selBg(); practiceRects=[];
  const tiny=H<430;
  ctx.textAlign='center';
  const titleY=tiny?8:H*0.05, titleFs=tiny?20:26;
  ctx.fillStyle='#a7c15e'; ctx.font='700 '+titleFs+'px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83C\uDFAF PRACTICE', W/2, titleY);
  ctx.fillStyle='#8a9268'; ctx.font=(tiny?'9':'12')+'px ui-monospace,Consolas,monospace';
  const subY=tiny?34:H*0.05+38;
  ctx.fillText(fitLine('offline \u00b7 no score, loot, or tasks', W-24), W/2, subY);
  const needsLoadout=!(loadout.primary && loadout.secondary && loadout.melee);
  if(needsLoadout){
    ctx.fillStyle='#d0a548'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('\u26A0 tap a mode, then pick your weapons', W-24), W/2, tiny?49:H*0.05+56);
  }
  const toggleH=tiny?25:32, toggleW=Math.min(460,W-(tiny?20:80));
  const toggleX=W/2-toggleW/2;
  const toggleY=tiny?(needsLoadout?60:45):(needsLoadout?H*0.05+66:H*0.05+52);
  const toggleHover=mouse.x>=toggleX&&mouse.x<=toggleX+toggleW&&mouse.y>=toggleY&&mouse.y<=toggleY+toggleH;
  practiceRects.push({x:toggleX,y:toggleY,w:toggleW,h:toggleH,action:'practice-infinite-ammo'});
  ctx.fillStyle=practiceInfiniteAmmo
    ? (toggleHover?'#cfe0a8':'rgba(167,193,94,0.24)')
    : (toggleHover?'rgba(232,182,88,0.24)':'rgba(0,0,0,0.4)');
  ctx.fillRect(toggleX,toggleY,toggleW,toggleH);
  ctx.strokeStyle=practiceInfiniteAmmo?'#a7c15e':'#e8b658';ctx.strokeRect(toggleX+0.5,toggleY+0.5,toggleW,toggleH);
  ctx.fillStyle=practiceInfiniteAmmo&&toggleHover?'#101208':practiceInfiniteAmmo?'#cfe0a8':'#e8b658';
  ctx.font='700 '+(tiny?9:11)+'px ui-monospace,Consolas,monospace';ctx.textBaseline='middle';
  ctx.fillText(fitLine(practiceInfiniteAmmo?'INFINITE AMMO: ON  \u00b7  \u221E MAGAZINE  \u00b7  NO RELOAD':'INFINITE AMMO: OFF  \u00b7  TAP TO ENABLE',toggleW-18),W/2,toggleY+toggleH/2);
  ctx.textBaseline='alphabetic';
  const OPTS=[
    {mode:'range', name:'SHOOTING RANGE', d:'one of every enemy type \u00b7 they stand still \u00b7 respawn 3s after a kill'},
    {mode:'dps',   name:'DPS DUMMY',      d:'an unbreakable target \u00b7 live damage-per-second readout'},
    {mode:'tracking', name:'TRACKING DUMMY', d:'open arena \u00b7 0.5\u00d7 speed steps to 5\u00d7 \u00b7 eight 45\u00b0 directions', controls:true},
    {mode:'boss',  name:'WARLORD FIGHT',  d:'all four warlords, fully live \u00b7 you respawn on death'},
  ];
  const cw=Math.min(460,W-(tiny?20:80)), gap=tiny?5:14;
  const bh=tiny?30:44, bottomPad=tiny?7:14, backGap=tiny?5:8;
  let y=toggleY+toggleH+(tiny?5:9);
  const cardBottom=H-bottomPad-bh-backGap;
  const controlsExtra=tiny?54:60;
  const ch=clamp(Math.floor((cardBottom-y-gap*(OPTS.length-1)-controlsExtra)/OPTS.length),28,tiny?64:70);
  for(const o of OPTS){
    const x=W/2-cw/2, cardH=ch+(o.controls?controlsExtra:0);
    practiceRects.push({x,y,w:cw,h:cardH,mode:o.mode});
    const hv=mouse.x>=x&&mouse.x<=x+cw&&mouse.y>=y&&mouse.y<=y+cardH;
    ctx.fillStyle=hv?'rgba(167,193,94,0.22)':'rgba(0,0,0,0.4)';
    ctx.fillRect(x,y,cw,cardH);
    ctx.strokeStyle='#a7c15e'; ctx.strokeRect(x+0.5,y+0.5,cw,cardH);
    ctx.textAlign='left';
    ctx.fillStyle='#e8d9a8'; ctx.font='700 '+(tiny?12:16)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(o.name, cw-32), x+16, y+(tiny?10:14));
    ctx.fillStyle='#8a9268'; ctx.font=(tiny?'8':'10')+'px ui-monospace,Consolas,monospace';
    if(ch>=36||o.controls) ctx.fillText(fitLine(o.d, cw-32), x+16, y+(tiny?27:34));
    if(o.controls){
      const rowX=x+12, rowW=cw-24, rowH=tiny?22:24, buttonW=tiny?40:46;
      const firstY=y+cardH-controlsExtra+(tiny?3:4), secondY=firstY+rowH+(tiny?3:4);
      const drawControlRow=(ry,label,leftAction,rightAction)=>{
        ctx.fillStyle='rgba(167,193,94,0.08)'; ctx.fillRect(rowX,ry,rowW,rowH);
        ctx.strokeStyle='rgba(167,193,94,0.42)'; ctx.strokeRect(rowX+0.5,ry+0.5,rowW,rowH);
        const left={x:rowX,y:ry,w:buttonW,h:rowH,action:leftAction.action,delta:leftAction.delta};
        const right={x:rowX+rowW-buttonW,y:ry,w:buttonW,h:rowH,action:rightAction.action,delta:rightAction.delta};
        practiceRects.push(left,right);
        for(const b of [left,right]){
          const bhv=mouse.x>=b.x&&mouse.x<=b.x+b.w&&mouse.y>=b.y&&mouse.y<=b.y+b.h;
          b.hover=bhv;
          ctx.fillStyle=bhv?'#a7c15e':'rgba(167,193,94,0.18)'; ctx.fillRect(b.x,b.y,b.w,b.h);
        }
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillStyle='#cfe0a8'; ctx.font='700 '+(tiny?9:11)+'px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine(label,rowW-buttonW*2-10),W/2,ry+rowH/2);
        ctx.font='700 '+(tiny?13:15)+'px ui-monospace,Consolas,monospace';
        ctx.fillStyle=left.hover?'#101208':'#cfe0a8';
        ctx.fillText(leftAction.label,left.x+left.w/2,ry+rowH/2);
        ctx.fillStyle=right.hover?'#101208':'#cfe0a8';
        ctx.fillText(rightAction.label,right.x+right.w/2,ry+rowH/2);
        ctx.textBaseline='top';
      };
      drawControlRow(firstY,'SPEED  '+normalizePracticeTrackingSpeed().toFixed(1)+'\u00d7',{action:'tracking-speed',delta:-PRACTICE_TRACKING_SPEED_STEP,label:'\u2212'},{action:'tracking-speed',delta:PRACTICE_TRACKING_SPEED_STEP,label:'+'});
      drawControlRow(secondY,'DIRECTION  '+Math.round(normalizePracticeTrackingDirection())+'\u00b0  '+practiceTrackingDirectionArrow(),{action:'tracking-direction',delta:-PRACTICE_TRACKING_DIRECTION_STEP,label:'\u21b6'},{action:'tracking-direction',delta:PRACTICE_TRACKING_DIRECTION_STEP,label:'\u21b7'});
    }
    y+=cardH+gap;
  }

  ctx.textAlign='center';
  const bw=Math.min(260,W-20), bx=W/2-bw/2, by=Math.min(H-bh-bottomPad, y-gap+backGap);
  backRect={x:bx,y:by,w:bw,h:bh};
  const hov=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=by&&mouse.y<=by+bh;
  ctx.fillStyle=hov?'#e8b658':'rgba(232,182,88,0.14)';
  ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle='#e8b658'; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
  ctx.fillStyle=hov?'#101208':'#e8b658'; ctx.font='700 '+(tiny?12:15)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('\u2039 BACK', W/2, by+(bh-(tiny?12:15))/2);
}
function drawArena(){
  selBg(); arenaRects=[];
  const botMode=isBotArena(),botAdminTest=botMode&&!!arena.botAdminTest,cpuTeamMode=typeof isLocalCpu2v2==='function'&&isLocalCpu2v2(),localMode=botMode||cpuTeamMode;
  const tiny=H<430, dense=H<620;
  const mapVoting=arena.phase==='map_vote'&&arena.mapVotePhase==='voting';
  const mapReveal=arena.phase==='map_reveal'&&arena.mapVotePhase==='reveal';
  const localMapVote=typeof arenaIsLocalMapVote==='function'&&arenaIsLocalMapVote(),mapClock=localMapVote?now:Date.now();
  const mapSeconds=mapVoting?Math.max(0,Math.ceil((arena.mapVoteDeadline-mapClock)/1000)):0;
  const validMapPick=id=>ARENA_MAP_IDS.includes(String(id||''));
  const myVoteId=typeof arenaLocalMapVoterId==='function'?arenaLocalMapVoterId():null,
    otherVoteId=typeof arenaOtherMapVoterId==='function'?arenaOtherMapVoterId():null,
    myMapPick=validMapPick(arena.mapVotes&&arena.mapVotes[myVoteId])?arena.mapVotes[myVoteId]:'arena',
    otherMapPick=validMapPick(arena.mapVotes&&arena.mapVotes[otherVoteId])?arena.mapVotes[otherVoteId]:'arena',
    myPickLabel=cpuTeamMode?'YOUR TEAM PICK':'YOUR PICK',otherPickLabel=cpuTeamMode?'CPU TEAM PICK':'OTHER TEAM PICK',
    voteSummary='VOTE SUMMARY \u00b7 '+myPickLabel+': '+arenaMapName(myMapPick)+' \u00b7 '+otherPickLabel+': '+arenaMapName(otherMapPick);
  const queueNoticeActive=modeBoardNotice&&now<modeBoardNoticeT;
  const titleY=tiny?19:(dense?28:42), subY=tiny?41:(dense?53:70);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=cpuTeamMode?'#bfa8ff':botMode?'#7fd8ff':'#d05548'; ctx.font='700 '+(tiny?20:(W<440?25:34))+'px ui-monospace,Consolas,monospace';
  const arenaTitle=mapVoting?('MAP VOTE \u00b7 '+mapSeconds+'s'):mapReveal?'MAP SELECTED':
                   cpuTeamMode?('\u2694 OFFLINE 2v2 \u00b7 '+botDifficultyName(partyCpuMatch.botDifficulty)):
                   botAdminTest?('\uD83E\uDDE0 AI TEST \u00b7 '+botModelRelease(arena.botModelId).name+' \u00b7 IMPOSSIBLE'):
                   botMode?('\u2694 1v1 VS '+botDifficultyName(arena.botDifficulty)+' CPU'):(W<430?'\u2694 1v1 \u00b7 NEW/BETA':'\u2694 ONLINE 1v1 \u00b7 NEW \u00b7 BETA');
  ctx.fillText(fitLine(arenaTitle,W-18),W/2,titleY);
  ctx.fillStyle=queueNoticeActive?'#ff6b5d':'#8a9268'; ctx.font=(tiny?'8':'10')+'px ui-monospace,Consolas,monospace';
  const compactCasualMeta=!localMode&&!mapVoting&&!mapReveal&&W<430,
    compactCpuTeamMeta=cpuTeamMode&&!mapVoting&&!mapReveal&&W<430,
    compactBetaReveal=mapReveal&&(!localMode||cpuTeamMode)&&W<430,
    onlineBetaPrefix=(!localMode||cpuTeamMode)&&!compactCasualMeta&&!compactCpuTeamMeta?'NEW \u00b7 BETA \u00b7 BEING TESTED \u00b7 ':'';
  const arenaSub=queueNoticeActive?modeBoardNotice:compactBetaReveal?('NEW/BETA \u00b7 '+arenaMapName(arena.mapId)+' \u00b7 WEIGHTED VOTE'):onlineBetaPrefix+(mapVoting?('CHANGE YOUR VOTE UNTIL TIMER ENDS \u00b7 '+voteSummary):
                   mapReveal?('SELECTED MAP: '+arenaMapName(arena.mapId)+' \u00b7 WON THE WEIGHTED VOTE \u00b7 '+voteSummary):
                   botAdminTest?'ADMIN COMPARISON \u00b7 ACCOUNT LADDER WILL NOT CHANGE':
                   cpuTeamMode?(compactCpuTeamMeta?'NEW/BETA \u00b7 LOCAL CPU 2v2 \u00b7 FIRST TO 5 \u00b7 NO REWARDS':'ONE DEVICE ONLY \u00b7 CPU 2v2 \u00b7 FIRST TO 5 \u00b7 NO REWARDS'):
                   botMode?(W<430?'CPU 1v1 \u00b7 FIRST TO 5 \u00b7 COUNTS FOR DAILY TASKS':'ONE DEVICE ONLY \u00b7 FIRST TO 5 \u00b7 NO MATCH REWARDS \u00b7 COUNTS FOR DAILY TASKS'):
                   compactCasualMeta?'NEW/BETA \u00b7 ONLINE \u00b7 FIRST TO 5 \u00b7 COUNTS FOR DAILY TASKS':
                   (tiny?'DIFFERENT DEVICES \u00b7 FIRST TO 5 \u00b7 COUNTS FOR DAILY TASKS':'ONLINE \u00b7 DIFFERENT DEVICES \u00b7 FIRST TO 5 \u00b7 NO MATCH REWARDS \u00b7 COUNTS FOR DAILY TASKS'));
  ctx.fillText(fitLine(arenaSub,W-16),W/2,subY);
  const pw=Math.min(mapVoting||mapReveal?820:560,W-20), px=W/2-pw/2, gap=tiny?4:(dense?7:10);
  const button=(id,label,y,col,sub,enabled=true)=>{
    const h=tiny?32:(dense?(sub?44:36):(sub?58:42)), r={id,x:px,y,w:pw,h,enabled}; arenaRects.push(r);
    const hv=enabled&&mouse.x>=px&&mouse.x<=px+pw&&mouse.y>=y&&mouse.y<=y+h;
    ctx.fillStyle=!enabled?'rgba(255,255,255,.025)':hv?col:'rgba(0,0,0,0.42)'; ctx.fillRect(px,y,pw,h);
    ctx.strokeStyle=enabled?col:'#3a3f38'; ctx.lineWidth=1.3; ctx.strokeRect(px+0.5,y+0.5,pw,h);
    ctx.fillStyle=hv?'#101208':enabled?'#e8d9a8':'#697064'; ctx.font='700 '+(tiny?11:14)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(label,pw-12),W/2,y+(sub&&!tiny?(dense?15:20):h/2));
    if(sub&&!tiny){ ctx.fillStyle=hv?'#202818':enabled?'#8a9268':'#555d53'; ctx.font=(dense?'8':'9')+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(sub,pw-24),W/2,y+(dense?32:42)); }
    return y+h+gap;
  };
  // current account + loadout
  const ly=tiny?49:(dense?65:86), lh=tiny?42:(dense?50:64), bodyY=ly+lh+(tiny?6:(dense?10:20));
  ctx.fillStyle='rgba(0,0,0,0.38)'; ctx.fillRect(px,ly,pw,lh);
  ctx.strokeStyle='#4a4634'; ctx.strokeRect(px+0.5,ly+0.5,pw,lh);
  ctx.textAlign='left'; ctx.fillStyle=cpuTeamMode?'#bfa8ff':botMode?'#7fd8ff':authUser?'#a7c15e':'#d05548'; ctx.font='700 '+(tiny?9:10)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(localMode?'\u25CF LOCAL PLAYER \u00b7 ONE DEVICE ONLY':authUser?('\u25CF '+displayName(authUser)):'\u25CF SIGN IN REQUIRED',px+10,ly+(tiny?12:18));
  const names=arenaLoadoutReady()?[loadout.primary,loadout.secondary,loadout.melee,loadout.utility]
    .filter(Boolean).map(k=>(WEAPONS[k]||UTILITIES[k]).name).join('  \u00b7  '):'Choose PRIMARY + SIDEARM + MELEE on the loadout screen';
  ctx.fillStyle=arenaLoadoutReady()?'#cdd6b0':'#d0a548'; ctx.font=(tiny?'8':'10')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(names,pw-20),px+10,ly+(tiny?29:43)); ctx.textAlign='center';

  if(mapVoting||mapReveal){
    const descriptions={arena:'CLASSIC WALLS \u00b7 CENTRAL COVER',dimension:'PORTALS TELEPORT YOU ACROSS THE MAP',construction:'CRATES + 100 HP EXPLOSIVE TNT'};
    if(mapReveal){
      const cardH=tiny?82:(dense?116:150), y=bodyY+(tiny?2:8);
      ctx.fillStyle='rgba(232,182,88,0.12)'; ctx.fillRect(px,y,pw,cardH);
      ctx.strokeStyle='#e8b658'; ctx.lineWidth=2; ctx.strokeRect(px+0.5,y+0.5,pw,cardH);
      ctx.fillStyle='#fff0a0'; ctx.font='700 '+(tiny?22:(W<360?22:(W<440?25:40)))+'px ui-monospace,Consolas,monospace';
      ctx.fillText(arenaMapName(arena.mapId),W/2,y+cardH*(tiny?0.18:0.20));
      ctx.fillStyle='#a7c15e'; ctx.font='700 '+(tiny?10:14)+'px ui-monospace,Consolas,monospace';
      ctx.fillText('SELECTED MAP',W/2,y+cardH*(tiny?0.39:0.39));
      ctx.fillStyle='#cdd6b0'; ctx.font='700 '+(tiny?'7':(dense?'8':'10'))+'px ui-monospace,Consolas,monospace';
      ctx.fillText(myPickLabel+': '+arenaMapName(myMapPick),W/2,y+cardH*(tiny?0.56:0.57));
      ctx.fillStyle='#bfa8ff';
      ctx.fillText(otherPickLabel+': '+arenaMapName(otherMapPick),W/2,y+cardH*(tiny?0.70:0.72));
      ctx.fillStyle='#8a9268'; ctx.font=(tiny?'7':(dense?'8':'10'))+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(descriptions[arena.mapId]||descriptions.arena,pw-20),W/2,y+cardH*(tiny?0.87:0.89));
    } else {
      const ids=ARENA_MAP_IDS, wide=W>=620, cardGap=tiny?4:8;
      const cardH=wide?(tiny?54:(dense?74:94)):(tiny?36:(dense?47:58));
      const cardW=wide?(pw-cardGap*(ids.length-1))/ids.length:pw;
      const summaryH=tiny?29:(dense?38:46), cardsY=bodyY+summaryH;
      const counts=Object.fromEntries(ids.map(id=>[id,0]));
      for(const id of Object.values(arena.mapVotes||{})) if(Object.prototype.hasOwnProperty.call(counts,id)) counts[id]++;
      ctx.fillStyle='#d0a548'; ctx.font='700 '+(tiny?'7':(dense?'8':'9'))+'px ui-monospace,Consolas,monospace';
      ctx.fillText('VOTE SUMMARY',W/2,bodyY+(tiny?3:5));
      ctx.fillStyle='#cdd6b0';
      ctx.fillText(myPickLabel+': '+arenaMapName(myMapPick),W/2,bodyY+(tiny?13:(dense?17:20)));
      ctx.fillStyle='#bfa8ff';
      ctx.fillText(otherPickLabel+': '+arenaMapName(otherMapPick),W/2,bodyY+(tiny?23:(dense?29:34)));
      ids.forEach((id,i)=>{
        const x=wide?px+i*(cardW+cardGap):px, y=wide?cardsY:cardsY+i*(cardH+cardGap);
        const selected=myMapPick===id,otherSelected=otherMapPick===id,
          pickLabels=[selected?myPickLabel:'',otherSelected?otherPickLabel:''].filter(Boolean);
        const r={id:'map_vote_'+id,mapId:id,x,y,w:cardW,h:cardH}; arenaRects.push(r);
        const hv=mouse.x>=x&&mouse.x<=x+cardW&&mouse.y>=y&&mouse.y<=y+cardH;
        ctx.fillStyle=selected?'rgba(167,193,94,0.30)':otherSelected?'rgba(191,168,255,0.20)':hv?'rgba(232,182,88,0.20)':'rgba(0,0,0,0.42)'; ctx.fillRect(x,y,cardW,cardH);
        ctx.strokeStyle=selected?'#a7c15e':otherSelected?'#bfa8ff':'#e8b658'; ctx.lineWidth=selected||otherSelected?2:1.2; ctx.strokeRect(x+0.5,y+0.5,cardW,cardH);
        ctx.fillStyle=selected?'#dff0aa':'#e8d9a8';
        const titleSize=wide?(tiny?10:(dense?12:15)):(tiny?11:(dense?13:16));
        ctx.font='700 '+titleSize+'px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine(arenaMapName(id),cardW-12),x+cardW/2,y+(wide?cardH*0.30:cardH*0.32));
        ctx.fillStyle='#8a9268'; ctx.font=(tiny?'7':(dense?'8':'9'))+'px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine(descriptions[id],cardW-12),x+cardW/2,y+(wide?cardH*0.58:cardH*0.62));
        ctx.fillStyle=selected?'#a7c15e':otherSelected?'#bfa8ff':'#d0a548'; ctx.font='700 '+(tiny?'7':'8')+'px ui-monospace,Consolas,monospace';
        const pickText=(pickLabels.length?pickLabels.join(' + ')+' \u00b7 ':'')+counts[id]+'/2 PICKS';
        ctx.fillText(fitLine(pickText,cardW-10),x+cardW/2,y+cardH*(wide?0.82:0.86));
      });
      const listBottom=wide?cardsY+cardH:cardsY+ids.length*cardH+(ids.length-1)*cardGap;
      if(!localMapVote)button('map_leave_match','LEAVE MATCH',listBottom+cardGap,'#d05548');
    }
  } else if(cpuTeamMode&&partyCpuMatch.phase==='match_end'){
    const me=partyCpuMatch.scores.allies||0,them=partyCpuMatch.scores.cpus||0;
    ctx.fillStyle=me>them?'#a7c15e':'#d05548';ctx.font='700 '+(tiny?18:24)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(me>them?'YOUR TEAM WINS':'CPUs WIN',W/2,bodyY+12);
    ctx.fillStyle='#e8d9a8';ctx.font='700 '+(tiny?30:42)+'px ui-monospace,Consolas,monospace';ctx.fillText(me+'  \u2014  '+them,W/2,bodyY+(tiny?40:62));
    ctx.fillStyle='#8a9268';ctx.font=(tiny?'8':'10')+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(arena.status,pw-20),W/2,bodyY+(tiny?62:94));
    ctx.fillStyle='#8a9268';ctx.fillText(fitLine(botLadderMatchResultText(partyCpuMatch),pw-20),W/2,bodyY+(tiny?72:108));
    ctx.fillStyle='#7fd8ff';ctx.font='700 '+(tiny?'7':'9')+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(typeof aiTrainingMatchStatusText==='function'?aiTrainingMatchStatusText(partyCpuMatch):'',pw-20),W/2,bodyY+(tiny?82:122));
    let y=bodyY+(tiny?94:140),settled=botLadderMatchSettled(partyCpuMatch),rematchReady=settled&&(!authUser||
      (typeof botLadderReadyForMatch==='function'&&botLadderReadyForMatch()&&
       (typeof botLadderSecureMatchReady!=='function'||botLadderSecureMatchReady()))),
      blockedNote=typeof botLadderSecureMatchReady==='function'&&!botLadderSecureMatchReady()?'Secure result saving is unavailable. Return to the CPU ladder.':
        botLadderSyncState==='conflict'?'Resolve the saved-result conflict from the CPU ladder.':
        botLadderSyncState==='reconciling'?'Wait while the saved result is verified.':
        botLadderSyncState==='storage_error'?'Device saving must recover before another ladder match.':'Return to the CPU ladder to finish syncing.';
    y=button(rematchReady?'teamrematch':'teamwait',!settled?'SAVING RESULT\u2026':rematchReady?'PLAY AGAIN':'LADDER NOT READY',y,'#a7c15e',
      !settled?'Play Again unlocks after this result is safely recorded.':rematchReady?'New first-to-5 team match at your current ladder difficulty.':blockedNote,rematchReady);
    y=button('teamloadout','CHANGE WEAPONS',y,'#7fd8ff');
    button('teamleave','BACK TO OFFLINE VS CPU',y,'#8a9268');
  } else if(botMode&&arena.phase==='match_end'){
    const me=arena.scores[LOCAL_DUEL_PLAYER]||0, them=arena.scores[LOCAL_DUEL_BOT]||0;
    const ladderResult=botLadderMatchResultText(arena);
    ctx.fillStyle=me>them?'#a7c15e':'#d05548'; ctx.font='700 '+(tiny?18:24)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(me>them?'YOU BEAT THE BOT':'BOT WINS',W/2,bodyY+12);
    ctx.fillStyle='#e8d9a8'; ctx.font='700 '+(tiny?30:42)+'px ui-monospace,Consolas,monospace'; ctx.fillText(me+'  \u2014  '+them,W/2,bodyY+(tiny?40:62));
    ctx.fillStyle='#8a9268'; ctx.font=(tiny?'8':'10')+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(arena.status,pw-20),W/2,bodyY+(tiny?62:94));
    ctx.fillStyle='#8a9268'; ctx.font=(tiny?'8':'10')+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(ladderResult,pw-20),W/2,bodyY+(tiny?72:108));
    if(!botAdminTest){ctx.fillStyle=arena.dailyTaskResult?'#a7c15e':'#7fd8ff';ctx.font='700 '+(tiny?'7':'9')+'px ui-monospace,Consolas,monospace';
      const dailyText=arena.dailyTaskResult||(typeof dailyDuelTaskProgressText==='function'?dailyDuelTaskProgressText():'');
      ctx.fillText(fitLine(dailyText,pw-20),W/2,bodyY+(tiny?82:122));}
    let y=bodyY+(tiny?94:140);
    if(botAdminTest){
      y=bodyY+(tiny?84:126);
      y=button('bottestagain','TEST '+botModelRelease(arena.botModelId).name+' AGAIN',y,'#a7c15e','Same Impossible execution and deterministic AI seed.');
      button('botlearningback','BACK TO AI BOT MODELS',y,'#7fd8ff');
    }else{
      const settled=botLadderMatchSettled(arena),rematchReady=settled&&(!authUser||
        (typeof botLadderReadyForMatch==='function'&&botLadderReadyForMatch()&&
         (typeof botLadderSecureMatchReady!=='function'||botLadderSecureMatchReady()))),
        blockedNote=typeof botLadderSecureMatchReady==='function'&&!botLadderSecureMatchReady()?'Secure result saving is unavailable. Return to the CPU ladder.':
          botLadderSyncState==='conflict'?'Resolve the saved-result conflict from the CPU ladder.':
          botLadderSyncState==='reconciling'?'Wait while the saved result is verified.':
          botLadderSyncState==='storage_error'?'Device saving must recover before another ladder match.':'Return to the CPU ladder to finish syncing.';
      y=button(rematchReady?'botrematch':'botwait',!settled?'SAVING RESULT\u2026':rematchReady?'PLAY AGAIN':'LADDER NOT READY',y,'#a7c15e',
        !settled?'Play Again unlocks after this result is safely recorded.':rematchReady?'New first-to-5 match at your current ladder difficulty.':blockedNote,rematchReady);
      y=button('botloadout','SWITCH WEAPONS',y,'#7fd8ff');
      button('botleave','BACK TO OFFLINE \u00b7 ONE DEVICE ONLY',y,'#8a9268');
    }
  } else if(!authUser){
    let y=bodyY; y=button('signin','SIGN IN TO PLAY',y,'#e8b658','Online Arena does not allow guest play.');
    button('back','\u2039 BACK TO MENU',y,'#8a9268');
  } else if(arena.phase==='queue'){
    ctx.fillStyle='#e8b658'; ctx.font='700 '+(tiny?17:22)+'px ui-monospace,Consolas,monospace'; ctx.fillText('QUICK MATCH',W/2,bodyY+(tiny?12:20));
    ctx.fillStyle='#8a9268'; ctx.font=(tiny?'9':'11')+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(arena.status,pw-20),W/2,bodyY+(tiny?35:55));
    const spin=performance.now()/260, sy=bodyY+(tiny?66:105), sr=tiny?14:22; ctx.strokeStyle='#e8b658'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(W/2,sy,sr,spin,spin+4.5); ctx.stroke();
    button('cancel','CANCEL SEARCH',bodyY+(tiny?91:154),'#d05548');
  } else if(arena.phase==='room'||arena.phase==='lobby'){
    ctx.fillStyle='#e8b658'; ctx.font='700 '+(tiny?10:13)+'px ui-monospace,Consolas,monospace'; ctx.fillText(arena.mode==='queue'?'CASUAL QUICK MATCH':'PRIVATE ROOM',W/2,bodyY+8);
    ctx.fillStyle='#fff0a0'; ctx.font='700 '+(tiny?25:38)+'px ui-monospace,Consolas,monospace'; ctx.fillText(arena.room,W/2,bodyY+(tiny?30:50));
    ctx.fillStyle='#8a9268'; ctx.font=(tiny?'8':'10')+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(arena.status,pw-24),W/2,bodyY+(tiny?50:85));
    let y=bodyY+(tiny?60:105);
    if(arena.mode==='private') y=button('copy','COPY ROOM CODE',y,'#7fd8ff');
    if(arena.opponent&&!arena.localReady) y=button('ready','READY',y,'#a7c15e','Both players must be ready.');
    else if(arena.opponent){ ctx.fillStyle='#a7c15e'; ctx.font='700 '+(tiny?9:12)+'px ui-monospace,Consolas,monospace'; ctx.fillText(arena.remoteReady?'STARTING MATCH...':'READY \u00b7 WAITING FOR OPPONENT',W/2,y+(tiny?10:20)); y+=tiny?24:52; }
    button('cancel','LEAVE ROOM',y,'#d05548');
  } else if(arena.phase==='match_end'){
    const me=arena.scores[authUser.id]||0, them=arena.opponent?(arena.scores[arena.opponent.id]||0):0;
    ctx.fillStyle=me>them?'#a7c15e':'#d05548'; ctx.font='700 '+(tiny?18:24)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(me>them?'MATCH WON':'MATCH LOST',W/2,bodyY+12);
    ctx.fillStyle='#e8d9a8'; ctx.font='700 '+(tiny?30:42)+'px ui-monospace,Consolas,monospace'; ctx.fillText(me+'  \u2014  '+them,W/2,bodyY+(tiny?40:62));
    ctx.fillStyle='#8a9268'; ctx.font=(tiny?'8':'10')+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(arena.status,pw-20),W/2,bodyY+(tiny?62:94));
    ctx.fillStyle=arena.dailyTaskResult?'#a7c15e':'#7fd8ff';ctx.font='700 '+(tiny?'7':'9')+'px ui-monospace,Consolas,monospace';
    const dailyText=arena.dailyTaskResult||(typeof dailyDuelTaskProgressText==='function'?dailyDuelTaskProgressText():'');
    ctx.fillText(fitLine(dailyText,pw-20),W/2,bodyY+(tiny?72:110));
    let y=bodyY+(tiny?82:132);
    y=button('rematch',arena.rematchVotes.has(authUser.id)?'REMATCH REQUESTED':'REMATCH',y,'#a7c15e');
    y=button('again','PLAY AGAIN \u00b7 QUICK MATCH',y,'#e8b658');
    y=button('switchweapons','SWITCH WEAPONS',y,'#7fd8ff');
    button('leave','LEAVE ARENA',y,'#d05548');
  } else {
    let y=bodyY;
    y=button('quick','CASUAL 1v1 \u00b7 QUICK MATCH',y,'#e8b658','Find another signed-in player. First to 5 rounds wins.');
    const partyH=tiny?32:(dense?44:58);
    ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(px,y,pw,partyH); ctx.strokeStyle='#4a4634'; ctx.strokeRect(px+0.5,y+0.5,pw,partyH);
    ctx.fillStyle='#6b7455'; ctx.font='700 '+(tiny?9:12)+'px ui-monospace,Consolas,monospace';
    ctx.fillText('PARTIES \u00b7 NEW \u00b7 BETA \u00b7 OPEN FROM HOME',W/2,y+(tiny?partyH/2:15));
    if(!tiny){ ctx.font=(dense?'8':'9')+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine('BEING TESTED \u00b7 GUEST-FRIENDLY CODES \u00b7 UP TO 4 PLAYERS',pw-20),W/2,y+(dense?32:39)); }
    y+=partyH+gap;
    const dh=tiny?32:(dense?44:58);
    ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(px,y,pw,dh); ctx.strokeStyle='#4a4634'; ctx.strokeRect(px+0.5,y+0.5,pw,dh);
    ctx.fillStyle='#6b7455'; ctx.font='700 '+(tiny?10:13)+'px ui-monospace,Consolas,monospace'; ctx.fillText('RANK + ELO \u2014 OPEN FROM PLAY MENU',W/2,y+(tiny?dh/2:15));
    if(!tiny){ ctx.font=(dense?'8':'9')+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine('Ranked stays locked until wins and divisions can be server-secured.',pw-20),W/2,y+(dense?32:39)); }
    y+=dh+gap;
    button('back','\u2039 BACK TO MENU',y,'#8a9268');
  }
  if(arena.status&&arena.phase==='menu'&&!tiny){
    ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(arena.status,W-30),W/2,H-18);
  }
  ctx.textBaseline='alphabetic'; ctx.textAlign='left';
}
let cpuUiLaunchVersion=0,cpuUiPendingIntent=0,cpuUiPendingMode='',cpuUiPendingOrigin='';
function cpuLaunchMode(mode){return mode==='ai1v1'||mode==='ai2v2'||mode==='partycpu2v2';}
function beginCpuLaunchIntent(mode,origin=''){
  if(!cpuLaunchMode(mode))return 0;
  mode=String(mode);origin=String(origin);
  if(cpuUiPendingIntent&&cpuUiPendingMode===mode&&cpuUiPendingOrigin===origin&&cpuUiPendingIntent===cpuUiLaunchVersion)
    return cpuUiPendingIntent;
  cpuUiPendingMode=mode;cpuUiPendingOrigin=origin;cpuUiPendingIntent=++cpuUiLaunchVersion;return cpuUiPendingIntent;
}
function cpuLaunchIntentCurrent(intent){return !intent||intent===cpuUiLaunchVersion;}
function cancelCpuLaunchIntent(){
  cpuUiLaunchVersion++;cpuUiPendingIntent=0;cpuUiPendingMode='';cpuUiPendingOrigin='';
  if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();
}
function cpuResultRouteToLoadout(mode,message){
  mode=mode==='ai2v2'?'ai2v2':'ai1v1';
  if(typeof cancelCpuLaunchIntent==='function')cancelCpuLaunchIntent();else if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();
  if(mode==='ai2v2')offlineCpu2v2Leave('',false);else leaveArena('',false);
  pendingGameMode=mode;modeBoardMode='endless';loadoutBackPage='offlinecpu';restoreLastLoadoutForMode(mode);selPage='loadout';
  modeBoardNotice=String(message||'CHOOSE YOUR WEAPONS BEFORE PLAYING AGAIN');modeBoardNoticeT=performance.now()+4200;
  return false;
}
function cpuResultRematch(mode,temporaryGiftVerified=false,ladderReady=false,uiIntent=0){
  mode=mode==='ai2v2'?'ai2v2':'ai1v1';
  if(!uiIntent&&typeof beginCpuLaunchIntent==='function')uiIntent=beginCpuLaunchIntent(mode,'result');
  const team=mode==='ai2v2',match=team?partyCpuMatch:arena,
    stillCurrent=()=>(typeof cpuLaunchIntentCurrent!=='function'||cpuLaunchIntentCurrent(uiIntent))&&
      (typeof menuOpen==='undefined'||!menuOpen)&&(team?
      (partyCpuMatch===match&&typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()&&partyCpuMatch.phase==='match_end'):
      (arena===match&&isBotArena()&&arena.phase==='match_end'));
  if(!stillCurrent())return false;
  const expired=(message='TEMPORARY WEAPON ACCESS CHANGED · PICK ANOTHER')=>{
    if(!stillCurrent())return false;
    if(typeof dropUnownedFromLoadout==='function')dropUnownedFromLoadout();
    cpuResultRouteToLoadout(mode,message);sfx('dry');return false;
  };
  if(typeof temporaryWeaponLoadoutReady==='function'&&!temporaryWeaponLoadoutReady())return expired();
  if(!loadout||!loadout.primary||!loadout.secondary||!loadout.melee)
    return expired('A TEMPORARY WEAPON EXPIRED OR YOUR LOADOUT IS INCOMPLETE · PICK ANOTHER');
  if(!temporaryGiftVerified&&typeof verifyTemporaryWeaponLoadoutForLaunch==='function'){
    const verified=verifyTemporaryWeaponLoadoutForLaunch(
      ()=>{if(stillCurrent())cpuResultRematch(mode,true,ladderReady,uiIntent);},expired);
    if(!verified){if(stillCurrent())arena.status='VERIFYING TEMPORARY WEAPON ACCESS BEFORE PLAY AGAIN…';return true;}
  }
  if(!stillCurrent())return false;
  // Refreshing the canonical ladder/model can outlive a temporary grant.
  // Re-enter through this validator after refresh so a mid-wait revoke or
  // expiry cannot launch either ranked mode with a stale weapon entitlement.
  if(!ladderReady&&typeof deferBotLadderMatchStart==='function'&&
     deferBotLadderMatchStart(mode,()=>{if(stillCurrent())cpuResultRematch(mode,false,true,uiIntent);}))return true;
  if(!stillCurrent())return false;
  if(team){
    const localId=typeof cpuTeamLocalId==='function'?String(cpuTeamLocalId()||''):'',
      kit=typeof partyCpuKit==='function'?partyCpuKit(loadout):null;
    if(!localId||!kit)return expired('YOUR CPU 2v2 LOADOUT CHANGED · PICK YOUR WEAPONS AGAIN');
    partyCpuMatch.loadouts[localId]=kit;partyCpuMatch.localLoadout=kit;
  }
  return team?offlineCpu2v2Rematch({ladderReady:true}):startBotArena({ladderReady:true});
}
function arenaClick(){
  const hit=r=>mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h;
  for(const r of arenaRects) if(r.enabled!==false&&hit(r)){
    if(r.mapId){ arenaCastMapVote(r.mapId); return; }
    else if(r.id==='map_leave_match') leaveArena('Left the match.',false);
    else if(r.id==='teamrematch') cpuResultRematch('ai2v2');
    else if(r.id==='teamloadout'){
      if(typeof cancelCpuLaunchIntent==='function')cancelCpuLaunchIntent();else if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();
      offlineCpu2v2Leave('',false);pendingGameMode='ai2v2';modeBoardMode='endless';loadoutBackPage='offlinecpu';restoreLastLoadoutForMode('ai2v2');selPage='loadout';
    }
    else if(r.id==='teamleave'){
      if(typeof cancelCpuLaunchIntent==='function')cancelCpuLaunchIntent();else if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();offlineCpu2v2Leave('',false);
    }
    else if(r.id==='bottestagain') restartAiLearningBotTest(arena);
    else if(r.id==='botlearningback') leaveArena('',false);
    else if(r.id==='botrematch') cpuResultRematch('ai1v1');
    else if(r.id==='botloadout'){
      if(typeof cancelCpuLaunchIntent==='function')cancelCpuLaunchIntent();else if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();
      leaveArena('',false); pendingGameMode='ai1v1'; modeBoardMode='endless'; loadoutBackPage='offlinecpu'; restoreLastLoadoutForMode('ai1v1'); selPage='loadout';
    }
    else if(r.id==='botleave'){
      if(typeof cancelCpuLaunchIntent==='function')cancelCpuLaunchIntent();else if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();leaveArena('',false);
    }
    else if(r.id==='signin'){
      arenaAuthPending=true; $('aguest').style.display='none'; $('authmsg').textContent='Sign in is required for Online multiplayer on different devices.'; $('authwrap').style.display='flex';
    } else if(r.id==='quick') arenaQuickMatch();
    else if(r.id==='copy') arenaCopyCode();
    else if(r.id==='ready') arenaSetReady(true);
    else if(r.id==='cancel') leaveArena('Left matchmaking.',false);
    else if(r.id==='rematch') arenaVoteRematch();
    else if(r.id==='again') arenaPlayAgain();
    else if(r.id==='switchweapons') arenaSwitchWeapons();
    else if(r.id==='leave') leaveArena('',true);
    else if(r.id==='back'){ leaveArena('',false); selPage=pendingGameMode==='arena'?'loadout':'hub'; }
    sfx('swap'); return;
  }
}
function onlinePlayReady(){
  return !!(sb && authUser && navigator.onLine!==false);
}
function onlineServiceAvailable(){ return !!(sb && navigator.onLine!==false); }
function partyAllowsQueue(mode){
  if(typeof partyCpuSessionOpen==='function'&&partyCpuSessionOpen()&&mode!=='partycpu2v2'){
    const message='FINISH OR CANCEL THE PARTY CPU MATCH SETUP FIRST';
    modeBoardNotice=message;modeBoardNoticeT=performance.now()+2800;party.status=message;arena.status=message;sfx('dry');return false;
  }
  if(party&&party.accepted&&!partyRequirePlayers()) return false;
  const cap=PARTY_QUEUE_CAPS[mode];
  if(!cap||!party||!party.accepted||party.members.length<=cap){
    modeBoardNotice=''; modeBoardNoticeT=0; return true;
  }
  const message='THE PARTY IS TOO BIG FOR THIS QUEUE';
  modeBoardNotice=message; modeBoardNoticeT=performance.now()+2800;
  party.status=message; arena.status=message; sfx('dry');
  return false;
}
function openModeLeaderboard(){
  modeBoardMode=null; pendingGameMode=null; modeBoardOrigin='hub';
  selPage='modeboard'; fetchBoard(); sfx('swap'); return true;
}
function chooseGameMode(mode,returnPage='modeboard'){
  if(typeof requireResolvedUsernameForGameplay==='function'&&!requireResolvedUsernameForGameplay()){
    modeBoardNotice='CHOOSE YOUR USERNAME TO PLAY'; modeBoardNoticeT=performance.now()+2800; sfx('dry'); return false;
  }
  if(!['arena','arena2v2','endless','ai1v1','ai2v2'].includes(mode)){ sfx('dry'); return false; }
  // Size is checked before locked/auth states so a party always gets the
  // useful queue-capacity explanation for the button it just chose.
  if(!partyAllowsQueue(mode)) return false;
  if((mode==='ai1v1'||mode==='ai2v2')&&typeof botLadderHasPendingResult==='function'&&botLadderHasPendingResult()){
    modeBoardNotice='WAITING FOR YOUR PREVIOUS AI RESULT TO SAVE';modeBoardNoticeT=performance.now()+2800;sfx('dry');return false;
  }
  if(mode==='arena2v2'){
    arena.status='2v2 is locked and coming soon.'; sfx('dry'); return false;
  }
  loadoutBackPage=returnPage;
  if(mode==='arena' && !onlinePlayReady()){
    if(navigator.onLine===false || !sb){ arena.status='Online games are unavailable. Reconnect and try again.'; sfx('dry'); return false; }
    arenaAuthPending=true; $('aguest').style.display='none';
    $('authmsg').textContent='Sign in is required for Online multiplayer on different devices.';
    $('authwrap').style.display='flex'; sfx('dry'); return false;
  }
  pendingGameMode=mode; modeBoardMode=mode==='arena'?'arena':'endless';
  restoreLastLoadoutForMode(mode);
  selPage='loadout'; sfx('swap'); return true;
}
function launchSelectedMode(temporaryGiftVerified=false,uiIntent=0,expectedMode=''){
  if(typeof requireResolvedUsernameForGameplay==='function'&&!requireResolvedUsernameForGameplay()){
    modeBoardNotice='CHOOSE YOUR USERNAME TO PLAY'; modeBoardNoticeT=performance.now()+2800; sfx('dry'); return false;
  }
  const launchMode=String(expectedMode||pendingGameMode||''),cpuLaunch=typeof cpuLaunchMode==='function'&&cpuLaunchMode(launchMode);
  if(sb&&authUser&&(!profileLoaded||profileOwnerUserId!==String(authUser.id||''))){
    modeBoardNotice='LOADING YOUR ACCOUNT PROGRESS\u2026';modeBoardNoticeT=performance.now()+2200;sfx('dry');return false;
  }
  if(cpuLaunch&&!uiIntent&&typeof beginCpuLaunchIntent==='function')uiIntent=beginCpuLaunchIntent(launchMode,'loadout');
  const cpuStillCurrent=()=>!cpuLaunch||((typeof cpuLaunchIntentCurrent!=='function'||cpuLaunchIntentCurrent(uiIntent))&&pendingGameMode===launchMode&&selPage==='loadout'&&
    (typeof state==='undefined'||state==='select')&&(typeof menuOpen==='undefined'||!menuOpen));
  if(!cpuStillCurrent())return false;
  if(typeof temporaryWeaponLoadoutReady==='function'&&!temporaryWeaponLoadoutReady()){
    dropUnownedFromLoadout();
    modeBoardNotice='A TEMPORARY WEAPON EXPIRED OR COULD NOT BE VERIFIED · PICK ANOTHER';
    modeBoardNoticeT=performance.now()+3200; pracNeedMsgT=now+2000; sfx('dry'); return false;
  }
  if(!temporaryGiftVerified&&typeof verifyTemporaryWeaponLoadoutForLaunch==='function'){
    const ready=verifyTemporaryWeaponLoadoutForLaunch(
      ()=>{if(cpuStillCurrent())launchSelectedMode(true,uiIntent,launchMode);},
      ()=>{if(cpuStillCurrent()){modeBoardNotice='TEMPORARY WEAPON ACCESS CHANGED · PICK ANOTHER';modeBoardNoticeT=performance.now()+3200;pracNeedMsgT=now+2000;sfx('dry');}}
    );
    if(!ready){modeBoardNotice='VERIFYING TEMPORARY GIFT WITH THE SERVER…';modeBoardNoticeT=performance.now()+3200;return false;}
  }
  if(!cpuStillCurrent())return false;
  if(!(loadout.primary&&loadout.secondary&&loadout.melee)){
    pracNeedMsgT=now+1600; sfx('dry'); return false;
  }
  if(pendingGameMode==='partycpu2v2') return partyCpuSubmitLoadout();
  // Party membership can change while the loadout screen is open, so the
  // selection-page check alone is not enough to protect queue capacities.
  if(!partyAllowsQueue(pendingGameMode)) return false;
  if(pendingGameMode==='arena'){
    if(!onlinePlayReady()){ chooseGameMode('arena'); return false; }
    if(!arenaQuickMatch()) return false;
    sfx('swap'); return true;
  }
  if(pendingGameMode==='ai1v1'){
    loadout.utility=null; startBotArena(); sfx('wave'); return true;
  }
  if(pendingGameMode==='ai2v2'){
    loadout.utility=null; if(!startOfflineCpu2v2())return false; sfx('wave'); return true;
  }
  if(pendingGameMode==='practice'){
    const mode=pendingPractice||'range'; pendingPractice=null; pendingGameMode=null; startPractice(mode); sfx('wave'); return true;
  }
  pendingGameMode=null; pendingPractice=null; modeBoardMode=null; startGame(); return true;
}
function navigateSelectBack(){
  if(detailKey){ detailKey=null; sfx('swap'); return; }
  if(selPage==='shop'&&shopWeaponPickerOpen){ shopWeaponPickerOpen=false; sfx('swap'); return; }
  if(selPage==='weaponbrowse'){ selPage='weapons'; sfx('swap'); return; }
  if(selPage==='weapons'){ selPage='hub'; sfx('swap'); return; }
  if(CATS.some(c=>c[0]===selPage)){ selPage=pendingGameMode?'loadout':'hub'; sfx('swap'); return; }
  if(selPage==='loadout'){
    if(typeof cancelCpuLaunchIntent==='function')cancelCpuLaunchIntent();else if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();
    if(pendingGameMode==='partycpu2v2'){
      const direct=!!(party&&party.directCpu);partyCpuAbort(direct?'FRIEND CPU GAME SETUP CANCELLED.':'Party CPU match setup was cancelled.',true);
      selPage=direct?'offlinecpu':'party';if(direct)offlineCpuView='2v2';sfx('swap');return;
    }
    const returnTo=pendingGameMode==='practice'?'practice':(loadoutBackPage||'modeboard');
    pendingGameMode=null; pendingPractice=null; selPage=returnTo; sfx('swap'); return;
  }
  if(selPage==='modeboard'){
    const destination=modeBoardOrigin==='party'&&party.accepted?'party':'hub';
    pendingGameMode=null; modeBoardMode=null; modeBoardOrigin='hub'; selPage=destination; sfx('swap'); return;
  }
  if(selPage==='offlinecpu'){
    if(typeof cancelCpuLaunchIntent==='function')cancelCpuLaunchIntent();else if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();
    if(party&&party.directCpu){
      if(typeof partyCpuSessionOpen==='function'&&partyCpuSessionOpen())partyCpuAbort('FRIEND CPU GAME SETUP CANCELLED.',true);
      else if(typeof partyDirectCpuClose==='function')partyDirectCpuClose('FRIEND INVITE CANCELLED');
    }
    if(offlineCpuView!=='modes'){offlineCpuView='modes';offlineCpuInfoKey='';offlineCpuFocusId='cpu_root_1v1';sfx('swap');return;}
    pendingGameMode=null;modeBoardMode='endless';selPage='modeboard';sfx('swap');return;
  }
  if(selPage==='ranked'){ selPage='modeboard'; sfx('swap'); return; }
  if(selPage==='social'){ selPage='hub'; sfx('swap'); return; }
  if(selPage==='partymodes'){ selPage=party.accepted?'party':'social'; sfx('swap'); return; }
  if(selPage==='party'){
    party.chatOpen=false;
    if(typeof partyCpuSessionOpen==='function'&&partyCpuSessionOpen()){ partyCpuAbort('Party CPU match setup was cancelled.',true); sfx('swap'); }
    else if(party.accepted&&party.cpuIntent){selPage='offlinecpu';offlineCpuView='2v2';offlineCpuInfoKey='';sfx('swap');}
    else if(party.accepted){ selPage='social'; fetchSocial(true); sfx('swap'); }
    else if(party.channel) { leaveParty('',false); selPage='social'; fetchSocial(true); sfx('swap'); }
    else { selPage='social'; fetchSocial(true); sfx('swap'); }
    return;
  }
  if(selPage==='modes'){ selPage='hub'; sfx('swap'); return; }
  if(selPage==='arena'){
    if(typeof cancelCpuLaunchIntent==='function')cancelCpuLaunchIntent();else if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();
    if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()){ offlineCpu2v2Leave('',false); sfx('swap'); return; }
    if(isBotArena()){ leaveArena('',false); sfx('swap'); return; }
    leaveArena('',false); selPage=pendingGameMode==='arena'?'loadout':'hub'; sfx('swap'); return;
  }
  if(selPage==='shop' && pendingGameMode){ selPage='loadout'; sfx('swap'); return; }
  if(selPage==='tutorial'){ selPage='howto'; sfx('swap'); return; }
  if(selPage!=='hub'){ selPage='hub'; sfx('swap'); return; }
  menuOpen=!menuOpen; sfx('swap');
}
function drawModeLeaderboard(){
  selBg(); leaderboardRowRects=[]; modeBoardActionRects=[];
  const tiny=H<450||(W<=360&&H<=500), compact=H<600;
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillStyle='#e8b658'; ctx.font='700 '+(tiny?20:compact?26:34)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('PLAY',W/2,tiny?4:10);
  const noticeActive=typeof modeBoardNotice!=='undefined'&&modeBoardNotice&&typeof modeBoardNoticeT!=='undefined'&&typeof now!=='undefined'&&now<modeBoardNoticeT;
  ctx.fillStyle=noticeActive?'#ff6b5d':'#8a9268'; ctx.font='700 '+(tiny?'7':compact?'9':'10')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(noticeActive?modeBoardNotice:'CHOOSE WHERE YOU WANT TO PLAY',W-20),W/2,tiny?25:compact?39:50);

  const margin=tiny?7:compact?10:16, gap=tiny?2:compact?4:7;
  const top=tiny?35:compact?52:66, backH=tiny?30:compact?34:40;
  const backY=H-backH-(tiny?5:8), contentBottom=backY-(tiny?5:8);
  const contentW=Math.min(780,W-margin*2), contentX=(W-contentW)/2;
  const sectionTitleH=tiny?14:compact?22:28, sectionGap=tiny?3:compact?6:10;
  const outerPad=tiny?1:compact?4:6;
  // Casual modes share one row, Ranked gets its own row, and Offline modes
  // share one row. The three clear sections stay tall even in phone landscape.
  const sectionCount=3, actionRows=3;
  const fixed=sectionTitleH*sectionCount+sectionGap*(sectionCount-1)+outerPad*2*sectionCount;
  const actionH=Math.min(tiny?(H<390?54:60):compact?72:88,
    Math.max(tiny?44:compact?54:64,Math.floor((contentBottom-top-fixed)/actionRows)));

  const drawAction=(item,x,y,w,h)=>{
    const hot=item.enabled&&mouse.x>=x&&mouse.x<=x+w&&mouse.y>=y&&mouse.y<=y+h;
    const r={id:item.id,mode:item.mode,x,y,w,h,enabled:item.enabled}; modeBoardActionRects.push(r);
    ctx.fillStyle=item.enabled?(hot?item.col:'rgba(0,0,0,0.44)'):'rgba(38,38,38,0.78)'; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle=item.enabled?item.col:'#4a4a45'; ctx.strokeRect(x+0.5,y+0.5,w,h);
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=item.enabled?(hot?'#101208':'#e8d9a8'):'#65655f';
    const labelFs=item.id==='offline_cpu_menu'?(tiny?11:W<430?14:compact?16:22):(tiny?15:compact?19:25);
    ctx.font='700 '+labelFs+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(item.label,w-14),x+w/2,y+h/2-(item.note?5:0));
    if(item.note){
      ctx.fillStyle=item.enabled?(hot?'#24291a':'#7f876e'):'#55554f';
      ctx.font='700 '+(tiny?6:compact?7:8)+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(item.note,w-14),x+w/2,y+h/2+(tiny?9:compact?12:16));
    }
  };
  const sectionHeight=section=>{
    const rows=Math.ceil(section.actions.length/(section.cols||1));
    return outerPad*2+sectionTitleH+rows*actionH+(rows-1)*gap;
  };
  const drawSection=(section,y)=>{
    const sectionH=sectionHeight(section);
    ctx.fillStyle='rgba(12,13,10,0.76)'; ctx.fillRect(contentX,y,contentW,sectionH);
    ctx.strokeStyle=section.col; ctx.lineWidth=1.5; ctx.strokeRect(contentX+0.5,y+0.5,contentW,sectionH);
    const headY=y+outerPad;
    ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillStyle=section.col;
    ctx.font='700 '+(tiny?13:compact?17:22)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(section.title,contentX+10,headY+sectionTitleH/2);
    ctx.textAlign='right'; ctx.fillStyle='#777f68'; ctx.font='700 '+(tiny?6:compact?8:10)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(section.sub,contentW*0.62),contentX+contentW-10,headY+sectionTitleH/2);
    const cols=section.cols||1, innerW=contentW-outerPad*2;
    const actionW=(innerW-gap*(cols-1))/cols;
    const ay=headY+sectionTitleH;
    for(let i=0;i<section.actions.length;i++){
      const action=section.actions[i], col=i%cols, row=Math.floor(i/cols);
      drawAction(action,contentX+outerPad+col*(actionW+gap),ay+row*(actionH+gap),actionW,actionH);
    }
    return y+sectionH;
  };

  const connected=onlineServiceAvailable();
  const sections=[
    {title:'ONLINE',sub:'MULTIPLE DEVICES',col:'#d05548',cols:2,actions:[
      {id:'casual_1v1',mode:'arena',label:'1v1',note:authUser?'NEW \u00b7 BETA \u00b7 FIRST TO 5':'NEW \u00b7 BETA \u00b7 SIGN IN',col:'#d05548',enabled:connected},
      {id:'casual_2v2',mode:'arena2v2',label:'2v2  \uD83D\uDD12',note:'COMING SOON',col:'#6b7455',enabled:false}]},
    {title:'RANKED',sub:'COMPETITIVE \u00b7 RANK + ELO',col:'#e8b658',cols:1,actions:[
      {id:'ranked',label:'PLAY RANKED  \uD83D\uDD12',note:'COMING SOON',col:'#e8b658',enabled:false}]},
    {title:'OFFLINE',sub:'ONE DEVICE',col:'#a7c15e',cols:2,actions:[
      {id:'offline_endless',mode:'endless',label:'ENDLESS',col:'#a7c15e',enabled:true},
      {id:'offline_cpu_menu',label:'PLAY AGAINST CPU',note:'1v1 OR 2v2',col:'#7fd8ff',enabled:true}]}
  ];
  const totalSectionsH=sections.reduce((sum,section)=>sum+sectionHeight(section),0)+sectionGap*(sections.length-1);
  let sectionY=top+Math.max(0,(contentBottom-top-totalSectionsH)/2);
  for(const section of sections){ sectionY=drawSection(section,sectionY)+sectionGap; }

  backRect={x:margin,y:backY,w:Math.min(150,W-2*margin),h:backH};
  const backHot=mouse.x>=backRect.x&&mouse.x<=backRect.x+backRect.w&&mouse.y>=backRect.y&&mouse.y<=backRect.y+backRect.h;
  ctx.fillStyle=backHot?'#8a9268':'rgba(0,0,0,0.45)'; ctx.fillRect(backRect.x,backRect.y,backRect.w,backRect.h); ctx.strokeStyle='#8a9268'; ctx.strokeRect(backRect.x+0.5,backRect.y+0.5,backRect.w,backRect.h);
  ctx.fillStyle=backHot?'#101208':'#cdd6b0'; ctx.font='700 '+(tiny?9:compact?10:12)+'px ui-monospace,Consolas,monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('\u2039 HOME',backRect.x+backRect.w/2,backRect.y+backRect.h/2);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function drawOfflineCpuModes(){
  selBg();offlineCpuRects=[];
  const landscape=H<430,tiny=W<=360||H<350,margin=tiny?7:Math.min(16,Math.max(10,W*.025));
  const contentW=Math.min(780,W-margin*2),x0=(W-contentW)/2;
  const titleY=tiny?4:landscape?7:14,titleFs=offlineCpuView==='2v2'&&W<520?(tiny?20:26):(tiny?20:landscape?26:35);
  ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#7fd8ff';
  ctx.font='700 '+titleFs+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(offlineCpuView==='1v1'?'CPU 1v1':offlineCpuView==='2v2'?'CPU 2v2 · NEW · BETA':'PLAY AGAINST CPU',W-20),W/2,titleY);
  const directCpuStatus=offlineCpuView==='2v2'&&typeof party!=='undefined'&&party&&party.directCpu?String(party.status||'PRIVATE FRIEND GAME · CONNECTING'):'';
  const ladderState=String(botLadderSyncState||'idle'),ladderResultPending=!!(authUser&&typeof botLadderHasPendingResult==='function'&&botLadderHasPendingResult()),
    ladderSecureReady=!authUser||typeof botLadderSecureMatchReady!=='function'||botLadderSecureMatchReady(),
    ladderSyncText=!authUser?'GUEST · BEGINNER · SCORE IS NOT SAVED':
      ladderResultPending?'ACCOUNT LADDER · PREVIOUS RESULT STILL SAVING':
      !ladderSecureReady?'ACCOUNT LADDER · SECURE RESULT SAVE UNAVAILABLE':
      ladderState==='ready'?'ACCOUNT LADDER · SYNCED':
      ladderState==='queued'?'ACCOUNT LADDER · SAVED ON DEVICE · SYNC PENDING':
      ladderState==='reconciling'?'ACCOUNT LADDER · VERIFYING SAVED RESULT':
      ladderState==='conflict'?'ACCOUNT LADDER · RESULT CONFLICT · RECEIPT KEPT':
      ladderState==='storage_error'?'ACCOUNT LADDER · DEVICE SAVE ERROR':
      ladderState==='offline'?'ACCOUNT LADDER · CLOUD OFFLINE · DEVICE SAVE READY':
      ladderState==='syncing'?'ACCOUNT LADDER · SYNCING':'ACCOUNT LADDER · LOADING',
    syncText=(directCpuStatus||ladderSyncText)+(offlineCpuView==='2v2'?' · BETA':'');
  ctx.fillStyle=directCpuStatus?'#bfa8ff':'#8a9268';ctx.font='700 '+(tiny?6:landscape?7:9)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(syncText,W-20),W/2,titleY+titleFs+(tiny?1:4));

  const duelControls=offlineCpuView==='1v1',backH=duelControls?(tiny?34:landscape?38:44):(tiny?28:landscape?31:38),backY=H-margin-backH,
    backW=offlineCpuView==='modes'?Math.min(210,W-margin*2):Math.min(duelControls?(tiny?112:160):(tiny?105:150),W-margin*2);
  backRect={x:margin,y:backY,w:backW,h:backH};
  const drawButton=(id,label,note,x,y,w,h,col,enabled=true)=>{
    const hot=enabled&&((mouse.x>=x&&mouse.x<=x+w&&mouse.y>=y&&mouse.y<=y+h)||(offlineCpuKeyboardActive&&offlineCpuFocusId===id));
    const primary=id==='cpu_start_1v1',rect={id,x,y,w,h,enabled};offlineCpuRects.push(rect);
    ctx.fillStyle=enabled?(hot?col:'rgba(0,0,0,.48)'):'rgba(35,35,37,.76)';ctx.fillRect(x,y,w,h);
    ctx.strokeStyle=enabled?col:'#4b4d49';ctx.lineWidth=1.5;ctx.strokeRect(x+.5,y+.5,w-1,h-1);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=enabled?(hot?'#101208':'#f0ead4'):'#656660';
    ctx.font='700 '+(primary?(tiny?14:landscape?17:22):(tiny?(h<32?8:11):landscape?(h<36?10:14):(h<40?14:18)))+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(label,w-12),x+w/2,y+h/2-(note?(h<44?4:7):0));
    if(note){ctx.fillStyle=enabled?(hot?'#27301e':'#818a76'):'#555650';ctx.font='700 '+(primary?(tiny?7:landscape?8:10):(tiny?6:landscape?7:9))+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(note,w-12),x+w/2,y+h/2+(h<44?7:13));}
    return rect;
  };
  const drawBack=()=>{
    const label=offlineCpuView==='modes'?'‹ PLAY MENU':'‹ CPU MODES';
    const hot=mouse.x>=backRect.x&&mouse.x<=backRect.x+backRect.w&&mouse.y>=backRect.y&&mouse.y<=backRect.y+backRect.h;
    ctx.fillStyle=hot?'#8a9268':'rgba(0,0,0,.45)';ctx.fillRect(backRect.x,backRect.y,backRect.w,backRect.h);
    ctx.strokeStyle='#8a9268';ctx.lineWidth=1;ctx.strokeRect(backRect.x+.5,backRect.y+.5,backRect.w-1,backRect.h-1);
    ctx.fillStyle=hot?'#101208':'#cdd6b0';ctx.font='700 '+(duelControls?(tiny?10:landscape?11:12):(tiny?8:10))+'px ui-monospace,Consolas,monospace';ctx.textBaseline='middle';ctx.fillText(label,backRect.x+backRect.w/2,backRect.y+backRect.h/2);
  };
  const headerBottom=titleY+titleFs+(tiny?12:landscape?16:22),contentBottom=backY-(tiny?5:9);

  if(offlineCpuView==='modes'){
    const gap=tiny?6:12,cardTop=headerBottom+(tiny?4:10),availableH=Math.max(64,contentBottom-cardTop),
      cardH=Math.min(tiny?72:landscape?84:110,availableH),cardY=cardTop+Math.max(0,(availableH-cardH)/2),cardW=(contentW-gap)/2;
    const ladder=currentBotLadder(),cards=[
      {id:'cpu_root_1v1',title:'1v1 VS CPU',note:'OPEN YOUR FIVE-TIER LADDER',detail:'CURRENT · '+botDifficultyName(ladder.tier),col:'#7fd8ff'},
      {id:'cpu_root_2v2',title:'2v2 VS CPU',note:'NEW · BETA',detail:'LOCAL OR INVITE A FRIEND',col:'#bfa8ff'}
    ];
    for(let i=0;i<cards.length;i++){
      const item=cards[i],x=x0+i*(cardW+gap),hot=(mouse.x>=x&&mouse.x<=x+cardW&&mouse.y>=cardY&&mouse.y<=cardY+cardH)||(offlineCpuKeyboardActive&&offlineCpuFocusId===item.id);
      offlineCpuRects.push({id:item.id,x,y:cardY,w:cardW,h:cardH,enabled:true});
      ctx.fillStyle=hot?item.col:'rgba(0,0,0,.48)';ctx.fillRect(x,cardY,cardW,cardH);ctx.strokeStyle=item.col;ctx.lineWidth=2;ctx.strokeRect(x+.5,cardY+.5,cardW-1,cardH-1);
      ctx.fillStyle=hot?'#101208':'#e8d9a8';ctx.textBaseline='middle';ctx.font='700 '+(tiny?13:landscape?18:24)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(item.title,cardW-12),x+cardW/2,cardY+cardH*.30);
      ctx.fillStyle=hot?'#182016':item.col;ctx.font='700 '+(tiny?6.5:landscape?8:10)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(item.note,cardW-12),x+cardW/2,cardY+cardH*.59);
      ctx.fillStyle=hot?'#27301e':'#7f876e';ctx.font='700 '+(tiny?5.5:landscape?6.5:8)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(item.detail,cardW-12),x+cardW/2,cardY+cardH*.79);
    }
    drawBack();ctx.textAlign='left';ctx.textBaseline='alphabetic';return;
  }

  if(offlineCpuView==='1v1'){
    const ladder=currentBotLadder(),active=clamp(Math.floor(+ladder.tier||0),0,BOT_DIFFICULTIES.length-1),progress=clamp(Math.floor(+ladder.progress||0),0,BOT_LADDER_MAX_PROGRESS);
    const footerGap=tiny?6:10,startH=tiny?44:landscape?50:58,desiredStartW=Math.min(tiny?(W<=360?260:360):landscape?400:440,contentW);
    let startW=desiredStartW,startX=(W-startW)/2,startY=H-margin-startH;
    const backRight=backRect.x+backRect.w,horizontallyClear=startX>=backRight+footerGap;
    if(!horizontallyClear){
      if(landscape){
        startW=Math.max(180,Math.min(startW,W-2*(backRight+footerGap)));
        startX=(W-startW)/2;
      }else startY=backY-footerGap-startH;
    }
    const gridTop=headerBottom+(tiny?2:6),gridBottom=startY-(tiny?5:8),availableGrid=Math.max(150,gridBottom-gridTop),gridGap=tiny?6:8,
      minCardW=H<350?165:W<=340?134:142,
      cols=Math.min(BOT_DIFFICULTIES.length,Math.max(1,Math.floor((contentW+gridGap)/(minCardW+gridGap)))),rows=Math.ceil(BOT_DIFFICULTIES.length/cols),
      targetCardH=tiny?112:landscape?128:W<=420?126:148,
      compactGridH=rows*targetCardH+(rows-1)*gridGap,
      gridH=Math.min(availableGrid,compactGridH),gridY=gridTop+Math.max(0,(availableGrid-gridH)/2),
      cardW=(contentW-gridGap*(cols-1))/cols,cardH=(gridH-gridGap*(rows-1))/rows,
      wins=ladder.winStreak>=3?0:clamp(Math.floor(+ladder.winStreak||0),0,2),losses=clamp(Math.floor(+ladder.lossStreak||0),0,2);
    ctx.fillStyle='rgba(0,0,0,.24)';ctx.fillRect(x0,gridY,contentW,gridH);ctx.strokeStyle='#315568';ctx.strokeRect(x0+.5,gridY+.5,contentW-1,gridH-1);
    let tooltip=null;
    for(let i=0;i<BOT_DIFFICULTIES.length;i++){
      const col=i%cols,row=Math.floor(i/cols),x=x0+col*(cardW+gridGap),y=gridY+row*(cardH+gridGap),current=i===active,completed=i<active,
        cardHeadH=clamp(Math.floor(cardH*.18),20,36);
      ctx.fillStyle=current?'rgba(19,46,57,.96)':'rgba(0,0,0,.60)';ctx.fillRect(x,y,cardW,cardH);
      ctx.strokeStyle=current?'#7fd8ff':completed?'#718b4d':'#454b46';ctx.lineWidth=current?2:1;ctx.strokeRect(x+.5,y+.5,cardW-1,cardH-1);
      ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillStyle=current?'#bfe8ff':completed?'#a7c15e':'#687064';ctx.font='700 '+(cardW<155?9:tiny?10:landscape?11:12)+'px ui-monospace,Consolas,monospace';
      if(current){
        const pad=cardW<150?4:6,headH=cardHeadH,rowsTop=y+headH,
          rowGap=cardH<135?2:4,rowH=(cardH-headH-pad-rowGap*2)/3,innerX=x+pad,innerW=cardW-pad*2;
        ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillText(BOT_DIFFICULTIES[i].name,x+cardW/2,y+headH*.42);
        ctx.fillStyle='#7fd8ff';ctx.font='700 '+(cardW<155?6.5:tiny?7:8)+'px ui-monospace,Consolas,monospace';ctx.fillText('CURRENT',x+cardW/2,y+headH*.76);
        const maxTier=active===BOT_DIFFICULTIES.length-1,metrics=[
          {id:'score',label:'SCORE',value:progress,max:BOT_LADDER_MAX_PROGRESS,col:'#7fd8ff',copy:maxTier?
            'IMPOSSIBLE IS THE HIGHEST TIER. WINS ADD +1 SCORE UNTIL THIS BAR IS COMPLETE AT SCORE 10.':
            'EVERY WIN ADDS +1 SCORE. REACH SCORE 10 TO PROMOTE AND RESET THIS BAR.'},
          {id:'wins',label:'CONSECUTIVE WINS',value:wins,max:3,col:'#a7c15e',copy:maxTier?
            'IMPOSSIBLE IS THE HIGHEST TIER. THE THIRD CONSECUTIVE WIN RESETS THIS COUNTER; SCORE STAYS CAPPED AT 10.':
            'REACH 3 CONSECUTIVE WINS TO PROMOTE IMMEDIATELY. THIS COUNTER THEN RESETS TO 0.'},
          {id:'losses',label:'CONSECUTIVE LOSSES',value:losses,max:3,col:'#d05548',copy:'REACH 3 CONSECUTIVE LOSSES TO LOSE 1 SCORE. AT SCORE 0, YOU CAN RANK DOWN.'}
        ];
        for(let m=0;m<metrics.length;m++){
          const metric=metrics[m],sy=rowsTop+m*(rowH+rowGap),info=Math.max(24,Math.min(cardH<135?26:30,rowH-4)),
            ix=innerX+innerW-info,barH=Math.max(cardH<135?10:13,Math.min(17,rowH*.34)),barY=sy+rowH-barH-(cardH<135?2:4),barX=innerX+4,barW=innerW-8;
          ctx.fillStyle='rgba(3,10,12,.62)';ctx.fillRect(innerX,sy,innerW,rowH);ctx.strokeStyle=metric.col;ctx.lineWidth=1;ctx.strokeRect(innerX+.5,sy+.5,innerW-1,rowH-1);
          ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=metric.col;ctx.font='700 '+(cardW<155?6.7:cardW<180?7.3:8)+'px ui-monospace,Consolas,monospace';
          ctx.fillText(metric.label+' '+metric.value+' / '+metric.max,innerX+4,sy+(cardH<135?2:4));
          const ir={id:'cpu_info_'+metric.id,x:ix,y:sy+2,w:info,h:info,enabled:true};offlineCpuRects.push(ir);
          const selected=offlineCpuInfoKey===metric.id||(offlineCpuKeyboardActive&&offlineCpuFocusId===ir.id);
          ctx.fillStyle=selected?metric.col:'#25343a';ctx.fillRect(ir.x,ir.y,ir.w,ir.h);ctx.strokeStyle=metric.col;ctx.strokeRect(ir.x+.5,ir.y+.5,ir.w-1,ir.h-1);
          ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=selected?'#101208':'#eff7fa';ctx.font='700 '+(cardW<155?7:9)+'px ui-monospace,Consolas,monospace';ctx.fillText('[i]',ir.x+ir.w/2,ir.y+ir.h/2);
          ctx.fillStyle='#121b1d';ctx.fillRect(barX,barY,barW,barH);ctx.strokeStyle=metric.col;ctx.strokeRect(barX+.5,barY+.5,barW-1,barH-1);
          ctx.fillStyle=metric.col;ctx.fillRect(barX,barY,barW*clamp(metric.value/metric.max,0,1),barH);
          if(offlineCpuInfoKey===metric.id)tooltip={anchor:ir,copy:metric.copy,col:metric.col,tierTop:y,tierBottom:y+cardH};
        }
      }else{
        ctx.fillText(BOT_DIFFICULTIES[i].name,x+cardW/2,y+cardHeadH*.42);
        ctx.textBaseline='middle';ctx.fillStyle=completed?'#a7c15e':'#626960';ctx.font='700 '+(cardW<155?7:8)+'px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine(completed?'COMPLETE':'COMPLETE THE PREVIOUS TIER',cardW-10),x+cardW/2,y+cardHeadH+(cardH-cardHeadH)*.46);
      }
    }
    if(tooltip){
      const leftSpace=tooltip.anchor.x-(x0+4)-6,rightSpace=(x0+contentW-4)-(tooltip.anchor.x+tooltip.anchor.w)-6,useRight=rightSpace>=leftSpace,
        tipW=Math.max(110,Math.min(tiny?210:landscape?300:360,Math.max(leftSpace,rightSpace))),tipH=tiny?44:landscape?50:60,
        tipX=useRight?tooltip.anchor.x+tooltip.anchor.w+6:tooltip.anchor.x-tipW-6,
        tipY=clamp(tooltip.anchor.y+tooltip.anchor.h/2-tipH/2,tooltip.tierTop+3,tooltip.tierBottom-tipH-3);
      ctx.fillStyle='rgba(7,15,18,.98)';ctx.fillRect(tipX,tipY,tipW,tipH);ctx.strokeStyle=tooltip.col;ctx.lineWidth=2;ctx.strokeRect(tipX+.5,tipY+.5,tipW-1,tipH-1);
      ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#eff7fa';ctx.font='700 '+(tiny?6:landscape?7:9)+'px ui-monospace,Consolas,monospace';
      wrapTextClamped(tooltip.copy,tipX+(tiny?6:9),tipY+(tiny?6:9),tipW-(tiny?12:18),tiny?9:landscape?10:12,tiny?4:3);
    }
    const ladderCanStart=!authUser||(botLadderReadyForMatch()&&!ladderResultPending&&ladderSecureReady),startNote=!authUser?'FIRST TO 5 · GUEST RESULT IS NOT SAVED':
      ladderCanStart?'FIRST TO 5 · RESULT UPDATES THIS LADDER':
      ladderResultPending?'PREVIOUS RESULT IS STILL SAVING':
      !ladderSecureReady?'SECURE RESULT SAVE UNAVAILABLE':
      ladderState==='reconciling'?'VERIFYING YOUR SAVED RESULT':ladderState==='conflict'?'RESULT CONFLICT · RECEIPT KEPT':
      ladderState==='storage_error'?'DEVICE SAVE UNAVAILABLE':'LADDER IS STILL SYNCING';
    drawButton('cpu_start_1v1','START 1v1',startNote,startX,startY,startW,startH,'#7fd8ff',ladderCanStart);
    drawBack();ctx.textAlign='left';ctx.textBaseline='alphabetic';return;
  }

  const gap=tiny?6:12,cardTop=headerBottom+(tiny?4:10),availableH=Math.max(64,contentBottom-cardTop),
    cardH=Math.min(tiny?72:landscape?84:110,availableH),cardY=cardTop+Math.max(0,(availableH-cardH)/2),cardW=(contentW-gap)/2;
  const friendOnline=typeof partyServiceAvailable==='function'&&partyServiceAvailable(),directOpen=!!(typeof party!=='undefined'&&party&&party.directCpu&&party.channel);
  const cards=[
    {id:'cpu_local_2v2',title:'LOCAL',sub:'YOU + ALLY CPU',detail:'BEING TESTED · COUNTS FOR LADDER',col:'#7fd8ff',enabled:!directOpen&&(!authUser||(botLadderReadyForMatch()&&!ladderResultPending&&ladderSecureReady))},
    directOpen
      ?party.phase==='closing'
        ?{id:'cpu_direct_closing',title:'CLOSING',sub:'FINISHING CONNECTION',detail:'UNRANKED FRIEND GAME',col:'#8a9268',enabled:false,smallTitle:true}
        :{id:'cpu_cancel_friend_invite',title:'CANCEL INVITE',sub:party.members.length>=2?'FRIEND CONNECTED · STARTING':'WAITING FOR FRIEND',detail:'UNRANKED · DIRECT FRIEND GAME',col:'#d05548',enabled:true,smallTitle:true}
      :{id:'cpu_friend_2v2',title:'INVITE A FRIEND',sub:'YOU + FRIEND VS 2 CPUs',detail:friendOnline?'UNRANKED · ACCEPTING STARTS':'RECONNECT TO INVITE A FRIEND',col:'#bfa8ff',enabled:friendOnline,smallTitle:true}
  ];
  for(let i=0;i<cards.length;i++){
    const item=cards[i],x=x0+i*(cardW+gap),hot=item.enabled&&((mouse.x>=x&&mouse.x<=x+cardW&&mouse.y>=cardY&&mouse.y<=cardY+cardH)||(offlineCpuKeyboardActive&&offlineCpuFocusId===item.id));
    offlineCpuRects.push({id:item.id,x,y:cardY,w:cardW,h:cardH,enabled:item.enabled});ctx.fillStyle=item.enabled?(hot?item.col:'rgba(0,0,0,.48)'):'rgba(34,34,36,.75)';ctx.fillRect(x,cardY,cardW,cardH);ctx.strokeStyle=item.enabled?item.col:'#4d4e4b';ctx.lineWidth=2;ctx.strokeRect(x+.5,cardY+.5,cardW-1,cardH-1);
    ctx.fillStyle=item.enabled?(hot?'#101208':'#e8d9a8'):'#666760';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 '+(item.smallTitle?(tiny?10:landscape?14:cardW<210?16:19):(tiny?15:landscape?20:27))+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(item.title,cardW-12),x+cardW/2,cardY+cardH*.33);
    ctx.fillStyle=item.enabled?(hot?'#1c221b':item.col):'#5a5b56';ctx.font='700 '+(tiny?7:landscape?9:12)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(item.sub,cardW-12),x+cardW/2,cardY+cardH*.59);
    ctx.fillStyle=item.enabled?(hot?'#293025':'#7f876e'):'#50514e';ctx.font='700 '+(tiny?5.5:landscape?6.5:8)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(item.detail,cardW-12),x+cardW/2,cardY+cardH*.77);
  }
  drawBack();ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function drawRanked(){
  selBg(); rankedRects=[]; leaderboardRowRects=[];
  const tiny=H<390, compact=H<560, margin=tiny?9:compact?13:20, col='#e8b658';
  ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle=col; ctx.font='700 '+(tiny?20:compact?28:38)+'px ui-monospace,Consolas,monospace'; ctx.fillText('RANKED',W/2,tiny?5:14);
  const noticeActive=typeof modeBoardNotice!=='undefined'&&modeBoardNotice&&typeof modeBoardNoticeT!=='undefined'&&typeof now!=='undefined'&&now<modeBoardNoticeT;
  ctx.fillStyle=noticeActive?'#ff6b5d':'#8a9268'; ctx.font=(tiny?'7':compact?'9':'11')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(noticeActive?modeBoardNotice:'COMPETITIVE \u00b7 RATING-PROTECTED MATCHES',W-20),W/2,tiny?27:compact?48:61);
  const totalW=Math.min(650,W-margin*2), x0=W/2-totalW/2, gap=tiny?5:8, statsY=tiny?39:compact?68:88, statsH=tiny?45:compact?58:76, sw=(totalW-gap*2)/3;
  const stats=[['RANK',authUser?'UNRANKED':'SIGN IN'],['ELO','\u2014'],['PLACEMENTS','0 / 5']];
  for(let i=0;i<3;i++){
    const x=x0+i*(sw+gap); ctx.fillStyle='rgba(0,0,0,0.44)'; ctx.fillRect(x,statsY,sw,statsH); ctx.strokeStyle=col; ctx.strokeRect(x+0.5,statsY+0.5,sw,statsH);
    ctx.fillStyle='#8a9268'; ctx.font='700 '+(tiny?6:compact?8:9)+'px ui-monospace,Consolas,monospace'; ctx.fillText(stats[i][0],x+sw/2,statsY+(tiny?6:9));
    ctx.fillStyle='#e8d9a8'; ctx.font='700 '+(tiny?12:sw<105?14:(compact||sw<150)?17:23)+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(stats[i][1],sw-8),x+sw/2,statsY+(tiny?20:compact?27:34));
  }
  const lbY=statsY+statsH+gap, lbH=tiny?48:compact?66:90;
  ctx.fillStyle='rgba(0,0,0,0.40)'; ctx.fillRect(x0,lbY,totalW,lbH); ctx.strokeStyle='#6f6238'; ctx.strokeRect(x0+0.5,lbY+0.5,totalW,lbH);
  ctx.textAlign='left'; ctx.fillStyle=col; ctx.font='700 '+(tiny?7:compact?9:11)+'px ui-monospace,Consolas,monospace'; ctx.fillText('RANKED LEADERBOARD',x0+9,lbY+7);
  ctx.textAlign='right'; ctx.fillText('ELO',x0+totalW-9,lbY+7);
  ctx.textAlign='center'; ctx.fillStyle='#626153'; ctx.font=(tiny?'7':compact?'8':'10')+'px ui-monospace,Consolas,monospace'; ctx.fillText('NO RATED RESULTS \u00b7 SECURE MATCH SERVERS COMING SOON',W/2,lbY+lbH/2);
  const modeY=lbY+lbH+gap, modeH=tiny?42:compact?54:68, modeGap=tiny?5:8, modeW=(totalW-modeGap)/2;
  const modes=[{id:'ranked_1v1',mode:'ranked1v1',label:'RANKED 1v1  \uD83D\uDD12'},{id:'ranked_2v2',mode:'ranked2v2',label:'RANKED 2v2  \uD83D\uDD12'}];
  for(let i=0;i<2;i++){
    const x=x0+i*(modeW+modeGap), r={id:modes[i].id,mode:modes[i].mode,x,y:modeY,w:modeW,h:modeH,enabled:false}; rankedRects.push(r);
    ctx.fillStyle='rgba(38,38,38,0.78)'; ctx.fillRect(x,modeY,modeW,modeH); ctx.strokeStyle='#4a4a45'; ctx.strokeRect(x+0.5,modeY+0.5,modeW,modeH);
    ctx.fillStyle='#696960'; ctx.font='700 '+(tiny?10:compact?14:18)+'px ui-monospace,Consolas,monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(fitLine(modes[i].label,modeW-10),x+modeW/2,modeY+modeH/2-5);
    ctx.fillStyle='#55554f'; ctx.font='700 '+(tiny?6:compact?7:8)+'px ui-monospace,Consolas,monospace'; ctx.fillText('SECURE SERVER REQUIRED',x+modeW/2,modeY+modeH/2+(tiny?10:13));
  }
  if(!authUser){
    const sy=modeY+modeH+gap, sh=tiny?28:compact?34:40, r={id:'signin',x:x0,y:sy,w:totalW,h:sh,enabled:true}; rankedRects.push(r);
    const hot=mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h; ctx.fillStyle=hot?col:'rgba(232,182,88,0.12)'; ctx.fillRect(r.x,r.y,r.w,r.h); ctx.strokeStyle=col; ctx.strokeRect(r.x+0.5,r.y+0.5,r.w,r.h); ctx.fillStyle=hot?'#101208':'#e8d9a8'; ctx.font='700 '+(tiny?9:compact?11:13)+'px ui-monospace,Consolas,monospace'; ctx.fillText('SIGN IN FOR FUTURE RANKED ACCESS',W/2,r.y+r.h/2);
  }
  const bh=tiny?30:compact?34:40; backRect={x:margin,y:H-bh-(tiny?5:9),w:Math.min(160,W-margin*2),h:bh};
  const hot=mouse.x>=backRect.x&&mouse.x<=backRect.x+backRect.w&&mouse.y>=backRect.y&&mouse.y<=backRect.y+backRect.h; ctx.fillStyle=hot?'#8a9268':'rgba(0,0,0,0.42)'; ctx.fillRect(backRect.x,backRect.y,backRect.w,backRect.h); ctx.strokeStyle='#8a9268'; ctx.strokeRect(backRect.x+0.5,backRect.y+0.5,backRect.w,backRect.h); ctx.fillStyle=hot?'#101208':'#cdd6b0'; ctx.font='700 '+(tiny?9:compact?10:12)+'px ui-monospace,Consolas,monospace'; ctx.fillText('\u2039 PLAY MENU',backRect.x+backRect.w/2,backRect.y+backRect.h/2);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function drawModes(){
  selBg(); modeRects=[];
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillStyle='#e8b658'; ctx.font='700 '+(H<560?25:34)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('CHOOSE GAME MODE',W/2,H*0.055);
  ctx.fillStyle='#8a9268'; ctx.font='11px ui-monospace,Consolas,monospace';
  ctx.fillText('Choose where to play. Your loadout comes next.',W/2,H*0.055+(H<560?34:44));
  const cw=Math.min(560,W-32), cx=W/2-cw/2, ch=H<560?86:112;
  const card=(id,group,title,desc,y,col,enabled)=>{
    const r={id,x:cx,y,w:cw,h:ch,enabled}; modeRects.push(r);
    const hot=enabled&&mouse.x>=cx&&mouse.x<=cx+cw&&mouse.y>=y&&mouse.y<=y+ch;
    ctx.fillStyle=enabled?(hot?col:'rgba(0,0,0,0.42)'):'rgba(45,45,42,0.72)'; ctx.fillRect(cx,y,cw,ch);
    ctx.strokeStyle=enabled?col:'#4a4a45'; ctx.lineWidth=enabled?2:1; ctx.strokeRect(cx+0.5,y+0.5,cw,ch);
    ctx.textAlign='left'; ctx.fillStyle=enabled?(hot?'#101208':col):'#66665f';
    ctx.font='700 11px ui-monospace,Consolas,monospace'; ctx.fillText(group,cx+18,y+13);
    ctx.font='700 '+(H<560?20:25)+'px ui-monospace,Consolas,monospace'; ctx.fillText(title,cx+18,y+(H<560?31:38));
    ctx.fillStyle=enabled?(hot?'#202818':'#8a9268'):'#5a5a54'; ctx.font='10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(desc,cw-36),cx+18,y+ch-23);
    ctx.textAlign='right'; ctx.font='700 24px ui-monospace,Consolas,monospace'; ctx.fillText(enabled?'\u203A':'\uD83D\uDD12',cx+cw-20,y+ch/2-12);
    ctx.textAlign='center';
  };
  const y0=H*0.055+(H<560?62:86), gap=H<560?14:20;
  card('endless','OFFLINE \u00b7 ONE DEVICE ONLY','ENDLESS + 1v1 VS AI','Choose waves or a first-to-5 local duel against the bot.',y0,'#a7c15e',true);
  const online=onlinePlayReady();
  const why=(navigator.onLine===false||!sb)?'NO CONNECTION \u2014 different-device multiplayer unavailable':(!authUser?'SIGN IN REQUIRED \u2014 multiplayer uses different devices':'Casual first-to-5 multiplayer on different devices.');
  card('arena','ONLINE \u00b7 MULTIPLAYER','CASUAL 1v1',why,y0+ch+gap,'#d05548',online);
  const bw=Math.min(260,W-40), bh=42, bx=W/2-bw/2, by=Math.min(H-bh-14,y0+ch*2+gap+22);
  backRect={x:bx,y:by,w:bw,h:bh};
  const hot=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=by&&mouse.y<=by+bh;
  ctx.fillStyle=hot?'#8a9268':'rgba(138,146,104,0.12)'; ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle='#8a9268'; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
  ctx.fillStyle=hot?'#101208':'#cdd6b0'; ctx.font='700 14px ui-monospace,Consolas,monospace'; ctx.textBaseline='middle'; ctx.fillText('\u2039 BACK TO HOME',W/2,by+bh/2);
  ctx.textBaseline='alphabetic';
}
function drawSocialButton(id,label,x,y,w,h,col,enabled=true,extra={}){
  const hot=enabled&&mouse.x>=x&&mouse.x<=x+w&&mouse.y>=y&&mouse.y<=y+h;
  const active=!!extra.active, r=Object.assign({id,x,y,w,h,enabled},extra); socialRects.push(r);
  ctx.fillStyle=enabled?(hot||active?col:'rgba(0,0,0,0.44)'):'rgba(34,34,36,0.72)'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle=enabled?col:'#454548'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,w,h);
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=enabled?(hot||active?'#101208':'#e8d9a8'):'#60605d';
  ctx.font='700 '+(h<27?7:w<100?8:h<38?9:11)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(label,w-7),x+w/2,y+h/2); return r;
}
function drawSocialAttentionBadge(rect){
  if(!rect)return;
  const small=rect.w<115||rect.h<38,bw=small?20:26,bh=small?15:19,bx=rect.x+rect.w-bw-(small?3:5),by=rect.y+(small?3:5);
  ctx.save();ctx.fillStyle='#d72f2f';ctx.fillRect(bx,by,bw,bh);ctx.strokeStyle='#ffd0c8';ctx.lineWidth=1;ctx.strokeRect(bx+.5,by+.5,bw-1,bh-1);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff7f2';ctx.font='900 '+(small?9:12)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('!!',bx+bw/2,by+bh/2);ctx.restore();
}
function drawSocial(){
  selBg(); socialRects=[];
  const tiny=H<390, short=H<430, compact=H<600;
  const activeSocialView=typeof socialView==='string'?socialView:'friends';
  const friendPageState=typeof socialFriendPages==='object'&&socialFriendPages?socialFriendPages:{incoming:0,outgoing:0,current:0};
  const margin=tiny?7:compact?10:16, gap=tiny?4:compact?8:14;
  const titleY=tiny?2:compact?7:12, titleFs=tiny?18:compact?25:34;
  ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#bfa8ff';ctx.font='700 '+titleFs+'px ui-monospace,Consolas,monospace';
  ctx.fillText('SOCIAL',W/2,titleY);
  const inboxLabel='PRIVATE INBOX',socialSub='FRIENDS + PRIVATE INBOX · PARTIES: NEW · BETA',
    socialStatusHint='SIGN IN FOR FRIENDS + PRIVATE INBOX',inboxPanelTitle='PRIVATE INBOX';
  const subY=titleY+titleFs+(tiny?0:3);
  if(!tiny){
    ctx.fillStyle='#8a9268';ctx.font='700 '+(compact?8:10)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(W<430?('FRIENDS · '+inboxLabel+' · PARTY'):socialSub,W-20),W/2,subY);
  }
  const statusY=subY+(tiny?7:compact?13:17);
  ctx.fillStyle=/NOT ENABLED|COULD NOT|OFFLINE/.test(socialStatus)?'#d05548':'#7f876e';
  ctx.font='700 '+(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(socialStatus||(authUser?'OPEN SOCIAL TO REFRESH':socialStatusHint),W-20),W/2,statusY);

  // On very short landscape screens HOME lives in the unused title corner;
  // reclaiming the old bottom footer gives every friend bucket an actionable
  // row without shrinking the enlarged Party controls.
  const backH=tiny?28:short?32:44,backY=short?2:H-backH-margin;
  const contentBottom=short?H-margin:backY-(compact?8:12);
  const contentW=Math.min(1120,W-margin*2),contentX=(W-contentW)/2;
  const identityY=statusY+(tiny?8:compact?12:15);
  const identityH=authUser&&!short?(W<500?(compact?32:48):(compact?27:32)):0;
  if(typeof socialLayoutIdentity==='function')socialLayoutIdentity(identityH?{x:contentX,y:identityY,w:contentW,h:identityH}:null);
  const contentTop=(identityH?identityY+identityH:statusY)+(tiny?5:compact?8:12);
  const navH=tiny?36:compact?44:48,pageBottom=contentBottom;

  const navGap=tiny?4:compact?7:10,navW=(contentW-navGap*2)/3;
  const friendsNav=drawSocialButton('social_view_friends','FRIENDS',contentX,contentTop,navW,navH,'#7fd8ff',true,{active:activeSocialView==='friends'}),
    inboxNav=drawSocialButton('social_view_inbox','INBOX',contentX+navW+navGap,contentTop,navW,navH,'#a7c15e',true,{active:activeSocialView==='inbox'}),
    partyNav=drawSocialButton('social_view_party','PARTY',contentX+(navW+navGap)*2,contentTop,navW,navH,'#bfa8ff',true,{active:activeSocialView==='party'});
  if(typeof socialHasUnreadFriendsActivity==='function'&&socialHasUnreadFriendsActivity())drawSocialAttentionBadge(friendsNav);
  if(typeof socialHasUnreadInboxActivity==='function'&&socialHasUnreadInboxActivity())drawSocialAttentionBadge(inboxNav);
  if(typeof socialHasUnreadPartyActivity==='function'&&socialHasUnreadPartyActivity())drawSocialAttentionBadge(partyNav);
  const viewY=contentTop+navH+gap,view={x:contentX,y:viewY,w:contentW,h:Math.max(24,pageBottom-viewY)};

  const panelFrame=(p,title,col,sub)=>{
    ctx.fillStyle='rgba(10,10,12,0.76)';ctx.fillRect(p.x,p.y,p.w,p.h);ctx.strokeStyle=col;ctx.lineWidth=1.3;ctx.strokeRect(p.x+0.5,p.y+0.5,p.w,p.h);
    ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=col;ctx.font='700 '+(tiny?9:compact?11:14)+'px ui-monospace,Consolas,monospace';ctx.fillText(title,p.x+8,p.y+(tiny?5:8));
    if(sub&&p.w>=250){ctx.textAlign='right';ctx.fillStyle='#686b61';ctx.font='700 '+(tiny?5:compact?6:8)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(sub,p.w*.46),p.x+p.w-8,p.y+(tiny?7:10));}
  };
  const panelMessage=(p,text,y,col='#777f68')=>{
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=col;ctx.font='700 '+(tiny?6:compact?8:9)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(text,p.w-16),p.x+p.w/2,y);
  };

  if(activeSocialView==='friends'){
    const owner=String(authUser&&authUser.id||'');
    const buckets={
      incoming:authUser?socialFriends.filter(r=>r.status==='pending'&&String(r.addressee_id)===owner):[],
      outgoing:authUser?socialFriends.filter(r=>r.status==='pending'&&String(r.requester_id)===owner):[],
      current:authUser?socialFriends.filter(r=>r.status==='accepted'||(r.status==='blocked'&&String(r.blocked_by)===owner)):[]
    };
    const topGap=gap,topW=(view.w-topGap)/2,topH=Math.max(20,Math.floor((view.h-gap)*(compact?.40:.48)));
    const panels={
      incoming:{x:view.x,y:view.y,w:topW,h:topH},
      outgoing:{x:view.x+topW+topGap,y:view.y,w:topW,h:topH},
      current:{x:view.x,y:view.y+topH+gap,w:view.w,h:Math.max(20,view.h-topH-gap)}
    };
    const labels={incoming:'INCOMING',outgoing:'OUTGOING',current:'CURRENT'};
    const drawBucket=(key,col)=>{
      const p=panels[key],rows=buckets[key],headerH=compact?18:26;
      ctx.fillStyle='rgba(10,10,12,0.76)';ctx.fillRect(p.x,p.y,p.w,p.h);ctx.strokeStyle=col;ctx.lineWidth=1.2;ctx.strokeRect(p.x+0.5,p.y+0.5,p.w,p.h);
      ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=col;ctx.font='700 '+(tiny?7:compact?9:12)+'px ui-monospace,Consolas,monospace';ctx.fillText(labels[key],p.x+7,p.y+(tiny?3:6));
      ctx.textAlign='right';ctx.fillStyle='#8a9268';ctx.font='700 '+(tiny?6:compact?8:10)+'px ui-monospace,Consolas,monospace';ctx.fillText(String(rows.length),p.x+p.w-7,p.y+(tiny?3:6));
      const room=p.h-headerH-4,ready=!!(authUser&&socialBackend.profiles===true&&socialBackend.friends===true);
      if(!authUser){panelMessage(p,key==='current'?'SIGN IN TO USE FRIENDS':'NONE',p.y+headerH+Math.max(0,room)/2,'#8a9268');return;}
      if(socialBackend.profiles===false||socialBackend.friends===false){
        const retryH=key==='current'&&room>=22?Math.min(compact?36:44,room-2):0;
        panelMessage(p,'SETUP REQUIRED',p.y+headerH+Math.max(0,room-retryH)/2,'#d05548');
        if(retryH>=16)drawSocialButton('social_retry','RETRY SETUP CHECK',p.x+6,p.y+p.h-retryH-4,p.w-12,retryH,'#d05548',true,{section:key});
        return;
      }
      if(socialLoading&&socialBackend.profiles===null){panelMessage(p,'LOADING...',p.y+headerH+Math.max(0,room)/2,'#8a9268');return;}
      if(room<18)return;
      const footerH=room>=96?(compact?36:44):0,listH=room-footerH-(footerH?4:0);
      const minimumRowH=compact?27:44,maxRows=listH>=minimumRowH?Math.max(1,Math.floor(listH/minimumRowH)):0;
      const rowH=maxRows?Math.min(compact?36:52,listH/maxRows):0;
      const pages=Math.max(1,Math.ceil(rows.length/Math.max(1,maxRows)));
      const page=clamp(Number(friendPageState[key])||0,0,pages-1);friendPageState[key]=page;
      const pageRows=maxRows?rows.slice(page*maxRows,(page+1)*maxRows):[];
      if(!rows.length)panelMessage(p,key==='incoming'?'NO REQUESTS':key==='outgoing'?'NONE SENT':'NO CURRENT FRIENDS',p.y+headerH+Math.max(8,listH)/2);
      for(let i=0;i<pageRows.length;i++){
        const f=pageRows[i],other=socialFriendOther(f),person=socialPerson(other),y=p.y+headerH+i*rowH,blocked=f.status==='blocked';
        ctx.fillStyle=i%2?'rgba(255,255,255,0.022)':'rgba(255,255,255,0.05)';ctx.fillRect(p.x+5,y,p.w-10,rowH-2);
        const status=blocked?'BLOCKED':key==='incoming'?'WANTS TO ADD YOU':key==='outgoing'?'REQUEST SENT':'FRIEND';
        const two=key==='incoming'||(key==='current'&&!blocked),actionGap=tiny?2:4,actionH=Math.max(16,rowH-3);
        const actionArea=Math.min(p.w*(key==='current'?.46:.56),compact?130:170),aw=two?(actionArea-actionGap)/2:actionArea;
        const total=two?aw*2+actionGap:aw,ax=p.x+p.w-total-7;
        ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=blocked?'#d05548':key==='current'?'#cfe8ff':'#e8b658';ctx.font='700 '+(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine('@'+person.handle+' · '+status,Math.max(24,ax-p.x-13)),p.x+9,y+(rowH-2)/2);
        socialRects.push({id:'player_profile',x:p.x+6,y,w:Math.max(24,ax-p.x-8),h:rowH-2,enabled:true,userId:other,handle:person.handle});
        if(key==='incoming'){
          drawSocialButton('friend_accept','ACCEPT',ax,y+1,aw,actionH,'#a7c15e',ready,{rowId:f.id});
          drawSocialButton('friend_block','BLOCK',ax+aw+actionGap,y+1,aw,actionH,'#d05548',ready,{rowId:f.id});
        }else if(key==='outgoing'||blocked){
          drawSocialButton('friend_remove',blocked?'UNBLOCK':'CANCEL',ax,y+1,aw,actionH,'#d05548',ready,{rowId:f.id});
        }else{
          drawSocialButton('friend_message','MESSAGE',ax,y+1,aw,actionH,col,ready,{userId:other,handle:person.handle});
          drawSocialButton('friend_remove','REMOVE',ax+aw+actionGap,y+1,aw,actionH,'#d05548',ready,{rowId:f.id});
        }
      }
      if(!footerH&&(pages>1||key==='current')){
        const ph=Math.max(16,headerH-2),pw=Math.max(22,Math.min(38,p.w*.13)),py=p.y+1;
        let right=p.x+p.w-2;
        if(pages>1){
          drawSocialButton('friend_bucket_next','›',right-pw,py,pw,ph,'#8a9268',page<pages-1,{section:key});right-=pw+2;
          drawSocialButton('friend_bucket_prev','‹',right-pw,py,pw,ph,'#8a9268',page>0,{section:key});right-=pw+4;
        }
        if(key==='current'){
          const addW=Math.max(72,Math.min(108,p.w*.32));
          drawSocialButton('friend_add','ADD FRIEND',right-addW,py,addW,ph,'#7fd8ff',ready,{section:key});
        }
      }
      if(footerH){
        const fy=p.y+p.h-footerH-4,controls=[];
        if(key==='current')controls.push({id:'friend_add',label:'ADD FRIEND',enabled:ready,col:'#7fd8ff'});
        if(pages>1){
          controls.push({id:'friend_bucket_prev',label:'‹ '+(page+1)+'/'+pages,enabled:page>0,col:'#8a9268'});
          controls.push({id:'friend_bucket_next',label:(page+1)+'/'+pages+' ›',enabled:page<pages-1,col:'#8a9268'});
        }else if(key==='current')controls.push({id:'social_retry',label:'REFRESH',enabled:true,col:'#8a9268'});
        if(controls.length){
          const cg=compact?4:7,cw=(p.w-12-cg*(controls.length-1))/controls.length;
          controls.forEach((item,i)=>drawSocialButton(item.id,item.label,p.x+6+i*(cw+cg),fy,cw,footerH,item.col,item.enabled,{section:key}));
        }
      }
    };
    drawBucket('incoming','#e8b658');drawBucket('outgoing','#bfa8ff');drawBucket('current','#7fd8ff');
  }

  if(activeSocialView==='inbox'){
    const p=view,col='#a7c15e',footerH=tiny?28:compact?38:44,footerY=p.y+p.h-footerH-6,
      conversations=authUser&&typeof socialPrivateConversations==='function'?socialPrivateConversations():[],
      openConversation=typeof socialConversationPeer==='string'&&socialConversationPeer&&typeof socialPrivateConversation==='function'?socialPrivateConversation(socialConversationPeer):null,
      dmReady=!!(authUser&&socialBackend.profiles===true&&socialBackend.messages===true),
      dmMissing=!!(authUser&&(socialBackend.profiles===false||socialBackend.messages===false)),
      dmLoading=!!(authUser&&socialLoading&&socialBackend.profiles===null);
    if(openConversation){
      const person=socialPerson(openConversation.peerId),archived=!!openConversation.archived,headerY=p.y+(tiny?20:compact?27:34),
        listTop=headerY+(tiny?20:compact?26:32),listSpace=Math.max(0,footerY-listTop-3),desired=tiny?31:compact?43:54,
        maxRows=listSpace>=18?Math.max(1,Math.floor(listSpace/desired)):1,rowH=Math.max(18,listSpace/Math.max(1,maxRows)),
        pages=Math.max(1,Math.ceil(openConversation.messages.length/maxRows));
      socialConversationPage=clamp(Number(socialConversationPage)||0,0,pages-1);
      panelFrame(p,'PRIVATE CONVERSATION',archived?'#8a9268':col,openConversation.messages.length+' MESSAGES');
      const pagerW=Math.min(compact?34:42,p.w*.11),profileW=Math.max(46,p.w-pagerW*2-28);
      ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#f0ddb0';ctx.font='700 '+(tiny?7:compact?9:12)+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine('@'+person.handle+(archived?' · ARCHIVED':''),profileW-8),p.x+9,headerY+8);
      socialRects.push({id:'player_profile',x:p.x+6,y:headerY,w:profileW,h:Math.max(16,listTop-headerY-2),enabled:true,userId:openConversation.peerId,handle:person.handle});
      drawSocialButton('conversation_prev','‹',p.x+p.w-pagerW*2-8,headerY,pagerW,Math.max(16,listTop-headerY-2),'#8a9268',socialConversationPage>0);
      drawSocialButton('conversation_next','›',p.x+p.w-pagerW-6,headerY,pagerW,Math.max(16,listTop-headerY-2),'#8a9268',socialConversationPage<pages-1);
      const rows=openConversation.messages.slice(socialConversationPage*maxRows,(socialConversationPage+1)*maxRows),owner=String(authUser&&authUser.id||'');
      for(let i=0;i<rows.length;i++){
        const row=rows[i],mine=String(row.sender_id||'')===owner,y=listTop+i*rowH,stamp=typeof socialInboxTimestamp==='function'?socialInboxTimestamp(Date.parse(row.created_at||'')):'';
        ctx.fillStyle=mine?(i%2?'rgba(127,216,255,.055)':'rgba(127,216,255,.10)'):(i%2?'rgba(167,193,94,.07)':'rgba(167,193,94,.13)');ctx.fillRect(p.x+5,y,p.w-10,rowH-2);
        ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=mine?'#7fd8ff':'#a7c15e';ctx.font='700 '+(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine((mine?'YOU':'@'+person.handle)+' · '+stamp,p.w-18),p.x+9,y+3);
        ctx.fillStyle='#edf1df';ctx.font=(tiny?6:compact?8:10)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(String(row.body||''),p.w-18),p.x+9,y+(tiny?14:compact?19:24));
      }
      const canReply=typeof socialCanMessageUser==='function'?socialCanMessageUser(openConversation.peerId):socialAcceptedFriend(openConversation.peerId),
        controls=archived?[{id:'conversation_back',label:'‹ ARCHIVE',col:'#8a9268',ok:true},{id:'conversation_reply',label:'REPLY',col:'#a7c15e',ok:canReply},{id:'conversation_restore',label:'TO INBOX',col:'#7fd8ff',ok:!socialConversationBusy},{id:'conversation_delete',label:'DELETE',col:'#d05548',ok:!socialConversationBusy}]:
          [{id:'conversation_back',label:'‹ INBOX',col:'#8a9268',ok:true},{id:'conversation_reply',label:'REPLY',col:'#a7c15e',ok:canReply},{id:'conversation_archive',label:'ARCHIVE',col:'#e8b658',ok:!socialConversationBusy}],
        fg=compact?4:7,fw=(p.w-12-fg*(controls.length-1))/controls.length;
      controls.forEach((item,i)=>drawSocialButton(item.id,item.label,p.x+6+i*(fw+fg),footerY,fw,footerH,item.col,item.ok,{conversationKey:openConversation.uiKey,userId:openConversation.peerId,handle:person.handle}));
    }else{
      panelFrame(p,inboxPanelTitle,col,'25 ACTIVE CONVERSATIONS MAX');
      const tabY=p.y+(tiny?18:compact?25:31),tabH=tiny?21:compact?27:31,tabGap=compact?5:8,tabW=(p.w-12-tabGap)/2,
        section=typeof socialInboxSection==='string'&&socialInboxSection==='archive'?'archive':'inbox',
        notificationRows=authUser&&typeof socialNotifications!=='undefined'&&Array.isArray(socialNotifications)?socialNotifications:[],
        archivedUpdateNotices=notificationRows.filter(notice=>typeof socialOfficialUpdateAutoArchived==='function'&&socialOfficialUpdateAutoArchived(notice)),
        activeNotices=notificationRows.filter(notice=>!(typeof socialOfficialUpdateAutoArchived==='function'&&socialOfficialUpdateAutoArchived(notice))),
        officialMeta=value=>{
        const stamp=Date.parse(value||'');if(!Number.isFinite(stamp))return 'OUTPOST ZERO · OFFICIAL';
        const date=new Date(stamp);try{return 'POSTED '+date.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch(error){return 'POSTED '+date.toISOString().slice(0,16).replace('T',' ')+' UTC';}
      };
      const fallbackOfficial=(!authUser||socialNotificationSqlReady!==true?(typeof banners!=='undefined'&&Array.isArray(banners)?banners:[]):[]).filter(row=>row&&row.approved===true&&String(row.heading||row.message||'').trim()&&
          !(typeof socialOfficialBannerAlreadyNotified==='function'&&socialOfficialBannerAlreadyNotified(row)))
        .map(row=>({kind:'official',id:row.id,title:String(row.heading||row.message||'OFFICIAL UPDATE'),body:String(row.details||row.message||''),meta:officialMeta(row.created_at),sortAt:Date.parse(row.created_at||'')||(+row.id||0)})),
        official=section==='inbox'?fallbackOfficial:[],noticeSource=section==='archive'?archivedUpdateNotices:activeNotices,
        notices=noticeSource.map(notice=>({kind:'notification',notice,sortAt:+notice.createdAt||0})),
        inboxCount=conversations.filter(row=>!row.archived).length+activeNotices.length+fallbackOfficial.length,
        archiveCount=conversations.filter(row=>row.archived).length+archivedUpdateNotices.length;
      drawSocialButton('inbox_section_inbox','INBOX · '+inboxCount,p.x+6,tabY,tabW,tabH,col,true,{active:section==='inbox'});
      drawSocialButton('inbox_section_archive','ARCHIVE · '+archiveCount,p.x+6+tabW+tabGap,tabY,tabW,tabH,'#8a9268',true,{active:section==='archive'});
      const headY=tabY+tabH+(tiny?3:compact?5:7);
      const threadRows=conversations.filter(row=>section==='archive'?row.archived:!row.archived).map(conversation=>({kind:'conversation',conversation,sortAt:conversation.lastAt})),
        inboxRows=notices.concat(official,threadRows).sort((a,b)=>b.sortAt-a.sortAt),
        desiredRowH=tiny?25:compact?36:47,listSpace=Math.max(0,footerY-headY-2),maxRows=listSpace>=12?Math.max(1,Math.floor(listSpace/desiredRowH)):0,
        rowH=maxRows?Math.min(desiredRowH,listSpace/maxRows):0,pages=Math.max(1,Math.ceil(inboxRows.length/Math.max(1,maxRows)));
      socialMessagePage=clamp(socialMessagePage,0,pages-1);
      const pageRows=maxRows?inboxRows.slice(socialMessagePage*maxRows,(socialMessagePage+1)*maxRows):[];
      if(!inboxRows.length){
        const empty=!authUser?'SIGN IN FOR PRIVATE CONVERSATIONS':dmMissing?'SECURE MESSAGE STORAGE NEEDS SETUP':dmLoading?'LOADING PRIVATE INBOX...':section==='archive'?'YOUR ARCHIVE IS EMPTY':'YOUR PRIVATE INBOX IS EMPTY';
        panelMessage(p,empty,headY+(footerY-headY)/2,dmMissing?'#d05548':'#8a9268');
      }else for(let i=0;i<pageRows.length;i++){
        const item=pageRows[i],y=headY+i*rowH;
        if(item.kind==='conversation'){
          const conversation=item.conversation,person=socialPerson(conversation.peerId),archived=conversation.archived,busy=!!socialConversationBusy,
            actionGap=tiny?2:4,buttonW=Math.min(compact?54:72,Math.max(44,p.w*.17)),actions=archived?2:1,
            actionSpan=buttonW*actions+actionGap*(actions-1),openW=Math.max(55,p.w-14-actionSpan-actionGap),preview=typeof socialConversationPreviewBody==='function'?socialConversationPreviewBody(conversation.last):String(conversation.last&&conversation.last.body||'');
          ctx.fillStyle=conversation.unread?'rgba(167,193,94,.16)':i%2?'rgba(255,255,255,.022)':'rgba(255,255,255,.05)';ctx.fillRect(p.x+5,y,p.w-10,rowH-2);
          ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=conversation.unread?'#cfe8a8':'#f0ddb0';ctx.font='700 '+(tiny?6:compact?8:10)+'px ui-monospace,Consolas,monospace';
          ctx.fillText(fitLine((conversation.unread?'● '+conversation.unread+' NEW · ':'')+'@'+person.handle+' · '+conversation.messages.length+' MESSAGES',openW-8),p.x+9,y+3);
          ctx.fillStyle='#aeb59d';ctx.font=(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(preview,openW-8),p.x+9,y+(tiny?14:compact?19:25));
          socialRects.push({id:'inbox_conversation_open',x:p.x+5,y,w:openW,h:rowH-2,enabled:true,conversationKey:conversation.uiKey});
          const ax=p.x+p.w-actionSpan-7;
          if(archived){
            drawSocialButton('conversation_restore','INBOX',ax,y+1,buttonW,Math.max(16,rowH-4),'#7fd8ff',!busy,{conversationKey:conversation.uiKey,handle:person.handle});
            drawSocialButton('conversation_delete','DELETE',ax+buttonW+actionGap,y+1,buttonW,Math.max(16,rowH-4),'#d05548',!busy,{conversationKey:conversation.uiKey,handle:person.handle});
          }else drawSocialButton('conversation_archive','ARCHIVE',ax,y+1,buttonW,Math.max(16,rowH-4),'#e8b658',!busy,{conversationKey:conversation.uiKey});
          continue;
        }
        if(item.kind==='notification'){
          const notice=item.notice||{},unread=!notice.readAt,ncol=/^ban_/.test(notice.kind)?'#ff6b5d':/^friend_/.test(notice.kind)?'#7fd8ff':notice.kind==='admin_message'?'#bfa8ff':'#a7c15e';
          ctx.fillStyle=unread?'rgba(208,85,72,.15)':i%2?'rgba(255,255,255,.022)':'rgba(255,255,255,.05)';ctx.fillRect(p.x+5,y,p.w-10,rowH-2);
          ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=ncol;ctx.font='700 '+(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine((unread?'● NEW · ':'')+String(notice.title||'OUTPOST ZERO NOTICE'),p.w-18),p.x+9,y+3);
          ctx.fillStyle='#f0ddb0';ctx.font=(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(String(notice.message||''),p.w-18),p.x+9,y+(tiny?14:compact?19:25));
          socialRects.push({id:'inbox_notice_open',x:p.x+5,y,w:p.w-10,h:rowH-2,enabled:true,noticeKey:String(notice.uiKey||'')});continue;
        }
        if(item.kind==='official'){
          ctx.fillStyle='rgba(232,182,88,.11)';ctx.fillRect(p.x+5,y,p.w-10,rowH-2);ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#e8b658';ctx.font='700 '+(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';ctx.fillText('OFFICIAL UPDATE',p.x+9,y+3);
          ctx.fillStyle='#f0ddb0';ctx.font=(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(item.title,p.w-18),p.x+9,y+(tiny?14:compact?19:25));socialRects.push({id:'official_update_open',x:p.x+5,y,w:p.w-10,h:rowH-2,enabled:true,title:item.title,body:item.body,meta:item.meta,updateId:item.id});continue;
        }
      }
      const footerGap=compact?5:8,bw=(p.w-12-footerGap*2)/3;
      if(!authUser)drawSocialButton('signin','SIGN IN',p.x+6,footerY,bw,footerH,col,true);
      else if(dmReady)drawSocialButton('dm_new','NEW MESSAGE',p.x+6,footerY,bw,footerH,col,true);
      else drawSocialButton('social_retry',dmMissing?'RETRY MESSAGES':'LOADING MESSAGES',p.x+6,footerY,bw,footerH,col,dmMissing);
      drawSocialButton('dm_prev','‹ '+(socialMessagePage+1)+'/'+pages,p.x+6+bw+footerGap,footerY,bw,footerH,'#8a9268',socialMessagePage>0);
      const morePages=socialMessagePage<pages-1,canLoadOlder=!morePages&&!!socialNotificationHasMore;
      drawSocialButton(morePages?'dm_next':canLoadOlder?'inbox_load_older':'inbox_refresh',morePages?(socialMessagePage+1)+'/'+pages+' ›':canLoadOlder?'LOAD OLDER':'REFRESH',p.x+6+(bw+footerGap)*2,footerY,bw,footerH,'#8a9268',morePages||canLoadOlder||!!authUser);
    }
  }

  if(activeSocialView==='party'){
    const p=view,col='#bfa8ff',online=partyServiceAvailable(),actionH=tiny?29:compact?38:44,actionGap=tiny?4:compact?7:10,
      side=(p.w-12-actionGap)/2,actionY=p.y+(tiny?19:compact?27:34);
    panelFrame(p,'PARTY · NEW · BETA',col,'PUBLIC DIRECTORY · HOST APPROVAL');
    drawSocialButton('party_create_new','CREATE NEW',p.x+6,actionY,side,actionH,'#a7c15e',online);
    drawSocialButton('party_join','JOIN',p.x+6+side+actionGap,actionY,side,actionH,'#7fd8ff',online);
    let cursor=actionY+actionH+(tiny?4:compact?7:10);
    if(party.accepted){
      const openH=tiny?22:compact?28:32;
      drawSocialButton('party_open','OPEN CURRENT PARTY · '+party.members.length+'/'+PARTY_MAX,p.x+6,cursor,p.w-12,openH,col,true);cursor+=openH+(tiny?4:compact?7:9);
    }
    const incomingInvites=typeof socialIncomingPartyInvites==='function'?socialIncomingPartyInvites():[];
    if(incomingInvites.length){
      const titleH=tiny?14:compact?18:21,rowH=tiny?34:compact?43:49,footerReserve=tiny?35:compact?45:52,
        pageSize=!tiny&&p.y+p.h-cursor-footerReserve>=titleH+rowH*2?2:1,
        invitePages=Math.max(1,Math.ceil(incomingInvites.length/pageSize));
      socialPartyInvitePage=clamp(Math.floor(+socialPartyInvitePage||0),0,invitePages-1);
      ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#bfa8ff';ctx.font='700 '+(tiny?7:compact?9:11)+'px ui-monospace,Consolas,monospace';
      ctx.fillText('INCOMING INVITES · '+incomingInvites.length,p.x+8,cursor);
      if(invitePages>1){
        const pagerW=tiny?24:31,pagerGap=tiny?2:4,pagerX=p.x+p.w-pagerW*2-pagerGap-6;
        drawSocialButton('party_invite_prev','‹',pagerX,cursor-2,pagerW,titleH,'#8a9268',socialPartyInvitePage>0);
        drawSocialButton('party_invite_next','›',pagerX+pagerW+pagerGap,cursor-2,pagerW,titleH,'#8a9268',socialPartyInvitePage<invitePages-1);
      }
      cursor+=titleH;
      const inviteRows=incomingInvites.slice(socialPartyInvitePage*pageSize,(socialPartyInvitePage+1)*pageSize);
      for(let i=0;i<inviteRows.length;i++){
        const invite=inviteRows[i],y=cursor+i*rowH,cpu=invite.kind==='cpu2v2',buttonGap=tiny?2:4,
          buttonW=Math.min(compact?56:72,Math.max(45,p.w*.16)),actionW=buttonW*2+buttonGap,profileW=Math.max(54,p.w-actionW-24),cloud=invite.source==='cloud';
        ctx.fillStyle=i%2?'rgba(191,168,255,.055)':'rgba(191,168,255,.11)';ctx.fillRect(p.x+5,y,p.w-10,rowH-2);
        ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#e6dcff';ctx.font='700 '+(tiny?6:compact?8:10)+'px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine('FROM @'+String(invite.senderUsername||'PLAYER'),profileW-8),p.x+9,y+3);
        ctx.fillStyle='#aeb59d';ctx.font='700 '+(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine(cpu?'CPU 2v2 INVITE':'PARTY INVITE',profileW-8),p.x+9,y+(tiny?14:compact?19:24));
        socialRects.push({id:'player_profile',x:p.x+6,y,w:profileW,h:rowH-2,enabled:true,handle:String(invite.senderUsername||'')});
        const bx=p.x+p.w-actionW-7,actionH=Math.max(16,rowH-4),actionExtra=cloud?{inviteKey:String(invite.inviteKey||'')}:{invite:invite.invite,messageKey:String(invite.messageKey||'')};
        const inviteActionsReady=!socialPartyInviteClaimBusy&&!socialPartyInviteDismissBusy;
        drawSocialButton(cloud?'cloud_party_invite_accept':cpu?'cpu_invite_play':'party_invite_join',cpu?'START':'JOIN',bx,y+1,buttonW,actionH,'#a7c15e',inviteActionsReady,actionExtra);
        drawSocialButton(cloud?'cloud_party_invite_dismiss':'legacy_party_invite_dismiss','DECLINE',bx+buttonW+buttonGap,y+1,buttonW,actionH,'#d05548',inviteActionsReady,actionExtra);
      }
      cursor+=inviteRows.length*rowH+(tiny?2:5);
    }
    const pending=typeof publicPartyHostRequests!=='undefined'&&Array.isArray(publicPartyHostRequests)?publicPartyHostRequests:[];
    if(partyIsHost()&&party.publicParty&&pending.length&&cursor<p.y+p.h-70){
      const titleH=tiny?13:compact?17:20,rowH=tiny?44:48;
      ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#e8b658';ctx.font='700 '+(tiny?7:compact?9:11)+'px ui-monospace,Consolas,monospace';ctx.fillText('JOIN REQUESTS',p.x+8,cursor);cursor+=titleH;
      for(const request of pending.slice(0,Math.max(1,Math.min(3,Math.floor((p.y+p.h-cursor-48)/rowH))))){
        const y=cursor,buttonW=Math.min(compact?66:86,p.w*.20),profileW=Math.max(40,p.w-18-buttonW*2-actionGap);
        ctx.fillStyle='rgba(232,182,88,.09)';ctx.fillRect(p.x+5,y,p.w-10,rowH-2);
        ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#f0ddb0';ctx.font='700 '+(tiny?7:compact?8:10)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine('@'+request.username,profileW-8),p.x+9,y+(rowH-2)/2);
        socialRects.push({id:'player_profile',x:p.x+6,y,w:profileW,h:rowH-2,enabled:true,handle:request.username});
        const bx=p.x+p.w-buttonW*2-actionGap-7,busy=!!publicPartyActionBusy;
        drawSocialButton('public_party_accept','ACCEPT',bx,y+1,buttonW,rowH-4,'#a7c15e',!busy,{requestId:request.requestId});
        drawSocialButton('public_party_decline','DECLINE',bx+buttonW+actionGap,y+1,buttonW,rowH-4,'#d05548',!busy,{requestId:request.requestId});cursor+=rowH;
      }
      cursor+=tiny?2:5;
    }
    const footerH=tiny?25:compact?32:38,footerY=p.y+p.h-footerH-5,titleY2=cursor,
      listTop=cursor+(tiny?14:compact?19:23),listH=Math.max(0,footerY-listTop-3),desiredRow=tiny?27:compact?37:46,
      maxRows=listH>=20?Math.max(1,Math.floor(listH/desiredRow)):0,rows=typeof publicPartyRows!=='undefined'&&Array.isArray(publicPartyRows)?publicPartyRows:[],
      pages=Math.max(1,Math.ceil(rows.length/Math.max(1,maxRows)));
    publicPartyPage=clamp(Math.floor(+publicPartyPage||0),0,pages-1);
    const directoryTitle='PUBLIC PARTIES'+(publicPartySearch?' · SEARCH: '+publicPartySearch.toUpperCase():'');
    ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=col;ctx.font='700 '+(tiny?7:compact?9:11)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(directoryTitle,p.w-16),p.x+8,titleY2);
    const visible=maxRows?rows.slice(publicPartyPage*maxRows,(publicPartyPage+1)*maxRows):[];
    if(!authUser)panelMessage(p,'SIGN IN TO REQUEST OR CREATE A PUBLIC PARTY',listTop+listH/2,'#8a9268');
    else if(publicPartySqlReady===false)panelMessage(p,'RUN SOCIAL 03 TO ENABLE PUBLIC PARTIES',listTop+listH/2,'#d05548');
    else if(publicPartyPolling&&!rows.length)panelMessage(p,'LOADING PUBLIC PARTIES...',listTop+listH/2,'#8a9268');
    else if(!rows.length)panelMessage(p,'NO PUBLIC PARTIES ARE OPEN · CREATE THE FIRST',listTop+listH/2,'#8a9268');
    for(let i=0;i<visible.length;i++){
      const row=visible[i],mine=typeof partyPublicMyRequest==='function'?partyPublicMyRequest(row.partyId):null,y=listTop+i*(listH/Math.max(1,maxRows)),rowH=listH/Math.max(1,maxRows),
        isHost=row.status==='host',approved=mine&&mine.status==='accepted'&&mine.expiresAt>Date.now(),pendingRequest=mine&&mine.status==='pending',
        label=isHost?'OPEN':approved?'JOIN':pendingRequest?'PENDING':mine&&mine.status==='declined'?'REQUEST AGAIN':'REQUEST',
        buttonW=Math.min(compact?86:112,Math.max(64,p.w*.24)),profileW=Math.max(60,p.w-buttonW-24);
      ctx.fillStyle=i%2?'rgba(191,168,255,.055)':'rgba(191,168,255,.10)';ctx.fillRect(p.x+5,y,p.w-10,rowH-2);
      ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#e6dcff';ctx.font='700 '+(tiny?7:compact?9:11)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(row.name,profileW-8),p.x+9,y+(tiny?3:5));
      ctx.fillStyle='#8a9268';ctx.font='700 '+(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine('@'+row.host+' · '+row.members+'/'+row.capacity+' PLAYERS · PROFILE',profileW-8),p.x+9,y+(tiny?14:compact?19:24));
      socialRects.push({id:'player_profile',x:p.x+6,y,w:profileW,h:rowH-2,enabled:true,handle:row.host});
      drawSocialButton(isHost?'party_open':approved?'public_party_join':'public_party_request',label,p.x+p.w-buttonW-7,y+1,buttonW,Math.max(18,rowH-4),isHost||approved?'#bfa8ff':'#e8b658',!pendingRequest&&!publicPartyActionBusy,{partyId:row.partyId,requestId:mine&&mine.requestId});
    }
    const footGap=tiny?3:5,footW=(p.w-12-footGap*3)/4;
    drawSocialButton('public_party_prev','‹ '+(publicPartyPage+1)+'/'+pages,p.x+6,footerY,footW,footerH,'#8a9268',publicPartyPage>0);
    drawSocialButton('public_party_search',publicPartySearch?'CLEAR / SEARCH':'SEARCH',p.x+6+footW+footGap,footerY,footW,footerH,'#e8b658',!!authUser);
    drawSocialButton('public_party_refresh','REFRESH',p.x+6+(footW+footGap)*2,footerY,footW,footerH,'#7fd8ff',!publicPartyPolling);
    drawSocialButton('public_party_next',(publicPartyPage+1)+'/'+pages+' ›',p.x+6+(footW+footGap)*3,footerY,footW,footerH,'#8a9268',publicPartyPage<pages-1);
  }

  backRect=drawSocialButton('back','‹ HOME',margin,backY,Math.min(170,W-margin*2),backH,'#8a9268',true);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function drawPartyButton(id,label,x,y,w,h,col,enabled=true,extra={}){
  const hot=enabled&&mouse.x>=x&&mouse.x<=x+w&&mouse.y>=y&&mouse.y<=y+h;
  const r=Object.assign({id,x,y,w,h,enabled},extra); partyRects.push(r);
  ctx.fillStyle=enabled?(hot?col:'rgba(0,0,0,0.42)'):'rgba(32,32,34,0.72)'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle=enabled?col:'#4a4a4d'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,w,h);
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=enabled?(hot?'#101208':'#e8d9a8'):'#60605d';
  ctx.font='700 '+(h<30?8:h<38?10:12)+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(label,w-8),x+w/2,y+h/2);
  return r;
}
function drawPartyChatOverlay(){
  if(!party.chatOpen) return;
  // Replace the lobby hit targets while the modal is visible so taps cannot
  // leak through to assignment, leave, or kick controls behind it.
  partyRects=[];
  ctx.fillStyle='rgba(4,4,7,0.84)'; ctx.fillRect(0,0,W,H);
  const compact=H<560, margin=compact?10:16, pw=Math.min(560,W-margin*2), ph=Math.min(H-margin*2,compact?Math.max(250,H-20):Math.max(330,H*0.78));
  const px=(W-pw)/2, py=(H-ph)/2, headerH=compact?49:60, footerH=compact?67:79, gap=compact?5:8;
  ctx.fillStyle='rgba(18,17,22,0.98)'; ctx.fillRect(px,py,pw,ph); ctx.strokeStyle='#bfa8ff'; ctx.lineWidth=2; ctx.strokeRect(px+1,py+1,pw-2,ph-2);
  ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='#d8c8ff'; ctx.font='700 '+(compact?17:22)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('PARTY CHAT',W/2,py+(compact?8:11));
  ctx.fillStyle=party.chatEnabled?'#a7c15e':'#d05548'; ctx.font='700 '+(compact?7:9)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(party.chatEnabled?'ENABLED \u00b7 '+party.chat.length+'/'+PARTY_CHAT_KEEP+' RECENT MESSAGES':'DISABLED BY HOST \u00b7 HISTORY IS STILL VISIBLE',W/2,py+(compact?31:40));

  const listX=px+8, listY=py+headerH, listW=pw-16, listH=Math.max(54,ph-headerH-footerH-8);
  ctx.fillStyle='rgba(0,0,0,0.46)'; ctx.fillRect(listX,listY,listW,listH); ctx.strokeStyle='#5c526d'; ctx.lineWidth=1; ctx.strokeRect(listX+0.5,listY+0.5,listW,listH);
  const rowH=compact?36:44;
  party.chatPageSize=Math.max(1,Math.floor((listH-6)/rowH));
  party.chatScroll=clamp(party.chatScroll,0,Math.max(0,party.chat.length-party.chatPageSize));
  const end=Math.max(0,party.chat.length-party.chatScroll), start=Math.max(0,end-party.chatPageSize), visible=party.chat.slice(start,end);
  if(!visible.length){
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#6b7455'; ctx.font=(compact?'9':'11')+'px ui-monospace,Consolas,monospace';
    ctx.fillText('NO MESSAGES YET',W/2,listY+listH/2);
  } else for(let i=0;i<visible.length;i++){
    const msg=visible[i], y=listY+4+i*rowH;
    ctx.fillStyle=i%2?'rgba(255,255,255,0.025)':'rgba(255,255,255,0.05)'; ctx.fillRect(listX+4,y,listW-8,rowH-2);
    ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillStyle=msg.authorId===party.self.id?'#7fd8ff':'#bfa8ff'; ctx.font='700 '+(compact?8:10)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(msg.author,listW-16),listX+8,y+4);
    ctx.fillStyle='#e8d9a8'; ctx.font=(compact?'8':'10')+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(msg.text,listW-16),listX+8,y+(compact?18:22));
  }

  const controlsY=py+ph-footerH, bh=compact?27:32, innerW=pw-16, half=(innerW-gap)/2;
  drawPartyButton('chat_up','OLDER',px+8,controlsY,half,bh,'#8a9268',party.chatScroll<Math.max(0,party.chat.length-party.chatPageSize));
  drawPartyButton('chat_down','NEWER',px+8+half+gap,controlsY,half,bh,'#8a9268',party.chatScroll>0);
  const bottomY=controlsY+bh+gap, buttons=partyIsHost()?3:2, bw=(innerW-gap*(buttons-1))/buttons;
  drawPartyButton('chat_send','SEND MESSAGE',px+8,bottomY,bw,bh,'#7fd8ff',party.chatEnabled);
  if(partyIsHost()) drawPartyButton('chat_toggle',party.chatEnabled?'DISABLE CHAT':'ENABLE CHAT',px+8+bw+gap,bottomY,bw,bh,party.chatEnabled?'#d05548':'#a7c15e',true);
  drawPartyButton('chat_close','CLOSE',px+8+(bw+gap)*(buttons-1),bottomY,bw,bh,'#bfa8ff',true);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function drawPartyEntry(){
  selBg(); partyRects=[];
  const compact=H<560, online=partyServiceAvailable(), pw=Math.min(590,W-28), px=W/2-pw/2;
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillStyle='#bfa8ff'; ctx.font='700 '+(compact?24:W<430?30:34)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('PARTY \u00b7 NEW \u00b7 BETA',W/2,H*0.045);
  ctx.fillStyle='#8a9268'; ctx.font=(compact?'9':'11')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('UP TO 4 PLAYERS \u00b7 NO SIGN-IN \u00b7 SHARE A CODE',W-24),W/2,H*0.045+(compact?32:44));
  const infoY=H*0.045+(compact?54:72), infoH=compact?92:124;
  ctx.fillStyle='rgba(18,17,22,0.72)'; ctx.fillRect(px,infoY,pw,infoH); ctx.strokeStyle='#5c526d'; ctx.strokeRect(px+0.5,infoY+0.5,pw,infoH);
  ctx.fillStyle='#d8c8ff'; ctx.font='700 '+(compact?13:17)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('CREATE OR JOIN',W/2,infoY+(compact?13:19));
  ctx.fillStyle='#e8b658'; ctx.font='700 '+(compact?6:8)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('NEW FEATURE \u00b7 BEING TESTED',W/2,infoY+(compact?26:35));
  ctx.fillStyle='#8a9268'; ctx.font='700 '+(compact?7:9)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('INVITE FRIENDS WITH A 6-CHARACTER CODE',pw-22),W/2,infoY+(compact?39:51));
  ctx.fillText(fitLine('PLAY: 1v1v1 \u00b7 1v1 \u00b7 2v2 \u00b7 EXISTING GAME MODE',pw-22),W/2,infoY+(compact?55:72));
  ctx.fillStyle='#d05548';
  ctx.fillText('AT LEAST 2 PARTY PLAYERS ARE NEEDED TO PLAY',W/2,infoY+(compact?71:94));
  const gap=compact?7:10, bh=compact?38:48, buttonsY=infoY+infoH+(compact?10:16), bw=(pw-gap)/2;
  drawPartyButton('create','CREATE PARTY',px,buttonsY,bw,bh,'#a7c15e',online);
  drawPartyButton('join','JOIN WITH CODE',px+bw+gap,buttonsY,bw,bh,'#7fd8ff',online);
  const backH=compact?32:38, backY=H-backH-14; backRect=drawPartyButton('back','\u2039 SOCIAL',W/2-Math.min(260,W-36)/2,backY,Math.min(260,W-36),backH,'#8a9268',true);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic'; ctx.fillStyle=online?'#8a9268':'#d05548'; ctx.font='700 '+(compact?8:10)+'px ui-monospace,Consolas,monospace';
  const msg=!online?'PARTIES NEED AN INTERNET CONNECTION':party.phase==='joining'?'CONNECTING TO PARTY...':(party.status||'CREATE A PARTY OR JOIN WITH A CODE');
  ctx.fillText(fitLine(msg,W-24),W/2,Math.min(backY-10,buttonsY+bh+(compact?20:28)));
  ctx.textAlign='left';
}
function drawPartyLobby(){
  selBg(); partyRects=[];
  // Chat is no longer part of this deliberately minimal lobby. Clear stale
  // overlay state left by an older session so Back works on the first press.
  party.chatOpen=false;
  const tiny=H<430, compact=H<560, margin=tiny?7:compact?10:Math.max(14,Math.min(22,W*0.025));
  const top=tiny?4:compact?7:12, titleFs=tiny?18:compact?22:30;
  const host=partyMember(party.hostId), sorted=party.members.slice().sort((a,b)=>(a.order-b.order)||a.id.localeCompare(b.id));
  ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='#bfa8ff'; ctx.font='700 '+titleFs+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(party.cpuIntent?'CPU 2v2 \u00b7 NEW \u00b7 BETA':'PARTY \u00b7 NEW \u00b7 BETA',W-24),W/2,top);
  ctx.fillStyle='#8a9268'; ctx.font='700 '+(tiny?7:compact?8:10)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(party.members.length+'/'+PARTY_MAX+' PLAYERS \u00b7 HOST '+(host?host.name:'RECONNECTING'),W-24),W/2,top+titleFs+(tiny?1:3));

  const lobbyWarningY=top+titleFs+(tiny?10:compact?14:17);
  ctx.fillStyle='#e8b658'; ctx.font='700 '+(tiny?6:compact?7:8)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('NEW FEATURE \u00b7 BEING TESTED',W/2,lobbyWarningY);
  const headerBottom=lobbyWarningY+(tiny?9:compact?11:14);
  const leaveH=tiny?25:compact?30:36, leaveY=H-margin-leaveH;
  const statusY=leaveY-(tiny?11:compact?14:18);
  const playH=tiny?46:compact?58:76, playY=statusY-playH-(tiny?10:compact?13:17);
  const panelY=headerBottom+(tiny?3:compact?6:10), panelBottom=playY-(tiny?7:compact?10:14), panelH=Math.max(112,panelBottom-panelY);
  const gap=tiny?5:compact?7:11, availableW=W-margin*2-gap;
  const rosterW=Math.floor(availableW*(W<520?0.58:0.62)), codeW=availableW-rosterW;
  const rosterX=margin, codeX=rosterX+rosterW+gap;

  // The lobby stays focused on the people and their invite code. PLAY opens a
  // separate four-choice page, while pairing edits remain inline here.
  ctx.fillStyle='rgba(0,0,0,0.42)'; ctx.fillRect(rosterX,panelY,rosterW,panelH); ctx.strokeStyle='#5c526d'; ctx.lineWidth=1; ctx.strokeRect(rosterX+0.5,panelY+0.5,rosterW,panelH);
  const rosterHeaderH=tiny?22:compact?27:34;
  ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillStyle='#d8c8ff'; ctx.font='700 '+(tiny?7:compact?9:11)+'px ui-monospace,Consolas,monospace';
  const selectedSetup=party.cpuIntent?'2 HUMANS VS 2 CPUs  ·  ':party.mode==='1v1v1'?'1v1v1  ·  ':party.mode==='1v1'?'1v1  ·  ':party.mode==='2v2'?'2v2  ·  ':'';
  const pairingHint=selectedSetup+(party.cpuIntent?(partyIsHost()?'EXACTLY 2 PLAYERS':'WAITING FOR HOST'):
    (partyIsHost()?'DEFAULT PAIRINGS  ·  USE ‹ › TO EDIT':'DEFAULT PAIRINGS'));
  ctx.fillText(fitLine('PARTY MEMBERS  '+party.members.length+'/'+PARTY_MAX+'  ·  '+pairingHint,rosterW-14),rosterX+8,panelY+rosterHeaderH/2);
  const rowGap=tiny?3:compact?4:6, rowsTop=panelY+rosterHeaderH, rowH=Math.max(18,Math.floor((panelH-rosterHeaderH-rowGap*5)/PARTY_MAX));
  for(let i=0;i<PARTY_MAX;i++){
    const m=sorted[i], y=rowsTop+rowGap+i*(rowH+rowGap);
    ctx.fillStyle=m?(i%2?'rgba(255,255,255,0.035)':'rgba(255,255,255,0.065)'):'rgba(255,255,255,0.018)';
    ctx.fillRect(rosterX+5,y,rosterW-10,rowH);
    if(!m){
      ctx.textAlign='left'; ctx.fillStyle='#555948'; ctx.font=(tiny?'6':compact?'7':'9')+'px ui-monospace,Consolas,monospace';
      ctx.fillText('OPEN SLOT',rosterX+10,y+rowH/2); continue;
    }
    const isMe=party.self&&m.id===party.self.id, isHost=partyIsHost(), canKick=isHost&&!isMe;
    // Pairing slots are neutral: choosing a game mode happens after PLAY.
    // Moving a player changes who occupies each deterministic A/B slot.
    const assignment=party.mode==='1v1v1'?(i<3?'FFA '+(i+1):'RESERVE'):
      party.mode==='2v2'?('TEAM '+(i<2?'A':'B')+(i%2+1)):
      ('PAIR '+(Math.floor(i/2)+1)+(i%2?'B':'A'));
    const controlH=Math.min(rowH-4,tiny?18:compact?22:26), controlY=y+Math.max(2,(rowH-controlH)/2);
    if(isHost){
      // Defaults are created when players join. The host only needs these
      // inline arrows to edit them; there is no separate assignment panel.
      const narrow=W<430, arrowW=narrow?15:tiny?16:compact?18:22, labelW=narrow?38:tiny?32:compact?39:50;
      const kickW=canKick?(narrow?30:tiny?29:compact?33:41):0;
      const kickGap=canKick?(narrow||tiny?2:3):0, controlsW=arrowW*2+labelW+kickW+kickGap;
      const controlsX=rosterX+rosterW-controlsW-6, nameW=Math.max(22,controlsX-rosterX-13);
      ctx.textAlign='left'; ctx.fillStyle=isMe?'#7fd8ff':'#e8d9a8'; ctx.font='700 '+(tiny?7:compact?9:11)+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine((m.id===party.hostId?'\u2605 ':'')+m.name+(isMe?'  (YOU)':''),nameW),rosterX+10,y+rowH/2);
      partyRects.push({id:'member_profile',x:rosterX+6,y,w:nameW+5,h:rowH,enabled:true,handle:m.name});
      drawPartyButton('member_prev','\u2039',controlsX,controlY,arrowW,controlH,'#bfa8ff',true,{memberId:m.id,dir:-1});
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#d8c8ff'; ctx.font='700 '+(tiny?6:compact?7:8)+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(assignment,labelW-2),controlsX+arrowW+labelW/2,y+rowH/2);
      drawPartyButton('member_next','\u203a',controlsX+arrowW+labelW,controlY,arrowW,controlH,'#bfa8ff',true,{memberId:m.id,dir:1});
      if(canKick) drawPartyButton('kick','KICK',controlsX+arrowW*2+labelW+kickGap,controlY,kickW,controlH,'#d05548',true,{memberId:m.id});
    } else {
      const labelW=tiny?38:compact?48:62, nameW=Math.max(28,rosterW-labelW-26);
      ctx.textAlign='left'; ctx.fillStyle=isMe?'#7fd8ff':'#e8d9a8'; ctx.font='700 '+(tiny?7:compact?9:11)+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine((m.id===party.hostId?'\u2605 ':'')+m.name+(isMe?'  (YOU)':''),nameW),rosterX+10,y+rowH/2);
      partyRects.push({id:'member_profile',x:rosterX+6,y,w:nameW+5,h:rowH,enabled:true,handle:m.name});
      ctx.textAlign='right'; ctx.fillStyle='#d8c8ff'; ctx.font='700 '+(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(assignment,labelW),rosterX+rosterW-8,y+rowH/2);
    }
  }

  ctx.fillStyle='rgba(18,17,22,0.78)'; ctx.fillRect(codeX,panelY,codeW,panelH); ctx.strokeStyle='#5c526d'; ctx.strokeRect(codeX+0.5,panelY+0.5,codeW,panelH);
  const codePad=tiny?5:compact?7:10, copyH=tiny?27:compact?34:42, codeGroupH=tiny?88:compact?116:154;
  const codeGroupY=panelY+Math.max(codePad,(panelH-codeGroupH)/2);
  ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='#8a9268'; ctx.font='700 '+(tiny?6:compact?8:10)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('PARTY CODE',codeW-10),codeX+codeW/2,codeGroupY);
  ctx.fillStyle='#7fd8ff'; ctx.font='700 '+(tiny?15:compact?20:Math.min(32,Math.max(22,codeW*0.17)))+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(party.code,codeW-12),codeX+codeW/2,codeGroupY+(tiny?18:compact?25:34));
  const copyY=Math.min(panelY+panelH-copyH-codePad,codeGroupY+(tiny?47:compact?63:82));
  if(party.cpuIntent){
    const actionGap=tiny?3:5,available=Math.max(38,panelY+panelH-codePad-copyY),actionH=Math.max(18,Math.floor((available-actionGap)/2));
    drawPartyButton('invite_cpu_friend',authUser?'INVITE A FRIEND':'COPY INVITE',codeX+codePad,copyY,codeW-codePad*2,actionH,'#bfa8ff',true);
    drawPartyButton('copy','COPY CODE',codeX+codePad,copyY+actionH+actionGap,codeW-codePad*2,actionH,'#7fd8ff',true);
  }else drawPartyButton('copy','COPY CODE',codeX+codePad,copyY,codeW-codePad*2,copyH,'#7fd8ff',true);
  if(!party.cpuIntent&&copyY+copyH+codePad*2<panelY+panelH){
    ctx.fillStyle='#6b7455'; ctx.font=(tiny?'6':compact?'7':'9')+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('SEND THIS TO FRIENDS',codeW-12),codeX+codeW/2,copyY+copyH+codePad);
  }

  const canPlay=party.cpuIntent?party.members.length===2:party.members.length>=PARTY_MIN_PLAYERS;
  const playHot=mouse.x>=margin&&mouse.x<=W-margin&&mouse.y>=playY&&mouse.y<=playY+playH;
  // Keep this target live below the minimum so the shared guard can explain
  // exactly why PLAY is unavailable instead of silently swallowing the tap.
  partyRects.push({id:party.cpuIntent?'cpu2v2':'browse',x:margin,y:playY,w:W-margin*2,h:playH,enabled:true});
  ctx.fillStyle=playHot?'#bfa8ff':'rgba(38,30,50,0.92)'; ctx.fillRect(margin,playY,W-margin*2,playH);
  ctx.strokeStyle='#bfa8ff'; ctx.lineWidth=2; ctx.strokeRect(margin+0.5,playY+0.5,W-margin*2-1,playH-1);
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=playHot?'#101208':'#f0e4ff';
  const cpuPlayLabel=!party.cpuIntent?'PLAY':party.members.length!==2?'WAITING FOR FRIEND':partyIsHost()?'START CPU 2v2':'WAITING FOR HOST';
  ctx.font='700 '+(party.cpuIntent?(tiny?13:compact?19:27):(tiny?22:compact?28:38))+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(cpuPlayLabel,W-margin*2-18),W/2,playY+playH*(tiny?0.44:0.43));
  ctx.fillStyle=canPlay?(playHot?'#2b2430':'#9b8dab'):(playHot?'#52262b':'#d05548'); ctx.font='700 '+(tiny?6:compact?8:10)+'px ui-monospace,Consolas,monospace';
  const cpuPlayNote=!party.cpuIntent?(canPlay?'1v1v1 \u00b7 1v1 \u00b7 2v2 \u00b7 EXISTING MODES':'NEED AT LEAST 2 PARTY PLAYERS'):
    party.members.length>2?'REMOVE EXTRA PLAYERS \u00b7 EXACTLY 2 REQUIRED':party.members.length<2?'INVITE ONE FRIEND WITH THE BUTTON OR CODE':partyIsHost()?'BOTH PLAYERS CHOOSE A LOADOUT NEXT':'THE PARTY HOST STARTS THE MATCH';
  ctx.fillText(cpuPlayNote,W/2,playY+playH*(tiny?0.76:0.73));

  ctx.textAlign='center'; ctx.textBaseline='alphabetic'; ctx.fillStyle=party.members.length<PARTY_MIN_PLAYERS?'#d05548':'#8a9268'; ctx.font='700 '+(tiny?6:compact?8:9)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(party.status||'SHARE THE CODE TO INVITE PLAYERS',W-20),W/2,statusY);
  const footerGap=tiny?5:compact?7:10, footerW=Math.min(430,W-margin*2), footerButtonW=(footerW-footerGap)/2, footerX=W/2-footerW/2;
  backRect=drawPartyButton('back',party.cpuIntent?'\u2039 CPU 2v2':'\u2039 SOCIAL',footerX,leaveY,footerButtonW,leaveH,'#8a9268',true);
  drawPartyButton('leave','LEAVE PARTY',footerX+footerButtonW+footerGap,leaveY,footerButtonW,leaveH,'#d05548',true);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function drawPartyModes(){
  selBg(); partyModeRects=[];
  const tiny=W<=360||H<430, narrow=W<520, compact=H<600, margin=tiny?7:compact?10:16;
  const titleY=tiny?5:compact?9:14, titleFs=tiny?21:compact?27:36;
  ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='#bfa8ff';
  ctx.font='700 '+titleFs+'px ui-monospace,Consolas,monospace'; ctx.fillText('PARTY PLAY',W/2,titleY);
  ctx.fillStyle='#8a9268'; ctx.font='700 '+(tiny?6:compact?8:10)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('NEW \u00b7 BETA \u00b7 BEING TESTED \u00b7 CHOOSE A SETUP OR NORMAL HOME PLAY',W-20),W/2,titleY+titleFs+(tiny?2:5));

  const backH=tiny?28:compact?34:40, backY=H-margin-backH;
  const statusY=backY-(tiny?10:compact?14:18), gridTop=titleY+titleFs+(tiny?18:compact?26:34);
  const gridBottom=statusY-(tiny?8:compact?11:15), availableH=Math.max(100,gridBottom-gridTop);
  const gridH=Math.min(availableH,tiny?250:compact?350:410), gridY=gridTop+Math.max(0,(availableH-gridH)/2);
  const gridW=Math.min(780,W-margin*2), gridX=W/2-gridW/2, gap=tiny?6:compact?9:13;
  const cardW=(gridW-gap)/2, cardH=(gridH-gap)/2;
  const cards=[
    {id:'party_mode_1v1v1',mode:'1v1v1',title:'1v1v1',note:'EXACTLY 3 PLAYERS \u00b7 EDIT PAIRINGS',foot:'GAMEPLAY COMING SOON',col:'#bfa8ff'},
    {id:'party_mode_1v1',mode:'1v1',title:'1v1',note:'EXACTLY 2 PLAYERS \u00b7 EDIT PAIRINGS',foot:'GAMEPLAY COMING SOON',col:'#7fd8ff'},
    {id:'party_mode_2v2',mode:'2v2',title:'2v2',note:'EXACTLY 4 PLAYERS \u00b7 EDIT PAIRINGS',foot:'GAMEPLAY COMING SOON',col:'#d05548'},
    {id:'party_mode_existing',mode:'existing',title:'EXISTING GAME MODE',note:'NORMAL HOME PLAY \u00b7 NOT SYNCHRONIZED',foot:'PARTY STAYS CONNECTED',col:'#a7c15e'}
  ];
  for(let i=0;i<cards.length;i++){
    const item=cards[i], x=gridX+(i%2)*(cardW+gap), y=gridY+Math.floor(i/2)*(cardH+gap);
    const hot=mouse.x>=x&&mouse.x<=x+cardW&&mouse.y>=y&&mouse.y<=y+cardH;
    const selected=item.mode!=='existing'&&party.mode===item.mode;
    partyModeRects.push({id:item.id,mode:item.mode,x,y,w:cardW,h:cardH,enabled:true});
    ctx.fillStyle=hot?item.col:(selected?'rgba(191,168,255,0.18)':'rgba(0,0,0,0.46)'); ctx.fillRect(x,y,cardW,cardH);
    ctx.strokeStyle=item.col; ctx.lineWidth=selected?2:1.5; ctx.strokeRect(x+0.5,y+0.5,cardW-1,cardH-1);
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=hot?'#101208':'#f0e4ff';
    const titleSize=item.id==='party_mode_existing'?(tiny?10:narrow?12:compact?15:20):(tiny?20:compact?27:36);
    ctx.font='700 '+titleSize+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(item.title,cardW-14),x+cardW/2,y+cardH*0.34);
    ctx.fillStyle=hot?'#25291b':'#a99bb8'; ctx.font='700 '+(tiny?6:narrow?6.5:compact?7:9)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(item.note,cardW-12),x+cardW/2,y+cardH*0.61);
    ctx.fillStyle=hot?'#25291b':(item.mode==='existing'?'#7f9661':'#d05548');
    ctx.font='700 '+(tiny?6:narrow?7:compact?8:10)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(item.foot,cardW-12),x+cardW/2,y+cardH*0.79);
  }

  const notice=/NEEDS EXACTLY|ONLY THE PARTY LEADER|NOT AVAILABLE/.test(party.status||'');
  ctx.textAlign='center'; ctx.textBaseline='alphabetic'; ctx.fillStyle=notice?'#ff6b5d':'#8a9268';
  ctx.font='700 '+(tiny?6:compact?8:9)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(party.status||'THE PARTY LEADER CHOOSES THE PAIRINGS',W-20),W/2,statusY);
  const backW=Math.min(260,W-margin*2), backX=W/2-backW/2;
  const backHot=mouse.x>=backX&&mouse.x<=backX+backW&&mouse.y>=backY&&mouse.y<=backY+backH;
  partyModeRects.push({id:'party_modes_back',x:backX,y:backY,w:backW,h:backH,enabled:true});
  ctx.fillStyle=backHot?'#8a9268':'rgba(0,0,0,0.45)'; ctx.fillRect(backX,backY,backW,backH);
  ctx.strokeStyle='#8a9268'; ctx.lineWidth=1; ctx.strokeRect(backX+0.5,backY+0.5,backW-1,backH-1);
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=backHot?'#101208':'#cdd6b0';
  ctx.font='700 '+(tiny?9:compact?10:12)+'px ui-monospace,Consolas,monospace'; ctx.fillText('\u2039 PARTY',W/2,backY+backH/2);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function drawParty(){
  if(party.phase==='lobby'&&party.accepted) drawPartyLobby(); else drawPartyEntry();
}
function drawLoadout(){
  selBg(); catBtns=[];
  const arenaMode=pendingGameMode==='arena', ai1v1Mode=pendingGameMode==='ai1v1', ai2v2Mode=pendingGameMode==='ai2v2', aiMode=ai1v1Mode||ai2v2Mode,
    partyCpuMode=pendingGameMode==='partycpu2v2', practiceSetup=pendingGameMode==='practice',
    practiceLabel={range:'SHOOTING RANGE',dps:'DPS DUMMY',tracking:'TRACKING DUMMY',boss:'WARLORD PRACTICE'}[pendingPractice]||'PRACTICE';
  const queueNoticeActive=modeBoardNotice&&now<modeBoardNoticeT;
  const modeCol=arenaMode?'#d05548':partyCpuMode?'#bfa8ff':aiMode?'#7fd8ff':practiceSetup?'#a7c15e':'#e8b658';
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillStyle=modeCol; ctx.font='700 '+(H<600?24:32)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('YOUR LOADOUT',W/2,H*0.035);
  const betaLoadout=arenaMode||partyCpuMode||ai2v2Mode;
  ctx.fillStyle=queueNoticeActive?'#ff6b5d':betaLoadout?'#e8b658':'#8a9268'; ctx.font=(W<430?(betaLoadout?'8':'9'):'11')+'px ui-monospace,Consolas,monospace';
  const loadoutSub=arenaMode?(W<430?'NEW/BETA \u00b7 SAVED \u00b7 1v1 \u00b7 ONLINE':'NEW \u00b7 BETA \u00b7 TESTING \u00b7 AUTO-SAVED \u00b7 CASUAL 1v1 \u00b7 ONLINE'):
                   partyCpuMode?(W<430?'NEW/BETA \u00b7 SAVED \u00b7 CPU 2v2 \u00b7 2 DEVICES \u00b7 NO REWARDS':'NEW \u00b7 BETA \u00b7 TESTING \u00b7 AUTO-SAVED \u00b7 PARTY CPU 2v2 \u00b7 MULTIPLE DEVICES \u00b7 NO REWARDS'):
                   ai2v2Mode?(W<430?'NEW/BETA \u00b7 SAVED \u00b7 CPU 2v2 \u00b7 LOCAL \u00b7 NO REWARDS':'NEW \u00b7 BETA \u00b7 TESTING \u00b7 AUTO-SAVED \u00b7 CPU 2v2 \u00b7 LOCAL \u00b7 NO REWARDS'):
                   ai1v1Mode?'OFFLINE \u00b7 ONE DEVICE ONLY \u00b7 1v1 VS AI \u00b7 NO UPGRADES':
                   practiceSetup?'OFFLINE \u00b7 PRACTICE \u00b7 '+practiceLabel+' \u00b7 NO SCORE OR REWARDS':
                          'OFFLINE \u00b7 ONE DEVICE ONLY \u00b7 ENDLESS \u00b7 UTILITY OPTIONAL';
  ctx.fillText(fitLine(queueNoticeActive?modeBoardNotice:betaLoadout?loadoutSub:('AUTO-SAVED FOR EVERY MODE \u00b7 '+loadoutSub),W-24),W/2,H*0.035+40);
  const rows=(aiMode||partyCpuMode)?CATS.slice(0,3):CATS;
  const bw=Math.min(540,W-40), x0=W/2-bw/2, gap=H<600?9:14;
  const top=H*0.035+68, footer=112;
  const rowH=clamp(Math.floor((H-top-footer-gap*(rows.length-1))/rows.length),H<420?32:H<500?40:48,78);
  let y=top;
  for(const [cat,slot] of rows){
    const k=loadout[slot], col=ROLECOL[cat], r={cat,x:x0,y,w:bw,h:rowH}; catBtns.push(r);
    const hot=mouse.x>=x0&&mouse.x<=x0+bw&&mouse.y>=y&&mouse.y<=y+rowH;
    ctx.fillStyle=hot?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.40)'; ctx.fillRect(x0,y,bw,rowH);
    ctx.strokeStyle=k?col:(cat==='UTILITY'?'#4a4634':'#6b5030'); ctx.lineWidth=k?2:1; ctx.strokeRect(x0+0.5,y+0.5,bw,rowH);
    ctx.fillStyle=col; ctx.fillRect(x0,y,6,rowH);
    ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillStyle=col; ctx.font='700 15px ui-monospace,Consolas,monospace'; ctx.fillText(cat,x0+20,y+rowH/2-9);
    ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace'; ctx.fillText(cat==='UTILITY'?'OPTIONAL \u00b7 SAVED':'REQUIRED \u00b7 SAVED',x0+20,y+rowH/2+11);
    ctx.textAlign='right'; ctx.fillStyle=k?'#e8d9a8':'#6b5030'; ctx.font='700 '+(W<430?12:15)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(k?(cat==='UTILITY'?UTILITIES[k]:WEAPONS[k]).name:'\u2014 CHOOSE \u2014',x0+bw-42,y+rowH/2);
    ctx.fillStyle=hot?'#e8b658':'#8a9268'; ctx.font='700 22px ui-monospace,Consolas,monospace'; ctx.fillText('\u203A',x0+bw-18,y+rowH/2);
    ctx.textAlign='center'; ctx.textBaseline='top'; y+=rowH+gap;
  }
  const ready=!!(loadout.primary&&loadout.secondary&&loadout.melee), dh=48, dw=Math.min(360,W-34), dx=W/2-dw/2;
  const dy=Math.min(H-dh-58,y+5); deployRect={x:dx,y:dy,w:dw,h:dh};
  const hot=ready&&mouse.x>=dx&&mouse.x<=dx+dw&&mouse.y>=dy&&mouse.y<=dy+dh;
  ctx.fillStyle=hot?modeCol:ready?(partyCpuMode?'rgba(191,168,255,0.16)':aiMode?'rgba(127,216,255,0.16)':arenaMode?'rgba(208,85,72,0.18)':'rgba(232,182,88,0.16)'):'rgba(0,0,0,0.35)'; ctx.fillRect(dx,dy,dw,dh);
  ctx.strokeStyle=ready?modeCol:'#4a4634'; ctx.lineWidth=1.5; ctx.strokeRect(dx+0.5,dy+0.5,dw,dh);
  ctx.fillStyle=hot?'#101208':ready?'#e8d9a8':'#6b7455'; ctx.font='700 16px ui-monospace,Consolas,monospace'; ctx.textBaseline='middle';
  ctx.fillText(ready?(partyCpuMode?'READY FOR PARTY 2v2':arenaMode?'START QUEUING FOR 1v1':ai2v2Mode?'START 2v2 VS CPUs':ai1v1Mode?'START 1v1 VS AI':practiceSetup?'START '+practiceLabel:'START ENDLESS'):'CHOOSE ALL 3 WEAPONS',W/2,dy+dh/2);
  const bbW=120, bbH=30, bbX=16, bbY=H-bbH-14; backRect={x:bbX,y:bbY,w:bbW,h:bbH};
  const backHot=mouse.x>=bbX&&mouse.x<=bbX+bbW&&mouse.y>=bbY&&mouse.y<=bbY+bbH;
  ctx.fillStyle=backHot?'#8a9268':'rgba(138,146,104,0.12)'; ctx.fillRect(bbX,bbY,bbW,bbH); ctx.strokeStyle='#8a9268'; ctx.strokeRect(bbX+0.5,bbY+0.5,bbW,bbH);
  const backLabel=pendingGameMode==='practice'?'\u2039 PRACTICE':partyCpuMode?'\u2039 PARTY':loadoutBackPage==='offlinecpu'?'\u2039 OFFLINE VS CPU':(loadoutBackPage==='modeboard'?'\u2039 PLAY MENU':'\u2039 HOME');
  ctx.fillStyle=backHot?'#101208':'#cdd6b0'; ctx.font='700 11px ui-monospace,Consolas,monospace'; ctx.fillText(backLabel,bbX+bbW/2,bbY+bbH/2);
  if(now<pracNeedMsgT){ ctx.fillStyle='#d05548'; ctx.font='700 11px ui-monospace,Consolas,monospace'; ctx.fillText('PRIMARY + SIDEARM + MELEE ARE REQUIRED',W/2,dy-18); }
  ctx.textBaseline='alphabetic';
}

// Home's WEAPONS route is a catalog, not another loadout editor. Its lists are
// assembled from the public rosters, the limited-time rosters, and currently
// published gem-shop offers. Storage-only equipment is visible only to an
// admin using the dedicated Test Mode/editor path.
function weaponBrowserKeys(cat){
  const entry=CATS.find(c=>c[0]===cat);
  if(!entry) return [];
  const slot=entry[1], keys=[], add=k=>{
    if(!k||keys.includes(k)) return;
    const valid=slot==='utility' ? !!(UTILITIES[k]||VAULT_UTILITIES[k]) : !!(WEAPONS[k]||VAULT_WEAPONS[k]);
    if(!valid) return;
    const vaulted=Object.prototype.hasOwnProperty.call(VAULT_SLOTS,k);
    const adminTest=typeof fallEligible==='function'&&fallEligible();
    const published=typeof isWeaponPublished!=='function'||isWeaponPublished(k);
    if(vaulted&&!adminTest&&!published) return;              // no storage-only/public leaks
    if(FALL_KEYS.includes(k)&&!adminTest) return;
    keys.push(k);
  };
  entry[2]().forEach(add);                                 // current released roster
  GEM_SHOP.filter(it=>it.slot===slot).forEach(it=>add(it.key)); // include locked public offers
  entry[3]().forEach(add);                                 // current limited-time roster
  return keys;
}
function weaponBrowserAccess(k){
  const limited=TEMP_PRIMARY.includes(k)||TEMP_SECONDARY.includes(k)||TEMP_MELEE.includes(k)||TEMP_UTILITY.includes(k);
  const shop=GEM_SHOP.find(it=>it.key===k),locked=typeof isLocked==='function'&&isLocked(k),
    published=typeof isWeaponPublished!=='function'||isWeaponPublished(k);
  const adminTest=typeof fallEligible==='function'&&fallEligible();
  if(FALL_KEYS.includes(k)) return {text:'ADMIN TEST \u00b7 NEXT SEASON',col:'#d0763e',locked:false};
  if(Object.prototype.hasOwnProperty.call(VAULT_SLOTS,k)&&!shop&&adminTest)
    return {text:'ADMIN TEST \u00b7 DORMANT',col:'#d0763e',locked:false};
  if(limited) return locked
    ? {text:'LIMITED \u00b7 SIGN IN',col:'#d05548',locked:true}
    : {text:'LIMITED \u00b7 AVAILABLE',col:'#ff8b4d',locked:false};
  if(shop){
    if(!published)return {text:'UNAVAILABLE \u00b7 NOT CURRENTLY LIVE',col:'#d05548',locked:true};
    if(gemOwned[k]) return {text:'OWNED \u00b7 LIVE',col:'#a7c15e',locked:false};
    if(typeof testMode!=='undefined'&&testMode) return {text:'TEST ACCESS \u00b7 NOT OWNED',col:'#d0763e',locked:false};
    if(typeof sb==='undefined'||!sb) return {text:'OFFLINE PREVIEW \u00b7 NOT OWNED',col:'#8fb3c9',locked:false};
    return {text:'BUY IN SHOP \u00b7 \uD83D\uDC8E '+shop.cost,col:'#7fd8ff',locked:false};
  }
  return {text:'LIVE \u00b7 AVAILABLE',col:'#a7c15e',locked:false};
}
function weaponBrowserDef(k,cat){
  return cat==='UTILITY' ? (UTILITIES[k]||VAULT_UTILITIES[k]) : (WEAPONS[k]||VAULT_WEAPONS[k]);
}
function drawWeaponsHome(){
  selBg(); weaponBrowserRects=[];
  const tiny=H<400, margin=Math.max(10,Math.min(24,W*.045));
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillStyle='#e8b658'; ctx.font='700 '+(tiny?22:30)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('WEAPONS',W/2,Math.max(10,H*.035));
  ctx.fillStyle='#8a9268'; ctx.font=(W<360?'8':'10')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('BROWSE THE CURRENT ARMORY \u00b7 DETAILS \u00b7 PRACTICE',W-24),W/2,Math.max(39,H*.035+(tiny?28:38)));

  const backH=tiny?28:34, backW=Math.min(190,W-margin*2), backX=W/2-backW/2, backY=H-margin-backH;
  const top=tiny?68:82, bottom=backY-(tiny?9:15), gap=tiny?6:10;
  const gridW=Math.min(720,W-margin*2), gridX=W/2-gridW/2, cardW=(gridW-gap)/2;
  const available=Math.max(100,bottom-top), cardH=Math.min(220,(available-gap)/2);
  const gridY=top+Math.max(0,(available-(cardH*2+gap))/2);
  for(let i=0;i<CATS.length;i++){
    const cat=CATS[i][0], keys=weaponBrowserKeys(cat), col=ROLECOL[cat];
    const x=gridX+(i%2)*(cardW+gap), y=gridY+Math.floor(i/2)*(cardH+gap);
    const hot=mouse.x>=x&&mouse.x<=x+cardW&&mouse.y>=y&&mouse.y<=y+cardH;
    weaponBrowserRects.push({kind:'category',cat,x,y,w:cardW,h:cardH});
    ctx.fillStyle=hot?'rgba(232,182,88,0.16)':'rgba(0,0,0,0.42)'; ctx.fillRect(x,y,cardW,cardH);
    ctx.strokeStyle=col; ctx.lineWidth=hot?2:1.2; ctx.strokeRect(x+0.5,y+0.5,cardW-1,cardH-1);
    ctx.fillStyle=col; ctx.fillRect(x,y,5,cardH);
    ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillStyle=col;
    ctx.font='700 '+(cardH<70?10:cardW<150?12:16)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(cat,cardW-45),x+14,y+(cardH<70?9:13));
    ctx.textAlign='right'; ctx.fillStyle='#e8d9a8'; ctx.font='700 '+(cardH<70?9:12)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(keys.length+' ITEMS',x+cardW-12,y+(cardH<70?10:15));
    if(cardH>=66){
      const names=keys.map(k=>(weaponBrowserDef(k,cat)||{}).name||k).join(' \u00b7 ');
      ctx.textAlign='left'; ctx.fillStyle='#8a9268'; ctx.font=(cardH<100?'7':'9')+'px ui-monospace,Consolas,monospace';
      wrapTextClamped(names,x+14,y+(cardH<100?35:43),cardW-28,cardH<100?10:12,Math.max(1,Math.floor((cardH-(cardH<100?43:53))/(cardH<100?10:12))));
    }
    ctx.textAlign='right'; ctx.textBaseline='bottom'; ctx.fillStyle=hot?'#e8b658':'#6b7455';
    ctx.font='700 '+(cardH<70?13:18)+'px ui-monospace,Consolas,monospace'; ctx.fillText('\u203A',x+cardW-12,y+cardH-8);
  }
  backRect={x:backX,y:backY,w:backW,h:backH};
  const bh=mouse.x>=backX&&mouse.x<=backX+backW&&mouse.y>=backY&&mouse.y<=backY+backH;
  ctx.fillStyle=bh?'#8a9268':'rgba(138,146,104,0.12)'; ctx.fillRect(backX,backY,backW,backH);
  ctx.strokeStyle='#8a9268'; ctx.lineWidth=1; ctx.strokeRect(backX+0.5,backY+0.5,backW-1,backH-1);
  ctx.fillStyle=bh?'#101208':'#cdd6b0'; ctx.font='700 11px ui-monospace,Consolas,monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('\u2039 HOME',W/2,backY+backH/2);
  ctx.textBaseline='alphabetic';
}
function drawWeaponBrowserCard(k,cat,x,y,w,h){
  const def=weaponBrowserDef(k,cat), access=weaponBrowserAccess(k), col=ROLECOL[cat], isUtil=cat==='UTILITY';
  if(!def) return;
  const hot=mouse.x>=x&&mouse.x<=x+w&&mouse.y>=y&&mouse.y<=y+h;
  weaponBrowserRects.push({kind:'detail',key:k,x,y,w,h});
  ctx.fillStyle=hot?'rgba(255,255,255,0.055)':'rgba(0,0,0,0.42)'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle=hot?'#e8b658':access.locked?'#4a5a62':col; ctx.lineWidth=hot?1.8:1; ctx.strokeRect(x+0.5,y+0.5,w-1,h-1);
  ctx.fillStyle=access.col; ctx.fillRect(x,y,w,4);
  const compact=h<92, veryTight=h<62;
  const practiceW=compact?Math.min(44,w*.44):Math.min(78,Math.max(58,w*.36)), practiceH=compact?30:28;
  const practiceX=x+w-practiceW-6, practiceY=y+7;
  const practiceAllowed=(typeof isWeaponPublished!=='function'||isWeaponPublished(k))||
    (typeof FALL_KEYS!=='undefined'&&FALL_KEYS.includes(k)&&typeof fallEligible==='function'&&fallEligible());
  if(practiceAllowed)weaponBrowserRects.push({kind:'practice',key:k,x:practiceX,y:practiceY,w:practiceW,h:practiceH});
  const practiceHot=mouse.x>=practiceX&&mouse.x<=practiceX+practiceW&&mouse.y>=practiceY&&mouse.y<=practiceY+practiceH;
  ctx.fillStyle=practiceAllowed?(practiceHot?'#a7c15e':'rgba(167,193,94,0.13)'):'rgba(208,85,72,0.08)'; ctx.fillRect(practiceX,practiceY,practiceW,practiceH);
  ctx.strokeStyle=practiceAllowed?'#a7c15e':'#6a413d'; ctx.strokeRect(practiceX+0.5,practiceY+0.5,practiceW-1,practiceH-1);
  ctx.fillStyle=practiceAllowed?(practiceHot?'#101208':'#cfe0a8'):'#9a625c'; ctx.font='700 '+(compact?8:9)+'px ui-monospace,Consolas,monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(practiceAllowed?(compact?'\uD83C\uDFAF':'\uD83C\uDFAF PRACTICE'):(compact?'LOCKED':'IN STORAGE'),practiceX+practiceW/2,practiceY+practiceH/2);

  if(!veryTight){
    const iconX=x+Math.min(32,w*.17), iconY=y+(compact?33:43), scale=compact?.55:.72;
    if(isUtil) drawUtilIcon(iconX,iconY,k,access.locked?'#53605e':col,scale);
    else drawGunIcon(iconX,iconY,k,access.locked?'#53605e':col,scale);
  }
  const nameX=x+(veryTight?8:compact?53:66), nameRoom=Math.max(40,practiceX-nameX-5);
  ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillStyle=access.locked?'#8c9992':'#e8d9a8';
  ctx.font='700 '+(veryTight?8:compact?9:12)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(def.name,nameRoom),nameX,y+(veryTight?9:compact?33:36));
  if(!veryTight){
    ctx.fillStyle=access.col; ctx.font='700 '+(compact?6:8)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(access.text,w-16),x+8,y+h-(compact?17:20));
  }
  if(h>=105){
    let summary;
    if(isUtil) summary=k==='medkit'?'RECHARGE '+medKillsRequired()+' KILLS':'RECHARGE '+Math.round(def.cd/1000)+'s';
    else if(def.melee) summary=def.dmg+' DMG \u00b7 '+def.range+' RANGE \u00b7 '+def.fireRate+'ms';
    else summary=(def.dmg*def.pellets)+' DMG \u00b7 '+def.mag+' MAG \u00b7 '+def.fireRate+'ms';
    ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(summary,w-16),x+8,y+67);
  }
  if(h>=145){
    ctx.fillStyle='#6b7455'; ctx.font='8px ui-monospace,Consolas,monospace';
    const browserCopy=isUtil?liveUtilityCopy(k,def):(def.gimmick&&def.gimmick.copy?def.gimmick.copy:def.blurb);
    wrapTextClamped(browserCopy,x+8,y+86,w-16,10,Math.max(1,Math.floor((h-116)/10)));
  }
  ctx.textAlign='right'; ctx.textBaseline='bottom'; ctx.fillStyle=hot?'#e8b658':'#8a9268';
  ctx.font='700 '+(veryTight?9:11)+'px ui-monospace,Consolas,monospace'; ctx.fillText('DETAILS \u203A',x+w-7,y+h-6);
  ctx.textBaseline='alphabetic';
}
function drawWeaponBrowser(){
  selBg(); weaponBrowserRects=[];
  if(!CATS.some(c=>c[0]===weaponBrowserCat)) weaponBrowserCat='PRIMARY';
  const tiny=H<400, margin=Math.max(8,Math.min(22,W*.04));
  ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle=ROLECOL[weaponBrowserCat];
  ctx.font='700 '+(tiny?19:27)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(weaponBrowserCat,W/2,Math.max(8,H*.025));
  ctx.fillStyle='#8a9268'; ctx.font=(W<360?'7':'9')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('BROWSE ONLY \u00b7 LOADOUT WILL NOT CHANGE \u00b7 TAP \uD83C\uDFAF TO PRACTICE',W-20),W/2,Math.max(31,H*.025+(tiny?24:33)));

  const tabY=tiny?55:65, tabH=tiny?24:30, tabGap=W<420?3:6, tabW=(Math.min(720,W-margin*2)-tabGap*3)/4;
  let tabX=W/2-(tabW*4+tabGap*3)/2;
  for(const entry of CATS){
    const cat=entry[0], active=cat===weaponBrowserCat, col=ROLECOL[cat], x=tabX;
    const hot=mouse.x>=x&&mouse.x<=x+tabW&&mouse.y>=tabY&&mouse.y<=tabY+tabH;
    weaponBrowserRects.push({kind:'tab',cat,x,y:tabY,w:tabW,h:tabH});
    ctx.fillStyle=hot?col:active?'rgba(232,182,88,0.16)':'rgba(0,0,0,0.4)'; ctx.fillRect(x,tabY,tabW,tabH);
    ctx.strokeStyle=col; ctx.lineWidth=active?2:1; ctx.strokeRect(x+0.5,tabY+0.5,tabW-1,tabH-1);
    ctx.fillStyle=hot?'#101208':active?'#e8d9a8':'#8a9268'; ctx.font='700 '+(tabW<72?'6':tabW<100?'8':'10')+'px ui-monospace,Consolas,monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(fitLine(cat+' '+weaponBrowserKeys(cat).length,tabW-6),x+tabW/2,tabY+tabH/2);
    tabX+=tabW+tabGap;
  }

  const backH=tiny?26:32, backW=Math.min(190,W-margin*2), backX=W/2-backW/2, backY=H-margin-backH;
  const gridTop=tabY+tabH+(tiny?7:12), gridBottom=backY-(tiny?7:12), availableH=Math.max(80,gridBottom-gridTop);
  const keys=weaponBrowserKeys(weaponBrowserCat), cols=W>=720?4:W>=520?3:2, gap=tiny?6:9, rows=Math.max(1,Math.ceil(keys.length/cols));
  const gridW=Math.min(920,W-margin*2), cardW=(gridW-gap*(cols-1))/cols;
  const cardH=Math.min(190,(availableH-gap*(rows-1))/rows), usedH=cardH*rows+gap*(rows-1);
  const gridX=W/2-gridW/2, gridY=gridTop+Math.max(0,(availableH-usedH)/2);
  for(let i=0;i<keys.length;i++){
    const row=Math.floor(i/cols), col=i%cols, inRow=Math.min(cols,keys.length-row*cols);
    const rowW=inRow*cardW+(inRow-1)*gap, rowX=W/2-rowW/2;
    drawWeaponBrowserCard(keys[i],weaponBrowserCat,rowX+col*(cardW+gap),gridY+row*(cardH+gap),cardW,cardH);
  }
  backRect={x:backX,y:backY,w:backW,h:backH};
  const hot=mouse.x>=backX&&mouse.x<=backX+backW&&mouse.y>=backY&&mouse.y<=backY+backH;
  ctx.fillStyle=hot?'#8a9268':'rgba(138,146,104,0.12)'; ctx.fillRect(backX,backY,backW,backH);
  ctx.strokeStyle='#8a9268'; ctx.strokeRect(backX+0.5,backY+0.5,backW-1,backH-1);
  ctx.fillStyle=hot?'#101208':'#cdd6b0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('\u2039 WEAPONS',W/2,backY+backH/2);
  ctx.textBaseline='alphabetic';
}
function drawHomeLeaderboards(x,y,w,h){
  const titleH=h<90?16:20, gap=w<400?5:10;
  const panelY=y+titleH, panelH=h-titleH, panelW=(w-gap)/2;
  // Test/preview harnesses may draw this component without networking state,
  // so the normal empty labels remain the safe fallback.
  const readState=typeof leaderboardReadState==='object'&&leaderboardReadState?leaderboardReadState:null;
  const emptyLabel=(key,normal)=>{
    const status=readState&&readState[key];
    if(status==='loading') return 'LOADING...';
    if(status==='setup') return 'RUN LEADERBOARD SQL';
    if(status==='error') return 'BOARD UNAVAILABLE';
    return normal;
  };
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#e8b658'; ctx.font='700 '+(h<90?9:11)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83C\uDFC6 TOP '+PUBLIC_BOARD_LIMIT+' LEADERBOARDS',x+w/2,y+titleH/2);
  const panels=[
    {x,title:'ONLINE',metric:authUser&&Number.isSafeInteger(arenaOwnWinTotal)?('YOUR WINS '+arenaOwnWinTotal):'1v1 WINS',rows:arenaBoard,col:'#d05548',empty:emptyLabel('arena',onlineServiceAvailable()?'NO WINS YET':'NO CONNECTION')},
    {x:x+panelW+gap,title:'OFFLINE',metric:'ENDLESS SCORE',rows:board,col:'#a7c15e',empty:emptyLabel('endless',sb?'NO SCORES YET':'BOARD OFFLINE')}
  ];
  for(const panel of panels){
    ctx.fillStyle='rgba(8,10,7,0.72)'; ctx.fillRect(panel.x,panelY,panelW,panelH);
    ctx.strokeStyle=panel.col; ctx.lineWidth=1.2; ctx.strokeRect(panel.x+0.5,panelY+0.5,panelW,panelH);
    const headH=panelH<70?14:19;
    ctx.textBaseline='middle'; ctx.textAlign='left'; ctx.fillStyle=panel.col;
    ctx.font='700 '+(panelW<170?7:9)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(panel.title,panel.x+6,panelY+headH/2);
    ctx.textAlign='right'; ctx.fillStyle='#777f68'; ctx.font='700 '+(panelW<170?6:7)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(panel.metric,panel.x+panelW-6,panelY+headH/2);
    const rowH=(panelH-headH-2)/PUBLIC_BOARD_LIMIT;
    const count=Math.min(PUBLIC_BOARD_LIMIT,panel.rows.length);
    for(let i=0;i<PUBLIC_BOARD_LIMIT;i++){
      const rowY=panelY+headH+i*rowH;
      ctx.fillStyle=i%2?'rgba(255,255,255,0.018)':'rgba(255,255,255,0.045)';
      ctx.fillRect(panel.x+3,rowY,panelW-6,rowH);
      if(i>=count) continue;
      const item=panel.rows[i], publicName=leaderboardUsername(item);
      leaderboardRowRects.push({x:panel.x+3,y:rowY,w:panelW-6,h:rowH,userId:item.user_id,
        name:publicName,score:+item.score||0,metric:panel.title==='ONLINE'?'arena_wins':'endless_score',
        needsUsername:leaderboardNeedsUsername(item)});
      const hot=mouse.x>=panel.x+3&&mouse.x<=panel.x+panelW-3&&mouse.y>=rowY&&mouse.y<=rowY+rowH;
      if(hot){ ctx.fillStyle='rgba(127,216,255,0.13)'; ctx.fillRect(panel.x+3,rowY,panelW-6,rowH); }
      const me=authUser&&item.user_id===authUser.id;
      ctx.textBaseline='middle'; ctx.textAlign='left'; ctx.fillStyle=me?'#a7c15e':(i<3?'#cdd6b0':'#8a9268');
      ctx.font=(rowH<11?'6':rowH<14?'8':'9')+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine((i+1)+'. '+publicName,panelW-52),panel.x+6,rowY+rowH/2);
      ctx.textAlign='right'; ctx.fillStyle=panel.col; ctx.font='700 '+(rowH<11?'6':rowH<14?'8':'9')+'px ui-monospace,Consolas,monospace';
      ctx.fillText(String(item.score||0),panel.x+panelW-6,rowY+rowH/2);
    }
    if(!count){
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#60675a';
      ctx.font=(panelW<170?'6':'8')+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(panel.empty,panelW-12),panel.x+panelW/2,panelY+headH+(panelH-headH)/2);
    }
  }
  ctx.textAlign='center'; ctx.textBaseline='top';
}
function hubUtilityLayout(taskRect,limitTop,buttonH,gap){
  const y=Math.min(limitTop,taskRect.y+taskRect.h+6),half=(taskRect.w-gap)/2,rowY=y+buttonH+gap;
  return {
    settings:{x:taskRect.x,y,w:taskRect.w,h:buttonH},
    shop:{x:taskRect.x,y:rowY,w:half,h:buttonH},
    tools:{x:taskRect.x+half+gap,y:rowY,w:half,h:buttonH}
  };
}
function drawHub(){
  selBg();
  leaderboardRowRects=[];
  compactStatus = W<680;
  pendingCancelRect=null;
  ctx.textAlign='center';
  const accountGeo=accountTriggerMetrics(),gearGeo=gearMetrics(),titleChars=12;
  let titleFs=(H<760?28:38),titleX=W/2;
  const estimatedTitleW=titleFs*titleChars*.62,accountRight=accountGeo.x+accountGeo.w+10;
  if(W<900&&W/2-estimatedTitleW/2<accountRight){
    const titleRight=gearGeo.x-8,room=Math.max(96,titleRight-accountRight);
    titleFs=Math.min(titleFs,Math.max(16,Math.floor(room/(titleChars*.62))));
    titleX=accountRight+room/2;
  }
  ctx.fillStyle='#e8b658'; ctx.font='700 '+titleFs+'px ui-monospace,Consolas,monospace';
  ctx.fillText('OUTPOST ZERO', titleX, H*0.035);
  const titleBottom=H*0.035+titleFs;                 // the title uses a TOP baseline

  // ADMIN ROW: big labeled rectangles right under the title (admins only); the rest of the hub shifts down
  let adminRowShift=0;
  if(isAdmin()){
    const defs=[];
    defs.push({id:'panel', t:'\u2699 ADMIN TOOLS', st:'\u2699 TOOLS', d:isTester()?'test mode only':'edit \u00b7 players \u00b7 modes',
               f0:'rgba(208,85,72,0.12)', f1:'rgba(208,85,72,0.30)', c:'#d05548', tc:'#e0a8a0'});
    if(isMainAdmin())
      defs.push({id:'admins', t:'\uD83D\uDEE1 ADMINS', st:'\uD83D\uDEE1 ADMINS', d:'manage the team',
                 f0:'rgba(232,182,88,0.12)', f1:'rgba(232,182,88,0.30)', c:'#e8b658', tc:'#e8d9a8'});
    defs.push({id:'msgs', t:'\u2709 ADMIN INBOX'+(unreadMsgs?' ('+unreadMsgs+')':''), st:'\u2709 ADMIN INBOX'+(unreadMsgs?' ('+unreadMsgs+')':''), d:'admin messages \u00b7 archive',
               f0:'rgba(167,193,94,0.12)', f1:'rgba(167,193,94,0.30)', c:'#a7c15e', tc:'#cfe0a8'});
    if(isMainAdmin())
      defs.push({id:'suggestions',t:'\uD83D\uDCCB SUGGESTIONS',st:'\uD83D\uDCCB SUGGESTIONS',d:'reports \u00b7 admin suggestions \u00b7 log',
                 f0:'rgba(127,216,255,0.12)',f1:'rgba(127,216,255,0.30)',c:'#7fd8ff',tc:'#bfe8ff'});
    const tightHub = H<640;                         // small phones: icons only, shorter buttons
    const g2=tightHub?6:10, bh2=tightHub?28:46;
    const minBw=tightHub?44:78;
    const perRow=Math.max(2, Math.min(defs.length, Math.floor((W-40+g2)/(minBw+g2))));
    const rows=Math.ceil(defs.length/perRow);
    const bw2=Math.min(160, (W-40-(perRow-1)*g2)/perRow);
    const small=tightHub || bw2<110;
    const by0=titleBottom+10;                       // always below the title
    let bx=0, by=by0, idx=0;
    for(const d of defs){
      const row=Math.floor(idx/perRow), col=idx%perRow;
      const inRow=Math.min(perRow, defs.length-row*perRow);
      if(col===0) bx=W/2-(inRow*bw2+(inRow-1)*g2)/2;
      by=by0+row*(bh2+(tightHub?5:8));
      idx++;
      const r={x:bx,y:by,w:bw2,h:bh2};
      const hv=mouse.x>=r.x&&mouse.x<=r.x+bw2&&mouse.y>=by&&mouse.y<=by+bh2;
      ctx.fillStyle=hv?d.f1:d.f0; ctx.fillRect(r.x,by,bw2,bh2);
      ctx.strokeStyle=d.c; ctx.lineWidth=1.5; ctx.strokeRect(r.x+0.5,by+0.5,bw2,bh2);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=d.tc; ctx.font='700 '+(small?9:11)+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(tightHub?d.t.split(' ')[0]:(small?d.st:d.t), bw2-6), r.x+bw2/2, by+bh2/2+(small?0:-8));
      if(!small){ ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine(d.d, bw2-8), r.x+bw2/2, by+bh2/2+9); }
      ctx.textBaseline='alphabetic';
      if(d.id==='panel') adminHubBtnRect=r;
      else if(d.id==='admins') adminsHubBtnRect=r;
      else if(d.id==='msgs') msgsHubBtnRect=r;
      else if(d.id==='suggestions') suggestionsHubBtnRect=r;
      bx+=bw2+g2;
    }
    ctx.textAlign='center';
    adminRowShift=rows*(bh2+(tightHub?5:8))+(tightHub?14:28);
    if(compactStatus) adminRowShift+=26;              // room for the one-line status strip                       // banner, board, and side panels all drop below the row
  }

  // SUMMER FLAMING UPDATE banner
  const bnW=Math.min(560,W-60), bnX=W/2-bnW/2+offX('banner'), bnY=H*0.035+44+adminRowShift+offY('banner'), bnH=34;
  layoutBlock('banner',bnX,bnY,bnW,bnH);
  if(compactStatus){
    const sy=bnY-24;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='700 11px ui-monospace,Consolas,monospace';
    const gt='\uD83D\uDC8E '+gems, ct='\uD83E\uDE99 '+coins;
    const gw=ctx.measureText(gt).width, cw2=ctx.measureText(ct).width;
    const total=gw+18+cw2, sx=W/2-total/2;
    ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillStyle='#bfe8ff'; ctx.fillText(gt, sx+gw/2, sy+10);
    ctx.fillStyle='#ffe08a'; ctx.fillText(ct, sx+gw+18+cw2/2, sy+10);
    ctx.textBaseline='top'; ctx.textAlign='center';   // drawHub draws centred; put it back
  }
  const g=ctx.createLinearGradient(bnX,0,bnX+bnW,0);
  g.addColorStop(0,'#7a1e00'); g.addColorStop(0.5,'#ff6a1a'); g.addColorStop(1,'#7a1e00');
  ctx.fillStyle=g; ctx.fillRect(bnX,bnY,bnW,bnH);
  ctx.strokeStyle='#ffb84d'; ctx.lineWidth=1.5; ctx.strokeRect(bnX+0.5,bnY+0.5,bnW,bnH);
  leftColTop = Math.max(104, H*0.035+44+adminRowShift);
  ctx.fillStyle='#fff2cc'; ctx.font='700 15px ui-monospace,Consolas,monospace';
  ctx.textBaseline='middle';
  withBlockColour('banner', ()=>ctx.fillText(fitLine('\uD83D\uDD25 SUMMER FLAMING UPDATE \uD83D\uDD25', bnW-16), W/2, bnY+bnH/2));
  ctx.textBaseline='top';

  // Home destinations: Play, Practice, browse-only Weapons, and Social.
  // WEAPONS is a catalog; loadout changes stay
  // inside the Play/Practice setup flow.
  diffRects=[];
  homePlayRects=[];
  hubPostsRect=null;
  const actions=[
    {id:'play',title:'PLAY',sub:'ONLINE \u00b7 RANKED \u00b7 OFFLINE',col:'#e8b658',enabled:true},
    {id:'practice',title:'PRACTICE',sub:'RANGE \u00b7 TRACKING \u00b7 DPS \u00b7 WARLORDS',col:'#a7c15e',enabled:true},
    {id:'social',title:'SOCIAL',sub:W<520?'NEW \u00b7 BETA \u00b7 PARTY':party.directCpu?'NEW \u00b7 BETA \u00b7 CPU 2v2':party.accepted?('NEW \u00b7 BETA \u00b7 PARTY '+party.members.length+'/'+PARTY_MAX):'NEW \u00b7 BETA \u00b7 PARTY \u00b7 FRIENDS',col:'#bfa8ff',enabled:true},
    {id:'weapons',title:'WEAPONS',sub:'STATS \u00b7 OWNERSHIP \u00b7 PRACTICE',col:'#8fb3c9',enabled:true}
  ];
  const hbH=H<600?30:40,hbGap=W<520?5:8,
    controlsW=Math.min(390,W-24),controlsBlockH=hbH*2+hbGap,
    controlsLimitTop=H-controlsBlockH-8;
  // PLAY, PRACTICE, and SOCIAL form one destination row. WEAPONS is a
  // deliberately separate full-width armory section directly underneath.
  const actionRows=2;
  const actionGap=H<390?4:H<560?7:10, targetActionH=H<390?42:H<560?54:76;
  // Small landscape screens use one-line task rows. At the shortest height,
  // tasks take priority and the streak card waits for a taller/rotated view.
  const signedOut=sb&&!authUser,ultraCompactDaily=H<430,compactDaily=H<640,
    taskHeaderH=compactDaily?(ultraCompactDaily?22:24):34,
    trH=compactDaily?(ultraCompactDaily?15:18):36,
    taskPanelH=signedOut?(compactDaily?(ultraCompactDaily?37:42):58):taskHeaderH+dailyTasks.length*trH,
    showHubStreak=!ultraCompactDaily,stH=compactDaily?32:42,
    dailyTopGap=compactDaily?(ultraCompactDaily?5:6):10,streakTaskGap=compactDaily?6:8,
    dailyPanelReserve=dailyTopGap+(showHubStreak?stH+streakTaskGap:0)+taskPanelH+6;
  const contentTop=bnY+bnH+8, actionBottom=controlsLimitTop-10-dailyPanelReserve;
  let cardH=targetActionH, homeBoardsH=H<390?72:H<560?88:112;
  const boardActionGap=H<390?3:H<560?5:8,minCardH=H<390?24:compactDaily?32:38,
    minBoardH=H<390?50:60;
  const available=Math.max(0,actionBottom-contentTop);
  let actionBlockH=cardH*actionRows+actionGap*(actionRows-1);
  let showHomeBoards=available>=minBoardH+boardActionGap+(minCardH*actionRows+actionGap*(actionRows-1));
  let liveBoardGap=showHomeBoards?boardActionGap:0;
  if(showHomeBoards){
    const excess=Math.max(0,homeBoardsH+liveBoardGap+actionBlockH-available);
    homeBoardsH-=Math.min(excess,Math.max(0,homeBoardsH-minBoardH));
  }else homeBoardsH=0;
  const actionRoom=Math.max(0,available-homeBoardsH-liveBoardGap);
  cardH=Math.min(cardH,Math.max(10,Math.floor((actionRoom-actionGap*(actionRows-1))/actionRows)));
  actionBlockH=cardH*actionRows+actionGap*(actionRows-1);
  let homeBoardsY=contentTop;
  const homeBoardsW=Math.min(560,W-24), homeBoardsX=W/2-homeBoardsW/2;
  if(showHomeBoards){
    const maxBoardsY=Math.max(contentTop,actionBottom-actionBlockH-liveBoardGap-homeBoardsH),
      preferredBoardsY=Math.min(maxBoardsY,Math.max(contentTop,H*0.30)),
      postsLimit=preferredBoardsY-liveBoardGap,
      boardBottom=postsLimit-contentTop>=58?drawHubPosts(contentTop,postsLimit):contentTop;
    // The updates feed draws its post copy left-aligned. Home action labels use
    // their rectangle centres, so restore centred text before drawing buttons.
    ctx.textAlign='center';ctx.textBaseline='top';
    homeBoardsY=Math.min(maxBoardsY,Math.max(preferredBoardsY,boardBottom+liveBoardGap));
    const movedBoardsX=homeBoardsX+offX('board'), movedBoardsY=homeBoardsY+offY('board');
    boardPanelRect={x:movedBoardsX,y:movedBoardsY,w:homeBoardsW,h:homeBoardsH};
    layoutBlock('board',movedBoardsX,movedBoardsY,homeBoardsW,homeBoardsH);
    withBlockColour('board',()=>drawHomeLeaderboards(movedBoardsX,movedBoardsY,homeBoardsW,homeBoardsH));
  }else boardPanelRect=null;
  ctx.textAlign='center';ctx.textBaseline='top';
  const actionTop=homeBoardsY+homeBoardsH+liveBoardGap;
  const groupW=Math.min(560,W-24), groupX=W/2-groupW/2;
  const topCols=3, topCardW=(groupW-actionGap*(topCols-1))/topCols;
  for(let i=0;i<actions.length;i++){
    const a=actions[i], full=a.id==='weapons', x=full?groupX:groupX+i*(topCardW+actionGap),
      y=full?actionTop+cardH+actionGap:actionTop, cardW=full?groupW:topCardW;
    const r={id:a.id,x,y,w:cardW,h:cardH,enabled:a.enabled}; homePlayRects.push(r);
    const inside=mouse.x>=x&&mouse.x<=x+cardW&&mouse.y>=y&&mouse.y<=y+cardH;
    const hot=inside&&a.enabled;
    ctx.fillStyle=a.enabled?(hot?a.col:'rgba(0,0,0,0.42)'):'rgba(38,38,38,0.72)'; ctx.fillRect(x,y,cardW,cardH);
    ctx.strokeStyle=a.enabled?a.col:'#4a4a45'; ctx.lineWidth=a.enabled?1.7:1; ctx.strokeRect(x+0.5,y+0.5,cardW,cardH);
    ctx.fillStyle=a.enabled?(hot?'#101208':'#e8d9a8'):'#66665f';
    ctx.font='700 '+(cardW<170?12:(cardH<44?14:20))+'px ui-monospace,Consolas,monospace'; ctx.textBaseline='middle';
    ctx.fillText(fitLine(a.title,cardW-12),x+cardW/2,y+cardH/2-(cardH<38?5:8));
    ctx.fillStyle=a.enabled?(hot?'#25291d':'#8a9268'):'#555550'; ctx.font='700 '+(cardW<170?7:9)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(a.sub,cardW-12),x+cardW/2,y+cardH/2+(cardH<38?8:12));
    if(a.id==='social'&&typeof socialHasUnreadActivity==='function'&&socialHasUnreadActivity())drawSocialAttentionBadge(r);
    ctx.textBaseline='top';
  }

  if(now<referralMsgT){
    ctx.fillStyle='#bfa8ff'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(referralMsg,W-30),W/2,Math.max(12,actionTop-13));
  } else if(!authUser&&pendingReferralId()){
    ctx.fillStyle='#bfa8ff'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('FRIEND GIFT WAITING \u00b7 SIGN IN TO CLAIM +5 GEMS',W-30),W/2,Math.max(12,actionTop-13));
  }
  if(fallInjected){
    // Admin preview badge, left column under the currency chip
    const ex=52, ey=164, ew=92, eh=44;
    ctx.fillStyle='rgba(8,10,5,0.78)'; ctx.fillRect(ex,ey,ew,eh);
    ctx.strokeStyle='#e8b658'; ctx.lineWidth=1; ctx.strokeRect(ex+0.5,ey+0.5,ew,eh);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#ffd24d'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText('\uD83E\uDDEA ADMIN TEST', ex+ew/2, ey+13);
    ctx.fillStyle='#d0763e'; ctx.font='700 8px ui-monospace,Consolas,monospace';
    ctx.fillText('\uD83C\uDF42 NEXT SEASON ON', ex+ew/2, ey+30);
    ctx.textBaseline='alphabetic';
  }
  // ---- DAILY STREAK, then the tasks, stacked under the button row ----
  streakBtnRect=null;
  const stW=Math.min(340,W-24),stX=W/2-stW/2+offX('streak'),
    stackY=actionTop+cardH*2+actionGap+dailyTopGap,
    baseStY=stackY,
    maxSafeStY=controlsLimitTop-6-(stH+8+taskPanelH),
    stY=showHubStreak?clamp(baseStY+offY('streak'),baseStY,Math.max(baseStY,maxSafeStY)):baseStY;
  if(showHubStreak){layoutBlock('streak',stX,stY,stW,stH);}
  if(showHubStreak&&stY+stH<=controlsLimitTop-6){
    const rewardLoading=!!(sb&&authUser&&!profileLoaded),ready=streakClaimable()&&!signedOut&&!streakClaimBusy;
    ctx.fillStyle= ready?'rgba(94,196,106,0.12)':'rgba(0,0,0,0.4)'; ctx.fillRect(stX,stY,stW,stH);
    ctx.strokeStyle= ready?'#5ec46a':'#4a4634'; ctx.lineWidth=1; ctx.strokeRect(stX+0.5,stY+0.5,stW,stH);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    // reserve the right-hand controls first, so the text below can be clipped to fit
    const cbwR=Math.min(118, stW*0.36);
    const chipW=Math.min(78, stW*0.20);
    const nChips=0;
    const textRoom=Math.max(60, (stX+stW-cbwR-18) - nChips*(chipW+6) - (stX+12) - 8);
    // how long the streak is
    const shown = streakClaimable() ? streakDays : streakDays;
    ctx.fillStyle='#ffb057'; ctx.font='700 13px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('\uD83D\uDD25 '+shown+(shown===1?' DAY':' DAYS'), textRoom), stX+12, stY+15);
    ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
    const sub = signedOut ? 'sign in to start a streak'
              : rewardLoading ? 'loading your account reward…'
              : now<streakMsgT ? streakMsg
              : ready ? ('day '+streakNext()+': '+streakReward(streakNext()).gems+' \uD83D\uDC8E  +'+streakReward(streakNext()).coins+' \uD83E\uDE99')
              : 'collected \u00b7 come back after 12:00 UTC';
    ctx.fillStyle= now<streakMsgT ? '#a7c15e' : '#8a9268';
    ctx.fillText(fitLine(sub, textRoom), stX+12, stY+31);
    // the COLLECT button
    // right-hand chips, laid out from the right edge so they never overlap
    const cbw=Math.min(118, stW*0.36), cbh=26, cbx=stX+stW-cbw-10, cby=stY+stH/2-cbh/2;
    let chipX=cbx-8;
    const chip=(label,col)=>{
      const cw2=Math.min(78, stW*0.20), ch2=22;
      const bx=chipX-cw2, by=stY+stH/2-ch2/2;
      if(bx < stX+12) return null;                   // no room: skip rather than overlap
      const hv=mouse.x>=bx&&mouse.x<=bx+cw2&&mouse.y>=by&&mouse.y<=by+ch2;
      ctx.fillStyle=hv?col[1]:col[0]; ctx.fillRect(bx,by,cw2,ch2);
      ctx.strokeStyle=col[2]; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,cw2,ch2);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=col[3]; ctx.font='700 9px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(label, cw2-6), bx+cw2/2, by+ch2/2);
      ctx.textBaseline='alphabetic'; ctx.textAlign='left';
      chipX=bx-6;
      return {x:bx,y:by,w:cw2,h:ch2};
    };
    if(ready){
      streakBtnRect={x:cbx,y:cby,w:cbw,h:cbh};
      const hv=mouse.x>=cbx&&mouse.x<=cbx+cbw&&mouse.y>=cby&&mouse.y<=cby+cbh;
      const pulse=0.5+0.5*Math.sin(now/320);
      ctx.fillStyle= hv?'#7dff8c':'rgba(94,196,106,'+(0.55+0.35*pulse)+')';
      ctx.fillRect(cbx,cby,cbw,cbh);
      ctx.strokeStyle='#7dff8c'; ctx.lineWidth=2; ctx.strokeRect(cbx+0.5,cby+0.5,cbw,cbh);
      ctx.textAlign='center';
      ctx.fillStyle='#06210a'; ctx.font='700 12px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine('COLLECT', cbw-8), cbx+cbw/2, cby+cbh/2);
    } else {
      ctx.textAlign='center';
      ctx.fillStyle='#5a5648'; ctx.font='700 10px ui-monospace,Consolas,monospace';
      ctx.fillText(signedOut?'\u2014':rewardLoading?'LOADING…':'\u2714 COLLECTED', cbx+cbw/2, cby+cbh/2);
    }
    ctx.textBaseline='alphabetic'; ctx.textAlign='center';
  }

  // ---- DAILY TASKS, centered under the buttons ----
  const baseTpY=showHubStreak?stY+stH+streakTaskGap:stackY,
    tpY=clamp(baseTpY+offY('tasks')-(showHubStreak?offY('streak'):0),baseTpY,Math.max(baseTpY,controlsLimitTop-6-taskPanelH));
  const roomForTasks=(controlsLimitTop-6)-tpY;
  const tpW=controlsW,tpH=taskPanelH;
  const tpX=W/2-tpW/2+offX('tasks');
  layoutBlock('tasks',tpX,tpY,tpW,tpH);
  if(tpH <= roomForTasks && (signedOut || dailyTasks.length)){
    ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(tpX,tpY,tpW,tpH);
    ctx.strokeStyle='#4a4634'; ctx.strokeRect(tpX+0.5,tpY+0.5,tpW,tpH);
    ctx.textAlign='left';ctx.textBaseline='top';
    ctx.fillStyle='#e8b658';ctx.font='700 '+(compactDaily?9:11)+'px ui-monospace,Consolas,monospace';
    ctx.fillText('\uD83D\uDCCB DAILY TASKS',tpX+10,tpY+(compactDaily?4:11));
    ctx.textAlign='right';
    ctx.fillStyle='#6b7455';ctx.font=(compactDaily?7:9)+'px ui-monospace,Consolas,monospace';
    ctx.fillText('new in '+dailyCountdown(),tpX+tpW-10,tpY+(compactDaily?5:11));
    ctx.textAlign='left';
    ctx.fillStyle='#9fa77f';ctx.font='700 '+(compactDaily?7:8)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('COMPLETE EITHER SIDE \u00b7 EACH REWARD PAYS ONCE',tpW-20),tpX+10,tpY+(compactDaily?15:26));
    if(signedOut){
      const signInY=tpY+taskHeaderH+Math.max(2,(taskPanelH-taskHeaderH-(compactDaily?7:10))/2);
      ctx.fillStyle='#d0a548';ctx.font=(compactDaily?7:10)+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine('SIGN IN (top-left) to earn \uD83D\uDC8E gems from tasks',tpW-20),tpX+10,signInY);
    } else {
      for(let i=0;i<dailyTasks.length;i++){
        const t=dailyTasks[i],def=dailyTaskDefinition(t.id),rowY=tpY+taskHeaderH+i*trH;
        if(!def)continue;
        if(i){ctx.fillStyle='rgba(74,70,52,.55)';ctx.fillRect(tpX+9,rowY,tpW-18,1);}
        if(compactDaily){
          ctx.fillStyle=t.done?'#7f9768':'#9fa77f';ctx.font='700 8px ui-monospace,Consolas,monospace';
          ctx.fillText(fitLine(dailyTaskProgressText(t),tpW-58),tpX+10,rowY+(ultraCompactDaily?5:6));
          ctx.textAlign='right';ctx.fillStyle=t.done?'#a7c15e':'#e8b658';
          ctx.fillText('\uD83D\uDC8E'+def.reward,tpX+tpW-10,rowY+(ultraCompactDaily?5:6));ctx.textAlign='left';
          continue;
        }
        ctx.font='700 9px ui-monospace,Consolas,monospace';
        ctx.fillStyle = t.done ? '#a7c15e' : '#cdd6b0';
        ctx.fillText(fitLine((t.done?'\u2714 ':'')+def.title,tpW-100),tpX+10,rowY+11);
        ctx.textAlign='right';
        ctx.fillStyle=t.done?'#a7c15e':'#e8b658';
        ctx.fillText('\uD83D\uDC8E'+def.reward,tpX+tpW-10,rowY+11);
        ctx.textAlign='left';
        ctx.fillStyle=t.done?'#7f9768':'#8a9268';ctx.font='9px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine(dailyTaskProgressText(t),tpW-20),tpX+10,rowY+(trH>=36?27:25));
      }
    }
    ctx.textAlign='center';
  }

  // Account settings stays immediately under Daily Tasks. SHOP and TOOLS
  // form the only second row, replacing the old seven-button footer.
  const utilityLayout=hubUtilityLayout({x:tpX,y:tpY,w:tpW,h:tpH},controlsLimitTop,hbH,hbGap);
  const hubBtn=(r,label,base,textCol)=>{
    const hot=mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h;
    ctx.fillStyle=hot?base:'rgba(255,255,255,0.06)';ctx.fillRect(r.x,r.y,r.w,r.h);
    ctx.strokeStyle=base;ctx.lineWidth=1.25;ctx.strokeRect(r.x+0.5,r.y+0.5,r.w,r.h);
    ctx.fillStyle=hot?'#101208':textCol;ctx.font='700 '+(r.w<150?11:13)+'px ui-monospace,Consolas,monospace';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(fitLine(label,r.w-10),r.x+r.w/2,r.y+r.h/2);
    ctx.textBaseline='top';return r;
  };
  settingsBtnRect=hubBtn(utilityLayout.settings,'\u2699 SETTINGS','#e8b658','#e8d9a8');
  shopBtnRect=hubBtn(utilityLayout.shop,'\uD83D\uDC8E SHOP \u00b7 '+gems,'#7fd8ff','#bfe8ff');
  toolsBtnRect=hubBtn(utilityLayout.tools,'\uD83E\uDDF0 TOOLS','#bfa8ff','#d8c8ff');
  if(now<utilLockMsgT){
    ctx.fillStyle='#d05548';ctx.font='700 10px ui-monospace,Consolas,monospace';ctx.textBaseline='bottom';
    ctx.fillText(fitLine('SIGN-IN ONLY \u2014 use SIGN IN at top-left',tpW),W/2,utilityLayout.settings.y-3);
    ctx.textBaseline='top';
  }

}
function drawCategory(cat){
  selBg();
  const slot=slotFor(cat), col=ROLECOL[cat];
  const entry=CATS.find(c=>c[0]===cat);
  const casualUtility=cat==='UTILITY'&&pendingGameMode==='arena'&&typeof CASUAL_ARENA_UTILITY_KEYS!=='undefined';
  const list=entry[2]().filter(k=>!casualUtility||CASUAL_ARENA_UTILITY_KEYS.includes(k)),
    temps=entry[3]().filter(k=>!casualUtility||CASUAL_ARENA_UTILITY_KEYS.includes(k));

  ctx.textAlign='center';
  ctx.fillStyle=col; ctx.font='700 '+(H<760?24:30)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(cat, W/2, H*0.035);
  ctx.fillStyle='#8a9268'; ctx.font='11px ui-monospace,Consolas,monospace';
  ctx.fillText(cat==='UTILITY'?'tap to equip \u00b7 tap again to clear \u00b7 optional'
                              :'tap to equip \u00b7 \u25B8 for details', W/2, H*0.035+30);

  const cols=2, gap=16;
  const nBase=list.length, nTemp=temps.length;
  const rowsBase=Math.ceil(nBase/cols), rowsTemp=Math.ceil(nTemp/cols);
  const topY=H*0.035+52;
  const btnH=46, btnGap=14, bannerH=nTemp?30:0;
  const availH=H-topY-20-btnH-btnGap-bannerH;
  const totalRows=rowsBase+rowsTemp;
  const cw=Math.min(210,(W-70-(cols-1)*gap)/cols);
  const ch=clamp((availH-(totalRows-1)*gap)/totalRows, 84, 210);   // small phones: shrink rather than overflow
  const sc=Math.min(1.1, ch/200);
  const gridW=cw*cols+gap*(cols-1), gx=W/2-gridW/2;

  let y=topY, gridBottom=topY;
  for(let i=0;i<nBase;i++){
    const cx=gx+(i%cols)*(cw+gap), cy=y+Math.floor(i/cols)*(ch+gap);
    drawCard(list[i], cat, slot, cx, cy, cw, ch, sc);
    gridBottom=Math.max(gridBottom, cy+ch);
  }
  y=gridBottom+gap;
  if(nTemp){
    // fiery temp banner
    const bw=gridW, bx=gx;
    const grad=ctx.createLinearGradient(bx,0,bx+bw,0);
    grad.addColorStop(0,'#7a1e00'); grad.addColorStop(0.5,'#d9531a'); grad.addColorStop(1,'#7a1e00');
    ctx.fillStyle=grad; ctx.fillRect(bx,y,bw,24);
    ctx.fillStyle='#ffe0a0'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.textAlign='center'; ctx.fillText('\uD83D\uDD25 SUMMER FLAMING UPDATE \u2014 LIMITED TIME \uD83D\uDD25', W/2, y+6);
    y+=bannerH;
    for(let i=0;i<nTemp;i++){
      const cx=gx+(i%cols)*(cw+gap), cy=y+Math.floor(i/cols)*(ch+gap);
      drawCard(temps[i], cat, slot, cx, cy, cw, ch, sc, true);
      gridBottom=Math.max(gridBottom, cy+ch);
    }
  }

  const bw=340, dh=btnH, dx=W/2-bw/2, dy=Math.min(H-dh-14, gridBottom+btnGap);
  backRect={x:dx,y:dy,w:bw,h:dh};
  const hov=mouse.x>=dx&&mouse.x<=dx+bw&&mouse.y>=dy&&mouse.y<=dy+dh;
  const picked=!!loadout[slot];
  ctx.fillStyle=hov?'#e8b658':'rgba(232,182,88,0.14)';
  ctx.fillRect(dx,dy,bw,dh);
  ctx.strokeStyle='#e8b658'; ctx.strokeRect(dx+0.5,dy+0.5,bw,dh);
  ctx.fillStyle=hov?'#101208':'#e8b658'; ctx.font='700 16px ui-monospace,Consolas,monospace';
  ctx.textAlign='center';
  ctx.fillText(picked||cat==='UTILITY' ? 'CONTINUE \u203A' : 'CONTINUE (no pick) \u203A', W/2, dy+(dh-16)/2);
}
function drawCard(k, cat, slot, x, yb, cw, ch, sc, isTemp){
  const isUtil=cat==='UTILITY';
  const w = isUtil ? UTILITIES[k] : WEAPONS[k];
  const sel = loadout[slot]===k;
  const roleCol = isTemp ? '#ff3b3b' : ROLECOL[cat];
  const locked = isLocked(k);
  cardRects.push({x,y:yb,w:cw,h:ch,key:k,cat});
  const hov = mouse.x>=x&&mouse.x<=x+cw&&mouse.y>=yb&&mouse.y<=yb+ch;
  ctx.fillStyle = sel ? (isTemp?'rgba(255,59,59,0.14)':'rgba(232,182,88,0.08)') : hov ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.35)';
  ctx.fillRect(x,yb,cw,ch);
  ctx.strokeStyle = sel ? roleCol : hov ? '#6b7455' : '#4a4634'; ctx.lineWidth = sel?2:1;
  ctx.strokeRect(x+0.5,yb+0.5,cw,ch);
  // PRACTICE: try this weapon on the range even if you don't own it.
  // top-left, opposite the details arrow. On cramped cards it shrinks to the icon alone.
  const tight = ch<150 || cw<150;
  const pbw = tight ? 30 : Math.min(58, cw-46), pbh=tight?18:15, pbx=x+6, pby=yb+16;
  cardRects.push({x:pbx,y:pby,w:pbw,h:pbh,key:k,cat,tryIt:true});
  // the chip itself is painted at the very end of the card, on top of any lock dimming,
  // so it looks exactly the same whether or not the weapon is owned
  const practiceChip=()=>{
    const hovP = mouse.x>=pbx&&mouse.x<=pbx+pbw&&mouse.y>=pby&&mouse.y<=pby+pbh;
    ctx.fillStyle='#101208'; ctx.fillRect(pbx,pby,pbw,pbh);          // solid base, never dimmed
    ctx.fillStyle = hovP ? '#a7c15e' : 'rgba(167,193,94,0.16)';
    ctx.fillRect(pbx,pby,pbw,pbh);
    ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1; ctx.strokeRect(pbx+0.5,pby+0.5,pbw,pbh);
    ctx.fillStyle = hovP ? '#101208' : '#cfe0a8'; ctx.font='700 8px ui-monospace,Consolas,monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(tight?'\uD83C\uDFAF':'\uD83C\uDFAF PRACTICE', pbx+pbw/2, pby+pbh/2);
    ctx.textBaseline='top'; ctx.textAlign='left';
  };

  const dbx=x+cw-20, dby=yb+16;
  detailBtns.push({x:dbx,y:dby,w:16,h:14,key:k});
  const hovD = mouse.x>=dbx&&mouse.x<=dbx+16&&mouse.y>=dby&&mouse.y<=dby+14;
  ctx.fillStyle = hovD ? '#e8b658' : 'rgba(0,0,0,0.4)';
  ctx.fillRect(dbx,dby,16,14);
  ctx.strokeStyle='#4a4634'; ctx.lineWidth=1; ctx.strokeRect(dbx+0.5,dby+0.5,16,14);
  ctx.fillStyle = hovD ? '#101208' : '#8a9268'; ctx.font='700 9px ui-monospace,Consolas,monospace';
  ctx.textAlign='center'; ctx.fillText('\u25B8', dbx+8, dby+3);
  if(sel){
    ctx.fillStyle=roleCol; ctx.fillRect(x,yb,cw,13);
    ctx.fillStyle='#101208'; ctx.font='700 8px ui-monospace,Consolas,monospace';
    ctx.fillText('EQUIPPED', x+cw/2, yb+3);
  }
  if(!isUtil) drawGunIcon(x+cw/2, yb+Math.round(44*sc), k, sel?'#e8d9a8':'#8a9268', sc);
  else drawUtilIcon(x+cw/2, yb+Math.round(44*sc), k, locked?'#4a4634':(sel?'#e8d9a8':'#8fb3c9'), sc);
  ctx.fillStyle = locked ? '#4a4634' : sel ? roleCol : '#cdd6b0';
  ctx.font='700 '+Math.max(11,Math.round(13*sc))+'px ui-monospace,Consolas,monospace';
  let statBottom=0;
  const nameY = Math.max(yb+Math.round(68*sc), yb+38);   // always clears the top-row buttons
  ctx.fillText(w.name, x+cw/2, nameY);
  if(!isUtil){
    const bw=(cw-40)/2, bx1=x+15, bx2=x+25+bw;
    const r1=Math.max(yb+Math.round(98*sc), nameY+25), r2=Math.max(yb+Math.round(126*sc), r1+24);   // labels sit 12px above their bar
    statBottom=r2+8;
    if(w.melee){
      statBar(bx1,r1,bw,'DMG', w.dmg/80,'#d0a548');
      statBar(bx2,r1,bw,'RATE',(1000/w.fireRate)/4.2,'#d0a548');
      statBar(bx1,r2,bw,'ARC', w.arc/3.8,'#d0a548');
      statBar(bx2,r2,bw,'RNG', w.range/110,'#d0a548');
    } else {
      statBar(bx1,r1,bw,'DMG', w.dmg*w.pellets/130,'#d0a548');
      statBar(bx2,r1,bw,'RATE',(1000/w.fireRate)/16.7,'#d0a548');
      statBar(bx1,r2,bw,'MAG', w.mag/40,'#d0a548');
      statBar(bx2,r2,bw,'RNG', Math.min(w.range,900)/900,'#d0a548');
    }
  } else {
    ctx.fillStyle= locked ? '#4a4634' : '#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
    const ry2=Math.max(yb+Math.round(98*sc), nameY+15);
    ctx.fillText(k==='medkit' ? 'RECHARGE '+medKillsRequired()+' KILLS' : 'RECHARGE '+(w.cd/1000)+'s', x+cw/2, ry2);
    statBottom=ry2+8;
  }
  ctx.fillStyle = locked ? '#3a3a30' : '#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.textAlign='center';
  {                                                    // blurb fills whatever room is left, clipped not dropped
    const bl=Math.max(yb+Math.round(150*sc), statBottom+11);   // never rides up into the stat rows
    const room=(yb+ch-6)-bl;
    if(room>=10) wrapTextClamped(w.blurb, x+cw/2, bl, cw-16, 11, Math.max(1,Math.floor(room/11)));
  }
  const shopItem = GEM_SHOP.find(it=>it.key===k);
  const seasonalLocked = locked && !shopItem;        // seasonal = sign-in gate; shop items get their own overlay
  if(seasonalLocked){
    ctx.fillStyle='rgba(8,10,5,0.55)'; ctx.fillRect(x,yb,cw,ch);
    ctx.fillStyle='#d05548'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.textAlign='center';
    ctx.fillText('\u{1F512} SIGN IN', x+cw/2, yb+ch/2-12);
    ctx.fillText('TO UNLOCK', x+cw/2, yb+ch/2+3);
  }
  // gem-shop weapon not yet bought: dim + BUY IN SHOP button.
  // only when it is genuinely locked, so test mode / offline can still equip it.
  if(shopItem && !gemOwned[k] && locked){
    ctx.fillStyle='rgba(8,10,5,0.6)'; ctx.fillRect(x,yb,cw,ch);
    ctx.fillStyle='#7fd8ff'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.textAlign='center';
    ctx.fillText('\uD83D\uDC8E '+shopItem.cost+' GEMS', x+cw/2, yb+ch/2-20);
    const bbw=Math.min(cw-24,120), bbh=26, bbx=x+cw/2-bbw/2, bby=yb+ch/2-2;
    cardRects.push({x:bbx,y:bby,w:bbw,h:bbh,key:k,cat,gotoShop:true});   // click -> shop
    const hv=mouse.x>=bbx&&mouse.x<=bbx+bbw&&mouse.y>=bby&&mouse.y<=bby+bbh;
    ctx.fillStyle=hv?'#7fd8ff':'rgba(127,216,255,0.18)'; ctx.fillRect(bbx,bby,bbw,bbh);
    ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1; ctx.strokeRect(bbx+0.5,bby+0.5,bbw,bbh);
    ctx.fillStyle=hv?'#101208':'#bfe8ff'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText('BUY IN SHOP', x+cw/2, bby+bbh/2+3);
  }
  practiceChip();                                  // always last, always full brightness
}
function drawUtilIcon(x,y,key,col,sc){
  ctx.save(); ctx.translate(x,y); if(sc&&sc!==1) ctx.scale(sc,sc);
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=3; ctx.lineCap='round';
  ctx.beginPath();
  if(key==='medkit'){ ctx.rect(-12,-9,24,18); ctx.moveTo(-4,0); ctx.lineTo(4,0); ctx.moveTo(0,-4); ctx.lineTo(0,4); }
  else if(key==='grenade'){ ctx.arc(0,3,9,0,TAU); ctx.moveTo(-3,-6); ctx.rect(-4,-11,8,5); ctx.moveTo(6,-9); ctx.lineTo(11,-12); }
  else if(key==='portal'){ ctx.ellipse(0,0,7,13,0,0,TAU); ctx.moveTo(3.5,0); ctx.ellipse(0,0,3.5,8,0,0,TAU); }
  else if(key==='freezer'){ for(let s=0;s<6;s++){ const a=s/6*TAU; ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*12,Math.sin(a)*12); const bx=Math.cos(a)*7,by=Math.sin(a)*7; ctx.moveTo(bx,by); ctx.lineTo(bx+Math.cos(a+0.9)*4,by+Math.sin(a+0.9)*4); ctx.moveTo(bx,by); ctx.lineTo(bx+Math.cos(a-0.9)*4,by+Math.sin(a-0.9)*4); } }
  else if(key==='beachball'){ ctx.arc(0,0,10,0,TAU); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.moveTo(0,-10); ctx.lineTo(0,10); ctx.moveTo(2,-13); ctx.lineTo(-2,-16); ctx.moveTo(-2,-13); ctx.lineTo(2,-16); }
  else if(key==='redball'){ ctx.arc(0,0,9,0,TAU); ctx.moveTo(3,-3); ctx.arc(1,-2,3,0,TAU); }
  else { ctx.arc(0,0,9,0,TAU); ctx.moveTo(3,-3); ctx.arc(1,-2,3,0,TAU); }
  ctx.stroke(); ctx.restore();
}
// shrink a single line to fit maxW, ellipsis if needed
function fitLine(t,maxW){
  let v=String(t==null?'':t);
  if(ctx.measureText(v).width<=maxW) return v;
  while(v.length>1 && ctx.measureText(v+'\u2026').width>maxW) v=v.slice(0,-1);
  return v+'\u2026';
}
// wrap into at most maxLines, trimming the last line with an ellipsis instead of dropping text
function wrapTextClamped(text,x,y,maxW,lh,maxLines){
  if(maxLines<1) return;
  const words=String(text||'').split(' ');
  const lines=[]; let line='';
  for(const word of words){
    const test=line?line+' '+word:word;
    if(ctx.measureText(test).width>maxW && line){ lines.push(line); line=word; }
    else line=test;
  }
  if(line) lines.push(line);
  const show=lines.slice(0,maxLines);
  if(lines.length>maxLines && show.length){
    let last=show[show.length-1];
    while(last.length>1 && ctx.measureText(last+'\u2026').width>maxW) last=last.slice(0,-1);
    show[show.length-1]=last+'\u2026';
  }
  for(let i=0;i<show.length;i++) ctx.fillText(show[i], x, y+i*lh);
}
function wrapText(text,x,y,maxW,lh){
  const words=text.split(' '); let line='';
  for(const word of words){
    const test=line?line+' '+word:word;
    if(ctx.measureText(test).width>maxW && line){
      ctx.fillText(line,x,y); line=word; y+=lh;
    } else line=test;
  }
  if(line) ctx.fillText(line,x,y);
}
function drawOver(){
  ctx.fillStyle='rgba(8,9,5,0.96)'; ctx.fillRect(0,0,W,H);
  ctx.textAlign='center';
  ctx.fillStyle='#d05548'; ctx.font='700 64px ui-monospace,Consolas,monospace';
  ctx.fillText('K.I.A.', W/2, H*0.36);
  ctx.fillStyle='#cdd6b0'; ctx.font='18px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('SCORE '+score+'   ·   WAVE '+wave+'   ·   KILLS '+kills, W-24), W/2, H*0.36+48);
  ctx.fillStyle = score>prevBest ? '#a7c15e' : '#8a9268';
  ctx.font='700 15px ui-monospace,Consolas,monospace';
  ctx.fillText(score>prevBest ? 'NEW BEST — '+score : 'BEST '+hiScore, W/2, H*0.36+78);
  ctx.fillStyle='#e8b658'; ctx.font='700 16px ui-monospace,Consolas,monospace';
  ctx.fillText(touchUI ? 'TAP — redeploy' : 'ENTER — redeploy      M — armory', W/2, H*0.36+118);
  ctx.fillStyle='#e8d9a8'; ctx.beginPath(); ctx.arc(mouse.x,mouse.y,3,0,TAU); ctx.fill();
  ctx.textAlign='left';
}
function drawUpgrade(){
  ctx.fillStyle='rgba(8,9,5,0.8)'; ctx.fillRect(0,0,W,H);
  const narrow = W < 720;
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  // title scales down on small screens
  const titleSz = Math.max(20, Math.min(36, Math.round(W/28)));
  ctx.fillStyle='#a7c15e'; ctx.font='700 '+titleSz+'px ui-monospace,Consolas,monospace';
  const titleY = narrow ? Math.max(64, H*0.10) : H*0.20;
  ctx.fillText('WAVE '+wave+' CLEARED', W/2, titleY);
  ctx.fillStyle = bossBounty ? '#d0763e' : '#8a9268';
  ctx.font=(narrow?11:13)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(bossBounty ? 'BOSS BOUNTY \u2014 weapon mods for your loadout'
                          : 'FIELD REQUISITION \u2014 choose one upgrade', W/2, titleY+(narrow?22:32));

  upgradePowerRect=null; upgradeAdRect=null; upgradeDonateRect=null;
  const n=upgradeChoices.length;

  if(narrow){
    // ---------- PORTRAIT / NARROW: everything stacks vertically ----------
    let y = titleY + 40;
    const colW = Math.min(360, W-32), colX = W/2-colW/2;
    // promo: big POWERUPS on top, LLR + MOVES side by side under it
    const pH=44;
    upgradePowerRect={x:colX,y,w:colW,h:pH};
    let hv=mouse.x>=colX&&mouse.x<=colX+colW&&mouse.y>=y&&mouse.y<=y+pH;
    ctx.fillStyle=hv?'#a7c15e':'rgba(167,193,94,0.2)'; ctx.fillRect(colX,y,colW,pH);
    ctx.strokeStyle='#a7c15e'; ctx.lineWidth=2; ctx.strokeRect(colX+0.5,y+0.5,colW,pH);
    ctx.textBaseline='middle'; ctx.fillStyle=hv?'#101208':'#cfe0a8'; ctx.font='700 16px ui-monospace,Consolas,monospace';
    ctx.fillText('\u2728 POWERUPS', W/2, y+pH/2);
    y+=pH+8;
    const halfW=(colW-8)/2, sH=34;
    upgradeAdRect={x:colX,y,w:halfW,h:sH};
    hv=mouse.x>=colX&&mouse.x<=colX+halfW&&mouse.y>=y&&mouse.y<=y+sH;
    ctx.fillStyle=hv?'rgba(208,80,72,0.28)':'rgba(208,80,72,0.14)'; ctx.fillRect(colX,y,halfW,sH);
    ctx.strokeStyle='#d05548'; ctx.lineWidth=1; ctx.strokeRect(colX+0.5,y+0.5,halfW,sH);
    ctx.fillStyle='#e8a09a'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText('\u25B6 LLR', colX+halfW/2, y+sH/2);
    const dnX2=colX+halfW+8;
    upgradeDonateRect={x:dnX2,y,w:halfW,h:sH};
    hv=mouse.x>=dnX2&&mouse.x<=dnX2+halfW&&mouse.y>=y&&mouse.y<=y+sH;
    ctx.fillStyle=hv?'rgba(127,216,255,0.26)':'rgba(127,216,255,0.13)'; ctx.fillRect(dnX2,y,halfW,sH);
    ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1; ctx.strokeRect(dnX2+0.5,y+0.5,halfW,sH);
    ctx.fillStyle='#bfe8ff'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText('\u2665 MOVES', dnX2+halfW/2, y+sH/2);
    ctx.textBaseline='alphabetic';
    y+=sH+12;
    // upgrade cards stacked vertically, sized to the room left above the hint
    const hintH=26;
    const availH=H-y-hintH-10;
    const cardH=clamp(Math.floor((availH-(n-1)*10)/n), 46, 92);
    upgradeRects=[];
    for(let i=0;i<n;i++){
      const u=upgradeChoices[i], cx=colX, cyy=y+i*(cardH+10);
      upgradeRects.push({x:cx,y:cyy,w:colW,h:cardH});
      const hov=mouse.x>=cx&&mouse.x<=cx+colW&&mouse.y>=cyy&&mouse.y<=cyy+cardH;
      ctx.fillStyle=hov?'rgba(232,182,88,0.14)':'rgba(0,0,0,0.45)'; ctx.fillRect(cx,cyy,colW,cardH);
      ctx.strokeStyle=hov?'#e8b658':'#4a4634'; ctx.lineWidth=hov?2:1; ctx.strokeRect(cx+0.5,cyy+0.5,colW,cardH);
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillStyle=hov?'#e8b658':'#8a9268'; ctx.font='700 11px ui-monospace,Consolas,monospace';
      ctx.fillText('['+(i+1)+']', cx+10, cyy+cardH/2);
      ctx.textAlign='left';
      ctx.fillStyle=hov?'#e8d9a8':'#cdd6b0'; ctx.font='700 14px ui-monospace,Consolas,monospace';
      ctx.fillText(u.n, cx+40, cyy+ (cardH>60?cardH/2-9:cardH/2));
      if(cardH>60){
        ctx.fillStyle='#a7c15e'; ctx.font='10px ui-monospace,Consolas,monospace';
        ctx.fillText(u.d.slice(0,44), cx+40, cyy+cardH/2+9);
      }
      if(u.wkey){ ctx.textAlign='right'; ctx.fillStyle='#d0763e'; ctx.font='700 9px ui-monospace,Consolas,monospace'; ctx.fillText('MOD', cx+colW-10, cyy+cardH/2); }
      else if(u.tier){ ctx.textAlign='right'; ctx.fillStyle=u.tier===3?'#bfa8ff':'#e8b658'; ctx.font='700 9px ui-monospace,Consolas,monospace'; ctx.fillText('TIER '+ROMAN[u.tier], cx+colW-10, cyy+cardH/2); }
      ctx.textBaseline='alphabetic';
    }
    ctx.textAlign='center'; ctx.fillStyle='#6b7455'; ctx.font='11px ui-monospace,Consolas,monospace';
    ctx.fillText('tap a card or press 1-'+n, W/2, H-10);
    ctx.fillStyle='#e8d9a8'; ctx.beginPath(); ctx.arc(mouse.x,mouse.y,3,0,TAU); ctx.fill();
    ctx.textAlign='left';
    return;
  }

  // ---------- WIDE: four choices across ----------
  const gap=16, cw=Math.min(230,(W-80-(n-1)*gap)/n), ch=180;
  const totalW=cw*n+gap*(n-1), x0=W/2-totalW/2, y0=H*0.34;

  // promo row: [ SUBSCRIBE LLR ] [ big POWERUPS ] [ DONATE MOVES ]
  {
    const rowY = y0-70, rowH = 52;
    const midW = Math.min(300, totalW*0.42), sideW = Math.min(190, (totalW-midW)/2 - 10);
    const midX = W/2-midW/2, adX = midX-sideW-14, dnX = midX+midW+14;
    upgradeAdRect={x:adX,y:rowY,w:sideW,h:rowH};
    let hv=mouse.x>=adX&&mouse.x<=adX+sideW&&mouse.y>=rowY&&mouse.y<=rowY+rowH;
    ctx.fillStyle=hv?'rgba(208,80,72,0.28)':'rgba(208,80,72,0.14)'; ctx.fillRect(adX,rowY,sideW,rowH);
    ctx.strokeStyle='#d05548'; ctx.lineWidth=1; ctx.strokeRect(adX+0.5,rowY+0.5,sideW,rowH);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#e8a09a'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.fillText('\u25B6 SUBSCRIBE TO LLR', adX+sideW/2, rowY+rowH/2-7);
    ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
    ctx.fillText('opens in a new tab', adX+sideW/2, rowY+rowH/2+9);
    upgradePowerRect={x:midX,y:rowY,w:midW,h:rowH};
    hv=mouse.x>=midX&&mouse.x<=midX+midW&&mouse.y>=rowY&&mouse.y<=rowY+rowH;
    ctx.fillStyle=hv?'#a7c15e':'rgba(167,193,94,0.2)'; ctx.fillRect(midX,rowY,midW,rowH);
    ctx.strokeStyle='#a7c15e'; ctx.lineWidth=2; ctx.strokeRect(midX+0.5,rowY+0.5,midW,rowH);
    ctx.fillStyle=hv?'#101208':'#cfe0a8'; ctx.font='700 17px ui-monospace,Consolas,monospace';
    ctx.fillText('\u2728 POWERUPS', midX+midW/2, rowY+rowH/2-6);
    ctx.font='700 9px ui-monospace,Consolas,monospace'; ctx.fillStyle=hv?'#101208':'#8a9268';
    ctx.fillText('use your pre-bought items now', midX+midW/2, rowY+rowH/2+11);
    upgradeDonateRect={x:dnX,y:rowY,w:sideW,h:rowH};
    hv=mouse.x>=dnX&&mouse.x<=dnX+sideW&&mouse.y>=rowY&&mouse.y<=rowY+rowH;
    ctx.fillStyle=hv?'rgba(127,216,255,0.26)':'rgba(127,216,255,0.13)'; ctx.fillRect(dnX,rowY,sideW,rowH);
    ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1; ctx.strokeRect(dnX+0.5,rowY+0.5,sideW,rowH);
    ctx.fillStyle='#bfe8ff'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText('\u2665 DONATE TO MOVES', dnX+sideW/2, rowY+rowH/2-7);
    ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
    ctx.fillText('for a mission \u00b7 new tab', dnX+sideW/2, rowY+rowH/2+9);
    ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  }

  upgradeRects=[];
  for(let i=0;i<n;i++){
    const u=upgradeChoices[i], x=x0+i*(cw+gap);
    upgradeRects.push({x,y:y0,w:cw,h:ch});
    const hov = mouse.x>=x&&mouse.x<=x+cw&&mouse.y>=y0&&mouse.y<=y0+ch;
    ctx.fillStyle = hov ? 'rgba(232,182,88,0.14)' : 'rgba(0,0,0,0.45)';
    ctx.fillRect(x,y0,cw,ch);
    ctx.strokeStyle = hov ? '#e8b658' : '#4a4634'; ctx.lineWidth = hov?2:1;
    ctx.strokeRect(x+0.5,y0+0.5,cw,ch);
    ctx.fillStyle = hov ? '#e8b658' : '#8a9268';
    ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.textAlign='left'; ctx.fillText('['+(i+1)+']', x+12, y0+12);
    if(u.wkey){
      ctx.textAlign='right'; ctx.fillStyle='#d0763e';
      ctx.fillText('WEAPON MOD', x+cw-12, y0+12);
    } else if(u.tier){
      ctx.textAlign='right'; ctx.fillStyle='#e8b658';
      ctx.fillText('TIER '+ROMAN[u.tier], x+cw-12, y0+12);
    }
    ctx.textAlign='center';
    ctx.fillStyle = hov ? '#e8d9a8' : '#cdd6b0';
    ctx.font='700 16px ui-monospace,Consolas,monospace';
    ctx.fillText(u.n, x+cw/2, y0+58);
    ctx.fillStyle='#a7c15e'; ctx.font='12px ui-monospace,Consolas,monospace';
    wrapText(u.d, x+cw/2, y0+92, cw-30, 15);
    const owned=perkCounts[u.n]||0;
    if(owned){
      ctx.fillStyle='#6b7455'; ctx.font='10px ui-monospace,Consolas,monospace';
      ctx.fillText('owned \u00D7'+owned, x+cw/2, y0+ch-24);
    }
  }
  ctx.fillStyle='#6b7455'; ctx.font='12px ui-monospace,Consolas,monospace';
  const hintY=y0+ch+30;
  ctx.fillText('press 1-4 or click', W/2, hintY);
  if(board.length){
    let ly=Math.max(H*0.36+152, hintY+28);          // always sit below the hint text
    ctx.fillStyle='#8a9268'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText('GLOBAL TOP '+PUBLIC_BOARD_LIMIT, W/2, ly); ly+=18;
    ctx.font='11px ui-monospace,Consolas,monospace';
    for(let i=0;i<Math.min(PUBLIC_BOARD_LIMIT,board.length);i++){
      const row=board[i], rowName=leaderboardUsername(row);
      const me = authUser && row.user_id===authUser.id;
      ctx.fillStyle = me ? '#a7c15e' : '#6b7455';
      ctx.textAlign='right'; ctx.fillText((i+1)+'.', W/2-96, ly);
      ctx.textAlign='left';  ctx.fillText(rowName.slice(0,16), W/2-86, ly);
      ctx.textAlign='right'; ctx.fillText(String(row.score), W/2+110, ly);
      ly+=15;
    }
    ctx.textAlign='center';
  } else if(!sb){
    ctx.fillStyle='#4a4634'; ctx.font='10px ui-monospace,Consolas,monospace';
    ctx.fillText('leaderboard offline \u2014 add Supabase keys to enable', W/2, Math.max(H*0.36+152, hintY+28));
  }
  ctx.fillStyle='#e8d9a8'; ctx.beginPath(); ctx.arc(mouse.x,mouse.y,3,0,TAU); ctx.fill();
  ctx.textAlign='left';
}
function drawMenuBtn(id,label,x,y,w,h){
  menuRects[id]={x,y,w,h};
  const hov = mouse.x>=x&&mouse.x<=x+w&&mouse.y>=y&&mouse.y<=y+h;
  ctx.fillStyle = hov ? '#e8b658' : 'rgba(232,182,88,0.12)';
  ctx.fillRect(x,y,w,h);
  ctx.strokeStyle='#e8b658'; ctx.strokeRect(x+0.5,y+0.5,w,h);
  ctx.fillStyle = hov ? '#101208' : '#e8b658';
  ctx.font='700 15px ui-monospace,Consolas,monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(label, x+w/2, y+h/2);
  ctx.textBaseline='alphabetic';
}
function drawMenuTrack(key,label,x,y,w,h){
  const id='track_'+key,selected=(typeof normalizedMusicTrack==='function'?normalizedMusicTrack(musicTrack):musicTrack)===key;
  menuRects[id]={x,y,w,h};
  const hot=mouse.x>=x&&mouse.x<=x+w&&mouse.y>=y&&mouse.y<=y+h;
  ctx.fillStyle=hot?'#e8b658':selected?'rgba(167,193,94,0.25)':'rgba(255,255,255,0.045)';ctx.fillRect(x,y,w,h);
  ctx.strokeStyle=selected?'#a7c15e':hot?'#e8b658':'#4a4634';ctx.lineWidth=selected?2:1;ctx.strokeRect(x+0.5,y+0.5,w,h);
  ctx.fillStyle=hot?'#101208':selected?'#cfe0a8':'#8a9268';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='700 '+(w<95?8:10)+'px ui-monospace,Consolas,monospace';ctx.fillText(label,x+w/2,y+h/2);
  ctx.textBaseline='alphabetic';
}
function drawSlider(id,label,val,x,y,w){
  ctx.textBaseline='alphabetic';
  ctx.textAlign='left'; ctx.fillStyle='#8a9268'; ctx.font='700 11px ui-monospace,Consolas,monospace';
  ctx.fillText(label, x, y-6);
  ctx.textAlign='right'; ctx.fillText(Math.round(val*100)+'%', x+w, y-6);
  const ty=y+12;
  menuRects[id]={x, y:ty-9, w, h:24};      // generous hit box for grabbing
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(x,ty,w,6);
  ctx.fillStyle='#a7c15e'; ctx.fillRect(x,ty,w*val,6);
  ctx.strokeStyle='#4a4634'; ctx.strokeRect(x+0.5,ty+0.5,w,6);
  ctx.fillStyle='#e8d9a8'; ctx.fillRect(x+w*val-4, ty-5, 8, 16);
}
function drawMenu(){
  const inRun = state!=='select';
  const rankedCpuForfeit=!!(inRun&&authUser&&typeof botLadderMatchForfeitEligible==='function'&&
    ((typeof isBotArena==='function'&&isBotArena()&&botLadderMatchForfeitEligible(arena))||
     (typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()&&botLadderMatchForfeitEligible(partyCpuMatch))));
  ctx.fillStyle='rgba(8,9,5,0.78)'; ctx.fillRect(0,0,W,H);
  const compact=H<560,pw=Math.min(compact?370:420,W-16),buttonH=compact?34:44,buttonGap=compact?5:8,
    buttonCount=inRun?4:3,titleZone=compact?42:58,postButtonGap=compact?7:12,
    trackZone=compact?60:74,sliderZone=compact?74:102,bottomZone=compact?18:28,
    ph=titleZone+buttonCount*buttonH+(buttonCount-1)*buttonGap+postButtonGap+trackZone+sliderZone+bottomZone,
    px=W/2-pw/2,py=Math.max(6,(H-ph)/2);
  ctx.fillStyle='rgba(16,18,8,0.96)'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#4a4634'; ctx.lineWidth=1; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='middle';       // deterministic baseline regardless of prior draws
  ctx.fillStyle='#e8b658'; ctx.font='700 24px ui-monospace,Consolas,monospace';
  ctx.fillText('GAME MENU', W/2, py+(compact?20:26));
  ctx.textBaseline='alphabetic';

  menuRects={};
  const sidePad=pw<320?18:30,bw=pw-sidePad*2;
  let by=py+titleZone;
  drawMenuBtn('resume','CLOSE',px+sidePad,by,bw,buttonH);by+=buttonH+buttonGap;
  drawMenuBtn('account',authUser?'ACCOUNT SETTINGS':'SIGN IN / ACCOUNT',px+sidePad,by,bw,buttonH);by+=buttonH+buttonGap;
  if(inRun){
    drawMenuBtn('exit',rankedCpuForfeit?'EXIT · COUNTS AS LADDER LOSS':'EXIT TO MENU',px+sidePad,by,bw,buttonH);by+=buttonH+buttonGap;
    drawMenuBtn('report','\u26A0 REPORT PROBLEM',px+sidePad,by,bw,buttonH);by+=buttonH;
  } else {
    drawMenuBtn('report','\u26A0 REPORT PROBLEM',px+sidePad,by,bw,buttonH);by+=buttonH;
  }
  const trackY=by+postButtonGap,trackLabelH=compact?13:18,trackH=compact?26:32,trackGap=compact?4:6;
  ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#8a9268';ctx.font='700 '+(compact?9:11)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('SOUNDTRACK',px+sidePad,trackY);
  const trackButtonY=trackY+trackLabelH,trackW=(bw-trackGap*2)/3;
  drawMenuTrack('calm','CALM',px+sidePad,trackButtonY,trackW,trackH);
  drawMenuTrack('energetic','ENERGETIC',px+sidePad+trackW+trackGap,trackButtonY,trackW,trackH);
  drawMenuTrack('piano','PIANO',px+sidePad+(trackW+trackGap)*2,trackButtonY,trackW,trackH);
  const sy=trackY+trackZone,sliderStep=compact?38:52;
  drawSlider('music','MUSIC',musicVol,px+sidePad,sy,bw);
  drawSlider('sfx','SOUND',sfxVol,px+sidePad,sy+sliderStep,bw);

  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#6b7455'; ctx.font='11px ui-monospace,Consolas,monospace';
  ctx.fillText('P / ESC closes',W/2,py+ph-(compact?9:14));
  ctx.fillStyle='#e8d9a8'; ctx.beginPath(); ctx.arc(mouse.x,mouse.y,3,0,TAU); ctx.fill();
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
let signBtnRect=null,accountBtnRect=null;
let adLeftRect=null, adRightRect=null, editHubBtnRect=null, boardPanelRect=null;
// ---- DAILY REWARD: a full page you must collect before the menu ----
let dailyGateOpen=false, dailyGateRects=[], dailyGateReward=null;
function openDailyGate(){
  if(testMode){dailyGateOpen=false;dailyGateReward=null;dailyGateRects=[];return false;}
  if(!streakClaimable()) return false;
  if(sb && !authUser) return false;                 // signed-out players have nothing to collect
  const day=streakNext();
  dailyGateReward=Object.assign({day}, streakReward(day));
  dailyGateOpen=true; dailyGateRects=[];
  return true;
}
function drawDailyGate(){
  ctx.fillStyle='#0b0d07'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(232,182,88,0.10)'; ctx.lineWidth=1;
  ctx.beginPath();
  for(let x=0;x<W;x+=80){ ctx.moveTo(x,0); ctx.lineTo(x,H); }
  for(let y=0;y<H;y+=80){ ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();
  dailyGateRects=[];
  const r=dailyGateReward||{day:1,coins:25,gems:10};
  let y=Math.max(50, H*0.20);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#e8b658'; ctx.font='700 '+(W<520?26:38)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('DAILY GEM REWARD', W-24), W/2, y); y+=34;
  ctx.fillStyle='#8a9268'; ctx.font='700 12px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('day '+r.day+' of your streak', W-24), W/2, y); y+=44;
  const parts=[];
  if(r.gems)  parts.push(r.gems+' \uD83D\uDC8E');
  if(r.coins) parts.push(r.coins+' \uD83E\uDE99');
  ctx.fillStyle='#cfe0a8'; ctx.font='700 '+(W<520?24:34)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(parts.join('   +   '), W-40), W/2, y); y+=42;
  const bannerW=Math.min(560,W-32), bannerH=34, bannerX=W/2-bannerW/2;
  ctx.fillStyle='rgba(127,216,255,0.12)'; ctx.fillRect(bannerX,y-18,bannerW,bannerH);
  ctx.strokeStyle='#7fd8ff'; ctx.lineWidth=1; ctx.strokeRect(bannerX+0.5,y-17.5,bannerW,bannerH);
  ctx.fillStyle='#bfe8ff'; ctx.font='700 '+(W<520?10:13)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('EVERY CLAIM PAYS GEMS \u00b7 DAY 7 HAS THE BIGGEST BONUS',bannerW-18),W/2,y-1);
  y+=40;
  if(r.day%7!==0){
    ctx.fillStyle='#6b7455'; ctx.font='10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('tomorrow: '+streakReward(r.day+1).gems+' \uD83D\uDC8E \u00b7 keep going for the 100 \uD83D\uDC8E day-7 bonus', W-40), W/2, y);
  } else {
    ctx.fillStyle='#7fd8ff'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('seven days running \u2014 biggest gem bonus! next cycle starts at 10 \uD83D\uDC8E', W-40), W/2, y);
  }
  y+=40;
  const bw=Math.min(280,W-60), bh=52, bx=W/2-bw/2;
  dailyGateRects.push({x:bx,y,w:bw,h:bh,id:'collect'});
  const hv=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=y&&mouse.y<=y+bh;
  const pulse=0.5+0.5*Math.sin(now/320);
  ctx.fillStyle=hv?'#7dff8c':'rgba(94,196,106,'+(0.55+0.35*pulse)+')';
  ctx.fillRect(bx,y,bw,bh);
  ctx.strokeStyle='#7dff8c'; ctx.lineWidth=2.5; ctx.strokeRect(bx+0.5,y+0.5,bw,bh);
  ctx.textBaseline='middle';
  ctx.fillStyle='#06210a'; ctx.font='700 20px ui-monospace,Consolas,monospace';
  ctx.fillText('COLLECT GEMS + COINS', W/2, y+bh/2);
  ctx.textBaseline='alphabetic';
  ctx.textAlign='left';
}
function dailyGateClick(){
  for(const r of dailyGateRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.id==='collect'&&collectStreak()){
        dailyGateOpen=false;dailyGateReward=null;dailyGateRects=[];maybeFirstRunTutorial();
      }
      return;
    }
  }
}
// ---- first account login: a profile-backed, cross-device welcome ----
// The old oz_seen_tut flag was shared by every account on a device. Worse, a
// guest could set it before signing up. Account onboarding now lives in the
// profile; this separate flag is only the no-Supabase/offline fallback.
const OFFLINE_TUTORIAL_KEY='oz_seen_offline_tut';
function markOfflineTutorialSeen(){
  try{ localStorage.setItem(OFFLINE_TUTORIAL_KEY,'1'); }catch(e){}
}
function hasSeenOfflineTutorial(){
  try{
    return localStorage.getItem(OFFLINE_TUTORIAL_KEY)==='1' ||
      localStorage.getItem('oz_seen_tut')==='1'; // honor the retired preview-build marker
  }catch(e){ return true; }
}
function maybeFirstRunTutorial(){
  if(sb){
    if(!authUser || !profileLoaded) return false;
    const userId=String(authUser.id);
    if(firstAccountTutorialUserId!==userId || onboardingVersion>=ONBOARDING_VERSION) return false;
    firstAccountWelcomeOpen=true;
    firstAccountWelcomeRects=[];
    return true;
  }
  // A downloaded/offline copy has no account profile. Retain a useful one-time
  // How To prompt locally without letting it affect any future signed-in user.
  if(hasSeenOfflineTutorial()) return false;
  markOfflineTutorialSeen();
  selPage='howto';
  return true;
}
function drawFirstAccountWelcome(){
  ctx.fillStyle='#080b06'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(167,193,94,0.09)'; ctx.lineWidth=1;
  ctx.beginPath();
  for(let x=0;x<W;x+=72){ ctx.moveTo(x,0); ctx.lineTo(x,H); }
  for(let y=0;y<H;y+=72){ ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();

  firstAccountWelcomeRects=[];
  const compact=H<430, pw=Math.min(600,W-24), ph=Math.min(compact?H-20:390,H-24);
  const px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='rgba(16,18,8,0.98)'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#a7c15e'; ctx.lineWidth=2; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.fillStyle='rgba(167,193,94,0.08)'; ctx.fillRect(px+8,py+8,pw-16,compact?50:70);

  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#e8b658'; ctx.font='700 '+(W<500?22:32)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('WELCOME TO OUTPOST ZERO',pw-30),W/2,py+(compact?31:42));
  ctx.fillStyle='#cfe0a8'; ctx.font='700 '+(compact?13:17)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('THIS IS YOUR INTERACTIVE TUTORIAL',pw-34),W/2,py+(compact?75:104));

  const lines=compact
    ? ['Learn the controls in a safe training range.','Move, aim, shoot, reload, switch weapons, and use melee.']
    : ['Your first deployment begins in a safe training range.',
       'You will learn to move, aim, shoot, reload, switch weapons,',
       'and use your melee ability — one clear step at a time.'];
  ctx.fillStyle='#aab48b'; ctx.font=(compact?10:12)+'px ui-monospace,Consolas,monospace';
  let lineY=py+(compact?105:145);
  for(const line of lines){ ctx.fillText(fitLine(line,pw-36),W/2,lineY); lineY+=compact?17:22; }

  if(!compact){
    const tags=['MOVE','AIM','SHOOT','RELOAD','SWAP','MELEE'];
    const gap=6, tw=Math.min(78,(pw-42-gap*(tags.length-1))/tags.length), total=tw*tags.length+gap*(tags.length-1);
    let tx=W/2-total/2;
    for(const tag of tags){
      ctx.fillStyle='rgba(127,216,255,0.08)'; ctx.fillRect(tx,py+226,tw,30);
      ctx.strokeStyle='rgba(127,216,255,0.35)'; ctx.lineWidth=1; ctx.strokeRect(tx+0.5,py+226.5,tw,30);
      ctx.fillStyle='#bfe8ff'; ctx.font='700 9px ui-monospace,Consolas,monospace'; ctx.fillText(tag,tx+tw/2,py+241);
      tx+=tw+gap;
    }
  }

  const bw=Math.min(330,pw-40), bh=compact?42:54, bx=W/2-bw/2, by=py+ph-bh-(compact?18:28);
  firstAccountWelcomeRects.push({x:bx,y:by,w:bw,h:bh,id:'start'});
  const hv=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=by&&mouse.y<=by+bh;
  const pulse=0.5+0.5*Math.sin(now/320);
  ctx.fillStyle=hv?'#cfe87b':'rgba(167,193,94,'+(0.50+0.28*pulse)+')'; ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle='#d9ef91'; ctx.lineWidth=2; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
  ctx.fillStyle='#101208'; ctx.font='700 '+(compact?14:17)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('START TUTORIAL',W/2,by+bh/2);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function firstAccountWelcomeClick(){
  if(!firstAccountWelcomeOpen) return;
  for(const r of firstAccountWelcomeRects){
    if(mouse.x<r.x||mouse.x>r.x+r.w||mouse.y<r.y||mouse.y>r.y+r.h) continue;
    if(r.id==='start'){
      const userId=authUser ? String(authUser.id) : '';
      if(!userId || userId!==firstAccountTutorialUserId){
        firstAccountWelcomeOpen=false; firstAccountTutorialUserId=''; return;
      }
      onboardingVersion=ONBOARDING_VERSION;
      firstAccountTutorialUserId=''; firstAccountWelcomeOpen=false;
      saveProfile(true);                              // persist before gameplay; safe to retry on a later save
      startTutorial();
      sfx('wave');
    }
    return;
  }
}
// ---- signed-out nudges ----
let signUpPromptOpen=false, signUpRects=[], signUpReason='';
function openSignUpPrompt(reason){
  signUpPromptOpen=true; signUpReason=reason||''; signUpRects=[];
}
function drawSignUpPrompt(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(460,W-24), ph=Math.min(430,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#101208'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=2; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  signUpRects=[];
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#e8b658'; ctx.font='700 18px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('MAKE A FREE ACCOUNT', pw-24), W/2, py+30);
  ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(signUpReason||'it takes a few seconds and it is free', pw-24), W/2, py+48);
  let y=py+70;
  const perks=[
    ['\uD83D\uDC8E','earn gems and coins as you play'],
    ['\uD83C\uDFC6','get your score on the global leaderboard'],
    ['\uD83D\uDD25','claim gems every day \u00b7 day 7 pays the biggest bonus'],
    ['\uD83C\uDFA1','a free spin every 20 focused minutes \u00b7 later spins today pay up to 2\u00d7'],
    ['\uD83D\uDCBE','your weapons and progress follow you to any device'],
  ];
  for(const [icon,txt] of perks){
    ctx.textAlign='left';
    ctx.fillStyle='#cfe0a8'; ctx.font='700 13px ui-monospace,Consolas,monospace';
    ctx.fillText(icon, px+22, y+11);
    ctx.fillStyle='#cdd6b0'; ctx.font='10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(txt, pw-70), px+48, y+11);
    y+=26;
  }
  y+=6;
  const bw=pw-44, bh=40, bx=px+22;
  signUpRects.push({x:bx,y,w:bw,h:bh,id:'signup'});
  const hv=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=y&&mouse.y<=y+bh;
  ctx.fillStyle=hv?'#e8b658':'rgba(232,182,88,0.2)'; ctx.fillRect(bx,y,bw,bh);
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=2; ctx.strokeRect(bx+0.5,y+0.5,bw,bh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=hv?'#101208':'#e8b658'; ctx.font='700 14px ui-monospace,Consolas,monospace';
  ctx.fillText('SIGN UP / SIGN IN', W/2, y+bh/2);
  ctx.textBaseline='alphabetic';
  y+=bh+10;
  const sw=bw, sh=30;
  signUpRects.push({x:bx,y,w:sw,h:sh,id:'sub'});
  const hv2=mouse.x>=bx&&mouse.x<=bx+sw&&mouse.y>=y&&mouse.y<=y+sh;
  ctx.fillStyle=hv2?'rgba(255,51,85,0.35)':'rgba(255,51,85,0.16)'; ctx.fillRect(bx,y,sw,sh);
  ctx.strokeStyle='#ff3355'; ctx.lineWidth=1.5; ctx.strokeRect(bx+0.5,y+0.5,sw,sh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#ffb9c6'; ctx.font='700 11px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('\u25B6 SUBSCRIBE TO LLR ON YOUTUBE', sw-14), W/2, y+sh/2);
  ctx.textBaseline='alphabetic';
  y+=sh+8;
  const cw2=bw, ch2=26;
  signUpRects.push({x:bx,y,w:cw2,h:ch2,id:'later'});
  const hv3=mouse.x>=bx&&mouse.x<=bx+cw2&&mouse.y>=y&&mouse.y<=y+ch2;
  ctx.fillStyle=hv3?'rgba(255,255,255,0.12)':'rgba(255,255,255,0.04)'; ctx.fillRect(bx,y,cw2,ch2);
  ctx.strokeStyle='#5a5648'; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,y+0.5,cw2,ch2);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#8a9268'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText('PLAY WITHOUT AN ACCOUNT', W/2, y+ch2/2);
  ctx.textAlign='left'; ctx.textBaseline='top';
}
function signUpPromptClick(){
  for(const r of signUpRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.id==='signup'){ signUpPromptOpen=false; toggleAuth(); sfx('swap'); return; }
      if(r.id==='sub'){ try{ window.open(AD_LLR_URL,'_blank','noopener'); }catch(e){} sfx('swap'); return; }
      if(r.id==='later'){ signUpPromptOpen=false; signUpLater=now+90000; if(pendingDeploy){ pendingDeploy=false; startGame(); } sfx('swap'); return; }
      return;
    }
  }
}
let signUpLater=0, pendingDeploy=false;
let leftColTop=104;                       // pushed down when the hub's top rows are in the way
let compactStatus=false;                  // narrow: gems/coins/sign-in on one line under the title
const AD_LLR_URL   = 'https://www.youtube.com/@AsrtsbLLR';
const AD_MOVES_URL = 'https://movesforamission.org/donate-now/#1740457740469-d24153b1-38c1';
// a small YouTube mark: rounded red plate with a white play triangle
function drawYouTubeMark(cx, cy, w){
  const h=w*0.70, x=cx-w/2, y=cy-h/2, r=h*0.28;
  ctx.fillStyle='#ff0033';
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle='#ffffff';
  const t=h*0.42;
  ctx.beginPath();
  ctx.moveTo(cx-t*0.45, cy-t*0.62); ctx.lineTo(cx-t*0.45, cy+t*0.62); ctx.lineTo(cx+t*0.75, cy);
  ctx.closePath(); ctx.fill();
}
function sideAdMetrics(){
  // Keep the ads in the unused side gutters.  This lets them grow on a large
  // screen without covering the centred Home controls on a smaller one.
  const edge=14, gap=18;
  const centreHalf=Math.min(560,W-60)/2;
  const centreLeft=W/2-centreHalf, centreRight=W/2+centreHalf;
  const maxGutterW=Math.floor(centreLeft-edge-gap);
  const aw=Math.min(230, Math.floor(W*0.17), maxGutterW);
  const ah=Math.min(300, Math.max(210, Math.floor(H*0.38)), H-136);
  if(aw<112 || ah<170) return null;                 // no safe side gutter: hide, never squeeze the menu
  return {aw,ah,edge,gap,centreLeft,centreRight};
}
function sideAdTop(x,w,h,preferred){
  const minY=120, maxY=H-h-16;
  if(maxY<minY) return null;
  const overlapsX=r=>r && x<r.x+r.w+12 && x+w>r.x-12;
  const blocks=[boardPanelRect].filter(overlapsX);
  const collides=y=>blocks.some(r=>y<r.y+r.h+12 && y+h>r.y-12);
  const candidates=[clamp(preferred,minY,maxY),minY,maxY];
  for(const r of blocks){ candidates.push(r.y+r.h+16, r.y-h-16); }
  const safe=candidates.filter(y=>y>=minY&&y<=maxY&&!collides(y));
  if(!safe.length) return null;
  safe.sort((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred));
  return safe[0];
}
function drawSideAds(){
  adLeftRect=null; adRightRect=null;
  if(selPage!=='hub') return;                       // only beside the menu
  const geo=sideAdMetrics();
  if(!geo) return;
  const {aw,ah,edge,gap,centreLeft,centreRight}=geo;
  const lx2=clamp(edge+offX('adleft'),edge,centreLeft-gap-aw);
  const rx2=clamp(W-aw-edge+offX('adright'),centreRight+gap,W-aw-edge);
  const base=Math.max(120,H/2-ah/2);
  const ay=sideAdTop(lx2,aw,ah,base+offY('adleft'));
  const ry=sideAdTop(rx2,aw,ah,base+offY('adright'));

  const panel=(x,y,label,sub,accent,isYT)=>{
    const hv=mouse.x>=x&&mouse.x<=x+aw&&mouse.y>=y&&mouse.y<=y+ah;
    ctx.fillStyle='rgba(8,10,5,0.92)'; ctx.fillRect(x,y,aw,ah);
    ctx.strokeStyle=accent; ctx.lineWidth=hv?2:1.5; ctx.strokeRect(x+0.5,y+0.5,aw,ah);
    ctx.fillStyle=hv?accent+'22':'transparent';
    if(hv){ ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(x,y,aw,ah); }
    const heroY=y+Math.min(62,ah*0.23), heroW=Math.min(88,Math.max(66,aw*0.42));
    if(isYT) drawYouTubeMark(x+aw/2, heroY, heroW);
    else {
      ctx.fillStyle=accent; ctx.font='700 '+Math.min(46,Math.max(34,Math.floor(aw*0.20)))+'px ui-monospace,Consolas,monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('\u2665', x+aw/2, heroY);
    }
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const labelSize=Math.min(17,Math.max(13,Math.floor(aw/13)));
    ctx.fillStyle='#f2f2e8'; ctx.font='700 '+labelSize+'px ui-monospace,Consolas,monospace';
    wrapTextClamped(label, x+aw/2, y+ah*0.48, aw-22, labelSize+4, 3);
    ctx.fillStyle='#aab38b'; ctx.font='10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(sub, aw-18), x+aw/2, y+ah-36);
    ctx.fillStyle=hv?accent:'#7f8766'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText('TAP TO OPEN', x+aw/2, y+ah-17);
    ctx.textBaseline='top'; ctx.textAlign='left';
  };
  if(ay!==null){
    withBlockColour('adleft', ()=>panel(lx2, ay, 'SUBSCRIBE TO LLR', 'on YouTube', '#ff3355', true));
    adLeftRect={x:lx2,y:ay,w:aw,h:ah,url:AD_LLR_URL};
    layoutBlock('adleft', lx2, ay, aw, ah);
  }
  if(ry!==null){
    withBlockColour('adright', ()=>panel(rx2, ry, 'MOVES FOR A MISSION', 'donate now', '#7fd8ff', false));
    adRightRect={x:rx2,y:ry,w:aw,h:ah,url:AD_MOVES_URL};
    layoutBlock('adright', rx2, ry, aw, ah);
  }
}
let playersOpen=false, playersTab='banned', playersRects=[], playersHubBtnRect=null;
let banList=[], appealList=[];
let appealOpen=false;
let appealSubmitBusy=false;
let appealOperationReceipt=null;
const appealDecisionBusy=new Set(),playerBanActionBusy=new Set();
async function fetchPlayersData(){
  if(!sb || !canUsePlayerTools()) return;
  const epoch=adminPrivacyEpoch,userId=currentAuthUserId();
  try{
    const b=await sb.rpc('list_outpost_zero_bans_by_username',{p_limit:40});
    if(b.error)throw b.error;
    if(!adminPrivacyRequestCurrent(epoch,userId)||!canUsePlayerTools())return;
    banList=b.data||[];
  }catch(e){ if(adminPrivacyRequestCurrent(epoch,userId))banList=[]; }
  if(!adminPrivacyRequestCurrent(epoch,userId)||!canUsePlayerTools())return;
  try{
    const a=await sb.rpc('list_outpost_zero_ban_appeals_by_username',{p_limit:40});
    if(a.error)throw a.error;
    if(!adminPrivacyRequestCurrent(epoch,userId)||!canUsePlayerTools())return;
    appealList=a.data||[];
  }catch(e){ if(adminPrivacyRequestCurrent(epoch,userId))appealList=[]; }
}
function openAppeal(){
  appealOpen=true;
  $('appealwrap').style.display='flex'; $('appealstatus').textContent=''; $('appealmsg').value='';
  appealSubmitBusy=false;appealOperationReceipt=null;$('appealsend').disabled=false;$('appealcancel').disabled=false;
  try{ $('appealmsg').focus(); }catch(e){}
}
function closeAppeal(){ if(appealSubmitBusy)return false;appealOpen=false; $('appealwrap').style.display='none';return true; }
async function sendAppeal(){
  if(appealSubmitBusy)return;
  const t=String($('appealmsg').value||'').trim();
  if(!t){ $('appealstatus').textContent='write your appeal first'; return; }
  if(!sb || !authUser){ $('appealstatus').textContent='sign in to appeal'; return; }
  const fingerprint=t.slice(0,600);
  if(!appealOperationReceipt||appealOperationReceipt.fingerprint!==fingerprint)
    appealOperationReceipt={fingerprint,operationId:adminOperationUuid()};
  const operationId=appealOperationReceipt.operationId;
  appealSubmitBusy=true;$('appealsend').disabled=true;$('appealcancel').disabled=true;$('appealstatus').textContent='sending...';
  let completed=false;
  try{
    await adminReceiptRpc('submit_outpost_zero_ban_appeal',{p_message:t.slice(0,600)},operationId);
    $('appealstatus').textContent='sent \u2014 an admin will review it';
    appealSent=true;
    completed=true;appealOperationReceipt=null;
    setTimeout(()=>{appealSubmitBusy=false;$('appealsend').disabled=false;$('appealcancel').disabled=false;closeAppeal();},1400);
  }catch(err){ $('appealstatus').textContent='could not send \u2014 try again later'; }
  finally{if(!completed){appealSubmitBusy=false;$('appealsend').disabled=false;$('appealcancel').disabled=false;}}
}
let appealSent=false;
async function resolveAppeal(id, status){
  if(!isMainAdmin() || !sb) return;
  const key=String(id||'');if(!key||appealDecisionBusy.has(key))return;
  appealDecisionBusy.add(key);const operationId=adminOperationUuid();
  const decision=status==='lifted'||status==='lift'?'lift':'deny';
  try{ await adminReceiptRpc('resolve_outpost_zero_ban_appeal',{p_appeal_id:id,p_decision:decision},operationId); }
  catch(e){}finally{await fetchPlayersData();appealDecisionBusy.delete(key);}
}
async function unbanPlayerFromList(banId){
  const key=String(banId||'');if(!/^\d+$/.test(key)||!canBan()||!sb||playerBanActionBusy.has(key))return false;
  playerBanActionBusy.add(key);const operationId=adminOperationUuid();
  try{const result=await sb.rpc('unban_outpost_zero_ban',{p_ban_id:+key,p_operation_id:operationId});if(result.error||result.data!==true)throw result.error||new Error('not changed');await fetchPlayersData();return true;}
  catch(error){return false;}finally{playerBanActionBusy.delete(key);}
}
function drawCurrencyHUD(){
  if(practiceMode==='arena') return;                       // Arena has no spendable rewards during a match
  if(state==='select' && selPage==='arena') return;        // Arena page owns the full canvas
  if(compactStatus && state==='select' && selPage==='hub') return;   // shown in the status line instead
  // gems + coins, left side, visible on every screen at all times
  ctx.save();
  ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.font='700 13px ui-monospace,Consolas,monospace';
  const gt='\uD83D\uDC8E '+gems, ct='\uD83E\uDE99 '+coins;
  const spinTxt='\uD83C\uDFA1 '+wheelCountdown();
  const bw=Math.max(ctx.measureText(gt).width,ctx.measureText(ct).width,ctx.measureText(spinTxt).width)+22, bh=64,
        bx=52+offX('coins'), by=Math.max(104,leftColTop)+offY('coins');
  layoutBlock('coins',bx,by,bw,bh);
  const paintCoins=()=>{
  ctx.fillStyle='rgba(8,10,5,0.78)'; ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle='#4a4634'; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
  ctx.fillStyle='#bfe8ff'; ctx.fillText(gt, bx+11, by+15);
  ctx.fillStyle='#ffe08a'; ctx.fillText(ct, bx+11, by+33);
  ctx.fillStyle=wheelReady>0?'#e8b658':'#8a9268'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText(spinTxt, bx+11, by+51);
  if(performance.now()<coinTricklePopT){
    ctx.fillStyle='#ffe08a'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText('\u2191  '+coinTrickleRemaining()+' coming', bx+bw+8, by+33);
  }
  };
  withBlockColour('coins', paintCoins);
  ctx.restore();
}
function dailyTaskProgressText(task){
  const def=dailyTaskDefinition(task&&task.id);if(!def)return '';
  if(task.done){
    const completed=def.paths.find(path=>path.id===task.completedBy)||def.paths[0];
    return '\u2714 '+completed.label+' '+completed.goal+'/'+completed.goal+' \u00b7 REWARD CLAIMED';
  }
  return def.paths.map(path=>{
    const progress=clamp(+(task.progress&&task.progress[path.id])||0,0,path.goal);
    return path.label+' '+progress+'/'+path.goal;
  }).join('  OR  ');
}
function drawPlayQuests(){
  if(practiceMode==='arena') return;                       // keep the duel sightline clear; progress appears after the match
  if(state!=='play' && state!=='upgrade') return;
  const signedOut=sb&&!authUser,rows=signedOut?1:dailyTasks.length;
  const pw=Math.max(160,Math.min(360,W-24)),rh=34,headerH=34,ph=headerH+rows*rh;
  const px=Math.max(8,Math.min(16,(W-pw)/2)),py=Math.max(72,H/2-ph/2);
  ctx.save(); ctx.globalAlpha=0.72;
  ctx.fillStyle='rgba(5,7,4,0.68)'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#4a4634'; ctx.lineWidth=1; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textBaseline='middle'; ctx.textAlign='left';
  ctx.fillStyle='#e8b658'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83D\uDCCB DAILY TASKS',px+9,py+11);
  ctx.textAlign='right'; ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
  ctx.fillText(dailyCountdown(),px+pw-9,py+11);
  ctx.textAlign='left';
  ctx.fillStyle='#9fa77f';ctx.font='700 7px ui-monospace,Consolas,monospace';
  ctx.fillText('COMPLETE EITHER SIDE',px+9,py+25);
  if(signedOut){
    ctx.fillStyle='#d0a548'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText('SIGN IN TO EARN GEMS',px+9,py+headerH+rh/2);
  } else for(let i=0;i<dailyTasks.length;i++){
    const t=dailyTasks[i],def=dailyTaskDefinition(t.id),rowY=py+headerH+i*rh;
    if(!def)continue;
    ctx.fillStyle=t.done?'#a7c15e':'#cdd6b0';ctx.font='700 8px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine((t.done?'\u2714 ':'')+def.title,pw-76),px+9,rowY+10);
    ctx.textAlign='right'; ctx.fillStyle=t.done?'#a7c15e':'#8a9268';
    ctx.fillText('\uD83D\uDC8E'+def.reward,px+pw-9,rowY+10);
    ctx.textAlign='left';
    ctx.fillStyle=t.done?'#7f9768':'#9fa77f';ctx.font='8px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(dailyTaskProgressText(t),pw-18),px+9,rowY+25);
  }
  ctx.restore();
}
function drawChestReward(){
  if(!chestRewardOpen) return;
  const r=chestRewardOpen, done=performance.now()>=r.end;
  const pw=Math.min(390,W-24), ph=245, px=W/2-pw/2, py=H/2-ph/2;
  ctx.save();
  ctx.fillStyle='rgba(3,5,2,0.88)'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#101208'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#ffd24d'; ctx.lineWidth=2; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#ffd24d'; ctx.font='700 20px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83C\uDF81 MOD CHEST',W/2,py+34);
  ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace'; ctx.fillText('BOSS REWARD',W/2,py+56);
  ctx.fillStyle='#cfe0a8'; ctx.font='700 14px ui-monospace,Consolas,monospace';
  ctx.fillText(r.mod,W/2,py+91);
  ctx.fillStyle='#ffe08a'; ctx.font='700 18px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83E\uDE99 '+Math.min(r.coins,r.trickle.credited)+' / '+r.coins,W/2,py+126);
  ctx.fillStyle='#bfe8ff'; ctx.font='700 13px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('\uD83D\uDC8E CHEST +'+r.gems+(r.taskReward?' \u00b7 DAILY TASK +'+r.taskReward:''),pw-20),W/2,py+151);
  const bw=150,bh=32,bx=W/2-bw/2,by=py+190;
  chestRewardBtn=done?{x:bx,y:by,w:bw,h:bh}:null;
  ctx.fillStyle=done?'rgba(94,196,106,0.7)':'rgba(74,70,52,0.45)'; ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle=done?'#7dff8c':'#5a5648'; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
  ctx.fillStyle=done?'#06210a':'#8a9268'; ctx.font='700 11px ui-monospace,Consolas,monospace';
  ctx.fillText(done?'CONTINUE':('COUNTING... '+countdownText(r.end-performance.now())),W/2,by+bh/2);
  ctx.restore();
}
function drawWaveCoinTracker(){
  const q=coinTrickles.find(v=>v.label==='5-WAVE PAYOUT');
  if(!q || performance.now()<q.start) return;
  const wall=performance.now(), p=clamp((wall-q.start)/q.dur,0,1);
  const cx=W/2, cy=H/2, pw=Math.min(330,W-28), ph=116, px=cx-pw/2, py=cy-ph/2;
  ctx.save();
  ctx.fillStyle='rgba(5,7,3,0.82)'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#ffd24d'; ctx.lineWidth=2; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#ffd24d'; ctx.font='700 13px ui-monospace,Consolas,monospace';
  ctx.fillText('5-WAVE COIN PAYOUT',cx,py+23);
  ctx.fillStyle='#ffe08a'; ctx.font='700 22px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83E\uDE99 '+Math.min(q.total,q.credited)+' / '+q.total,cx,cy+18);
  for(let i=0;i<10;i++){
    const lag=i/10*.22, t=clamp((p-lag)/(1-lag),0,1);
    const a=t*TAU*3+i*TAU/10, radius=(1-t)*Math.min(125,pw*.38)+8;
    const x=cx+Math.cos(a)*radius, y=cy+Math.sin(a)*radius*.38+Math.sin(wall/95+i)*4;
    ctx.save(); ctx.translate(x,y); ctx.rotate(a+wall/180);
    ctx.fillStyle='#ffd24d'; ctx.beginPath(); ctx.arc(0,0,6,0,TAU); ctx.fill();
    ctx.strokeStyle='#fff0a0'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#8b5b12'; ctx.font='700 8px ui-monospace,monospace'; ctx.fillText('$',0,0);
    ctx.restore();
  }
  ctx.restore();
}
function chestRewardClick(){
  if(!chestRewardBtn) return;
  if(mouse.x>=chestRewardBtn.x&&mouse.x<=chestRewardBtn.x+chestRewardBtn.w&&mouse.y>=chestRewardBtn.y&&mouse.y<=chestRewardBtn.y+chestRewardBtn.h){
    chestRewardOpen=null; chestRewardBtn=null; sfx('swap');
  }
}
// One stable top-left account trigger replaces the old small button plus the
// separate compact-Hub duplicate. Its visual and hit rectangle are always the
// same, so touch, mouse, keyboard companion, and the layout audit cannot drift.
function gearMetrics(){
  const sz=48;
  return {x:W-12-sz,y:10,w:sz,h:sz};
}
function accountTriggerMetrics(){
  const maxW=Math.max(96,W-76),desired=W<420?Math.max(110,W*.34):W<680?Math.max(150,W*.29):220;
  const w=Math.min(230,maxW,desired),h=48;
  const gear=gearMetrics(),x=clamp(10+offX('account'),8,Math.max(8,gear.x-w-8));
  const y=clamp(10+offY('account'),8,Math.max(8,H-h-8));
  return {x,y,w,h};
}
function accountTriggerVisible(){
  // On narrow/medium screens the centred headers consume the full top lane on
  // subpages. Keep the large account control on Home there instead of drawing
  // a tiny or overlapping version; wide screens have a true left gutter.
  if(state!=='select'||selPage==='arena'||(W<900&&selPage!=='hub')||menuOpen||accountMenuOpen||accountSettingsOpen||
     dailyGateOpen||firstAccountWelcomeOpen||signUpPromptOpen||banBlocksPlay())return false;
  if(typeof usernameGateBlocksGameplay==='function'&&usernameGateBlocksGameplay())return false;
  if(typeof topModal==='function'&&topModal())return false;
  if(reportOpen||postOpen||msgOpen||scoreEditOpen||appealOpen||promoOpen||formOpen)return false;
  const auth=typeof document!=='undefined'&&document.getElementById('authwrap');
  return !(auth&&auth.style.display==='flex');
}
function syncAccountTriggerDom(rect,label,visible){
  if(typeof document==='undefined')return;
  const trigger=document.getElementById('accountmenutrigger');if(!trigger)return;
  if(!visible||!rect){trigger.style.display='none';trigger.tabIndex=-1;return;}
  trigger.style.display='block';trigger.style.left=rect.x+'px';trigger.style.top=rect.y+'px';
  trigger.style.width=rect.w+'px';trigger.style.height=rect.h+'px';trigger.tabIndex=0;
  trigger.setAttribute('aria-label',label);
}
function accountTriggerLabel(){
  const privateAccountName=authUser&&typeof ownerPrivateDisplayName==='function'
    ?ownerPrivateDisplayName(authUser):'NOT SIGNED IN';
  return authUser
    ?('Open account menu for '+privateAccountName+'. Sign out requires confirmation.')
    :'Sign in to your Outpost Zero account.';
}
function restoreAccountTriggerFocus(){
  if(typeof document==='undefined'||!accountTriggerVisible())return false;
  const trigger=document.getElementById('accountmenutrigger');if(!trigger)return false;
  // The dialog hides its canvas companion while open. Restore its real DOM
  // geometry before focusing so Escape/Cancel cannot race the next RAF and
  // silently leave keyboard focus on a display:none element.
  syncAccountTriggerDom(accountTriggerMetrics(),accountTriggerLabel(),true);
  try{trigger.focus({preventScroll:true});}catch(error){try{trigger.focus();}catch(focusError){return false;}}
  return document.activeElement===trigger;
}
function drawAccountChip(){
  signBtnRect=null;accountBtnRect=null;
  if(!accountTriggerVisible()){
    syncAccountTriggerDom(null,'',false);return;
  }
  const r=accountTriggerMetrics(),privateAccountName=authUser&&typeof ownerPrivateDisplayName==='function'
    ?ownerPrivateDisplayName(authUser):'NOT SIGNED IN',action=authUser?'SIGN OUT':'SIGN IN';
  signBtnRect=accountBtnRect={x:r.x,y:r.y,w:r.w,h:r.h};
  syncAccountTriggerDom(r,accountTriggerLabel(),true);
  layoutBlock('account',r.x,r.y,r.w,r.h);
  ctx.save();ctx.textBaseline='middle';
  const paintAccount=()=>{
    const hv=mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h;
    ctx.fillStyle=hv?'rgba(232,182,88,.28)':'rgba(8,10,5,.90)';ctx.fillRect(r.x,r.y,r.w,r.h);
    ctx.strokeStyle=hv?'#bfe8ff':'#e8b658';ctx.lineWidth=hv?2:1.5;ctx.strokeRect(r.x+.5,r.y+.5,r.w,r.h);
    ctx.textAlign='left';ctx.fillStyle=authUser?'#f0ddb0':'#aab38a';
    ctx.font='700 '+(r.w<125?12:13)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(privateAccountName,r.w-14),r.x+7,r.y+15);
    ctx.fillStyle=hv?'#bfe8ff':'#e8b658';ctx.font='700 '+(r.w<125?11:12)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(action+' \u203a',r.w-14),r.x+7,r.y+35);
  };
  withBlockColour('account',paintAccount);ctx.restore();
}
function drawGear(){
  const r=gearMetrics(),sz=r.w,x=r.x,y=r.y;
  gearRect={x,y,w:sz,h:sz};
  const hot = menuOpen || (mouse.x>=x&&mouse.x<=x+sz&&mouse.y>=y&&mouse.y<=y+sz);
  ctx.fillStyle = hot ? 'rgba(232,182,88,0.18)' : 'rgba(8,10,5,0.7)';
  ctx.fillRect(x,y,sz,sz);
  ctx.strokeStyle = hot ? '#e8b658' : '#4a4634'; ctx.lineWidth=1;
  ctx.strokeRect(x+0.5,y+0.5,sz,sz);
  const cx=x+sz/2, cy=y+sz/2;
  ctx.strokeStyle = hot ? '#e8b658' : '#8a9268'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(cx,cy,8,0,TAU); ctx.stroke();
  for(let i=0;i<8;i++){
    const a=i*TAU/8;
    ctx.beginPath();
    ctx.moveTo(cx+Math.cos(a)*10, cy+Math.sin(a)*10);
    ctx.lineTo(cx+Math.cos(a)*14,cy+Math.sin(a)*14);
    ctx.stroke();
  }
  ctx.fillStyle=ctx.strokeStyle;
  ctx.beginPath(); ctx.arc(cx,cy,3,0,TAU); ctx.fill();

  // powerups are now accessed from the upgrade screen only
  powerBtnRect={x:-99,y:-99,w:0,h:0};
  adminBtnRect={x:-99,y:-99,w:0,h:0};

}
