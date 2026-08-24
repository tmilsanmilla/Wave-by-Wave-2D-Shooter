"use strict";

// ---- account progress sync: purchases + currency live with the account, not the device ----
let profileLoaded=false, profileSaveT=0, profilePending=false;
let currentLoginAt='';
function metaPayload(){
  return {gems, gv:GEM_ECONOMY_VERSION, gre:gemResetVersion, coins, device:deviceId(), stk:streakDays, stkMax:streakLongest, stkDay:streakLastDay, refUsed:referralUsed, refPaid:referralPaid, wr:wheelReady, wa:Math.round(wheelAcc),
          date:tasksDate, tasks:dailyTasks, owned:gemOwned, cos:cosmeticOwned, cosEq:cosmeticEquipped,
          pow:powerStock, anim:animOwned, animEq:animEquipped,
          hi:hiScore, mv:musicVol, sv:sfxVol, onboardV:onboardingVersion};
}
function publicProfilePayload(){
  return {
    v:1, email:String((authUser&&authUser.email)||'').toLowerCase(), display:displayName(authUser),
    lastLogin:currentLoginAt||new Date().toISOString(), gems, gre:gemResetVersion, coins, streak:streakDays, longestStreak:streakLongest, highScore:hiScore,
    owned:Object.keys(gemOwned).filter(k=>gemOwned[k]),
    powerups:Object.fromEntries(Object.entries(powerStock).filter(([,v])=>v>0)),
    cosmetics:Object.keys(cosmeticOwned).filter(k=>cosmeticOwned[k]).length,
    animations:Object.keys(animOwned).filter(k=>animOwned[k]).length,
    daily:dailyTasks.map(t=>({id:t.id,prog:t.prog,goal:t.goal,done:!!t.done})),
    wheelSpins:wheelReady
  };
}
async function publishPublicProfile(isLogin){
  if(!sb||!authUser) return;
  if(isLogin||!currentLoginAt) currentLoginAt=new Date().toISOString();
  try{
    const {error}=await sb.from('scores').upsert({user_id:authUser.id,
      name:JSON.stringify(publicProfilePayload()), game:'outpost-zero-profile',
      score:Math.floor(Date.parse(currentLoginAt)/1000)},{onConflict:'user_id,game'});
    if(error) throw error;
  }catch(e){ console.warn('public profile update failed',e); }
}
function applyProfile(m){
  if(!m) return;
  // the account is the source of truth for what you own: a purchase made elsewhere arrives,
  // and an item an admin removed actually goes away (a union here would ignore every revoke)
  const take=(cloud, local)=>{ const o={}; for(const k in (cloud||{})) if(cloud[k]) o[k]=true; return (cloud==null)?(local||{}):o; };
  gemOwned      = take(m.owned, gemOwned);
  cosmeticOwned = take(m.cos,   cosmeticOwned);
  animOwned     = take(m.anim,  animOwned);
  dropUnownedFromLoadout();
  // the account is the source of truth for spendable balances
  gems=savedGemBalance(m); gemResetVersion=Math.max(GEM_RESET_VERSION,+m.gre||0);
  if(typeof m.coins==='number') coins=m.coins;
  // ---- daily tasks: the account is the record, so finishing them twice on two devices is impossible ----
  if(typeof m.date==='string' && Array.isArray(m.tasks)){
    const today=todayIndex();
    if(m.date===tasksDate){
      // same day on both: a task counts as done if EITHER side finished it, and progress takes the higher
      for(const ct of m.tasks){
        const lt=dailyTasks.find(t=>t.id===ct.id);
        if(!lt) continue;
        lt.prog=Math.max(lt.prog||0, ct.prog||0);
        lt.done=!!(lt.done||ct.done);
        if(lt.done) lt.prog=lt.goal;
      }
    } else if(m.date===today && tasksDate!==today){
      tasksDate=m.date; dailyTasks=m.tasks;          // this device was behind; take the account's day
    }
  }
  if(typeof m.hi==='number') hiScore=Math.max(hiScore, m.hi);   // best score is the best of both
  if(typeof m.mv==='number') musicVol=m.mv;
  if(typeof m.sv==='number') sfxVol=m.sv;
  try{ if(musicGain) musicGain.gain.value=musicVol*0.7; if(sfxGain) sfxGain.gain.value=sfxVol; }catch(e){}
  if(typeof m.wr==='number') wheelReady=m.wr>0?1:0;
  if(typeof m.wa==='number') wheelAcc=wheelReady?0:clamp(m.wa,0,WHEEL_MS-1);
  referralUsed=!!m.refUsed;
  if(typeof m.stkMax==='number') streakLongest=Math.max(streakLongest,m.stkMax);
  referralPaid=Math.max(0,+m.refPaid||0);
  // take the account's streak only when it is at least as far along as this device's,
  // so a profile landing after a local collect cannot hand out the same reward twice
  if(typeof m.stkDay==='string' && (+(m.stkDay||-1) >= +(streakLastDay||-1))){
    streakLastDay=m.stkDay;
    if(typeof m.stk==='number') streakDays=m.stk;
  }
  if(m.cosEq) cosmeticEquipped=m.cosEq;
  if(m.animEq && typeof m.animEq==='object') animEquipped=m.animEq;
  if(m.pow) powerStock=m.pow;
  normalizeDailyRewards();
  for(const k in animEquipped){ const id=animEquipped[k];
    if(id!=='none' && !animOwned[animKey(k,id)]) delete animEquipped[k]; }
  syncOwnedWeapons();                                 // otherwise a synced purchase has no card
}
// an older account may have a leaderboard score but no saved profile yet
async function fetchOwnBest(){
  if(!sb || !authUser) return;
  try{
    const { data } = await sb.from('scores').select('score')
      .eq('user_id',authUser.id).eq('game','outpost-zero').maybeSingle();
    if(data && typeof data.score==='number' && data.score>hiScore){ hiScore=data.score; saveMetaLocal(); }
  }catch(e){}
}
async function fetchProfile(expectedUserId,requestVersion){
  if(!sb || !authUser) return false;
  const userId=String(expectedUserId||authUser.id);
  if(String(authUser.id)!==userId) return false;
  try{
    const { data, error } = await sb.from('profiles').select('data').eq('user_id', userId).maybeSingle();
    if(error) throw error;                            // a failed read is not a new account
    if(!authUser || String(authUser.id)!==userId ||
       (requestVersion!=null && requestVersion!==authProfileRequestVersion)) return false;
    if(data && data.data){
      const migrateGems=data.data.gv!==GEM_ECONOMY_VERSION;
      const resetGems=(+data.data.gre||0)<GEM_RESET_VERSION;
      const hasOnboarding=Object.prototype.hasOwnProperty.call(data.data,'onboardV') &&
        data.data.onboardV!==null && Number.isFinite(Number(data.data.onboardV));
      // Profiles created before account onboarding existed are established
      // players. Migrate them as already seen instead of surprising everyone
      // with a first-login tutorial after an update.
      onboardingVersion=hasOnboarding ? Math.max(0,Math.floor(Number(data.data.onboardV))) : ONBOARDING_VERSION;
      applyProfile(data.data); profileLoaded=true; saveMetaLocal();
      if(onboardingVersion<ONBOARDING_VERSION) firstAccountTutorialUserId=userId;
      else if(firstAccountTutorialUserId===userId) firstAccountTutorialUserId='';
      if(migrateGems||resetGems||!hasOnboarding) await saveProfile(true); // persist all migration markers
    }
    else {                                            // a new account never inherits another account's device gems
      onboardingVersion=0;
      firstAccountTutorialUserId=userId;
      gems=0; gemResetVersion=GEM_RESET_VERSION; referralUsed=false; referralPaid=0; saveMetaLocal();
      profileLoaded=true;
      // Finish the initial onboardV=0 write before exposing START. Otherwise a
      // slow first write could land after the button's onboardV=1 save and make
      // the same account look new again on its next login.
      await saveProfile(true);
    }
    if(!authUser || String(authUser.id)!==userId ||
       (requestVersion!=null && requestVersion!==authProfileRequestVersion)) return false;
    return true;
  }catch(e){
    if(requestVersion==null || requestVersion===authProfileRequestVersion) profileLoaded=false;
    return false;
  }
}
async function saveProfile(force){
  if(!sb || !authUser) return;
  if(!force && !profileLoaded) return;               // never overwrite the cloud before we've read it
  try{ await sb.from('profiles').upsert({user_id:authUser.id, data:metaPayload(), updated_at:new Date().toISOString()}); }
  catch(e){}
  publishPublicProfile(false);
}
function queueProfileSave(){                          // debounce: batch rapid changes into one write
  if(!sb || !authUser) return;
  profilePending=true; profileSaveT=Date.now()+1200;
}
function loadMeta(){
  try{
    const m=JSON.parse(localStorage.getItem('oz_meta')||'{}');
    gems=savedGemBalance(m); gemResetVersion=Math.max(GEM_RESET_VERSION,+m.gre||0); gemOwned=m.owned||{}; tasksDate=m.date||''; dailyTasks=m.tasks||[];
    coins=m.coins||0; cosmeticOwned=m.cos||{}; cosmeticEquipped=m.cosEq||{}; powerStock=m.pow||{};
    animOwned=m.anim||{}; animEquipped=(m.animEq && typeof m.animEq==='object') ? m.animEq : {};
    streakDays=m.stk||0; streakLongest=m.stkMax||streakDays; streakLastDay=m.stkDay||'';
    referralUsed=!!m.refUsed; referralPaid=m.refPaid||0;
    wheelReady=m.wr>0?1:0; wheelAcc=wheelReady?0:clamp(m.wa||0,0,WHEEL_MS-1);
    hiScore=m.hi||0;
    if(typeof m.mv==='number') musicVol=m.mv;
    if(typeof m.sv==='number') sfxVol=m.sv;
    for(const k in animEquipped){ const id=animEquipped[k];
      if(id!=='none' && !animOwned[animKey(k,id)]) delete animEquipped[k]; }
  }catch(e){}
  if(gemResetVersion<GEM_RESET_VERSION){ gems=0; gemResetVersion=GEM_RESET_VERSION; }
  // the daily period rolls over at 12:00 UTC
  const today=String(Math.floor((Date.now()-43200000)/86400000));
  if(tasksDate!==today){
    tasksDate=today;
    dailyTasks=freshDailyTasks();                    // one definition controls both the UI and payout
    saveMeta();
  }
  normalizeDailyRewards();
  saveMetaLocal();                                  // persist the reset marker and reward normalization
  syncOwnedWeapons();
}
function dropUnownedFromLoadout(){                    // a removed weapon must leave your hands too
  for(const slot of ['primary','secondary','melee','utility']){
    const k=loadout[slot];
    if(k && isLocked(k)) loadout[slot]=null;
  }
  for(const k in animEquipped){ const id=animEquipped[k];
    if(id!=='none' && !animOwned[animKey(k,id)]) delete animEquipped[k]; }
}
function syncOwnedWeapons(){                          // owned shop weapons must exist in the rosters
  for(const it of GEM_SHOP) if(gemOwned[it.key]) gemUnlock(it);
}
function gemUnlock(it){
  if(it.slot==='utility'){
    if(VAULT_UTILITIES[it.key] && !UTILITIES[it.key]) UTILITIES[it.key]=VAULT_UTILITIES[it.key];
    if(!UTILKEYS.includes(it.key)) UTILKEYS.push(it.key);
    return;
  }
  const def=VAULT_WEAPONS[it.key];
  if(def && !WEAPONS[it.key]) WEAPONS[it.key]=def;   // vault weapons need injecting; base weapons already exist
  const r = it.slot==='primary' ? PRIMARIES : it.slot==='melee' ? MELEES : SECONDARIES;
  if(!r.includes(it.key)) r.push(it.key);
  if(!WKEYS.includes(it.key)) WKEYS.push(it.key);
}
/* ---- NEXT-SEASON PREVIEW: admins may play this set only in TEST MODE ---- */
let fallInjected=false;
function fallEligible(){
  return !!(isAdmin() && testMode);
}
function syncFallAccess(){
  const rosters={warpwave:PRIMARIES, timeturner:SECONDARIES, terafists:MELEES};
  const liveFallRun=(state==='play'||state==='upgrade'||state==='over') &&
    (FALL_KEYS.includes(player.cur) ||
     [loadout.primary,loadout.secondary,loadout.melee,loadout.utility].some(k=>FALL_KEYS.includes(k)));
  if(!isAdmin()){
    testMode=false;
    adminPanelOpen=false; storageOpen=false; weaponEditOpen=false;
    if(formOpen && weaponEditKey) closeForm();
    weaponEditKey=null; weaponEditDraft=null;
  }
  if(!fallEligible() && liveFallRun){
    if(practiceMode==='arena') leaveArena('Admin preview access ended.',true);
    else {
      state='select'; selPage='hub'; pendingGameMode=null; practiceMode=null; menuOpen=false;
      bullets=[]; ebullets=[]; grenades=[]; pearls=[]; balls=[]; flames=[]; damageNumbers=[]; daggersOut=null;
      utilityOut=false; aiming=false; rmbAim=false;
    }
  }
  if(fallEligible()){
    for(const k of ['warpwave','timeturner','terafists']){
      if(!WEAPONS[k]) WEAPONS[k]=VAULT_WEAPONS[k];
      if(!rosters[k].includes(k)) rosters[k].push(k);
      if(!WKEYS.includes(k)) WKEYS.push(k);
    }
    if(!UTILITIES.portal) UTILITIES.portal=VAULT_UTILITIES.portal;
    if(!UTILKEYS.includes('portal')) UTILKEYS.push('portal');
    fallInjected=true;
  } else if(!fallEligible()){
    for(const k of ['warpwave','timeturner','terafists']){
      const r=rosters[k], i=r.indexOf(k); if(i>=0) r.splice(i,1);
      const wi=WKEYS.indexOf(k); if(wi>=0) WKEYS.splice(wi,1);
      for(const slot of ['primary','secondary','melee']) if(loadout[slot]===k) loadout[slot]=null;
    }
    const ui=UTILKEYS.indexOf('portal'); if(ui>=0) UTILKEYS.splice(ui,1);
    if(loadout.utility==='portal') loadout.utility=null;
    fallInjected=false;
  }
}
function buyGem(it){
  if(gemOwned[it.key]){ sfx('dry'); return; }
  if(gems<it.cost){ sfx('dry'); return; }
  gems-=it.cost; gemOwned[it.key]=true; gemUnlock(it); saveMeta(); sfx('pickup');
}
function addCoins(n){ if(sb && !authUser) return; coins+=n; saveMeta(); }   // coins are sign-in only
function gemRewardsEnabled(){ return !testMode && (!sb||!!authUser); }
function addGems(n){ if(!gemRewardsEnabled()) return false; gems+=Math.max(0,Math.round(+n||0)); saveMeta(); return true; }
function buyPowerup(pu){
  if(coins<pu.cost){ sfx('dry'); return; }
  coins-=pu.cost; powerStock[pu.id]=(powerStock[pu.id]||0)+1; saveMeta(); sfx('pickup');
}
function cosKey(wkey, id){ return wkey+':'+id; }
function buyCosmetic(wkey, c){
  const k=cosKey(wkey,c.id);
  if(cosmeticOwned[k]){ cosmeticEquipped[wkey]=c.id; saveMeta(); sfx('swap'); return; }   // already owned -> equip
  if(coins<COSMETIC_COST){ sfx('dry'); return; }
  coins-=COSMETIC_COST; cosmeticOwned[k]=true; cosmeticEquipped[wkey]=c.id; saveMeta(); sfx('pickup');
}
// color a weapon is currently wearing (equipped cosmetic overrides its default tracer)
function weaponColor(wkey, fallback){
  const id=cosmeticEquipped[wkey];
  if(id){ const c=COSMIC_COLORS.find(x=>x.id===id); if(c) return c.col; }
  return fallback;
}
const FIREARM_BULLET_SPEED_MUL=1.15, AWM_BULLET_SPEED_MUL=1.35;
function weaponBulletSpeedMul(k){ return k==='sniper'?AWM_BULLET_SPEED_MUL:FIREARM_BULLET_SPEED_MUL; }
function weaponBulletSpeed(k){ const w=WEAPONS[k]; return w&&w.speed ? w.speed*weaponBulletSpeedMul(k) : 0; }
function weaponBulletLife(k,base){ return base/weaponBulletSpeedMul(k); } // faster travel, same maximum distance
function taskProgress(id,n){
  if(!gemRewardsEnabled()) return;         // never consume a quest when its gem payout is disabled
  for(const t of dailyTasks){
    if(t.id===id && !t.done){
      t.prog+=n;
      if(t.prog>=t.goal){ t.prog=t.goal; t.done=true; addGems(t.reward);
        waveMsg='\uD83D\uDC8E DAILY TASK COMPLETE +'+t.reward+' GEMS'; waveMsgT=now+2600; sfx('pickup'); }
      saveMeta();
    }
  }
}
const LOCKED_KEYS = ['fireworks','solarrifle','bdaggers','beachball'];   // seasonal = sign-in only
const TEMP_KEYS = ['flamethrower','fireworks','bdaggers','beachball'];  // Summer Flaming Update
function isLocked(k){
  if(FALL_KEYS.includes(k)) return !fallEligible();  // unreleased: admins in Test Mode only
  if(!sb) return false;                              // preview/offline: everything open
  if(testMode) return false;                         // TEST MODE: every weapon free + usable
  if(GEM_SHOP.some(it=>it.key===k)) return !gemOwned[k];   // shop weapons: unlocked once bought
  return !authUser && LOCKED_KEYS.includes(k);       // seasonal weapons: sign-in only; utilities free
}
