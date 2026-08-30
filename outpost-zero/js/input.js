"use strict";

const keys={};
const mouse={x:W/2,y:H/2,down:false};
let menuRects={}, dragSlider=null, menuOpen=false, gearRect={x:-99,y:-99,w:0,h:0}, powerBtnRect={x:-99,y:-99,w:0,h:0};
// Cadence carry is valid only after a shot has fired during this uninterrupted
// physical press. Resetting it on release prevents a second quick press from
// replaying the automatic-fire intervals that elapsed while the button was up.
let mouseFireCadence=false;
function resetFireCadence(){ mouseFireCadence=false; touchFireCadence=false; }
function toggleMenuFromInput(){
  // Opening an overlay while a CPU start/rematch is awaiting cloud state is a
  // route-away intent. Cancel first so closing the overlay before the response
  // cannot let an older callback launch behind the player's current screen.
  if(!menuOpen&&state==='select'){
    if(typeof cancelCpuLaunchIntent==='function')cancelCpuLaunchIntent();
    else if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();
  }
  // A pause opened by keyboard, mouse, or a second touch must retire any
  // currently held touch contacts. Otherwise closing it while the original
  // finger is still down resumes stale movement/fire. This deliberately keeps
  // keyboard/mouse cadence and weapon gimmicks intact across an ordinary pause.
  if(!menuOpen&&state==='play'&&typeof resetHeldTouchContacts==='function')resetHeldTouchContacts();
  menuOpen=!menuOpen;sfx('swap');
}
function activateOfflineCpuAction(rect){
  if(!rect||rect.enabled===false){sfx('dry');return false;}
  const id=String(rect.id||'');offlineCpuFocusId=id;
  const rankedCpuAction=id==='cpu_start_1v1'||id==='cpu_local_2v2',signedIn=typeof authUser!=='undefined'&&!!authUser,
    resultPending=typeof botLadderHasPendingResult==='function'&&botLadderHasPendingResult(),
    secureReady=typeof botLadderSecureMatchReady!=='function'||botLadderSecureMatchReady();
  // Rectangles describe the last rendered frame. Recheck live state so an
  // account sync/conflict or unsaved result arriving before click/Enter cannot
  // route a signed-in player into a ranked loadout through a stale button.
  if(rankedCpuAction&&signedIn&&
     (typeof botLadderReadyForMatch!=='function'||!botLadderReadyForMatch()||resultPending||!secureReady)){
    sfx('dry');return false;
  }
  if(id==='cpu_root_1v1'){offlineCpuView='1v1';offlineCpuInfoKey='';offlineCpuFocusId='cpu_start_1v1';sfx('swap');}
  else if(id==='cpu_root_2v2'){offlineCpuView='2v2';offlineCpuInfoKey='';offlineCpuFocusId='cpu_local_2v2';sfx('swap');}
  else if(id==='cpu_start_1v1')chooseGameMode('ai1v1','offlinecpu');
  else if(id==='cpu_local_2v2')chooseGameMode('ai2v2','offlinecpu');
  else if(id==='cpu_friend_2v2'&&typeof partyOpenCpuFriendFlow==='function')partyOpenCpuFriendFlow();
  else if(id==='cpu_cancel_friend_invite'){
    if(typeof party!=='undefined'&&party&&party.directCpu&&party.phase==='closing')return false;
    if(typeof partyCpuSessionOpen==='function'&&partyCpuSessionOpen())partyCpuAbort('FRIEND CPU GAME SETUP CANCELLED.',true);
    else if(typeof partyDirectCpuClose==='function')partyDirectCpuClose('FRIEND INVITE CANCELLED');
  }
  else if(/^cpu_info_/.test(id)){const key=id.slice(9);offlineCpuInfoKey=offlineCpuInfoKey===key?'':key;sfx('swap');}
  else return false;
  return true;
}

/* ---------------- input ---------------- */
function typingInField(e){
  const t=e.target;
  return t && (t.tagName==='INPUT' || t.tagName==='TEXTAREA' || t.isContentEditable);
}
function activateContextAction(){
  if(practiceMode==='arena'&&!arenaCanAct()){ sfx('dry'); return; }
  if(typeof arenaUtilityFrozen==='function'&&arenaUtilityFrozen()){sfx('dry');return;}
  // Arena does not simulate the two vaulted ranged specials, but melee
  // abilities use the normal Arena hit path and are valid once play starts.
  if(practiceMode==='arena'&&(player.cur==='warpwave'||player.cur==='timeturner')){ sfx('dry'); return; }
  if(utilityOut){ utilQuick(); return; }
  if(player.cur==='warpwave'){ warpStun(); return; }
  if(player.cur==='timeturner'){ timeDragField(); return; }
  if(WEAPONS[player.cur].melee){ quickMelee(); return; }
  aiming=!aiming; sfx('aim');
}
addEventListener('keydown', e=>{
  if(typingInField(e)) return;          // don't eat keys while typing in the auth form
  if(typeof accountMenuOpen!=='undefined'&&accountMenuOpen){e.preventDefault();return;}
  if(typeof accountSettingsOpen!=='undefined'&&accountSettingsOpen){
    if(e.key==='Escape'&&typeof closeAccountSettings==='function') closeAccountSettings();
    e.preventDefault(); return;
  }
  if((typeof usernameGateBlocksGameplay==='function'&&usernameGateBlocksGameplay())||
     (typeof usernameClaimOpen!=='undefined'&&usernameClaimOpen)){
    if(typeof requireResolvedUsernameForGameplay==='function') requireResolvedUsernameForGameplay();
    const gate=typeof document!=='undefined'&&document.getElementById('usernameclaimwrap');
    if(!(gate&&gate.contains(e.target))) e.preventDefault();
    return;
  }
  if(chestRewardOpen) return;            // chest menu stays open for the full three-second count-up
  if(reportOpen){ if(e.key==='Escape') closeReport(); return; }
  if(postOpen){ if(e.key==='Escape') closePost(); return; }
  if(msgOpen){ if(e.key==='Escape') closeMsgCompose(); return; }
  if(scoreEditOpen){ if(e.key==='Escape') closeScoreEdit(); return; }
  if(appealOpen){ if(e.key==='Escape') closeAppeal(); return; }
  if(promoOpen){ if(e.key==='Escape') closePromo(); return; }
  if(formOpen){ if(e.key==='Escape') cancelForm(); return; }
  if(layoutMode && e.key==='Escape'){ layoutMode=false; layoutDrag=null; layoutPick=null; sfx('swap'); return; }
  if(adminPanelOpen||aiLearningOpen||updatesOpen||adminsOpen||msgsOpen||auditOpen||archOpen||storageOpen||scoresOpen||playersOpen||wheelOpen||promoAdminOpen||weaponEditOpen||weaponSuggestionsOpen||requestsOpen||readerOpen){ if(e.key==='Escape'){ if((scoresOpen&&peBusy)||wheelSpinning) return; if(readerOpen){ clearReaderState(); sfx('swap'); return; } if(scoresOpen) resetPlayerEditScroll(); if(auditOpen) resetAdminAuditScroll(); if(updatesOpen)resetReportScroll();reportActionMenuOpen=reportAmountMenuOpen=false; wheelOpen=false; promoAdminOpen=false; weaponEditOpen=false; weaponSuggestionsOpen=false;requestsOpen=false;adminPanelOpen=false; aiLearningOpen=false; updatesOpen=false; adminsOpen=false; msgsOpen=false; auditOpen=false; archOpen=false; storageOpen=false; scoresOpen=false; playersOpen=false; sfx('swap'); } return; }
  const k = e.key.toLowerCase();
  if(['w','a','s','d',' '].includes(k)) e.preventDefault();
  keys[k]=true;
  initAudio();

  // respawn prompt is modal: swallow all keys until they choose
  if(respawnPromptT){ return; }
  if(k==='`'){ showFps=!showFps; return; }   // toggle FPS counter
  // powerups popup lives on the upgrade screen now
  if(powerMenuOpen){ if(k==='escape'||k==='p'||k==='v'){ powerMenuOpen=false; sfx('swap'); } return; }
  if(k==='v' && state==='upgrade'){ powerMenuOpen=true; sfx('swap'); return; }

  if(k==='escape' && state==='select'){ navigateSelectBack(); return; }
  if(k==='p' || k==='escape'){ toggleMenuFromInput(); return; }
  if(menuOpen) return;

  if(state==='select'){
    if(selPage==='offlinecpu'&&['arrowleft','arrowright','arrowup','arrowdown','enter'].includes(k)){
      e.preventDefault();const choices=offlineCpuRects.filter(r=>r&&r.enabled!==false&&r.id),at=Math.max(0,choices.findIndex(r=>r.id===offlineCpuFocusId));
      offlineCpuKeyboardActive=true;
      if(k==='enter'){if(choices.length)activateOfflineCpuAction(choices[at]||choices[0]);}
      else if(choices.length){const direction=(k==='arrowleft'||k==='arrowup')?-1:1;offlineCpuFocusId=choices[(at+direction+choices.length)%choices.length].id;sfx('swap');}
      return;
    }
    if(k==='enter' && selPage==='loadout') launchSelectedMode();
    return;
  }
  if(state==='over'){
    if(k==='enter'){ pendingPractice=null; startGame(); }
    if(k==='m'){ state='select'; tutorialTeardown(); restoreTryLoadout(); }
    return;
  }
  if(state==='upgrade'){
    const i = parseInt(k)-1;
    if(i>=0 && i<4) chooseUpgrade(i);
    return;
  }
  if(state!=='play') return;

  if(k==='e'){
    if(e.repeat) return;                                  // one physical press toggles aim once
    activateContextAction();                              // melee ability, ranged aim, or visible utility
  }
  if(k==='r') startReload();
  if(k==='h' && !e.repeat) useStashedMedkit();
  if(k===' ') doDash();
  if(k==='f') quickMelee();
  if(k==='g' && !e.repeat) utilQuick();
  if(k==='4') equipUtility();
  if(k==='1') switchWeapon(loadout.primary);
  if(k==='2') switchWeapon(loadout.secondary);
  if(k==='3') switchWeapon(loadout.melee);
  if(k==='q') cycleWeapon();
});
addEventListener('keyup', e=>{
  if(typingInField(e)) return;
  if(typeof accountMenuOpen!=='undefined'&&accountMenuOpen){keys[e.key.toLowerCase()]=false;return;}
  if(typeof accountSettingsOpen!=='undefined'&&accountSettingsOpen){ keys[e.key.toLowerCase()]=false; return; }
  if((typeof usernameGateBlocksGameplay==='function'&&usernameGateBlocksGameplay())||
     (typeof usernameClaimOpen!=='undefined'&&usernameClaimOpen)){ keys[e.key.toLowerCase()]=false; return; }
  keys[e.key.toLowerCase()]=false;
});

cv.addEventListener('mousemove', e=>{
  mouse.x=px(e.clientX); mouse.y=e.clientY;
  if(layoutMode && mouse.down) layoutMouseMove();
  if(dragSlider && mouse.down) setSliderFromMouse();
});
cv.addEventListener('wheel',e=>{
  const x=px(e.clientX),y=e.clientY;
  mouse.x=x; mouse.y=y;
  const modal=typeof topModal==='function'?topModal():null;
  if(!modal)return;
  const scores=modal.k==='scores'&&playerEditScrollContains(x,y),audit=modal.k==='audit'&&adminAuditScrollContains(x,y),reports=modal.k==='updates'&&reportScrollContains(x,y);
  if(!scores&&!audit&&!reports)return;
  const viewport=scores?peScrollViewport:audit?auditScrollViewport:reportScrollViewport;
  const amount=e.deltaMode===1?e.deltaY*20:e.deltaMode===2?e.deltaY*Math.max(1,viewport.h):e.deltaY;
  if(scores)scrollPlayerEditBy(amount);else if(audit)scrollAdminAuditBy(amount);else scrollReportsBy(amount);
  // Keep a boundary wheel gesture inside the canvas modal instead of letting
  // it scroll/overscroll the surrounding browser page.
  if((scores?peScrollMax:audit?auditScrollMax:reportScrollMax)>0)e.preventDefault();
},{passive:false});
cv.addEventListener('mousedown', e=>{
  // A press can be the first pointer event after tab focus, a resize, or a
  // keyboard-opened Layout Editor. Resolve this event's coordinates directly
  // instead of dragging whichever block the last mousemove happened to touch.
  mouse.x=px(e.clientX); mouse.y=e.clientY;
  if(typeof requireResolvedUsernameForGameplay==='function'&&!requireResolvedUsernameForGameplay()){
    mouse.down=false; resetFireCadence(); e.preventDefault(); return;
  }
  if(tutorialOn && state==='play' && !menuOpen){ const r=cv.getBoundingClientRect();
    mouse.x=(e.clientX-r.left); mouse.y=(e.clientY-r.top);
    if(tutorialClick()){ e.preventDefault(); return; } }
  initAudio();
  if(e.button===0){
    mouse.down=true;
    mouseFireCadence=false;
    if(chestRewardOpen){ chestRewardClick(); return; }
    if(respawnPromptT){ respawnPromptClick(); return; }        // modal
    if(powerMenuOpen){ powerMenuClick(); return; }
    if(mouse.x>=gearRect.x && mouse.x<=gearRect.x+gearRect.w && mouse.y>=gearRect.y && mouse.y<=gearRect.y+gearRect.h){
      toggleMenuFromInput(); return;
    }
    if(menuOpen){ menuClick(); return; }
    if(layoutMode && state==='select' && selPage==='hub'){ layoutMouseDown(); return; }
    if(state==='select'){ clickSelect(); return; }
    if(state==='upgrade'){ clickUpgrade(); return; }
    if(state==='over') return;
    if(state==='play' && utilityOut){
      if(loadout.utility==='medkit') medChannelStart();
      else utilQuick();
      return;
    }
    // Every physical press gets one immediate attempt. Automatic weapons then
    // continue from that shot only while this same press remains held.
    if(state==='play') mouseFireCadence=!!tryFire(false)&&player.reloadEnd<=now;
  } else if(e.button===2 && state==='play'){
    if(practiceMode==='arena'&&!arenaCanAct()){ sfx('dry'); }
    else if(utilityOut){                                 // the visible utility owns RMB, never the hidden melee
      if(loadout.utility==='medkit') medQuick(); else utilQuick();
    }
    else if(WEAPONS[player.cur].melee) meleeAbility();
    else { rmbAim=true; aiming=true; sfx('aim'); }
  }
});
addEventListener('mouseup', e=>{
  layoutMouseUp();
  if(e.button===0){ mouse.down=false; mouseFireCadence=false; dragSlider=null; if(utilityOut) utilRelease(); }
  if(e.button===2 && rmbAim){ rmbAim=false; aiming=false; }
});
cv.addEventListener('contextmenu', e=> e.preventDefault());

/* ---------------- touch controls (twin-stick) ---------------- */
const touchUI = ('ontouchstart' in window) || (navigator.maxTouchPoints>0);
const STICK_R=60;
const MOVE_STICK_HIT_R=STICK_R+18;
const sticks={ move:{id:null,cx:0,cy:0,dx:0,dy:0}, aim:{id:null,cx:0,cy:0,dx:0,dy:0} };
let touchButtons=[], touchWeaponSelectorBounds=null, pressedBtn=null, pressedBtnTouchId=null, menuTouchId=null;
let peScrollTouchId=null,peScrollTouchStartX=0,peScrollTouchStartY=0,peScrollTouchLastY=0,peScrollTouchMoved=false,peScrollTouchKind='';
let tapShootUntil=0, tapAimX=0, tapAimY=0, aimStickId=null, touchUtilityUsed=false, touchFireCadence=false;
function touchMoveStickCenter(){
  // This is the same fixed point painted by drawHUD. Keeping the hit target
  // anchored is important: a field touch aimed at a lower-left enemy must not
  // turn into a floating movement stick at the enemy's screen position.
  const inset=STICK_R+8;
  const xMax=Math.max(inset,W-inset),yMax=Math.max(inset,H-inset);
  return {x:Math.max(inset,Math.min(110,xMax)),y:Math.max(inset,Math.min(H-120,yMax))};
}
function touchPointClaimsMoveStick(x,y){
  const c=touchMoveStickCenter(),dx=x-c.x,dy=y-c.y;
  return dx*dx+dy*dy<=MOVE_STICK_HIT_R*MOVE_STICK_HIT_R;
}
function updateMoveStickTouch(t){
  const st=sticks.move;
  let dx=px(t.clientX)-st.cx,dy=t.clientY-st.cy;
  const m=Math.hypot(dx,dy);
  if(m>STICK_R){dx*=STICK_R/m;dy*=STICK_R/m;}
  st.dx=dx;st.dy=dy;
}
function touchInputHasOwner(){
  return sticks.move.id!==null||aimStickId!==null||pressedBtnTouchId!==null||
    menuTouchId!==null||peScrollTouchId!==null;
}
function resetHeldTouchContacts(clearGeometry=false){
  const ownsMouse=menuTouchId!==null||peScrollTouchId!==null;
  if(menuTouchId!==null&&typeof layoutMouseUp==='function')layoutMouseUp();
  pressedBtn=null;pressedBtnTouchId=null;menuTouchId=null;aimStickId=null;
  touchUtilityUsed=false;tapShootUntil=0;touchFireCadence=false;
  peScrollTouchId=null;peScrollTouchMoved=false;peScrollTouchKind='';
  for(const stick of [sticks.move,sticks.aim]){stick.id=null;stick.dx=0;stick.dy=0;}
  if(ownsMouse){mouse.down=false;dragSlider=null;}
  if(clearGeometry){touchButtons=[];touchWeaponSelectorBounds=null;}
}
function resetHeldGameplayInput(){
  // A click/touch/Enter used to launch a mode must never become gameplay input.
  // Fullscreen changes can swallow the matching release event, so clear every
  // held source explicitly instead of waiting for mouseup/touchend/keyup.
  for(const k in keys) keys[k]=false;
  mouse.down=false; dragSlider=null;
  // Production uses the narrow shared touch boundary. The fallback keeps this
  // reset safe when a single mode embeds/tests it without the surrounding
  // touch section.
  if(typeof resetHeldTouchContacts==='function')resetHeldTouchContacts(true);
  else{
    pressedBtn=null;pressedBtnTouchId=null;menuTouchId=null;aimStickId=null;
    touchUtilityUsed=false;tapShootUntil=0;touchFireCadence=false;
    peScrollTouchId=null;peScrollTouchMoved=false;peScrollTouchKind='';
    for(const stick of [sticks.move,sticks.aim]){stick.id=null;stick.dx=0;stick.dy=0;}
    touchButtons=[];touchWeaponSelectorBounds=null;
  }
  resetFireCadence();
  if(typeof cancelFanTheHammer==='function')cancelFanTheHammer();
  aiming=false; rmbAim=false;
  fireSuppressT=Math.max(fireSuppressT,now+250);
}
function buttonAt(x,y,exactOnly=false){
  // Prefer the exact visible target. Weapon slots are rectangular while the
  // action controls are circular, so an overlapping magnetic margin must
  // never turn a deliberate numbered-slot tap into another action.
  for(const b of touchButtons){
    if(b.w!=null&&b.h!=null){
      if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h) return b;
    } else if((x-b.x)*(x-b.x)+(y-b.y)*(y-b.y)<=b.r*b.r) return b;
  }
  if(exactOnly)return null;
  // Magnet: snap to the nearest button just outside its visible edge, so a
  // hurried tap is still usable without creating overlapping visible buttons.
  let best=null, bd=1e9;
  for(const b of touchButtons){
    let d2,limit;
    if(b.w!=null&&b.h!=null){
      const dx=Math.max(b.x-x,0,x-(b.x+b.w)),dy=Math.max(b.y-y,0,y-(b.y+b.h));
      d2=dx*dx+dy*dy; limit=12;
    } else {
      d2=(x-b.x)*(x-b.x)+(y-b.y)*(y-b.y); limit=b.r+22;
    }
    if(d2<=limit*limit&&d2<bd){bd=d2;best=b;}
  }
  return best;
}
function doButton(k){
  if(k==='rld') startReload();
  else if(k==='swp') cycleWeapon();
  else if(k==='1') switchWeapon(loadout.primary);
  else if(k==='2') switchWeapon(loadout.secondary);
  else if(k==='3') switchWeapon(loadout.melee);
  else if(k==='4') equipUtility();
  else if(k==='e') activateContextAction();
  else if(k==='g') utilQuick();
  else if(k==='med') useStashedMedkit();
  else if(k==='dsh') doDash();
  else if(k==='f') quickMelee();
}
cv.addEventListener('touchstart', e=>{
  e.preventDefault(); initAudio();
  if(typeof requireResolvedUsernameForGameplay==='function'&&!requireResolvedUsernameForGameplay()){
    resetHeldGameplayInput(); return;
  }
  for(const t of e.changedTouches){
    const x=px(t.clientX), y=t.clientY;
    if(tutorialOn&&state==='play'&&!menuOpen){
      mouse.x=x; mouse.y=y;
      if(tutorialClick()) continue;
    }
    if(chestRewardOpen){ mouse.x=x; mouse.y=y; chestRewardClick(); continue; }
    if(respawnPromptT){ mouse.x=x; mouse.y=y; respawnPromptClick(); continue; }
    if(powerMenuOpen){ mouse.x=x; mouse.y=y; powerMenuClick(); continue; }
    if(x>=gearRect.x&&x<=gearRect.x+gearRect.w&&y>=gearRect.y&&y<=gearRect.y+gearRect.h){
      toggleMenuFromInput(); continue;
    }
    const scrollModal=typeof topModal==='function'?topModal():null;
    const scoreScroll=scrollModal&&scrollModal.k==='scores'&&playerEditScrollContains(x,y);
    const auditScroll=scrollModal&&scrollModal.k==='audit'&&adminAuditScrollContains(x,y);
    const reportScrollHit=scrollModal&&scrollModal.k==='updates'&&reportScrollContains(x,y);
    if(!menuOpen&&peScrollTouchId===null&&(scoreScroll||auditScroll||reportScrollHit)){
      // Defer the row click until touchend. Otherwise beginning a swipe on a
      // +/- weapon button would award/remove it before we know it is a drag.
      mouse.x=x; mouse.y=y; mouse.down=true; peScrollTouchId=t.identifier;
      peScrollTouchKind=scoreScroll?'scores':auditScroll?'audit':'updates';
      peScrollTouchStartX=x; peScrollTouchStartY=y; peScrollTouchLastY=y; peScrollTouchMoved=false;
      continue;
    }
    if(peScrollTouchId!==null&&scrollModal&&scrollModal.k===peScrollTouchKind) continue;
    if(state!=='play' || menuOpen){
      if(menuTouchId!==null)continue;
      mouse.x=x; mouse.y=y; mouse.down=true; menuTouchId=t.identifier;
      if(menuOpen) menuClick();
      else if(state==='select'&&layoutMode&&selPage==='hub') layoutMouseDown();
      else if(state==='select') clickSelect();
      else if(state==='upgrade') clickUpgrade();
      else if(state==='over') startGame();
      continue;
    }
    // An exact painted button remains stronger than every forgiving control
    // margin, including the movement stick's slightly enlarged hit target.
    const exactButton=buttonAt(x,y,true);
    if(exactButton){
      if(pressedBtnTouchId===null){pressedBtn=exactButton.key;pressedBtnTouchId=t.identifier;}
      doButton(exactButton.key);continue;
    }
    // Only the visible, fixed bottom-left control owns movement. The old
    // quadrant-wide target captured ordinary lower-left aim touches and then
    // moved the joystick underneath them. Resolve this before the buttons'
    // forgiving magnetic margins so the visible stick always keeps its area.
    if(touchPointClaimsMoveStick(x,y)){
      if(sticks.move.id===null){
        const c=touchMoveStickCenter();
        sticks.move.id=t.identifier;sticks.move.cx=c.x;sticks.move.cy=c.y;
        updateMoveStickTouch(t);
      }
      continue;
    }
    const b=buttonAt(x,y);
    if(b){
      if(pressedBtnTouchId===null){pressedBtn=b.key;pressedBtnTouchId=t.identifier;}
      doButton(b.key);continue;
    }
    // anywhere else on the field: tap to aim + shoot there
    // One pointer owns aim until its own end/cancel. A second field finger
    // cannot steal it, so movement + aim remains stable under multi-touch.
    if(aimStickId!==null)continue;
    const wp=screenToWorld(x,y);
    tapAimX=wp.x; tapAimY=wp.y;
    mouse.x=x; mouse.y=y;
    tapShootUntil=now+220;              // brief fire window per tap
    aimStickId=t.identifier;            // drag to keep firing along the finger
    touchUtilityUsed=false;
    touchFireCadence=false;
    if(utilityOut){
      if(loadout.utility==='medkit') medChannelStart(); else utilQuick();
      touchUtilityUsed=true;
    } else touchFireCadence=!!tryFire(false)&&player.reloadEnd<=now;
  }
},{passive:false});
cv.addEventListener('touchmove', e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    if(t.identifier===peScrollTouchId){
      const x=px(t.clientX),y=t.clientY;
      mouse.x=x; mouse.y=y;
      if(!peScrollTouchMoved&&Math.hypot(x-peScrollTouchStartX,y-peScrollTouchStartY)>=7){
        peScrollTouchMoved=true;
        if(peScrollTouchKind==='scores')scrollPlayerEditBy(peScrollTouchStartY-y);else if(peScrollTouchKind==='audit')scrollAdminAuditBy(peScrollTouchStartY-y);else scrollReportsBy(peScrollTouchStartY-y);
      } else if(peScrollTouchMoved){
        if(peScrollTouchKind==='scores')scrollPlayerEditBy(peScrollTouchLastY-y);else if(peScrollTouchKind==='audit')scrollAdminAuditBy(peScrollTouchLastY-y);else scrollReportsBy(peScrollTouchLastY-y);
      }
      peScrollTouchLastY=y;
      continue;
    }
    if(t.identifier===menuTouchId){
      mouse.x=px(t.clientX); mouse.y=t.clientY;
      if(layoutMode&&state==='select'&&selPage==='hub') layoutMouseMove();
      else if(dragSlider) setSliderFromMouse();
      continue;
    }
    if(t.identifier===aimStickId){
      const sx=px(t.clientX), sy=t.clientY;
      const wp=screenToWorld(sx,sy);
      tapAimX=wp.x; tapAimY=wp.y; mouse.x=sx; mouse.y=sy;
      tapShootUntil=now+220;
      continue;
    }
    const st=sticks.move;
    if(st.id===t.identifier){
      updateMoveStickTouch(t);
    }
  }
},{passive:false});
function touchEnd(e,cancelled){
  e.preventDefault();
  for(const t of e.changedTouches){
    if(t.identifier===peScrollTouchId){
      const modal=typeof topModal==='function'?topModal():null;
      const tap=!cancelled&&!peScrollTouchMoved&&modal&&modal.k===peScrollTouchKind&&
        (peScrollTouchKind==='scores'?playerEditScrollContains(peScrollTouchStartX,peScrollTouchStartY):
          peScrollTouchKind==='audit'?adminAuditScrollContains(peScrollTouchStartX,peScrollTouchStartY):
          reportScrollContains(peScrollTouchStartX,peScrollTouchStartY));
      peScrollTouchId=null; peScrollTouchMoved=false;peScrollTouchKind='';mouse.down=false;
      if(tap){ mouse.x=peScrollTouchStartX; mouse.y=peScrollTouchStartY; clickSelect(); }
      continue;
    }
    if(t.identifier===menuTouchId){ layoutMouseUp(); menuTouchId=null; mouse.down=false; dragSlider=null; }
    if(t.identifier===pressedBtnTouchId){pressedBtnTouchId=null;pressedBtn=null;}
    if(t.identifier===aimStickId){ aimStickId=null; touchUtilityUsed=false; touchFireCadence=false; tapShootUntil=0; }
    if(sticks.move.id===t.identifier){ sticks.move.id=null; sticks.move.dx=0; sticks.move.dy=0; }
  }
}
cv.addEventListener('touchend',e=>touchEnd(e,false),{passive:false});
cv.addEventListener('touchcancel',e=>touchEnd(e,true),{passive:false});
// Rotation/resizing changes the fixed control's geometry. Release ownership
// instead of applying a stale center to the next move event. Visibility loss
// covers mobile app switching where the browser may omit touchcancel.
function resetTouchInputForViewportChange(){
  if(!touchUI)return;
  if(touchInputHasOwner())resetHeldGameplayInput();
  else{touchButtons=[];touchWeaponSelectorBounds=null;}
}
addEventListener('resize',resetTouchInputForViewportChange);
addEventListener('orientationchange',resetTouchInputForViewportChange);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&touchInputHasOwner())resetHeldGameplayInput();
});
addEventListener('blur', ()=>{
  const localArena=isBotArena()||(typeof isLocalCpu2v2==='function'&&isLocalCpu2v2());
  if(state==='play'&&(practiceMode!=='arena'||localArena)) menuOpen=true;
  resetHeldGameplayInput();
});

function pickWeapon(k){
  if(isLocked(k)){ sfx('dry'); utilLockMsgT=now+2200; return; }
  if(UTILKEYS.includes(k) || TEMP_UTILITY.includes(k)){
    if(pendingGameMode==='arena'&&typeof casualArenaUtilityKey==='function'&&casualArenaUtilityKey(k,true)!==k){
      sfx('dry');utilLockMsgT=now+2200;return;
    }
    loadout.utility = loadout.utility===k ? null : k;
    rememberLoadoutSlot('utility',loadout.utility);
    sfx('swap'); return;
  }
  const slot = (PRIMARIES.includes(k)||TEMP_PRIMARY.includes(k)) ? 'primary'
             : (SECONDARIES.includes(k)||TEMP_SECONDARY.includes(k)) ? 'secondary' : 'melee';
  if(loadout[slot]===k){ loadout[slot]=null; rememberLoadoutSlot(slot,null); sfx('swap'); return; }
  loadout[slot]=k; rememberLoadoutSlot(slot,k); sfx('swap');
}
let utilLockMsgT=0;
// bottom to top: the LAST open one is what the player sees, so it gets the click.
// keeping one list for both drawing and clicking is what stops CLOSE landing on a hidden screen.
const MODALS=[
  {k:'adminPanel', is:()=>adminPanelOpen,  draw:()=>drawAdminPanel(),  click:()=>adminPanelClick()},
  {k:'aiLearning', is:()=>aiLearningOpen, draw:()=>drawAiLearning(), click:()=>aiLearningClick()},
  {k:'updates',    is:()=>updatesOpen,     draw:()=>drawUpdates(),     click:()=>updatesClick()},
  {k:'admins',     is:()=>adminsOpen,      draw:()=>drawAdminsMenu(),  click:()=>adminsClick()},
  {k:'requests',   is:()=>requestsOpen,    draw:()=>drawAdminRequests(),click:()=>adminRequestsClick()},
  {k:'weaponSuggestions',is:()=>weaponSuggestionsOpen,draw:()=>drawWeaponSuggestions(),click:()=>weaponSuggestionsClick()},
  {k:'msgs',       is:()=>msgsOpen,        draw:()=>{ if(composePickOpen) drawComposePick(); else drawMsgs(); },
                                           click:()=>msgsClick()},
  {k:'audit',      is:()=>auditOpen,       draw:()=>drawAdminAuditLog(),click:()=>adminAuditClick()},
  {k:'promos',     is:()=>promoAdminOpen,  draw:()=>drawPromoAdmin(),  click:()=>promoAdminClick()},
  {k:'players',    is:()=>playersOpen,     draw:()=>drawPlayers(),     click:()=>playersClick()},
  {k:'scores',     is:()=>scoresOpen,      draw:()=>drawScores(),      click:()=>scoresClick()},
  {k:'archive',    is:()=>archOpen,        draw:()=>drawArchive(),     click:()=>archClick()},
  {k:'storage',    is:()=>storageOpen,     draw:()=>drawStorage(),     click:()=>storageClick()},
  {k:'weaponEdit', is:()=>weaponEditOpen,  draw:()=>drawWeaponEdit(),  click:()=>weaponEditClick()},
  {k:'wheel',      is:()=>wheelOpen,       draw:()=>drawWheel(),       click:()=>wheelClick()},
  {k:'practice',   is:()=>practicePickOpen,draw:()=>drawPracticePick(),click:()=>practicePickClick()},
  {k:'reader',     is:()=>readerOpen,      draw:()=>drawReader(),      click:()=>readerClick()},
];
function topModal(){
  for(let i=MODALS.length-1;i>=0;i--) if(MODALS[i].is()) return MODALS[i];
  return null;
}
function clickSelect(){
  const inR=r=>r&&mouse.x>=r.x&&mouse.x<=r.x+r.w&&mouse.y>=r.y&&mouse.y<=r.y+r.h;
  const openBoardPlayer=r=>{
    const mine=authUser&&String(r.userId||'')===String(authUser.id||'');
    if(r.needsUsername&&mine){
      scoresOpen=false; resetPlayerEditScroll(); selPage='social';
      if(socialProfile) socialPromptEditProfile();
      else void Promise.resolve(fetchSocial(true)).then(()=>{ if(authUser&&socialProfile) socialPromptEditProfile(); });
      sfx('swap'); return;
    }
    // This row already came from the narrow public leaderboard RPC, so it is
    // the authoritative public snapshot. Reusing it avoids a fragile second
    // request that used to turn a valid click into "player not found".
    resetPlayerEditScroll(); scoresOpen=true; peStep='panel'; peMode='edit'; peTarget=r.name;
    peData=normalizedPlayerData({high_score:r.score,public_metric:r.metric},true);
    peEdit={score:peData.score,gems:0,coins:0,owned:{},pow:{}};
    peBusy=false; sfx('swap');
  };
  const top=topModal();
  if(top){ top.click(); return; }                    // whatever is on top owns the click
  if(banBlocksPlay()){ banPageClick(); return; }     // nothing else is reachable while blocked
  if(dailyGateOpen){ dailyGateClick(); return; }
  if(firstAccountWelcomeOpen){ firstAccountWelcomeClick(); return; }
  if(signUpPromptOpen){ signUpPromptClick(); return; }
  const accountRect=accountBtnRect||signBtnRect;
  if(accountRect&&inR(accountRect)&&!adminPanelOpen&&!updatesOpen&&!adminsOpen&&!msgsOpen&&!auditOpen&&!archOpen&&!storageOpen&&!scoresOpen&&!detailKey){
    if(state==='select'){
      if(typeof cancelCpuLaunchIntent==='function')cancelCpuLaunchIntent();
      else if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();
    }
    activateAccountTrigger();sfx('swap');return;
  }
  // ADMIN / UPDATES live beside the gear, so they work from any select page
  if(selPage==='hub'){
    for(const xr of feedXRects){ if(inR(xr)){ deleteBanner(xr.id); sfx('dry'); return; } }
    for(const rr of (typeof feedReadRects!=='undefined'?feedReadRects:[])){if(inR(rr)){const b=rr.b||{};openReader(String(b.heading||b.message||'OFFICIAL UPDATE'),String(b.created_at||'OUTPOST ZERO · OFFICIAL'),String(b.details||b.message||''),'public');sfx('swap');return;}}
  }
  if(isAdmin() && inR(adminHubBtnRect)){ adminPanelOpen=true; fetchAdmins(); fetchBanners(); sfx('swap'); return; }
  if(isMainAdmin() && inR(adminsHubBtnRect)){ adminsOpen=true; fetchAdmins(); sfx('swap'); return; }
  if(isAdmin() && inR(msgsHubBtnRect)){ inboxTab='msgs';msgsOpen=true; fetchMsgs().then(ok=>{if(ok)markMsgsRead();}); sfx('swap'); return; }
  if(isMainAdmin()&&inR(suggestionsHubBtnRect)){openSuggestionsSection('reports');sfx('swap');return;}
  if(detailKey){
    if(inR(detailRects.close) || !inR(detailRects.panel)){ detailKey=null; sfx('swap'); }
    return;
  }
  // details arrows (only on a category page)
  for(const b of detailBtns){ if(inR(b)){ detailKey=b.key; sfx('aim'); return; } }
  if(selPage==='hub'){
    for(const r of leaderboardRowRects) if(inR(r)){
      openBoardPlayer(r); return;
    }
    if(inR(adLeftRect)){ try{ window.open(adLeftRect.url,'_blank','noopener'); }catch(e){} sfx('swap'); return; }
    if(inR(adRightRect)){ try{ window.open(adRightRect.url,'_blank','noopener'); }catch(e){} sfx('swap'); return; }
    if(inR(promoBtnRect)){ openPromo(); sfx('swap'); return; }
    if(inR(shareBtnRect)){ shareReferral(); return; }
    if(inR(wheelBtnRect)){ openWheel(); sfx('swap'); return; }
    if(inR(streakBtnRect)){ collectStreak(); return; }
    if(inR(lookupBtnRect)){ resetPlayerEditScroll(); if(canUsePlayerTools()){ playersOpen=true; playersTab='lookup'; fetchPlayersData(); if(isMainAdmin()) fetchScoreReqs(); } else { scoresOpen=true; peStep='choose'; peData=null; peMode='edit'; } sfx('swap'); return; }
    for(const r of homePlayRects) if(inR(r)){
      if(!r.enabled){ sfx('dry'); return; }
      if(r.id==='play') openModeLeaderboard();
      else if(r.id==='practice'){ selPage='practice'; sfx('swap'); }
      else if(r.id==='weapons'){ selPage='weapons'; sfx('swap'); }
      else if(r.id==='social'){ selPage='social'; fetchSocial(true); sfx('swap'); }
      return;
    }
    if(inR(tutBtnRect)){ selPage='howto'; sfx('swap'); return; }
    if(inR(settingsBtnRect)){ openAccountSettings(); sfx('swap'); return; }
    if(inR(shopBtnRect)){ selPage='shop'; sfx('swap'); return; }
    return;
  }
  if(selPage==='weapons'){
    if(inR(backRect)){ navigateSelectBack(); return; }
    for(const r of weaponBrowserRects) if(r.kind==='category'&&inR(r)){
      weaponBrowserCat=r.cat; selPage='weaponbrowse'; sfx('swap'); return;
    }
    return;
  }
  if(selPage==='weaponbrowse'){
    if(inR(backRect)){ navigateSelectBack(); return; }
    for(const r of weaponBrowserRects) if(r.kind==='tab'&&inR(r)){
      weaponBrowserCat=r.cat; sfx('swap'); return;
    }
    for(const r of weaponBrowserRects) if(r.kind==='practice'&&inR(r)){
      openPracticePick(r.key); sfx('swap'); return;
    }
    for(const r of weaponBrowserRects) if(r.kind==='detail'&&inR(r)){
      detailKey=r.key; sfx('aim'); return;
    }
    return;
  }
  if(selPage==='modes'){
    if(inR(backRect)){ navigateSelectBack(); return; }
    for(const r of modeRects) if(inR(r)){ openModeLeaderboard(r.id); return; }
    return;
  }
  if(selPage==='modeboard'){
    for(const r of leaderboardRowRects) if(inR(r)){ openBoardPlayer(r); return; }
    if(inR(backRect)){ navigateSelectBack(); return; }
    for(const r of modeBoardActionRects) if(inR(r)){
      if(r.enabled===false){
        if(r.id==='ranked'){
          modeBoardNotice='COMING SOON'; modeBoardNoticeT=performance.now()+2800;
          sfx('dry'); return;
        }
        if(r.mode&&!partyAllowsQueue(r.mode)) return;
        sfx('dry'); return;
      }
      if(r.id==='ranked') {
        // Fail closed even if a stale cached draw rect still marks Ranked as enabled.
        modeBoardNotice='COMING SOON'; modeBoardNoticeT=performance.now()+2800;
        sfx('dry');
      }
      else if(r.id==='party_menu'||r.id==='party_open') { selPage='social'; fetchSocial(true); sfx('swap'); }
      // Legacy ids remain routable for older cached canvases, but the live
      // Play dashboard always enters the dedicated Party menu first.
      else if(r.id==='party_create') partyPromptCreate();
      else if(r.id==='party_join') partyPromptJoin();
      else if(r.id==='offline_cpu_menu') { offlineCpuView='modes';offlineCpuInfoKey='';offlineCpuFocusId='cpu_root_1v1';offlineCpuKeyboardActive=false;selPage='offlinecpu'; if(typeof refreshBotLadder==='function')void refreshBotLadder(true); if(typeof refreshActiveBotModel==='function')void refreshActiveBotModel(true); sfx('swap'); }
      else chooseGameMode(r.mode,'modeboard');
      return;
    }
    return;
  }
  if(selPage==='offlinecpu'){
    if(inR(backRect)){ navigateSelectBack(); return; }
    for(const r of offlineCpuRects) if(inR(r)){
      offlineCpuKeyboardActive=false;activateOfflineCpuAction(r);return;
    }
    return;
  }
  if(selPage==='ranked'){
    if(inR(backRect)){ navigateSelectBack(); return; }
    for(const r of rankedRects) if(inR(r)){
      if(!r.enabled){
        if(r.mode&&!partyAllowsQueue(r.mode)) return;
        sfx('dry'); return;
      }
      if(r.id==='signin') toggleAuth();
      return;
    }
    return;
  }
  if(selPage==='social'){
    for(const r of socialRects) if(inR(r)){
      if(!r.enabled){ sfx('dry'); return; }
      if(r.id==='back'){ selPage='hub'; sfx('swap'); }
      else if(r.id==='signin') toggleAuth();
      else if(r.id==='social_view_friends'){ socialView='friends'; if(typeof socialClosePrivateConversation==='function')socialClosePrivateConversation(); sfx('swap'); }
      else if(r.id==='social_view_inbox'){ socialView='inbox'; sfx('swap'); }
      else if(r.id==='social_view_party'){ socialView='party'; if(typeof partyPublicRefresh==='function')void partyPublicRefresh(true); sfx('swap'); }
      else if(r.id==='player_profile'&&typeof socialOpenPlayerProfile==='function'){void socialOpenPlayerProfile(r.userId,r.handle);}
      else if(r.id==='social_retry') fetchSocial(true);
      else if(r.id==='inbox_refresh'){ if(typeof fetchBanners==='function')fetchBanners(); if(authUser){fetchSocial(true);if(typeof socialPollPartyInvites==='function')void socialPollPartyInvites(true);if(typeof socialPollNotifications==='function')void socialPollNotifications(true);} sfx('swap'); }
      else if(r.id==='inbox_load_older'&&typeof socialLoadOlderNotifications==='function'){void socialLoadOlderNotifications();sfx('swap');}
      else if(r.id==='friend_add') socialPromptAddFriend();
      else if(r.id==='friend_accept') socialAcceptFriend(r.rowId);
      else if(r.id==='friend_block') socialBlockFriend(r.rowId);
      else if(r.id==='friend_remove') socialRemoveFriend(r.rowId);
      else if(r.id==='friend_prev'){ socialFriendPage=Math.max(0,socialFriendPage-1); sfx('swap'); }
      else if(r.id==='friend_next'){ socialFriendPage++; sfx('swap'); }
      else if(r.id==='friend_bucket_prev'&&socialFriendPages[r.section]!==undefined){ socialFriendPages[r.section]=Math.max(0,socialFriendPages[r.section]-1); sfx('swap'); }
      else if(r.id==='friend_bucket_next'&&socialFriendPages[r.section]!==undefined){ socialFriendPages[r.section]++; sfx('swap'); }
      else if(r.id==='official_update_open'&&typeof openReader==='function'){ openReader(String(r.title||'OFFICIAL UPDATE'),String(r.meta||'OUTPOST ZERO · OFFICIAL'),String(r.body||''),'public'); sfx('swap'); }
      else if(r.id==='inbox_notice_open'&&typeof socialOpenNotification==='function'){ socialOpenNotification(r.noticeKey); sfx('swap'); }
      else if(r.id==='inbox_section_inbox'){socialInboxSection='inbox';socialMessagePage=0;if(typeof socialClosePrivateConversation==='function')socialClosePrivateConversation();sfx('swap');}
      else if(r.id==='inbox_section_archive'){socialInboxSection='archive';socialMessagePage=0;if(typeof socialClosePrivateConversation==='function')socialClosePrivateConversation();sfx('swap');}
      else if(r.id==='inbox_conversation_open'&&typeof socialOpenPrivateConversation==='function'){socialOpenPrivateConversation(r.conversationKey);sfx('swap');}
      else if(r.id==='conversation_back'&&typeof socialClosePrivateConversation==='function'){socialClosePrivateConversation();sfx('swap');}
      else if(r.id==='conversation_prev'){socialConversationPage=Math.max(0,socialConversationPage-1);sfx('swap');}
      else if(r.id==='conversation_next'){socialConversationPage++;sfx('swap');}
      else if(r.id==='conversation_reply'&&typeof openSocialMessageCompose==='function'){openSocialMessageCompose(r.userId,r.handle);sfx('swap');}
      else if(r.id==='conversation_archive'&&typeof socialConversationPeerByUiKey==='function'&&typeof socialPersistConversationAction==='function'){
        const peer=socialConversationPeerByUiKey(r.conversationKey);if(peer)void socialPersistConversationAction(peer,'archive');
      }
      else if(r.id==='conversation_restore'&&typeof socialConversationPeerByUiKey==='function'&&typeof socialPersistConversationAction==='function'){
        const peer=socialConversationPeerByUiKey(r.conversationKey);if(peer)void socialPersistConversationAction(peer,'inbox');
      }
      else if(r.id==='conversation_delete'&&typeof socialPromptDeleteConversation==='function'){socialPromptDeleteConversation(r.conversationKey,r.handle);}
      else if(r.id==='inbox_message_open'&&typeof socialOpenInboxMessage==='function'){ socialOpenInboxMessage(r.messageKey); sfx('swap'); }
      else if(r.id==='inbox_message_reply'){
        if(!authUser){ toggleAuth(); return; }
        const directRow=r.messageKey&&typeof socialPrivateMessageByUiKey==='function'?socialPrivateMessageByUiKey(r.messageKey):null;
        const to=typeof r.replyTo==='string'&&r.replyTo?r.replyTo:(directRow?String(directRow.sender_id||directRow.recipient_id||''):null);
        if(typeof openSocialMessageCompose==='function'&&to){ const handle=String(r.replyHandle||'friend'); openSocialMessageCompose(to,handle); }
        sfx('swap');
      }
      else if(r.id==='friend_message'||r.id==='dm_reply') openSocialMessageCompose(r.userId,r.handle);
      else if(r.id==='cpu_invite_play'&&typeof partyJoinCpuInvite==='function'){
        const joined=partyJoinCpuInvite(r.invite);if(joined&&typeof socialPrivateMessageByUiKey==='function'&&typeof socialHandleLegacyInvite==='function')socialHandleLegacyInvite(socialPrivateMessageByUiKey(r.messageKey));
      }
      else if(r.id==='party_invite_join'&&typeof partyJoinFriendInvite==='function'){
        const joined=partyJoinFriendInvite(r.invite);if(joined&&typeof socialPrivateMessageByUiKey==='function'&&typeof socialHandleLegacyInvite==='function')socialHandleLegacyInvite(socialPrivateMessageByUiKey(r.messageKey));
      }
      else if(r.id==='cloud_party_invite_accept'&&typeof socialClaimAndJoinPartyInvite==='function') void socialClaimAndJoinPartyInvite(r.inviteKey);
      else if(r.id==='cpu_direct_return'){selPage='offlinecpu';offlineCpuView='2v2';offlineCpuInfoKey='';sfx('swap');}
      else if(r.id==='dm_new') socialPromptMessage();
      else if(r.id==='dm_prev'){ socialMessagePage=Math.max(0,socialMessagePage-1); sfx('swap'); }
      else if(r.id==='dm_next'){ socialMessagePage++; sfx('swap'); }
      else if(r.id==='party_create') partyPromptCreate();
      else if(r.id==='party_create_new'&&typeof partyCreateFromDirectory==='function') partyCreateFromDirectory();
      else if(r.id==='party_join') partyPromptJoin();
      else if(r.id==='party_invite_friend'&&typeof partyPromptFriendInvite==='function') partyPromptFriendInvite();
      else if(r.id==='party_open'){ selPage='party'; sfx('swap'); }
      else if(r.id==='party_copy') partyCopyCode();
      else if(r.id==='public_party_request'&&typeof partyPublicRequest==='function')void partyPublicRequest(r.partyId);
      else if(r.id==='public_party_join'&&typeof partyPublicJoinAccepted==='function')partyPublicJoinAccepted(r.requestId);
      else if(r.id==='public_party_accept'&&typeof partyPublicDecide==='function')void partyPublicDecide(r.requestId,true);
      else if(r.id==='public_party_decline'&&typeof partyPublicDecide==='function')void partyPublicDecide(r.requestId,false);
      else if(r.id==='public_party_refresh'&&typeof partyPublicRefresh==='function')void partyPublicRefresh(true);
      else if(r.id==='public_party_search'&&typeof partyPublicPromptSearch==='function')partyPublicPromptSearch();
      else if(r.id==='public_party_prev'){publicPartyPage=Math.max(0,publicPartyPage-1);sfx('swap');}
      else if(r.id==='public_party_next'){publicPartyPage++;sfx('swap');}
      return;
    }
    return;
  }
  if(selPage==='party'){
    for(const r of partyRects) if(inR(r)){
      if(!r.enabled){
        if(r.id==='browse') partyRequirePlayers();
        else sfx('dry');
        return;
      }
      if(r.id==='create') partyPromptCreate();
      else if(r.id==='join') partyPromptJoin();
      else if(r.id==='back'){
        // Returning to Social must never dissolve an accepted Party.
        if(!party.accepted&&party.channel) leaveParty('',false);
        if(party.accepted&&party.cpuIntent){selPage='offlinecpu';offlineCpuView='2v2';offlineCpuInfoKey='';sfx('swap');}
        else{selPage='social';fetchSocial(true);sfx('swap');}
      }
      else if(r.id==='leave'){
        const cpuOrigin=!!party.cpuIntent;leaveParty('',false);
        if(cpuOrigin){selPage='offlinecpu';offlineCpuView='2v2';offlineCpuInfoKey='';}else{selPage='social';fetchSocial(true);}sfx('swap');
      }
      else if(r.id==='browse') {
        if(!partyRequirePlayers()) return;
        // The old lobby exposed a dedicated cancel button. PLAY now safely
        // clears a stale setup/waiting session before opening the simple chooser.
        if(partyCpuSessionOpen()) partyCpuAbort('Party CPU match setup was cancelled.',true);
        selPage='partymodes'; sfx('swap');
      }
      else if(r.id==='cpu2v2') { if(partyCpuSessionOpen()) partyCpuAbort('Party CPU match setup was cancelled.',true); else partyCpuHostPrepare(); }
      else if(r.id==='invite_cpu_friend') partyPromptCpuFriendInvite();
      else if(r.id==='copy') partyCopyCode();
      else if(r.id==='mode') partySetMode(r.mode);
      else if(r.id==='lock') partyToggleLock();
      else if(r.id==='ready') partyToggleReady();
      else if(r.id==='member_prev'||r.id==='member_next') partyMoveMember(r.memberId,r.dir);
      else if(r.id==='kick') partyKickMember(r.memberId);
      else if(r.id==='member_profile'&&typeof socialOpenPlayerProfile==='function')void socialOpenPlayerProfile('',r.handle);
      else if(r.id==='chat_open'){ party.chatOpen=true; sfx('swap'); }
      else if(r.id==='chat_close'){ party.chatOpen=false; sfx('swap'); }
      else if(r.id==='chat_send') partyPromptChat();
      else if(r.id==='chat_toggle') partyToggleChat();
      else if(r.id==='chat_up') partyChatScroll(-1);
      else if(r.id==='chat_down') partyChatScroll(1);
      return;
    }
    return;
  }
  if(selPage==='partymodes'){
    for(const r of partyModeRects) if(inR(r)){
      if(r.id==='party_modes_back'){ selPage=party.accepted?'party':'social'; sfx('swap'); }
      else if(r.id==='party_mode_existing'){
        if(!party.accepted){ party.status='PARTY CONNECTION LOST'; selPage='party'; sfx('dry'); return; }
        if(!partyRequirePlayers()) return;
        modeBoardOrigin='party'; selPage='modeboard'; fetchBoard(); sfx('swap');
      }
      else if(r.id==='party_mode_1v1v1') partyChooseSetupMode('1v1v1');
      else if(r.id==='party_mode_1v1') partyChooseSetupMode('1v1');
      else if(r.id==='party_mode_2v2') partyChooseSetupMode('2v2');
      return;
    }
    return;
  }
  if(selPage==='loadout'){
    if(inR(backRect)){ navigateSelectBack(); return; }
    for(const c of catBtns) if(inR(c)){
      // A signed-in CPU deploy may still be awaiting its canonical ladder/model
      // read. Opening the editor is a new launch intent; invalidate the old
      // callback so returning here cannot auto-deploy a changed loadout.
      if(typeof cancelCpuLaunchIntent==='function')cancelCpuLaunchIntent();
      else if(typeof cancelBotLadderLaunch==='function')cancelBotLadderLaunch();
      selPage=c.cat; sfx('swap'); return;
    }
    if(inR(deployRect)){ launchSelectedMode(); return; }
    return;
  }
  if(selPage==='arena'){ arenaClick(); return; }
  // category / tutorial / shop pages
  if(inR(backRect)){ navigateSelectBack(); return; }
  // shop: tabs, weapon picker arrows, then buy/equip rects
  if(selPage==='howto'){ howToClick(); return; }
  if(selPage==='shop'){
  for(const r of shopTabRects){ if(inR(r)){ shopTab=r.tab; sfx('swap'); return; } }
  if(shopTab==='anims'){
    const pk=WKEYS.filter(k=>!isLocked(k));
    if(inR(animPrevRect)){ const i=pk.indexOf(shopAnimWeapon); shopAnimWeapon=pk[(i-1+pk.length)%pk.length]; sfx('swap'); return; }
    if(inR(animNextRect)){ const i=pk.indexOf(shopAnimWeapon); shopAnimWeapon=pk[(i+1)%pk.length]; sfx('swap'); return; }
  }
  if(shopTab==='cosmetics'){
    const pickable=WKEYS.filter(k=>!isLocked(k));
    if(inR(cosPrevRect)){ const i=pickable.indexOf(shopCosWeapon); shopCosWeapon=pickable[(i-1+pickable.length)%pickable.length]; sfx('swap'); return; }
    if(inR(cosNextRect)){ const i=pickable.indexOf(shopCosWeapon); shopCosWeapon=pickable[(i+1)%pickable.length]; sfx('swap'); return; }
  }
  // buttons first: the whole-row expand target must never swallow a BUY
  for(const r of shopRects){ if(r.kind!=='expand' && inR(r)){
    if(r.kind==='cosmetic') buyCosmetic(r.wkey, r.cos);
    else if(r.kind==='anim') buyAnim(r.anim, r.wkey);
    else if(r.kind==='powerup') buyPowerup(r.pu);
    else buyGem(r.item);
    return;
  } }
  for(const r of shopRects){ if(inR(r)){
    if(r.kind==='cosmetic') buyCosmetic(r.wkey, r.cos);
    else if(r.kind==='expand'){ shopExpanded = (shopExpanded===r.item.key) ? null : r.item.key; sfx('swap'); }
    else if(r.kind==='anim') buyAnim(r.anim, r.wkey);
    else if(r.kind==='powerup') buyPowerup(r.pu);
    else buyGem(r.item);
    return;
  } }
  }
  if(selPage==='practice'){
    // Tracking controls overlap the mode card, so give them click priority.
    for(const r of practiceRects){ if(r.action&&inR(r)){
      if(r.action==='tracking-speed') adjustPracticeTrackingSpeed(r.delta);
      else if(r.action==='tracking-direction') adjustPracticeTrackingDirection(r.delta);
      sfx('swap'); return;
    } }
    for(const r of practiceRects){ if(r.mode&&inR(r)){
      restoreLastLoadoutForMode('practice');
      pendingPractice=r.mode; pendingGameMode='practice'; selPage='loadout'; sfx('swap'); return;
    } }
  }
  for(const r of cardRects){                      // PRACTICE + BUY IN SHOP take priority over equipping
    if(r.tryIt && inR(r)){ openPracticePick(r.key); sfx('swap'); return; }
  }
  for(const r of cardRects){
    if(r.gotoShop && inR(r)){ selPage='shop'; shopTab='weapons'; sfx('swap'); return; }
  }
  for(const r of cardRects){
    if(inR(r)){
      if(r.gotoShop){ selPage='shop'; shopTab='weapons'; sfx('swap'); return; }   // BUY IN SHOP
      pickWeapon(r.key); return;   // stays on page so you can compare
    }
  }
}
