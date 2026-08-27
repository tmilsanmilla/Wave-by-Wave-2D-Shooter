"use strict";

/* ---------------- main loop ---------------- */
const SIM_STEP=1000/60, MAX_SIM_STEPS=8;
let fpsEMA=60, showFps=false, simAcc=0;
function frame(){
  const wall = performance.now();
  const raw = Math.max(0,wall-last);
  last = wall;
  wheelTick(Math.min(Math.max(raw,0),60000));       // total site time; tolerate background tabs without clock jumps
  arenaWallTick(wall);                              // online clocks + snapshots never pause with the campaign clock
  partyTick(Date.now());                            // party admission, liveness, and host snapshots keep running on menus
  partyCpuWallTick(Date.now());                     // host-run Party CPUs and round clocks never depend on render FPS
  if(typeof temporaryWeaponGrantTick==='function')temporaryWeaponGrantTick(Date.now());
  if(typeof myBanTick==='function')myBanTick();
  if(raw>0){ const inst=1000/raw; fpsEMA += (inst-fpsEMA)*0.1; }
  if(layoutDirty && Date.now()>layoutLocalSaveT){ persistLayoutDraft(); layoutLocalSaveT=Date.now()+250; }

  // `now` is a GAME clock. It freezes while the pause menu (or a modal) is open, so
  // utility cooldowns, reloads, ability timers and burn/freeze don't tick while paused.
  const frozen = menuOpen || powerMenuOpen || respawnPromptT || chestRewardOpen || reportOpen || postOpen || msgOpen || scoreEditOpen || appealOpen || promoOpen || formOpen ||
    (typeof accountMenuOpen!=='undefined'&&accountMenuOpen) ||
    (typeof accountSettingsOpen!=='undefined'&&accountSettingsOpen) ||
    (typeof usernameGateBlocksGameplay==='function'&&usernameGateBlocksGameplay()) ||
    (typeof usernameClaimOpen!=='undefined'&&usernameClaimOpen);
  if(frozen){
    simAcc=0;
  } else {
    // Run gameplay at a steady 60 Hz and render separately. A 20/30 FPS device
    // catches up with several small safe steps; a 144 FPS display no longer speeds
    // up movement, bullets, weapon cooldowns, particles, or enemy behavior.
    simAcc+=Math.min(raw,SIM_STEP*MAX_SIM_STEPS);
    let steps=0;
    while(simAcc>=SIM_STEP && steps<MAX_SIM_STEPS){
      now+=SIM_STEP;
      if(isBotArena()) arenaBotRoundTick();             // countdown/round clock pauses with the local game
      else if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()) offlineCpu2v2RoundTick();
      if(state==='play' && (practiceMode!=='arena'||arenaCanAct())) update(SIM_STEP);
      if(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2()&&partyCpuMatch.phase==='fight') partyCpuFixedStep(SIM_STEP,now);
      arenaBotFlushProjectiles();                       // safe point after every projectile loop has finished
      simAcc-=SIM_STEP; steps++;
    }
    if(steps===MAX_SIM_STEPS&&simAcc>=SIM_STEP) simAcc=0; // discard only a true background-tab backlog
  }
  arenaSyncTick(wall);                              // send the post-simulation position, even if a local menu is open
  partyCpuSyncTick(Date.now());                     // Party humans + host bot snapshots share the Party channel
  tickCoinTrickles(wall);                         // reward count-ups continue inside the reward menu
  // Daily quests reset at noon UTC even if the player stays inside a run.
  if(String(Math.floor((Date.now()-43200000)/86400000))!==tasksDate) loadMeta();

  // show the OS mouse pointer while any menu/popup is open (so buttons are easy to click);
  // otherwise hide it and use the in-game crosshair
  const wantPointer = frozen || adminOpen || adminPanelOpen || state==='select' || state==='over' || state==='upgrade';
  const desired = wantPointer ? 'default' : 'none';
  if(cv.style.cursor !== desired) cv.style.cursor = desired;

  // the account chip is canvas-drawn now; keep the old HTML bar permanently hidden
  const ub=$('userbar').style;
  if(ub.display !== 'none') ub.display='none';

  if(profilePending && Date.now()>profileSaveT){
    const saveUserId=profilePendingUserId; profilePending=false; profilePendingUserId='';
    if(authUser&&String(authUser.id)===saveUserId) saveProfile(); // a delayed save must never cross accounts
  }

  if(state==='select'){
    // keep the home-page leaderboard fresh (throttled to every 30s, on wall time)
    // realtime pushes changes; polling stays only as a safety net (rare when live)
    if(sb){
      if(rtStatus==='down' && rtRetryT && Date.now()>rtRetryT){ rtRetryT=0; setupRealtime(); }
      const every = rtStatus==='live' ? 180000 : 30000;     // 3 min when live, 30s when it isn't
      if(Date.now()-boardT > every){
        boardT=Date.now(); fetchBoard(); fetchBanners(); fetchPrices(); if(isAdmin()) fetchMsgs();
      }
    }
    drawSelect();
  }
  else {
    drawWorld();
    drawHUD();
    if(tutorialOn){ tutorialUpdate(); drawTutorialOverlay(); }
    if(state==='upgrade') drawUpgrade();
    if(state==='over')  drawOver();
  }
  drawUnscopedSniperKillCelebration();
  drawGear();
  if(state==='select' && myBan && !banBlocksPlay()) drawBanNotice();   // leaderboard-only: just a notice
  if(state==='select') for(const m of MODALS) if(m.is()) m.draw();
  if(menuOpen) drawMenu();
  if(powerMenuOpen) drawPowerMenu();
  if(respawnPromptT) drawRespawnPrompt();
  if(state==='select' && selPage==='hub') drawSideAds();   // stationary ads beside the menu
  drawPlayQuests();                       // semi-transparent quest tracker during a run
  drawCurrencyHUD();                      // gems + coins: always visible, left side
  drawAccountChip();                      // sign in / out
  drawWaveCoinTracker();                  // every fifth wave: coins spin and spiral into the total
  drawChestReward();                      // boss chest reward menu sits above the run and HUD
  if(layoutMode && state==='select' && selPage==='hub') drawLayoutOverlay();   // last: everything has registered
  if(showFps){
    ctx.save();
    ctx.textAlign='right'; ctx.textBaseline='top';
    ctx.font='700 11px ui-monospace,Consolas,monospace';
    ctx.fillStyle='rgba(8,10,5,0.7)'; ctx.fillRect(W-70,H-24,62,18);
    ctx.fillStyle='#a7c15e'; ctx.fillText(Math.round(fpsEMA)+' FPS', W-12, H-22);
    ctx.restore();
  }
  layoutRibbons();
  requestAnimationFrame(frame);
}
