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
function weaponDetails(k){
  const rows=[];
  if(isLocked(k)) rows.push(['ACCESS','\u{1F512} SIGN IN TO UNLOCK']);
  if(FALL_KEYS.includes(k)) rows.push(['\uD83C\uDF42 NEXT SEASON','admins \u00b7 Test Mode/editor only']);
  if(UTILKEYS.includes(k) || TEMP_UTILITY.includes(k)){
    const u=UTILITIES[k];
    rows.push(['RECHARGE',k==='medkit' ? MED_KILLS_REQUIRED+' enemy kills' : (u.cd/1000)+'s']);
    if(k==='medkit') rows.push(['QUICK HEAL','G / utility RMB \u00b7 5% max HP over 1s'],['CHANNEL HEAL','equip + LMB \u00b7 20% max HP over 8s'],
      ['HEAL PENALTY','-10% move speed'],['INTERRUPTED BY','taking damage or switching'],['CHARGES','one ready at a time']);
    if(k==='grenade') rows.push(['DAMAGE','up to 300 at center'],['VS BOSS','up to 180'],
      ['BLAST RADIUS','170'],['FUSE','0.95s'],['THROW SPEED','14']);
    if(k==='portal') rows.push(['EFFECT','teleport to crosshair'],['I-FRAMES','0.35s']);
    if(k==='timecapsule') rows.push(['\uD83C\uDF42 FALL','coming update'],['EFFECT','enemies & their shots at 25% speed'],
      ['ON CAST','clears every enemy projectile'],['DURATION','15s, ends if you move'],['RECHARGE','45s']);
    if(k==='freezer') rows.push(['EFFECT','freeze enemies at crosshair'],['RADIUS','2\u00d7 chainsaw range'],
      ['FREEZE TIME','5s'],['WHILE FROZEN','take half damage, can\u0027t move'],['ON HIT','first hit thaws them'],['RECHARGE','25s']);
    if(k==='redball') rows.push(['LIFETIME','3s'],['TAUNT RADIUS','750'],
      ['CONTACT DMG','8 per 0.28s'],['LURES','all enemies incl. shooters'],['BOSSES','immune to taunt']);
    if(k==='beachball') rows.push(['\uD83D\uDD25 SUMMER','temporary'],['EFFECT','enemies FLEE it'],
      ['CONTACT DMG','8 base + burn'],['BURN','ignites on touch'],['LIFETIME','3s'],
      ['SPLITS','every 1s into 2, 3 generations'],['CHILD DMG','halves each split']);
    return rows;
  }
  const w=WEAPONS[k];
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
              twinsai:['E / F / MELEE RMB: PARRY','2.5s window \u00b7 next shot aims at crosshair \u00b7 120 dmg \u00b7 6.4s cd'],
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
    ['BULLET SPEED',Number(weaponBulletSpeed(k).toFixed(2))+'  (boosted)'],
    ['FIRE MODE', w.auto ? 'full-auto' : 'semi-auto'],
    ['SCOPE ZOOM', w.zoom+'\u00d7'+(w.scoped?' (full scope)':'')],
    ['MOVE SPEED',Math.round(w.moveMod*100)+'%']);
  if(w.pierce) rows.push(['PIERCE',w.pierce+' enemies']);
  if(w.poison) rows.push(['POISON','stacks (max 8) \u00b7 4/s per stack \u00b7 4s each hit refreshes']);
  return rows;
}
function drawDetail(){
  if(!detailKey) return;
  const k=detailKey, isU=UTILKEYS.includes(k);
  const def=isU?UTILITIES[k]:WEAPONS[k];
  const rows=weaponDetails(k);
  ctx.fillStyle='rgba(8,9,5,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(470, W-24), headHt=96, ph=headHt+rows.length*19+22;
  const px=W/2-pw/2, py=Math.max(16, H/2-ph/2);
  detailRects={panel:{x:px,y:py,w:pw,h:ph}, close:{x:px+pw-32,y:py+10,w:22,h:20}};
  ctx.fillStyle='#101208'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#4a4634'; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  const cls = PRIMARIES.includes(k)?'PRIMARY':SECONDARIES.includes(k)?'SIDEARM':MELEES.includes(k)?'MELEE':'UTILITY';
  ctx.textAlign='left';
  ctx.fillStyle='#e8b658'; ctx.font='700 18px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(def.name, pw-70), px+20, py+14);
  ctx.fillStyle=ROLECOL[cls]||'#8a9268'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText(cls, px+20, py+36);
  // close X
  const hc=mouse.x>=detailRects.close.x&&mouse.x<=detailRects.close.x+22&&mouse.y>=detailRects.close.y&&mouse.y<=detailRects.close.y+20;
  ctx.fillStyle=hc?'#e8b658':'rgba(0,0,0,0.4)';
  ctx.fillRect(px+pw-32,py+10,22,20);
  ctx.strokeStyle='#4a4634'; ctx.strokeRect(px+pw-31.5,py+10.5,22,20);
  ctx.fillStyle=hc?'#101208':'#8a9268'; ctx.font='700 11px ui-monospace,Consolas,monospace';
  ctx.textAlign='center'; ctx.fillText('\u2715', px+pw-21, py+15);
  // description
  ctx.textAlign='left'; ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
  wrapTextClamped(def.blurb, px+20, py+52, pw-40, 13, 3);   // left-aligned inside the panel
  ctx.strokeStyle='rgba(74,70,52,0.7)';
  ctx.beginPath(); ctx.moveTo(px+16,py+headHt-8); ctx.lineTo(px+pw-16,py+headHt-8); ctx.stroke();
  // stat rows
  for(let i=0;i<rows.length;i++){
    const ry=py+headHt+ i*19;
    if(i%2===0){ ctx.fillStyle='rgba(255,255,255,0.025)'; ctx.fillRect(px+12,ry-3,pw-24,18); }
    ctx.textAlign='left';  ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
    const valW=Math.max(60,(pw-44)*0.52);
    ctx.fillText(fitLine(rows[i][0], pw-44-valW), px+22, ry);
    ctx.textAlign='right'; ctx.fillStyle='#e8d9a8'; ctx.font='700 11px ui-monospace,Consolas,monospace';
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
      if(r.id==='signout'){ toggleAuth(); sfx('swap'); return; }
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
  cardRects=[]; detailBtns=[]; catBtns=[]; modeRects=[]; homePlayRects=[]; socialRects=[]; partyRects=[]; partyModeRects=[]; rankedRects=[]; leaderboardRowRects=[]; modeBoardActionRects=[]; offlineCpuRects=[]; backRect=null;
  adLeftRect=null; adRightRect=null; editHubBtnRect=null; boardPanelRect=null;
  adminHubBtnRect=null; updatesHubBtnRect=null; adminsHubBtnRect=null; msgsHubBtnRect=null; archHubBtnRect=null; lookupBtnRect=null; playersHubBtnRect=null; streakBtnRect=null; wheelBtnRect=null; promoBtnRect=null; shareBtnRect=null;
  // page-scoped hit regions: clear them on every frame so a page you LEFT can never
  // swallow a click meant for the page you are on (stale shop/practice/feed buttons)
  shopRects=[]; shopTabRects=[]; practiceRects=[]; arenaRects=[]; feedXRects=[];
  cosPrevRect=null; cosNextRect=null; animPrevRect=null; animNextRect=null; pendingCancelRect=null;
  tutBtnRect=null; shopBtnRect=null; pracBtnRect=null; arenaBtnRect=null; tempBtnRect=null; deployRect=null;
  if(typeof socialSetDomPageActive==='function')
    socialSetDomPageActive(selPage==='social'&&!banBlocksPlay()&&!dailyGateOpen&&!firstAccountWelcomeOpen&&!signUpPromptOpen);
  if(banBlocksPlay()){ drawBanPage(); return; }      // blocked accounts see only the ban page
  if(dailyGateOpen){ drawDailyGate(); return; }      // collect before anything else
  if(firstAccountWelcomeOpen){ drawFirstAccountWelcome(); return; }
  if(signUpPromptOpen){ drawSignUpPrompt(); return; }
  if(selPage==='hub') drawHub(); else if(selPage==='modes') drawModes(); else if(selPage==='modeboard') drawModeLeaderboard(); else if(selPage==='offlinecpu') drawOfflineCpuModes(); else if(selPage==='ranked') drawRanked(); else if(selPage==='loadout') drawLoadout(); else if(selPage==='social') drawSocial(); else if(selPage==='party') drawParty(); else if(selPage==='partymodes') drawPartyModes(); else if(selPage==='howto') drawHowTo(); else if(selPage==='tutorial') drawTutorial(); else if(selPage==='shop') drawShop(); else if(selPage==='practice') drawPractice(); else if(selPage==='arena') drawArena(); else drawCategory(selPage);
  drawDetail();
  ctx.fillStyle='#e8d9a8'; ctx.beginPath(); ctx.arc(mouse.x,mouse.y,3,0,TAU); ctx.fill();
  ctx.textAlign='left';
}
function slotFor(cat){ const c=CATS.find(c=>c[0]===cat); return c ? c[1] : 'primary'; }
let howToRects=[];
// ---- INTERACTIVE TUTORIAL: learn by doing, with the real HUD visible throughout ----
let tutorialOn=false, tutStep=0, tutDone=false, tutStartPos=null, tutFired=0, tutKilled=0,
    tutReloaded=false, tutSwapped=false, tutMeleeUsed=false, tutRects=[], tutStepT=0;
const TUT_STEPS=[
  {id:'move',   title:'MOVE',        how:'WASD  \u00b7  or drag the left side on touch',
   why:'Keep moving. Standing still is how runs end.',
   watch:'you have moved {n}/40 steps'},
  {id:'aim',    title:'AIM',         how:'move the mouse  \u00b7  or drag the right side',
   why:'Your weapon always points where you aim.',
   watch:'turn to face the targets'},
  {id:'shoot',  title:'SHOOT',       how:'hold LEFT MOUSE',
   why:'Watch the AMMO counter drop as you fire.',
   watch:'{n}/6 shots fired'},
  {id:'reload', title:'RELOAD',      how:'press R',
   why:'Empty mag? Reload. Watch the bar fill and the ammo jump back up.',
   watch:'waiting for a reload'},
  {id:'swap',   title:'SWAP WEAPONS',how:'press Q, or 1 / 2 / 3',
   why:'Each slot has its own ammo. Swap instead of reloading under pressure.',
   watch:'waiting for a weapon swap'},
  {id:'kill',   title:'TAKE ONE DOWN',how:'shoot a target until it drops',
   why:'Targets here respawn. Real enemies do not.',
   watch:'{n}/1 target down'},
  {id:'melee',  title:'MELEE ABILITY',how:'press E or F',
   why:'Your melee has a special move. Tera Fists recharge from normal hits; others use a timer.',
   watch:'waiting for E / F'},
];
function startTutorial(){
  // A new account can sign in from an Offline/Online duel result before the
  // first-login welcome opens. Tear that session down before Practice starts,
  // otherwise its Arena identity and exit routing can leak into the tutorial.
  if(typeof partyCpuSessionOpen==='function'&&partyCpuSessionOpen()){
    if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()) offlineCpu2v2Leave('',true);
    else partyCpuAbort('Party CPU match setup was cancelled for the tutorial.',true);
  } else if(arena&&(practiceMode==='arena'||arena.active||arena.queueChannel||arena.matchChannel)) leaveArena('',true);
  soloPractice=false;
  if(!loadout.primary)   loadout.primary='smg';
  if(!loadout.secondary) loadout.secondary='m9';
  if(!loadout.melee)     loadout.melee='knife';
  startPractice('range');
  tutorialOn=true; tutStep=0; tutDone=false; tutStepT=now;
  tutFired=0; tutKilled=0; tutReloaded=false; tutSwapped=false; tutMeleeUsed=false;
  tutStartPos={x:player.x,y:player.y};
  waveMsg=''; waveMsgT=0;
}
function tutorialTeardown(){ tutorialOn=false; tutDone=false; }
function endTutorial(){
  tutorialOn=false; tutDone=false;
  practiceMode=null; practiceSpawns=[]; enemies=[]; soloPractice=false;
  restoreTryLoadout();
  state='select'; selPage='howto';
}
function tutMoved(){
  if(!tutStartPos) return 0;
  return Math.round(Math.hypot(player.x-tutStartPos.x, player.y-tutStartPos.y)/8);
}
function tutStepDone(){
  const st=TUT_STEPS[tutStep]; if(!st) return false;
  switch(st.id){
    case 'move':   return tutMoved()>=40;
    case 'aim':    return Math.abs(Math.atan2(mouse.y-H/2, mouse.x-W/2))<1.2 && now-tutStepT>900;
    case 'shoot':  return tutFired>=6;
    case 'reload': return tutReloaded;
    case 'swap':   return tutSwapped;
    case 'kill':   return tutKilled>=1;
    case 'melee':  return tutMeleeUsed;
  }
  return false;
}
function tutProgressText(){
  const st=TUT_STEPS[tutStep]; if(!st) return '';
  const n = st.id==='move' ? Math.min(40,tutMoved())
          : st.id==='shoot' ? Math.min(6,tutFired)
          : st.id==='kill' ? Math.min(1,tutKilled) : 0;
  return st.watch.replace('{n}', n);
}
function tutorialUpdate(){
  if(!tutorialOn || tutDone) return;
  if(tutStepDone()){
    tutStep++;
    tutStepT=now;
    if(tutStep>=TUT_STEPS.length){ tutDone=true; sfx('wave'); }
    else sfx('pickup');
  }
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
  ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('INTERACTIVE TUTORIAL · STEP '+(tutStep+1)+' OF '+TUT_STEPS.length,pw-120), px+12, py+16);
  ctx.textAlign='center';
  ctx.fillStyle='#cfe0a8'; ctx.font='700 17px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(st.title, pw-24), W/2, py+34);
  ctx.fillStyle='#e8d9a8'; ctx.font='700 12px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(st.how, pw-24), W/2, py+56);
  ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(st.why, pw-24), W/2, py+74);
  ctx.fillStyle='#a7c15e'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(tutProgressText(), pw-24), W/2, py+92);
  // skip / quit
  const sw=86, sh=22, sx=px+pw-sw-8, sy=py+8;
  tutRects.push({x:sx,y:sy,w:sw,h:sh,id:'skip'});
  const shv=mouse.x>=sx&&mouse.x<=sx+sw&&mouse.y>=sy&&mouse.y<=sy+sh;
  ctx.fillStyle=shv?'rgba(255,255,255,0.16)':'rgba(255,255,255,0.05)'; ctx.fillRect(sx,sy,sw,sh);
  ctx.strokeStyle='#5a5648'; ctx.lineWidth=1; ctx.strokeRect(sx+0.5,sy+0.5,sw,sh);
  ctx.fillStyle='#cdd6b0'; ctx.font='700 9px ui-monospace,Consolas,monospace';
  ctx.fillText('SKIP STEP \u203A', sx+sw/2, sy+sh/2);
  const qw=64, qx=px+8, qy=py+8;
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
  if(st.id==='shoot'||st.id==='reload') hint(16,H-92,{w:190,h:56});     // the ammo block
  if(st.id==='swap')                    hint(16,H-92,{w:300,h:56});     // the weapon slots
}
function tutorialClick(){
  for(const r of tutRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.id==='skip'){ tutStep++; tutStepT=now; if(tutStep>=TUT_STEPS.length) tutDone=true; sfx('swap'); return true; }
      if(r.id==='quit'){ endTutorial(); sfx('swap'); return true; }
      if(r.id==='stay'){ tutorialOn=false; sfx('swap'); return true; }
      return true;
    }
  }
  return false;
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
    ['AIM / SCOPE','hold right mouse or E (guns)'],
    ['RELOAD','R \u00b7 touch: reload button'],
    ['SWAP WEAPON','1-4 or Q \u00b7 touch: swap button'],
    ['MELEE ABILITY','E/F with melee out \u00b7 F anytime \u00b7 or right-click'],
    ['UTILITY','G = quick cast \u00b7 right-click while equipped \u00b7 4 = equip'],
    ['PICKUPS','medkit every '+MED_DROP_KILLS_BASE+' kills \u00b7 Field Medic lowers it \u00b7 ammo stays put'],
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
  const fs=narrow ? Math.max(7, Math.min(12, Math.floor(W/34))) : 12;
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
function drawShopAnims(cw, y){
  const x0=W/2-cw/2;
  const pickable=WKEYS.filter(k=>!isLocked(k));
  if(!shopAnimWeapon || !pickable.includes(shopAnimWeapon)) shopAnimWeapon=pickable[0];
  ctx.textAlign='center'; ctx.fillStyle='#8a9268'; ctx.font='11px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('pick a weapon, then buy how it flourishes when you draw it', W-24), W/2, y);
  y+=14;
  // < weapon name >
  const selH=34, aw=40;
  const wname=(WEAPONS[shopAnimWeapon]||{}).name||shopAnimWeapon;
  ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(x0,y,cw,selH);
  ctx.strokeStyle='#4a4634'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,cw,selH);
  animPrevRect={x:x0,y:y,w:aw,h:selH}; animNextRect={x:x0+cw-aw,y:y,w:aw,h:selH};
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(const [r,ch] of [[animPrevRect,'\u2039'],[animNextRect,'\u203A']]){
    const hv=mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h;
    ctx.fillStyle=hv?'rgba(255,255,255,0.10)':'rgba(255,255,255,0.04)'; ctx.fillRect(r.x,r.y,r.w,r.h);
    ctx.fillStyle=hv?'#e8d9a8':'#8a9268'; ctx.font='700 16px ui-monospace,Consolas,monospace';
    ctx.fillText(ch, r.x+r.w/2, r.y+r.h/2);
  }
  ctx.fillStyle='#e8d9a8'; ctx.font='700 13px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(wname, cw-2*aw-12), x0+cw/2, y+selH/2);
  ctx.textBaseline='alphabetic';
  y+=selH+10;
  for(const a of EQUIP_ANIMS){
    const h=44, owned=a.id==='none'||!!animOwned[animKey(shopAnimWeapon,a.id)], eq=animOf(shopAnimWeapon)===a.id;
    shopRects.push({x:x0,y,w:cw,h,kind:'anim',anim:a,wkey:shopAnimWeapon});
    const hv=mouse.x>=x0&&mouse.x<=x0+cw&&mouse.y>=y&&mouse.y<=y+h;
    ctx.fillStyle= eq?'rgba(167,193,94,0.18)':hv?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.35)';
    ctx.fillRect(x0,y,cw,h);
    ctx.strokeStyle= eq?'#a7c15e':'#4a4634'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,cw,h);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle='#cdd6b0'; ctx.font='700 13px ui-monospace,Consolas,monospace';
    ctx.fillText(a.name, x0+14, y+16);
    ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
    ctx.fillText(a.d, x0+14, y+31);
    ctx.textAlign='right'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.fillStyle= eq?'#a7c15e':owned?'#a7c15e':(coins>=a.cost?'#bfe8ff':'#6b7455');
    ctx.fillText(eq?'\u2714 EQUIPPED':owned?'EQUIP':(a.cost+' \uD83E\uDE99'), x0+cw-14, y+h/2);
    ctx.textBaseline='alphabetic';
    y+=h+8;
  }
  ctx.textAlign='center';
  return y;
}
function drawShop(){
  selBg(); shopRects=[];
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
  if(shopTab==='weapons')        y=drawShopWeapons(cw, y);
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
  ctx.fillText('\u2039 BACK', W/2, by+bh/2);
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
  const x=W/2-cw/2;
  if(!GEM_SHOP.length){
    ctx.textAlign='center';
    ctx.fillStyle='#6b7455'; ctx.font='700 15px ui-monospace,Consolas,monospace';
    ctx.fillText('THE SHELVES ARE EMPTY', W/2, y+30);
    return y+50;
  }
  // fit every card in the room between here and the BACK button (which sits ~64px tall at the bottom)
  const n=GEM_SHOP.length, avail=H-y-64, gap=Math.max(4, Math.min(12, Math.floor(avail*0.015)));
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
  for(const it of GEM_SHOP){
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
    const owned=!!gemOwned[it.key];
    const b2w=112, b2h=Math.min(32,ch-10), b2x=x+cw-b2w-12, b2y=y+ch/2-b2h/2;
    shopRects.push({x:b2x,y:b2y,w:b2w,h:b2h,item:it,kind:'weapon'});
    const hv=mouse.x>=b2x&&mouse.x<=b2x+b2w&&mouse.y>=b2y&&mouse.y<=b2y+b2h;
    const can=!owned && gems>=it.cost;
    ctx.fillStyle = owned ? 'rgba(167,193,94,0.25)' : can ? (hv?'#7fd8ff':'rgba(127,216,255,0.2)') : 'rgba(255,255,255,0.06)';
    ctx.fillRect(b2x,b2y,b2w,b2h);
    ctx.strokeStyle= owned ? '#a7c15e' : can ? '#7fd8ff' : '#5a5648'; ctx.strokeRect(b2x+0.5,b2y+0.5,b2w,b2h);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle = owned ? '#a7c15e' : (can&&hv) ? '#101208' : can ? '#cdd6b0' : '#6b7455';
    ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText(owned ? 'OWNED' : '\uD83D\uDC8E '+it.cost+' BUY', b2x+b2w/2, b2y+b2h/2);
    y+=rh+gap;
  }
  ctx.textBaseline='alphabetic';
  return y;
}
function drawShopCosmetics(cw, y){
  const x=W/2-cw/2;
  // weapon picker: cycle through everything the player owns/can use
  const pickable=WKEYS.filter(k=>!isLocked(k));
  if(!shopCosWeapon || !pickable.includes(shopCosWeapon)) shopCosWeapon=pickable[0];
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#8a9268'; ctx.font='10px ui-monospace,Consolas,monospace';
  ctx.textBaseline='alphabetic';
  ctx.fillText(fitLine('choose a weapon, then unlock a color for it \u00b7 '+COSMETIC_COST+' \uD83E\uDE99 each', W-24), W/2, y);
  y+=14;
  // < weapon name >
  const selW=cw, selH=34;
  const wname=(WEAPONS[shopCosWeapon]||{}).name||shopCosWeapon;
  ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(x,y,selW,selH);
  ctx.strokeStyle='#4a4634'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,selW,selH);
  // arrows
  const ah=selH, aw=40;
  cosPrevRect={x:x,y:y,w:aw,h:ah}; cosNextRect={x:x+selW-aw,y:y,w:aw,h:ah};
  const ph=mouse.x>=x&&mouse.x<=x+aw&&mouse.y>=y&&mouse.y<=y+ah;
  const nh=mouse.x>=x+selW-aw&&mouse.x<=x+selW&&mouse.y>=y&&mouse.y<=y+ah;
  ctx.fillStyle=ph?'#e8b658':'#8a9268'; ctx.font='700 18px ui-monospace,Consolas,monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('\u2039', x+aw/2, y+ah/2);
  ctx.fillStyle=nh?'#e8b658':'#8a9268';
  ctx.fillText('\u203A', x+selW-aw/2, y+ah/2);
  ctx.fillStyle='#e8d9a8'; ctx.font='700 15px ui-monospace,Consolas,monospace';
  ctx.fillText(wname, W/2, y+selH/2);
  ctx.textBaseline='alphabetic';
  y+=selH+16;
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
  ctx.fillText(fitLine('pre-buy consumables to carry into a run \u00b7 use them mid-game from the POWERUPS menu', W-24), W/2, y);
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
      if(r.act==='respawn'){ if(!usePowerup('respawn')){ respawnPromptT=0; menuOpen=false; state='over'; submitScore(hiScore); } }
      else { respawnPromptT=0; menuOpen=false; state='over'; sfx('die'); submitScore(hiScore); }
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
  ctx.fillText(fitLine('offline \u00b7 no score, loot, or tasks \u00b7 unlimited ammo', W-24), W/2, subY);
  const needsLoadout=!(loadout.primary && loadout.secondary && loadout.melee);
  if(needsLoadout){
    ctx.fillStyle='#d0a548'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('\u26A0 tap a mode, then pick your weapons', W-24), W/2, tiny?49:H*0.05+56);
  }
  const OPTS=[
    {mode:'range', name:'SHOOTING RANGE', d:'one of every enemy type \u00b7 they stand still \u00b7 respawn 3s after a kill'},
    {mode:'dps',   name:'DPS DUMMY',      d:'an unbreakable target \u00b7 live damage-per-second readout'},
    {mode:'boss',  name:'WARLORD FIGHT',  d:'all four warlords, fully live \u00b7 you respawn on death'},
  ];
  const cw=Math.min(460,W-(tiny?20:80)), gap=tiny?5:14;
  const bh=tiny?30:44, bottomPad=tiny?7:14, backGap=tiny?5:8;
  let y=tiny?(needsLoadout?63:50):H*0.05+62;
  const cardBottom=H-bottomPad-bh-backGap;
  const ch=clamp(Math.floor((cardBottom-y-gap*2)/3),tiny?42:52,74);
  for(const o of OPTS){
    const x=W/2-cw/2;
    practiceRects.push({x,y,w:cw,h:ch,mode:o.mode});
    const hv=mouse.x>=x&&mouse.x<=x+cw&&mouse.y>=y&&mouse.y<=y+ch;
    ctx.fillStyle=hv?'rgba(167,193,94,0.22)':'rgba(0,0,0,0.4)';
    ctx.fillRect(x,y,cw,ch);
    ctx.strokeStyle='#a7c15e'; ctx.strokeRect(x+0.5,y+0.5,cw,ch);
    ctx.textAlign='left';
    ctx.fillStyle='#e8d9a8'; ctx.font='700 '+(tiny?12:16)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(o.name, cw-32), x+16, y+(tiny?10:14));
    ctx.fillStyle='#8a9268'; ctx.font=(tiny?'8':'10')+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(o.d, cw-32), x+16, y+ch-(tiny?10:18));
    y+=ch+gap;
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
                   botMode?('\u2694 1v1 VS '+botDifficultyName(arena.botDifficulty)+' CPU'):'\u2694 ONLINE MULTIPLAYER';
  ctx.fillText(fitLine(arenaTitle,W-18),W/2,titleY);
  ctx.fillStyle=queueNoticeActive?'#ff6b5d':'#8a9268'; ctx.font=(tiny?'8':'10')+'px ui-monospace,Consolas,monospace';
  const arenaSub=queueNoticeActive?modeBoardNotice:mapVoting?('CHANGE YOUR VOTE UNTIL TIMER ENDS \u00b7 '+voteSummary):
                   mapReveal?('SELECTED MAP: '+arenaMapName(arena.mapId)+' \u00b7 WON THE WEIGHTED VOTE \u00b7 '+voteSummary):
                   botAdminTest?'ADMIN COMPARISON \u00b7 ACCOUNT LADDER WILL NOT CHANGE':
                   localMode?'ONE DEVICE ONLY \u00b7 FIRST TO 5 \u00b7 NO UPGRADES, UTILITIES, OR REWARDS':
                   (tiny?'DIFFERENT DEVICES \u00b7 SIGN-IN ONLY \u00b7 FIRST TO 5':'ONLINE \u00b7 MULTIPLAYER ON DIFFERENT DEVICES \u00b7 FIRST TO 5 \u00b7 NO REWARDS');
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
  const names=arenaLoadoutReady()?[loadout.primary,loadout.secondary,loadout.melee].map(k=>WEAPONS[k].name).join('  \u00b7  '):'Choose PRIMARY + SIDEARM + MELEE on the loadout screen';
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
      button('map_leave',localMapVote?'LEAVE MAP VOTE':'LEAVE MATCH',listBottom+cardGap,'#d05548');
    }
  } else if(cpuTeamMode&&partyCpuMatch.phase==='match_end'){
    const me=partyCpuMatch.scores.allies||0,them=partyCpuMatch.scores.cpus||0;
    ctx.fillStyle=me>them?'#a7c15e':'#d05548';ctx.font='700 '+(tiny?18:24)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(me>them?'YOUR TEAM WINS':'CPUs WIN',W/2,bodyY+12);
    ctx.fillStyle='#e8d9a8';ctx.font='700 '+(tiny?30:42)+'px ui-monospace,Consolas,monospace';ctx.fillText(me+'  \u2014  '+them,W/2,bodyY+(tiny?40:62));
    ctx.fillStyle='#8a9268';ctx.font=(tiny?'8':'10')+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(arena.status,pw-20),W/2,bodyY+(tiny?62:94));
    ctx.fillStyle='#8a9268';ctx.fillText(fitLine(botLadderMatchResultText(partyCpuMatch),pw-20),W/2,bodyY+(tiny?72:108));
    let y=bodyY+(tiny?84:126),settled=botLadderMatchSettled(partyCpuMatch);
    y=button(settled?'teamrematch':'teamwait',settled?'PLAY AGAIN':'SAVING RESULT\u2026',y,'#a7c15e',settled?'New first-to-5 team match at your synced difficulty.':'Play Again unlocks after the cloud result settles.',settled);
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
    let y=bodyY+(tiny?84:126);
    if(botAdminTest){
      y=button('bottestagain','TEST '+botModelRelease(arena.botModelId).name+' AGAIN',y,'#a7c15e','Same Impossible execution and deterministic AI seed.');
      button('botlearningback','BACK TO AI BOT MODELS',y,'#7fd8ff');
    }else{
      const settled=botLadderMatchSettled(arena);
      y=button(settled?'botrematch':'botwait',settled?'PLAY AGAIN':'SAVING RESULT\u2026',y,'#a7c15e',settled?'New first-to-5 match at your synced difficulty.':'Play Again unlocks after the cloud result settles.',settled);
      y=button('botloadout','CHANGE WEAPONS',y,'#7fd8ff');
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
    let y=bodyY+(tiny?72:116);
    y=button('rematch',arena.rematchVotes.has(authUser.id)?'REMATCH REQUESTED':'REMATCH',y,'#a7c15e');
    y=button('again','PLAY AGAIN \u00b7 QUICK MATCH',y,'#e8b658');
    button('leave','LEAVE ARENA',y,'#d05548');
  } else {
    let y=bodyY;
    y=button('quick','CASUAL 1v1 \u00b7 QUICK MATCH',y,'#e8b658','Find another signed-in player. First to 5 rounds wins.');
    const partyH=tiny?32:(dense?44:58);
    ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(px,y,pw,partyH); ctx.strokeStyle='#4a4634'; ctx.strokeRect(px+0.5,y+0.5,pw,partyH);
    ctx.fillStyle='#6b7455'; ctx.font='700 '+(tiny?9:12)+'px ui-monospace,Consolas,monospace';
    ctx.fillText('PARTIES \u00b7 UP TO 4 \u00b7 OPEN FROM HOME',W/2,y+(tiny?partyH/2:15));
    if(!tiny){ ctx.font=(dense?'8':'9')+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine('Guest-friendly codes, teams, tournament brackets, and Endless room splits.',pw-20),W/2,y+(dense?32:39)); }
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
function arenaClick(){
  const hit=r=>mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h;
  for(const r of arenaRects) if(r.enabled!==false&&hit(r)){
    if(r.mapId){ arenaCastMapVote(r.mapId); return; }
    else if(r.id==='map_leave') leaveArena('Left the map vote.',false);
    else if(r.id==='teamrematch') offlineCpu2v2Rematch();
    else if(r.id==='teamloadout'){
      offlineCpu2v2Leave('',false);pendingGameMode='ai2v2';modeBoardMode='endless';loadoutBackPage='offlinecpu';restoreLastLoadoutForMode('ai2v2');selPage='loadout';
    }
    else if(r.id==='teamleave') offlineCpu2v2Leave('',false);
    else if(r.id==='bottestagain') restartAiLearningBotTest(arena);
    else if(r.id==='botlearningback') leaveArena('',false);
    else if(r.id==='botrematch') startBotArena();
    else if(r.id==='botloadout'){
      leaveArena('',false); pendingGameMode='ai1v1'; modeBoardMode='endless'; loadoutBackPage='offlinecpu'; restoreLastLoadoutForMode('ai1v1'); selPage='loadout';
    }
    else if(r.id==='botleave') leaveArena('',false);
    else if(r.id==='signin'){
      arenaAuthPending=true; $('aguest').style.display='none'; $('authmsg').textContent='Sign in is required for Online multiplayer on different devices.'; $('authwrap').style.display='flex';
    } else if(r.id==='quick') arenaQuickMatch();
    else if(r.id==='copy') arenaCopyCode();
    else if(r.id==='ready') arenaSetReady(true);
    else if(r.id==='cancel') leaveArena('Left matchmaking.',false);
    else if(r.id==='rematch') arenaVoteRematch();
    else if(r.id==='again') arenaPlayAgain();
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
function launchSelectedMode(){
  if(!(loadout.primary&&loadout.secondary&&loadout.melee)){
    pracNeedMsgT=now+1600; sfx('dry'); return false;
  }
  if(pendingGameMode==='partycpu2v2') return partyCpuSubmitLoadout();
  // Party membership can change while the loadout screen is open, so the
  // selection-page check alone is not enough to protect queue capacities.
  if(!partyAllowsQueue(pendingGameMode)) return false;
  if(pendingGameMode==='arena'){
    if(!onlinePlayReady()){ chooseGameMode('arena'); return false; }
    loadout.utility=null;
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
  if(CATS.some(c=>c[0]===selPage)){ selPage=pendingGameMode?'loadout':'hub'; sfx('swap'); return; }
  if(selPage==='loadout'){
    if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();
    if(pendingGameMode==='partycpu2v2'){ partyCpuAbort('Party CPU match setup was cancelled.',true); selPage='party'; sfx('swap'); return; }
    const returnTo=pendingGameMode==='practice'?'practice':(loadoutBackPage||'modeboard');
    pendingGameMode=null; pendingPractice=null; selPage=returnTo; sfx('swap'); return;
  }
  if(selPage==='modeboard'){
    const destination=modeBoardOrigin==='party'&&party.accepted?'party':'hub';
    pendingGameMode=null; modeBoardMode=null; modeBoardOrigin='hub'; selPage=destination; sfx('swap'); return;
  }
  if(selPage==='offlinecpu'){ if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch(); pendingGameMode=null; modeBoardMode='endless'; selPage='modeboard'; sfx('swap'); return; }
  if(selPage==='ranked'){ selPage='modeboard'; sfx('swap'); return; }
  if(selPage==='social'){ selPage='hub'; sfx('swap'); return; }
  if(selPage==='partymodes'){ selPage=party.accepted?'party':'social'; sfx('swap'); return; }
  if(selPage==='party'){
    party.chatOpen=false;
    if(typeof partyCpuSessionOpen==='function'&&partyCpuSessionOpen()){ partyCpuAbort('Party CPU match setup was cancelled.',true); sfx('swap'); }
    else if(party.accepted){ selPage='social'; fetchSocial(true); sfx('swap'); }
    else if(party.channel) { leaveParty('',false); selPage='social'; fetchSocial(true); sfx('swap'); }
    else { selPage='social'; fetchSocial(true); sfx('swap'); }
    return;
  }
  if(selPage==='modes'){ selPage='hub'; sfx('swap'); return; }
  if(selPage==='arena'){
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
      {id:'casual_1v1',mode:'arena',label:'1v1',note:authUser?'CASUAL \u00b7 FIRST TO 5':'SIGN IN TO PLAY',col:'#d05548',enabled:connected},
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
  selBg(); offlineCpuRects=[];
  const short=H<430, tiny=W<=360||H<350, margin=tiny?10:16, gap=tiny?7:12;
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillStyle='#7fd8ff'; ctx.font='700 '+(tiny?22:short?27:36)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('PLAY AGAINST CPU',W-24),W/2,tiny?8:16);
  ctx.fillStyle='#a7c15e'; ctx.font='700 '+(tiny?8:10)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(authUser?(botLadderSyncState==='syncing'?'ACCOUNT LADDER · SYNCING':botLadderReady()?'SYNCED ACCOUNT LADDER':'ACCOUNT LADDER · '+String(botLadderSyncState).toUpperCase()):'GUEST · BEGINNER READ-ONLY',W-24),W/2,tiny?39:short?52:64);
  ctx.fillStyle='#8a9268'; ctx.font=(tiny?7:9)+'px ui-monospace,Consolas,monospace';
  const ladderState=currentBotLadder();
  ctx.fillText(fitLine('WIN STREAK '+ladderState.winStreak+'/3 · LOSS STREAK '+ladderState.lossStreak+'/3 · THIRD LOSS: -1 PROGRESS',W-24),W/2,tiny?54:short?68:82);

  const totalW=Math.min(720,W-margin*2),x0=W/2-totalW/2,ladderTop=tiny?(H<350?68:78):short?90:106,
    ladderH=tiny?(H<350?66:76):short?92:112,rowH=ladderH/5,labelW=tiny?68:102,valueW=tiny?28:42;
  ctx.fillStyle='rgba(0,0,0,.38)';ctx.fillRect(x0,ladderTop,totalW,ladderH);ctx.strokeStyle='#315568';ctx.strokeRect(x0+.5,ladderTop+.5,totalW,ladderH);
  BOT_DIFFICULTIES.forEach((bot,i)=>{
    const y=ladderTop+i*rowH,progress=botLadderProgressForTier(i,ladderState),active=i===ladderState.tier,
      bx=x0+labelW,bw=Math.max(20,totalW-labelW-valueW-8),bh=Math.max(4,tiny?5:7),by=y+(rowH-bh)/2;
    if(active){ctx.fillStyle='rgba(127,216,255,.08)';ctx.fillRect(x0+1,y+1,totalW-2,rowH-2);}
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=active?'#bfe8ff':i<ladderState.tier?'#a7c15e':'#65725d';ctx.font='700 '+(tiny?6:8)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(bot.name,x0+(tiny?5:8),y+rowH/2);
    ctx.fillStyle='#18201c';ctx.fillRect(bx,by,bw,bh);ctx.strokeStyle=active?'#7fd8ff':'#3d463c';ctx.strokeRect(bx+.5,by+.5,bw,bh);
    ctx.fillStyle=active?'#7fd8ff':i<ladderState.tier?'#a7c15e':'#596253';ctx.fillRect(bx,by,bw*progress/BOT_LADDER_MAX_PROGRESS,bh);
    ctx.textAlign='right';ctx.fillStyle=active?'#d7efff':'#7f876e';ctx.fillText(progress+'/'+BOT_LADDER_MAX_PROGRESS,x0+totalW-5,y+rowH/2);
  });

  const cardW=(totalW-gap)/2,top=ladderTop+ladderH+gap,backH=tiny?32:40,backY=H-backH-(tiny?8:14);
  const cardH=Math.max(tiny?54:70,backY-top-gap);
  const cards=[
    {mode:'ai1v1',title:'1v1',sub:'YOU VS '+botDifficultyName(ladderState.tier),detail:'WIN OR LOSS UPDATES LADDER',col:'#7fd8ff'},
    {mode:'ai2v2',title:'2v2',sub:'YOU + ALLY CPU',detail:'VS TWO '+botDifficultyName(ladderState.tier)+' CPUs',col:'#bfa8ff'}
  ];
  for(let i=0;i<cards.length;i++){
    const item=cards[i],x=x0+i*(cardW+gap),r={mode:item.mode,x,y:top,w:cardW,h:cardH,enabled:true};offlineCpuRects.push(r);
    const hot=mouse.x>=x&&mouse.x<=x+cardW&&mouse.y>=top&&mouse.y<=top+cardH;
    ctx.fillStyle=hot?item.col:'rgba(0,0,0,0.46)';ctx.fillRect(x,top,cardW,cardH);
    ctx.strokeStyle=item.col;ctx.lineWidth=2;ctx.strokeRect(x+0.5,top+0.5,cardW,cardH);
    ctx.fillStyle=hot?'#101208':'#e8d9a8';ctx.font='700 '+(tiny?30:short?38:54)+'px ui-monospace,Consolas,monospace';
    ctx.textBaseline='middle';ctx.fillText(item.title,x+cardW/2,top+cardH*(tiny?.34:.38));
    ctx.fillStyle=hot?'#182016':item.col;ctx.font='700 '+(tiny?9:short?12:15)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(item.sub,cardW-12),x+cardW/2,top+cardH*(tiny?.62:.63));
    ctx.fillStyle=hot?'#283123':'#7f876e';ctx.font='700 '+(tiny?7:short?8:10)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(item.detail,cardW-12),x+cardW/2,top+cardH*(tiny?.78:.77));
  }
  const bw=Math.min(240,W-2*margin);backRect={x:W/2-bw/2,y:backY,w:bw,h:backH};
  const backHot=mouse.x>=backRect.x&&mouse.x<=backRect.x+backRect.w&&mouse.y>=backRect.y&&mouse.y<=backRect.y+backRect.h;
  ctx.fillStyle=backHot?'#8a9268':'rgba(0,0,0,0.45)';ctx.fillRect(backRect.x,backRect.y,backRect.w,backRect.h);
  ctx.strokeStyle='#8a9268';ctx.lineWidth=1;ctx.strokeRect(backRect.x+0.5,backRect.y+0.5,backRect.w,backRect.h);
  ctx.fillStyle=backHot?'#101208':'#cdd6b0';ctx.font='700 '+(tiny?9:12)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('‹ PLAY MENU',W/2,backRect.y+backRect.h/2);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
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
  const r=Object.assign({id,x,y,w,h,enabled},extra); socialRects.push(r);
  ctx.fillStyle=enabled?(hot?col:'rgba(0,0,0,0.44)'):'rgba(34,34,36,0.72)'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle=enabled?col:'#454548'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,w,h);
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=enabled?(hot?'#101208':'#e8d9a8'):'#60605d';
  ctx.font='700 '+(h<27?7:w<100?8:h<38?9:11)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(label,w-7),x+w/2,y+h/2); return r;
}
function drawSocial(){
  selBg(); socialRects=[];
  const tiny=H<390, compact=H<600;
  const margin=tiny?7:compact?10:16, titleY=tiny?3:compact?7:12, titleFs=tiny?20:compact?25:34;
  ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='#bfa8ff'; ctx.font='700 '+titleFs+'px ui-monospace,Consolas,monospace';
  ctx.fillText('SOCIAL',W/2,titleY);
  const subY=titleY+titleFs+(tiny?0:3);
  ctx.fillStyle='#8a9268'; ctx.font='700 '+(tiny?6:compact?8:10)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('FRIENDS + PRIVATE MESSAGES REQUIRE SIGN-IN  ·  PARTY DOES NOT',W-20),W/2,subY);
  const statusY=subY+(tiny?9:compact?13:17);
  ctx.fillStyle=/NOT ENABLED|COULD NOT|OFFLINE/.test(socialStatus)?'#d05548':'#7f876e';
  ctx.font='700 '+(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(socialStatus||(authUser?'OPEN SOCIAL TO REFRESH':'SIGN IN FOR FRIENDS + PRIVATE MESSAGES'),W-20),W/2,statusY);

  const backH=tiny?27:compact?31:38, backY=H-backH-margin;
  const gap=tiny?4:compact?7:11, contentBottom=backY-(tiny?5:compact?8:12);
  const contentW=Math.min(1120,W-margin*2), contentX=(W-contentW)/2;
  const identityY=statusY+(tiny?9:compact?12:15), identityH=authUser?(W<500?(tiny?42:48):(tiny?23:compact?27:32)):0;
  if(typeof socialLayoutIdentity==='function') socialLayoutIdentity({x:contentX,y:identityY,w:contentW,h:identityH});
  const contentTop=(identityH?identityY+identityH:statusY)+(tiny?5:compact?8:12);
  const partyH=tiny?55:compact?64:78, partyY=contentBottom-partyH;
  const panelGap=gap, panelW=(contentW-panelGap)/2, panelH=Math.max(56,partyY-panelGap-contentTop);
  const panels=['friends','messages'].map((id,i)=>({id,x:contentX+i*(panelW+panelGap),y:contentTop,w:panelW,h:panelH}));
  const panelFrame=(p,title,col,sub)=>{
    ctx.fillStyle='rgba(10,10,12,0.76)'; ctx.fillRect(p.x,p.y,p.w,p.h); ctx.strokeStyle=col; ctx.lineWidth=1.3; ctx.strokeRect(p.x+0.5,p.y+0.5,p.w,p.h);
    ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillStyle=col; ctx.font='700 '+(tiny?9:compact?11:14)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(title,p.x+8,p.y+(tiny?5:8));
    const subNeeds=title==='PRIVATE MESSAGES'?285:210;
    if(sub&&p.w>=subNeeds){ ctx.textAlign='right'; ctx.fillStyle='#686b61'; ctx.font='700 '+(tiny?5:compact?6:8)+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(sub,p.w*0.46),p.x+p.w-8,p.y+(tiny?7:10)); }
  };
  const panelMessage=(p,text,y,col='#777f68')=>{
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=col; ctx.font='700 '+(tiny?6:compact?8:9)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(text,p.w-16),p.x+p.w/2,y);
  };

  // FRIENDS
  {
    const p=panels[0], col='#7fd8ff', footerH=tiny?25:compact?29:34, footerY=p.y+p.h-footerH-5, headY=p.y+(tiny?20:compact?25:32);
    panelFrame(p,'FRIENDS',col,authUser&&socialProfile?'@'+socialProfile.handle:'SIGNED-IN ONLY');
    if(!authUser){
      panelMessage(p,'SIGN IN TO ADD FRIENDS',headY+(footerY-headY)/2,'#8a9268');
      drawSocialButton('signin','SIGN IN',p.x+6,footerY,p.w-12,footerH,col,true);
    } else if(socialLoading&&socialBackend.profiles===null){
      panelMessage(p,'LOADING FRIENDS...',headY+(footerY-headY)/2,'#8a9268');
      drawSocialButton('social_retry','REFRESH',p.x+6,footerY,p.w-12,footerH,col,false);
    } else if(socialBackend.profiles===false||socialBackend.friends===false){
      panelMessage(p,'RUN SOCIAL SQL SETUP FILES',headY+(footerY-headY)/2,'#d05548');
      drawSocialButton('social_retry','RETRY SETUP CHECK',p.x+6,footerY,p.w-12,footerH,col,true);
    } else {
      const visible=socialFriends.filter(r=>r.status!=='blocked'||String(r.blocked_by)===String(authUser.id));
      const rowH=tiny?24:compact?30:37, maxRows=Math.max(1,Math.floor((footerY-headY-2)/rowH));
      const pages=Math.max(1,Math.ceil(visible.length/maxRows)); socialFriendPage=clamp(socialFriendPage,0,pages-1);
      const pageRows=visible.slice(socialFriendPage*maxRows,(socialFriendPage+1)*maxRows);
      if(!visible.length) panelMessage(p,'NO FRIENDS YET · ADD BY USERNAME',headY+(footerY-headY)/2);
      for(let i=0;i<pageRows.length;i++){
        const f=pageRows[i], other=socialFriendOther(f), person=socialPerson(other), y=headY+i*rowH;
        ctx.fillStyle=i%2?'rgba(255,255,255,0.022)':'rgba(255,255,255,0.05)'; ctx.fillRect(p.x+5,y,p.w-10,rowH-2);
        ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillStyle=f.status==='accepted'?'#cfe8ff':f.status==='blocked'?'#d05548':'#e8b658';
        ctx.font='700 '+(tiny?6:compact?8:9)+'px ui-monospace,Consolas,monospace';
        const status=f.status==='accepted'?'FRIEND':f.status==='blocked'?'BLOCKED':String(f.addressee_id)===String(authUser.id)?'WANTS TO ADD YOU':'REQUEST SENT';
        const actions=f.status==='accepted'?2:(f.status==='pending'&&String(f.addressee_id)===String(authUser.id)?2:1);
        const aw=Math.max(34,Math.min(compact?58:68,(p.w*0.46-(actions-1)*3)/actions)), total=aw*actions+3*(actions-1), ax=p.x+p.w-total-7;
        ctx.fillText(fitLine('@'+person.handle+'  ·  '+status,Math.max(28,ax-p.x-13)),p.x+9,y+(rowH-2)/2);
        if(f.status==='accepted'){
          drawSocialButton('friend_message','MSG',ax,y+3,aw,rowH-8,col,true,{userId:other,handle:person.handle});
          drawSocialButton('friend_remove','REMOVE',ax+aw+3,y+3,aw,rowH-8,'#d05548',true,{rowId:f.id});
        } else if(f.status==='pending'&&String(f.addressee_id)===String(authUser.id)){
          drawSocialButton('friend_accept','ACCEPT',ax,y+3,aw,rowH-8,'#a7c15e',true,{rowId:f.id});
          drawSocialButton('friend_block','BLOCK',ax+aw+3,y+3,aw,rowH-8,'#d05548',true,{rowId:f.id});
        } else drawSocialButton('friend_remove',f.status==='blocked'?'UNBLOCK':'CANCEL',ax,y+3,aw,rowH-8,'#d05548',true,{rowId:f.id});
      }
      const bg=4, count=pages>1?4:3, bw=(p.w-12-bg*(count-1))/count;
      drawSocialButton('friend_add','ADD',p.x+6,footerY,bw,footerH,col,true);
      drawSocialButton('friend_handle','USERNAME',p.x+6+bw+bg,footerY,bw,footerH,'#bfa8ff',true);
      if(pages>1){
        drawSocialButton('friend_prev','‹ '+(socialFriendPage+1)+'/'+pages,p.x+6+(bw+bg)*2,footerY,bw,footerH,'#8a9268',socialFriendPage>0);
        drawSocialButton('friend_next',(socialFriendPage+1)+'/'+pages+' ›',p.x+6+(bw+bg)*3,footerY,bw,footerH,'#8a9268',socialFriendPage<pages-1);
      } else drawSocialButton('social_retry','REFRESH',p.x+6+(bw+bg)*2,footerY,bw,footerH,'#8a9268',true);
    }
  }

  // PRIVATE MESSAGES
  {
    const p=panels[1], col='#a7c15e', footerH=tiny?25:compact?29:34, footerY=p.y+p.h-footerH-5, headY=p.y+(tiny?20:compact?25:32);
    panelFrame(p,'PRIVATE MESSAGES',col,'FRIENDS ONLY · MAX 500');
    if(!authUser){
      panelMessage(p,'SIGN IN TO READ PRIVATE MESSAGES',headY+(footerY-headY)/2,'#8a9268');
      drawSocialButton('signin','SIGN IN',p.x+6,footerY,p.w-12,footerH,col,true);
    } else if(socialLoading&&socialBackend.profiles===null){
      panelMessage(p,'LOADING PRIVATE MESSAGES...',headY+(footerY-headY)/2,'#8a9268');
      drawSocialButton('social_retry','REFRESH',p.x+6,footerY,p.w-12,footerH,col,false);
    } else if(socialBackend.profiles===false||socialBackend.messages===false||socialBackend.friends===false){
      panelMessage(p,'SECURE MESSAGE STORAGE NEEDS SETUP',headY+(footerY-headY)/2,'#d05548');
      drawSocialButton('social_retry','RETRY SETUP CHECK',p.x+6,footerY,p.w-12,footerH,col,true);
    } else {
      const rowH=tiny?24:compact?30:38, maxRows=Math.max(1,Math.floor((footerY-headY-2)/rowH));
      const pages=Math.max(1,Math.ceil(socialMessages.length/maxRows)); socialMessagePage=clamp(socialMessagePage,0,pages-1);
      const pageRows=socialMessages.slice(socialMessagePage*maxRows,(socialMessagePage+1)*maxRows);
      if(!socialMessages.length) panelMessage(p,'NO PRIVATE MESSAGES YET',headY+(footerY-headY)/2);
      for(let i=0;i<pageRows.length;i++){
        const m=pageRows[i], incoming=String(m.recipient_id)===String(authUser.id), other=incoming?m.sender_id:m.recipient_id, person=socialPerson(other), y=headY+i*rowH;
        const canReply=socialAcceptedFriend(other);
        ctx.fillStyle=incoming&&!m.read_at?'rgba(167,193,94,0.14)':i%2?'rgba(255,255,255,0.022)':'rgba(255,255,255,0.05)'; ctx.fillRect(p.x+5,y,p.w-10,rowH-2);
        ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillStyle=incoming?'#a7c15e':'#7fd8ff'; ctx.font='700 '+(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace';
        ctx.fillText(fitLine((incoming?'FROM ':'TO ')+'@'+person.handle,p.w-18),p.x+9,y+3);
        ctx.fillStyle='#cdd6b0'; ctx.font=(tiny?6:compact?7:9)+'px ui-monospace,Consolas,monospace'; ctx.fillText(fitLine(m.body,p.w-18),p.x+9,y+(tiny?13:compact?16:20));
        if(canReply) socialRects.push({id:'dm_reply',x:p.x+5,y,w:p.w-10,h:rowH-2,enabled:true,userId:String(other),handle:person.handle});
      }
      const bg=5, count=pages>1?3:2, bw=(p.w-12-bg*(count-1))/count;
      drawSocialButton('dm_new','NEW MESSAGE',p.x+6,footerY,bw,footerH,col,true);
      if(pages>1){
        drawSocialButton('dm_prev','‹ '+(socialMessagePage+1)+'/'+pages,p.x+6+bw+bg,footerY,bw,footerH,'#8a9268',socialMessagePage>0);
        drawSocialButton('dm_next',(socialMessagePage+1)+'/'+pages+' ›',p.x+6+(bw+bg)*2,footerY,bw,footerH,'#8a9268',socialMessagePage<pages-1);
      } else drawSocialButton('social_retry','REFRESH',p.x+6+bw+bg,footerY,bw,footerH,'#8a9268',true);
    }
  }

  // PARTY is a compact bottom action row. The real DOM field keeps keyboard,
  // paste, accessibility, and the mobile software keyboard working correctly.
  {
    const p={x:contentX,y:partyY,w:contentW,h:partyH}, col='#bfa8ff', footerH=tiny?25:compact?29:34, footerY=p.y+p.h-footerH-5, online=partyServiceAvailable();
    panelFrame(p,'PARTY',col,'GUESTS OK · MAX '+PARTY_MAX);
    const summary=!online?'PARTIES NEED AN INTERNET CONNECTION':party.accepted?
      (party.members.length+'/'+PARTY_MAX+' PLAYERS · JOINING ANOTHER CODE LEAVES THIS PARTY'):
      party.channel?('CONNECTING TO '+party.code):'CREATE A PARTY OR ENTER A 6-CHARACTER JOIN CODE';
    panelMessage(p,summary,p.y+(tiny?18:compact?22:27),!online?'#d05548':party.accepted?'#d8c8ff':'#8a9268');
    const bg=5, bw=(p.w-12-bg)/2, leftX=p.x+6, joinX=leftX+bw+bg;
    if(party.channel||party.accepted) drawSocialButton('party_open','OPEN PARTY',leftX,footerY,bw,footerH,col,true);
    else drawSocialButton('party_create','CREATE PARTY',leftX,footerY,bw,footerH,'#a7c15e',online);
    if(typeof socialLayoutPartyJoin==='function') socialLayoutPartyJoin({x:joinX,y:footerY,w:bw,h:footerH},online);
    else drawSocialButton('party_join','JOIN CODE',joinX,footerY,bw,footerH,'#7fd8ff',online);
  }

  backRect=drawSocialButton('back','‹ HOME',margin,backY,Math.min(170,W-margin*2),backH,'#8a9268',true);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
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
  ctx.fillStyle='#bfa8ff'; ctx.font='700 '+(compact?24:34)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('PARTY',W/2,H*0.045);
  ctx.fillStyle='#8a9268'; ctx.font=(compact?'9':'11')+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('UP TO 4 PLAYERS \u00b7 NO SIGN-IN \u00b7 SHARE A CODE',W-24),W/2,H*0.045+(compact?32:44));
  const infoY=H*0.045+(compact?54:72), infoH=compact?92:124;
  ctx.fillStyle='rgba(18,17,22,0.72)'; ctx.fillRect(px,infoY,pw,infoH); ctx.strokeStyle='#5c526d'; ctx.strokeRect(px+0.5,infoY+0.5,pw,infoH);
  ctx.fillStyle='#d8c8ff'; ctx.font='700 '+(compact?13:17)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('CREATE OR JOIN',W/2,infoY+(compact?13:19));
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
  ctx.fillText('PARTY',W/2,top);
  ctx.fillStyle='#8a9268'; ctx.font='700 '+(tiny?7:compact?8:10)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(party.members.length+'/'+PARTY_MAX+' PLAYERS  \u00b7  HOST '+(host?host.name:'RECONNECTING'),W-24),W/2,top+titleFs+(tiny?1:3));

  const headerBottom=top+titleFs+(tiny?14:compact?17:22);
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
  const selectedSetup=party.mode==='1v1v1'?'1v1v1  ·  ':party.mode==='1v1'?'1v1  ·  ':party.mode==='2v2'?'2v2  ·  ':'';
  const pairingHint=selectedSetup+(partyIsHost()?'DEFAULT PAIRINGS  ·  USE ‹ › TO EDIT':'DEFAULT PAIRINGS');
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
      drawPartyButton('member_prev','\u2039',controlsX,controlY,arrowW,controlH,'#bfa8ff',true,{memberId:m.id,dir:-1});
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#d8c8ff'; ctx.font='700 '+(tiny?6:compact?7:8)+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine(assignment,labelW-2),controlsX+arrowW+labelW/2,y+rowH/2);
      drawPartyButton('member_next','\u203a',controlsX+arrowW+labelW,controlY,arrowW,controlH,'#bfa8ff',true,{memberId:m.id,dir:1});
      if(canKick) drawPartyButton('kick','KICK',controlsX+arrowW*2+labelW+kickGap,controlY,kickW,controlH,'#d05548',true,{memberId:m.id});
    } else {
      const labelW=tiny?38:compact?48:62, nameW=Math.max(28,rosterW-labelW-26);
      ctx.textAlign='left'; ctx.fillStyle=isMe?'#7fd8ff':'#e8d9a8'; ctx.font='700 '+(tiny?7:compact?9:11)+'px ui-monospace,Consolas,monospace';
      ctx.fillText(fitLine((m.id===party.hostId?'\u2605 ':'')+m.name+(isMe?'  (YOU)':''),nameW),rosterX+10,y+rowH/2);
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
  drawPartyButton('copy','COPY CODE',codeX+codePad,copyY,codeW-codePad*2,copyH,'#7fd8ff',true);
  if(copyY+copyH+codePad*2<panelY+panelH){
    ctx.fillStyle='#6b7455'; ctx.font=(tiny?'6':compact?'7':'9')+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('SEND THIS TO FRIENDS',codeW-12),codeX+codeW/2,copyY+copyH+codePad);
  }

  const canPlay=party.members.length>=PARTY_MIN_PLAYERS;
  const playHot=mouse.x>=margin&&mouse.x<=W-margin&&mouse.y>=playY&&mouse.y<=playY+playH;
  // Keep this target live below the minimum so the shared guard can explain
  // exactly why PLAY is unavailable instead of silently swallowing the tap.
  partyRects.push({id:'browse',x:margin,y:playY,w:W-margin*2,h:playH,enabled:true});
  ctx.fillStyle=playHot?'#bfa8ff':'rgba(38,30,50,0.92)'; ctx.fillRect(margin,playY,W-margin*2,playH);
  ctx.strokeStyle='#bfa8ff'; ctx.lineWidth=2; ctx.strokeRect(margin+0.5,playY+0.5,W-margin*2-1,playH-1);
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=playHot?'#101208':'#f0e4ff';
  ctx.font='700 '+(tiny?22:compact?28:38)+'px ui-monospace,Consolas,monospace'; ctx.fillText('PLAY',W/2,playY+playH*(tiny?0.44:0.43));
  ctx.fillStyle=canPlay?(playHot?'#2b2430':'#9b8dab'):(playHot?'#52262b':'#d05548'); ctx.font='700 '+(tiny?6:compact?8:10)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(canPlay?'1v1v1 \u00b7 1v1 \u00b7 2v2 \u00b7 EXISTING MODES':'NEED AT LEAST 2 PARTY PLAYERS',W/2,playY+playH*(tiny?0.76:0.73));

  ctx.textAlign='center'; ctx.textBaseline='alphabetic'; ctx.fillStyle=party.members.length<PARTY_MIN_PLAYERS?'#d05548':'#8a9268'; ctx.font='700 '+(tiny?6:compact?8:9)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine(party.status||'SHARE THE CODE TO INVITE PLAYERS',W-20),W/2,statusY);
  const footerGap=tiny?5:compact?7:10, footerW=Math.min(430,W-margin*2), footerButtonW=(footerW-footerGap)/2, footerX=W/2-footerW/2;
  backRect=drawPartyButton('back','\u2039 SOCIAL',footerX,leaveY,footerButtonW,leaveH,'#8a9268',true);
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
  ctx.fillText(fitLine('CHOOSE A PARTY SETUP OR OPEN NORMAL HOME PLAY',W-20),W/2,titleY+titleFs+(tiny?2:5));

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
    partyCpuMode=pendingGameMode==='partycpu2v2', duelMode=arenaMode||aiMode||partyCpuMode;
  const queueNoticeActive=modeBoardNotice&&now<modeBoardNoticeT;
  const modeCol=arenaMode?'#d05548':partyCpuMode?'#bfa8ff':aiMode?'#7fd8ff':'#e8b658';
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillStyle=modeCol; ctx.font='700 '+(H<600?24:32)+'px ui-monospace,Consolas,monospace';
  ctx.fillText('YOUR LOADOUT',W/2,H*0.035);
  ctx.fillStyle=queueNoticeActive?'#ff6b5d':'#8a9268'; ctx.font=(W<430?'9':'11')+'px ui-monospace,Consolas,monospace';
  const loadoutSub=arenaMode?'ONLINE MULTIPLAYER \u00b7 DIFFERENT DEVICES \u00b7 1v1':
                   partyCpuMode?'PARTY \u00b7 MULTIPLE DEVICES \u00b7 2v2 VS CPUs \u00b7 NO UPGRADES, UTILITY, OR REWARDS':
                   ai2v2Mode?'OFFLINE \u00b7 ONE DEVICE ONLY \u00b7 YOU + ALLY CPU VS TWO CPUs \u00b7 NO UPGRADES, UTILITY, OR REWARDS':
                   ai1v1Mode?'OFFLINE \u00b7 ONE DEVICE ONLY \u00b7 1v1 VS AI \u00b7 NO UPGRADES':
                          'OFFLINE \u00b7 ONE DEVICE ONLY \u00b7 ENDLESS \u00b7 UTILITY OPTIONAL';
  ctx.fillText(fitLine(queueNoticeActive?modeBoardNotice:'AUTO-SAVED FOR EVERY MODE \u00b7 '+loadoutSub,W-24),W/2,H*0.035+40);
  const rows=duelMode?CATS.slice(0,3):CATS;
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
  ctx.fillText(ready?(partyCpuMode?'READY FOR PARTY 2v2':arenaMode?'START QUEUING FOR 1v1':ai2v2Mode?'START 2v2 VS CPUs':ai1v1Mode?'START 1v1 VS AI':'START ENDLESS'):'CHOOSE ALL 3 WEAPONS',W/2,dy+dh/2);
  const bbW=120, bbH=30, bbX=16, bbY=H-bbH-14; backRect={x:bbX,y:bbY,w:bbW,h:bbH};
  const backHot=mouse.x>=bbX&&mouse.x<=bbX+bbW&&mouse.y>=bbY&&mouse.y<=bbY+bbH;
  ctx.fillStyle=backHot?'#8a9268':'rgba(138,146,104,0.12)'; ctx.fillRect(bbX,bbY,bbW,bbH); ctx.strokeStyle='#8a9268'; ctx.strokeRect(bbX+0.5,bbY+0.5,bbW,bbH);
  const backLabel=pendingGameMode==='practice'?'\u2039 PRACTICE':partyCpuMode?'\u2039 PARTY':loadoutBackPage==='offlinecpu'?'\u2039 OFFLINE VS CPU':(loadoutBackPage==='modeboard'?'\u2039 PLAY MENU':'\u2039 HOME');
  ctx.fillStyle=backHot?'#101208':'#cdd6b0'; ctx.font='700 11px ui-monospace,Consolas,monospace'; ctx.fillText(backLabel,bbX+bbW/2,bbY+bbH/2);
  if(now<pracNeedMsgT){ ctx.fillStyle='#d05548'; ctx.font='700 11px ui-monospace,Consolas,monospace'; ctx.fillText('PRIMARY + SIDEARM + MELEE ARE REQUIRED',W/2,dy-18); }
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
    {x,title:'ONLINE',metric:'1v1 WINS',rows:arenaBoard,col:'#d05548',empty:emptyLabel('arena',onlineServiceAvailable()?'NO WINS YET':'NO CONNECTION')},
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
function drawHub(){
  selBg();
  leaderboardRowRects=[];
  compactStatus = W<680;
  pendingCancelRect=null;
  ctx.textAlign='center';
  const titleFs=(H<760?28:38);
  ctx.fillStyle='#e8b658'; ctx.font='700 '+titleFs+'px ui-monospace,Consolas,monospace';
  ctx.fillText('OUTPOST ZERO', W/2, H*0.035);
  const titleBottom=H*0.035+titleFs;                 // the title uses a TOP baseline

  // ADMIN ROW: big labeled rectangles right under the title (admins only); the rest of the hub shifts down
  let adminRowShift=0;
  if(isAdmin()){
    const defs=[];
    defs.push({id:'panel', t:'\u2699 ADMIN TOOLS', st:'\u2699 TOOLS', d:'edit \u00b7 players \u00b7 modes',
               f0:'rgba(208,85,72,0.12)', f1:'rgba(208,85,72,0.30)', c:'#d05548', tc:'#e0a8a0'});
    if(isMainAdmin())
      defs.push({id:'admins', t:'\uD83D\uDEE1 ADMINS', st:'\uD83D\uDEE1 ADMINS', d:'manage the team',
                 f0:'rgba(232,182,88,0.12)', f1:'rgba(232,182,88,0.30)', c:'#e8b658', tc:'#e8d9a8'});
    defs.push({id:'msgs', t:'\u2709 INBOX'+(unreadMsgs?' ('+unreadMsgs+')':''), st:'\u2709 INBOX'+(unreadMsgs?' ('+unreadMsgs+')':''), d:'messages \u00b7 reports \u00b7 archive',
               f0:'rgba(167,193,94,0.12)', f1:'rgba(167,193,94,0.30)', c:'#a7c15e', tc:'#cfe0a8'});
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
    const label=authUser?'SIGN OUT':'SIGN IN';
    const gw=ctx.measureText(gt).width, cw2=ctx.measureText(ct).width;
    ctx.font='700 9px ui-monospace,Consolas,monospace';
    const lw=Math.max(58, ctx.measureText(label).width+16);
    const total=gw+14+cw2+14+lw, sx=W/2-total/2;
    ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillStyle='#bfe8ff'; ctx.fillText(gt, sx+gw/2, sy+10);
    ctx.fillStyle='#ffe08a'; ctx.fillText(ct, sx+gw+14+cw2/2, sy+10);
    const bx3=sx+gw+14+cw2+14, by3=sy+10-9;
    signBtnRect={x:bx3,y:by3,w:lw,h:18};
    const hv3=mouse.x>=bx3&&mouse.x<=bx3+lw&&mouse.y>=by3&&mouse.y<=by3+18;
    ctx.fillStyle=hv3?'#e8b658':'rgba(232,182,88,0.14)'; ctx.fillRect(bx3,by3,lw,18);
    ctx.strokeStyle='#e8b658'; ctx.lineWidth=1; ctx.strokeRect(bx3+0.5,by3+0.5,lw,18);
    ctx.fillStyle=hv3?'#101208':'#e8b658'; ctx.font='700 9px ui-monospace,Consolas,monospace';
    ctx.fillText(label, bx3+lw/2, by3+9);
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

  // Home destinations: Play, offline Practice, and Social.
  diffRects=[];
  homePlayRects=[];
  hubPostsRect=null;
  const hbH=H<600?30:40, hbGap=W<520?5:8;
  const hbN=6;
  const hbW=Math.min(146, (W-24-hbGap*(hbN-1))/hbN);
  const hbY=H-hbH-8;
  const actionCount=3, actionCols=W>=480?3:1, actionRows=Math.ceil(actionCount/actionCols);
  const actionGap=H<390?4:H<560?7:10, targetActionH=H<390?42:H<560?54:76;
  const contentTop=bnY+bnH+8, actionBottom=hbY-10;
  let cardH=targetActionH, homeBoardsH=H<390?72:H<560?88:112;
  const boardActionGap=H<390?3:H<560?5:8;
  const available=Math.max(0,actionBottom-contentTop);
  let actionBlockH=cardH*actionRows+actionGap*(actionRows-1);
  let excess=homeBoardsH+boardActionGap+actionBlockH-available;
  if(excess>0){
    const shrink=Math.min(excess,Math.max(0,homeBoardsH-(H<390?60:72)));
    homeBoardsH-=shrink; excess-=shrink;
  }
  if(excess>0){
    cardH=Math.max(H<390?32:38,Math.floor((available-homeBoardsH-boardActionGap-actionGap*(actionRows-1))/actionRows));
    actionBlockH=cardH*actionRows+actionGap*(actionRows-1);
  }
  const maxBoardsY=Math.max(contentTop,actionBottom-actionBlockH-boardActionGap-homeBoardsH);
  const preferredBoardsY=Math.min(maxBoardsY,Math.max(contentTop,H*0.30));
  const postsLimit=preferredBoardsY-boardActionGap;
  const boardBottom=postsLimit-contentTop>=58?drawHubPosts(contentTop,postsLimit):contentTop;
  // The updates feed draws its post copy left-aligned. Home action labels use
  // their rectangle centres, so restore centred text before drawing buttons.
  ctx.textAlign='center'; ctx.textBaseline='top';
  const homeBoardsY=Math.min(maxBoardsY,Math.max(preferredBoardsY,boardBottom+boardActionGap));
  const homeBoardsW=Math.min(560,W-24), homeBoardsX=W/2-homeBoardsW/2;
  drawHomeLeaderboards(homeBoardsX,homeBoardsY,homeBoardsW,homeBoardsH);
  const actionTop=homeBoardsY+homeBoardsH+boardActionGap;
  const groupW=Math.min(560,W-24), groupX=W/2-groupW/2;
  const cardW=(groupW-actionGap*(actionCols-1))/actionCols;
  const actions=[
    {id:'play',title:'PLAY',sub:'ONLINE \u00b7 RANKED \u00b7 OFFLINE',col:'#e8b658',enabled:true},
    {id:'practice',title:'PRACTICE',sub:'RANGE \u00b7 DPS \u00b7 WARLORDS',col:'#a7c15e',enabled:true},
    {id:'social',title:'SOCIAL',sub:party.accepted?('FRIENDS \u00b7 MESSAGES \u00b7 PARTY '+party.members.length+'/'+PARTY_MAX+' OPEN'):'FRIENDS \u00b7 PRIVATE MESSAGES \u00b7 PARTY',col:'#bfa8ff',enabled:true}
  ];
  for(let i=0;i<actions.length;i++){
    const a=actions[i], x=groupX+(i%actionCols)*(cardW+actionGap);
    const y=actionTop+Math.floor(i/actionCols)*(cardH+actionGap);
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
    ctx.textBaseline='top';
  }

  // ---- Menu actions. ----
  let hbX=W/2-(hbW*hbN+hbGap*(hbN-1))/2;
  const hubBtn=(label, base, txtCol)=>{
    const r={x:hbX,y:hbY,w:hbW,h:hbH};
    const hv=mouse.x>=r.x&&mouse.x<=r.x+hbW&&mouse.y>=hbY&&mouse.y<=hbY+hbH;
    ctx.fillStyle=hv?base:'rgba(255,255,255,0.06)';
    ctx.fillRect(r.x,hbY,hbW,hbH);
    ctx.strokeStyle=base; ctx.lineWidth=1; ctx.strokeRect(r.x+0.5,hbY+0.5,hbW,hbH);
    ctx.fillStyle=hv?'#101208':txtCol; ctx.font='700 '+(hbW<110?11:13)+'px ui-monospace,Consolas,monospace';
    ctx.textBaseline='middle';
    ctx.fillText(fitLine(label, hbW-8), r.x+hbW/2, hbY+hbH/2);
    ctx.textBaseline='top';
    hbX+=hbW+hbGap;
    return r;
  };
  tutBtnRect =hubBtn('\u2753 HOW TO PLAY','#8a9268','#cdd6b0');
  shopBtnRect=hubBtn('\uD83D\uDC8E SHOP \u00b7 '+gems,'#7fd8ff','#bfe8ff');
  promoBtnRect=hubBtn('\uD83C\uDF81 CODE','#a7c15e','#cfe0a8');
  shareBtnRect=hubBtn('\uD83D\uDD17 SHARE +5','#bfa8ff','#d8c8ff');
  wheelBtnRect=hubBtn('\uD83C\uDFA1 SPIN '+(wheelReady>0?'('+wheelReady+')':wheelCountdown()),
                      wheelReady>0?'#e8b658':'#5a5648', wheelReady>0?'#e8d9a8':'#8a9268');
  lookupBtnRect=hubBtn('\uD83D\uDD0D LOOKUP','#7fd8ff','#bfe8ff');
  if(now<referralMsgT){
    ctx.fillStyle='#bfa8ff'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(referralMsg,W-30),W/2,Math.max(12,actionTop-13));
  } else if(!authUser&&pendingReferralId()){
    ctx.fillStyle='#bfa8ff'; ctx.font='700 10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('FRIEND GIFT WAITING \u00b7 SIGN IN TO CLAIM +5 GEMS',W-30),W/2,Math.max(12,actionTop-13));
  }
  if(now<utilLockMsgT){
    ctx.fillStyle='#d05548'; ctx.font='700 12px ui-monospace,Consolas,monospace';
    ctx.fillText('SIGN-IN ONLY \u2014 use the SIGN IN button top-left', W/2, hbY+hbH+12);
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
  const signedOut = sb && !authUser;
  streakBtnRect=null;
  const stW=Math.min(340,W-24), stH=42, stX=W/2-stW/2+offX('streak'), stY=hbY+hbH+10+offY('streak');
  layoutBlock('streak',stX,stY,stW,stH);
  if(stY+stH <= H-6){
    const ready=streakClaimable() && !signedOut;
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
              : now<streakMsgT ? streakMsg
              : ready ? ('day '+streakNext()+' reward: '+streakReward(streakNext()).coins+' \uD83E\uDE99'
                         +(streakReward(streakNext()).gems?('  +'+streakReward(streakNext()).gems+' \uD83D\uDC8E'):''))
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
      ctx.fillText(signedOut?'\u2014':'\u2714 COLLECTED', cbx+cbw/2, cby+cbh/2);
    }
    ctx.textBaseline='alphabetic'; ctx.textAlign='center';
  }

  // ---- DAILY TASKS, centered under the buttons ----
  const tpY=stY+stH+8+offY('tasks')-offY('streak');
  const roomForTasks=(H-6)-tpY;
  const trH = (24+dailyTasks.length*28 <= roomForTasks) ? 28 : 21;   // tighten rather than vanish
  const tpW=Math.min(340,W-24), tpH= signedOut ? 46 : 24+dailyTasks.length*trH;
  const tpX=W/2-tpW/2+offX('tasks');
  layoutBlock('tasks',tpX,tpY,tpW,tpH);
  if(tpH <= roomForTasks && (signedOut || dailyTasks.length)){
    ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(tpX,tpY,tpW,tpH);
    ctx.strokeStyle='#4a4634'; ctx.strokeRect(tpX+0.5,tpY+0.5,tpW,tpH);
    ctx.textAlign='left';
    ctx.fillStyle='#e8b658'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText('\uD83D\uDCCB DAILY TASKS', tpX+10, tpY+7);
    ctx.textAlign='right';
    ctx.fillStyle='#6b7455'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText('new quests in '+dailyCountdown(), tpX+tpW-10, tpY+8);
    ctx.textAlign='left';
    if(signedOut){
      ctx.fillStyle='#d0a548'; ctx.font='10px ui-monospace,Consolas,monospace';
      ctx.fillText('SIGN IN (top-left) to earn \uD83D\uDC8E gems from tasks', tpX+10, tpY+26);
    } else {
      ctx.font='10px ui-monospace,Consolas,monospace';
      for(let i=0;i<dailyTasks.length;i++){
        const t=dailyTasks[i], ty2=tpY+24+i*trH;
        ctx.fillStyle = t.done ? '#a7c15e' : '#cdd6b0';
        ctx.fillText((t.done?'\u2714 ':'')+t.d, tpX+10, ty2);
        ctx.textAlign='right';
        ctx.fillStyle = t.done ? '#a7c15e' : '#8a9268';
        ctx.fillText(t.done ? '\uD83D\uDC8E'+t.reward : t.prog+'/'+t.goal+'  \uD83D\uDC8E'+t.reward, tpX+tpW-10, ty2);
        ctx.textAlign='left';
        if(!t.done){
          ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(tpX+10, ty2+13, tpW-20, 3);
          ctx.fillStyle='#e8b658'; ctx.fillRect(tpX+10, ty2+13, (tpW-20)*clamp(t.prog/t.goal,0,1), 3);
        }
      }
    }
    ctx.textAlign='center';
  }

}
function drawCategory(cat){
  selBg();
  const slot=slotFor(cat), col=ROLECOL[cat];
  const entry=CATS.find(c=>c[0]===cat);
  const list=entry[2](), temps=entry[3]();

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
    ctx.fillText(k==='medkit' ? 'RECHARGE '+MED_KILLS_REQUIRED+' KILLS' : 'RECHARGE '+(w.cd/1000)+'s', x+cw/2, ry2);
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
  ctx.fillStyle='rgba(8,9,5,0.78)'; ctx.fillRect(0,0,W,H);
  const pw=340, ph=inRun?354:304, px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='rgba(16,18,8,0.96)'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#4a4634'; ctx.lineWidth=1; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='middle';       // deterministic baseline regardless of prior draws
  ctx.fillStyle='#e8b658'; ctx.font='700 24px ui-monospace,Consolas,monospace';
  ctx.fillText('GAME MENU', W/2, py+26);
  ctx.textBaseline='alphabetic';

  menuRects={};
  const bw=pw-60;
  drawMenuBtn('resume','CLOSE', px+30, py+62, bw, 36);
  let sy;
  if(inRun){
    drawMenuBtn('exit','EXIT TO MENU', px+30, py+110, bw, 36);
    drawMenuBtn('report','\u26A0 REPORT PROBLEM', px+30, py+158, bw, 36);
    sy=py+240;
  } else {
    drawMenuBtn('report','\u26A0 REPORT PROBLEM', px+30, py+110, bw, 36);
    sy=py+192;
  }
  drawSlider('music','MUSIC', musicVol, px+30, sy,    bw);
  drawSlider('sfx','SOUND',  sfxVol,   px+30, sy+52, bw);

  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#6b7455'; ctx.font='11px ui-monospace,Consolas,monospace';
  ctx.fillText('P / ESC closes', W/2, py+ph-18);
  ctx.fillStyle='#e8d9a8'; ctx.beginPath(); ctx.arc(mouse.x,mouse.y,3,0,TAU); ctx.fill();
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
let signBtnRect=null;
let adLeftRect=null, adRightRect=null, editHubBtnRect=null, boardPanelRect=null;
// ---- DAILY REWARD: a full page you must collect before the menu ----
let dailyGateOpen=false, dailyGateRects=[], dailyGateReward=null;
function openDailyGate(){
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
  const r=dailyGateReward||{day:1,coins:25,gems:0};
  let y=Math.max(50, H*0.20);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#e8b658'; ctx.font='700 '+(W<520?26:38)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(fitLine('DAILY REWARD', W-24), W/2, y); y+=34;
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
  ctx.fillText(fitLine('SIGN IN TOMORROW FOR A GROWING REWARD!',bannerW-18),W/2,y-1);
  y+=40;
  if(r.day%7!==0){
    ctx.fillStyle='#6b7455'; ctx.font='10px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('keep the streak going \u2014 day '+(r.day+1)+' pays more, and every 7th day pays gems', W-40), W/2, y);
  } else {
    ctx.fillStyle='#7fd8ff'; ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('seven days running \u2014 gem bonus!', W-40), W/2, y);
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
  ctx.fillText('COLLECT', W/2, y+bh/2);
  ctx.textBaseline='alphabetic';
  ctx.textAlign='left';
}
function dailyGateClick(){
  for(const r of dailyGateRects){
    if(mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h){
      if(r.id==='collect'){ collectStreak(); dailyGateOpen=false; maybeFirstRunTutorial(); }
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
    ['\uD83D\uDD25','daily rewards and a streak that keeps paying'],
    ['\uD83C\uDFA1','a free wheel spin every 20 minutes'],
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
  // PLAYER LOOKUP is directly below the board, so protect both rectangles.
  const blocks=[boardPanelRect,lookupBtnRect].filter(overlapsX);
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
let banList=[], appealList=[], playerLog=[];
let appealOpen=false;
async function fetchPlayersData(){
  if(!sb || !isAdmin()) return;
  try{
    const b=await sb.from('bans').select('user_email,device_id,until,note,scopes,banned_by,created_at').order('created_at',{ascending:false}).limit(40);
    banList=b.data||[];
  }catch(e){ banList=[]; }
  try{
    const a=await sb.from('ban_appeals').select('id,player_email,message,status,created_at').order('id',{ascending:false}).limit(40);
    appealList=a.data||[];
  }catch(e){ appealList=[]; }
  try{
    const l=await sb.from('player_log').select('at,actor_email,target_email,action,detail').order('at',{ascending:false}).limit(60);
    playerLog=l.data||[];
  }catch(e){ playerLog=[]; }
}
function openAppeal(){
  appealOpen=true;
  $('appealwrap').style.display='flex'; $('appealstatus').textContent=''; $('appealmsg').value='';
  try{ $('appealmsg').focus(); }catch(e){}
}
function closeAppeal(){ appealOpen=false; $('appealwrap').style.display='none'; }
async function sendAppeal(){
  const t=String($('appealmsg').value||'').trim();
  if(!t){ $('appealstatus').textContent='write your appeal first'; return; }
  if(!sb || !authUser){ $('appealstatus').textContent='sign in to appeal'; return; }
  $('appealstatus').textContent='sending...';
  try{
    const { error } = await sb.from('ban_appeals').insert(
      {player_email: adminEmail()||String(authUser.email||'').toLowerCase(), message: t.slice(0,600), status:'open'});
    if(error) throw error;
    $('appealstatus').textContent='sent \u2014 an admin will review it';
    appealSent=true;
    setTimeout(closeAppeal, 1400);
  }catch(err){ $('appealstatus').textContent='could not send \u2014 try again later'; }
}
let appealSent=false;
async function resolveAppeal(id, status){
  if(!isAdmin() || !sb) return;
  try{ await sb.from('ban_appeals').update({status, decided_by:adminEmail()}).eq('id',id); }catch(e){}
  fetchPlayersData();
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
function drawPlayQuests(){
  if(practiceMode==='arena') return;                       // Arena never advances campaign quests
  if(state!=='play' && state!=='upgrade') return;
  const signedOut=sb&&!authUser, rows=signedOut?1:dailyTasks.length;
  const pw=Math.min(280,Math.max(210,W*0.28)), rh=25, ph=30+rows*rh;
  const px=16, py=Math.max(72,H/2-ph/2);
  ctx.save(); ctx.globalAlpha=0.72;
  ctx.fillStyle='rgba(5,7,4,0.68)'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#4a4634'; ctx.lineWidth=1; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textBaseline='middle'; ctx.textAlign='left';
  ctx.fillStyle='#e8b658'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText('\uD83D\uDCCB DAILY QUESTS',px+9,py+14);
  ctx.textAlign='right'; ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
  ctx.fillText(dailyCountdown(),px+pw-9,py+14);
  ctx.textAlign='left';
  if(signedOut){
    ctx.fillStyle='#d0a548'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText('SIGN IN TO EARN GEMS',px+9,py+30+rh/2);
  } else for(let i=0;i<dailyTasks.length;i++){
    const t=dailyTasks[i], y=py+30+i*rh+rh/2;
    ctx.fillStyle=t.done?'#a7c15e':'#cdd6b0'; ctx.font='9px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine((t.done?'\u2714 ':'')+t.d,pw-92),px+9,y);
    ctx.textAlign='right'; ctx.fillStyle=t.done?'#a7c15e':'#8a9268';
    ctx.fillText(t.done?('\uD83D\uDC8E'+t.reward):(t.prog+'/'+t.goal+'  \uD83D\uDC8E'+t.reward),px+pw-9,y);
    ctx.textAlign='left';
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
  ctx.fillText('\uD83D\uDC8E +'+r.gems,W/2,py+151);
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
// account chip: was an HTML overlay that sat on top of the game text on every page
function drawAccountChip(){
  signBtnRect=null;
  if(state==='select' && selPage==='arena') return;        // do not cover Arena buttons on narrow screens
  if(compactStatus && state==='select' && selPage==='hub') return;   // the status line owns it
  if(state==='play' || state==='over') return;        // only on the menus
  ctx.save();
  ctx.textAlign='left'; ctx.textBaseline='middle';
  const label = authUser ? 'SIGN OUT' : 'SIGN IN';
  ctx.font='700 10px ui-monospace,Consolas,monospace';
  const bw=Math.max(74, ctx.measureText(label).width+18), bh=20,
        bx=52+offX('account'), by=Math.max(104, leftColTop)+56+offY('account');
  layoutBlock('account',bx,by,bw,bh);
  const paintAccount=()=>{
  signBtnRect={x:bx,y:by,w:bw,h:bh};
  const hv=mouse.x>=bx&&mouse.x<=bx+bw&&mouse.y>=by&&mouse.y<=by+bh;
  ctx.fillStyle=hv?'#e8b658':'rgba(232,182,88,0.14)'; ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle='#e8b658'; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
  ctx.textAlign='center';
  ctx.fillStyle=hv?'#101208':'#e8b658';
  ctx.fillText(label, bx+bw/2, by+bh/2);
  // who you are, under the button, clipped so it can never reach the centre column
  ctx.textAlign='left'; ctx.font='9px ui-monospace,Consolas,monospace'; ctx.fillStyle='#8a9268';
  const room=Math.max(60, Math.min(150, W*0.30));
  ctx.fillText(fitLine(authUser?displayName(authUser):'not signed in', room), bx, by+bh+9);
  };
  withBlockColour('account', paintAccount);
  ctx.restore();
}
function drawGear(){
  const sz=34, x=W-16-sz, y=14;
  gearRect={x,y,w:sz,h:sz};
  const hot = menuOpen || (mouse.x>=x&&mouse.x<=x+sz&&mouse.y>=y&&mouse.y<=y+sz);
  ctx.fillStyle = hot ? 'rgba(232,182,88,0.18)' : 'rgba(8,10,5,0.7)';
  ctx.fillRect(x,y,sz,sz);
  ctx.strokeStyle = hot ? '#e8b658' : '#4a4634'; ctx.lineWidth=1;
  ctx.strokeRect(x+0.5,y+0.5,sz,sz);
  const cx=x+sz/2, cy=y+sz/2;
  ctx.strokeStyle = hot ? '#e8b658' : '#8a9268'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(cx,cy,6,0,TAU); ctx.stroke();
  for(let i=0;i<8;i++){
    const a=i*TAU/8;
    ctx.beginPath();
    ctx.moveTo(cx+Math.cos(a)*7, cy+Math.sin(a)*7);
    ctx.lineTo(cx+Math.cos(a)*10,cy+Math.sin(a)*10);
    ctx.stroke();
  }
  ctx.fillStyle=ctx.strokeStyle;
  ctx.beginPath(); ctx.arc(cx,cy,2,0,TAU); ctx.fill();

  // powerups are now accessed from the upgrade screen only
  powerBtnRect={x:-99,y:-99,w:0,h:0};
  adminBtnRect={x:-99,y:-99,w:0,h:0};

}
