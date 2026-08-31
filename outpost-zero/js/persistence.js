"use strict";

// ---- account progress sync: purchases + currency live with the account, not the device ----
let profileLoaded=false, profileSaveT=0, profilePending=false, profilePendingUserId='', profileOwnerUserId=null;
let profileMutationVersion=0,profileSaveQueued=0,profileSaveTail=Promise.resolve(false);
let profileSaveRequestSerial=0,profileLatestSaveSerialByUser=Object.create(null),
  profileActiveSaveController=null,profileActiveSaveUserId='';
let pendingDailyTaskEvents=Object.create(null),pendingDailyTaskOwner='',pendingDailyTaskDay='';
let dailyTaskBatchDepth=0;
// Temporary admin gifts are a separate server-backed entitlement. They are
// deliberately excluded from metaPayload/localStorage so no device can turn a
// timed gift into permanent ownership by editing its local profile cache.
let temporaryWeaponGrants=Object.create(null), temporaryWeaponGrantUserId='', temporaryWeaponGrantsLoaded=false;
let temporaryWeaponGrantAttemptAt=0, temporaryWeaponGrantRequest=null, temporaryWeaponGrantRequestSeq=0;
let temporaryWeaponLaunchVerification=null;
const TEMP_WEAPON_GRANT_POLL_MS=60000;
function prepareAccountProgressForAuth(accountId=''){
  const id=String(accountId||'');
  if(profileOwnerUserId!==null&&id===profileOwnerUserId)return false; // token refresh / same account: keep loaded state
  profileOwnerUserId=id;profileLoaded=false;profilePending=false;profilePendingUserId='';profileMutationVersion++;
  pendingDailyTaskEvents=Object.create(null);pendingDailyTaskOwner=id;pendingDailyTaskDay=todayIndex();
  if(typeof resetDailyStreakUiForAccountChange==='function')resetDailyStreakUiForAccountChange();
  // Fail closed synchronously during A -> B (and sign-out). A slow or failed B
  // profile read must never leave A's wallet or permanent inventory usable.
  // This reset is memory-only: never save it to either account from here.
  gems=0;gemResetVersion=GEM_RESET_VERSION;coins=0;hiScore=0;
  gemOwned={};cosmeticOwned={};cosmeticEquipped={};animOwned={};animEquipped={};powerStock={};
  tasksDate=todayIndex();dailyTasks=freshDailyTasks();streakDays=0;streakLongest=0;streakLastDay='';
  referralUsed=false;referralPaid=0;wheelReady=0;wheelAcc=0;
  if(typeof resetWheelEngagement==='function')resetWheelEngagement();
  return true;
}
function metaPayload(){
  return {gems, gv:GEM_ECONOMY_VERSION, gre:gemResetVersion, coins, device:deviceId(), stk:streakDays, stkMax:streakLongest, stkDay:streakLastDay, refUsed:referralUsed, refPaid:referralPaid, wr:wheelReady, wa:Math.round(wheelAcc),
          wd:wheelEarnedDay, we:wheelEarnedToday, wt:wheelReadyTier,
          date:tasksDate, tasksV:DAILY_TASK_SCHEMA_VERSION, tasks:dailyTasks, owned:gemOwned, cos:cosmeticOwned, cosEq:cosmeticEquipped,
          pow:powerStock, anim:animOwned, animEq:animEquipped,
          hi:hiScore, mv:musicVol, mt:typeof musicTrack==='string'?musicTrack:'calm', sv:sfxVol, onboardV:onboardingVersion, loadout:storedLastLoadout()};
}
function temporaryGrantMonotonicNow(){
  return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();
}
function activeTemporaryWeaponGrant(key,at=temporaryGrantMonotonicNow()){
  if(!authUser||!temporaryWeaponGrantsLoaded||temporaryWeaponGrantUserId!==String(authUser.id||''))return null;
  const row=temporaryWeaponGrants[String(key||'')];
  return row&&Number.isFinite(+row.deadline)&&+row.deadline>at?row:null;
}
function temporarilyOwnsWeapon(key,at=temporaryGrantMonotonicNow()){return !!activeTemporaryWeaponGrant(key,at);}
function temporaryGrantKeys(){return Object.keys(temporaryWeaponGrants);}
function dropExpiredTemporaryLoadout(keys,options){
  options=options||{};
  const expired=new Set(keys||[]),forgetSaved=options.forgetSaved!==false,
    persistCloud=forgetSaved&&options.persistCloud!==false;
  let liveChanged=false,savedChanged=false,
    expiredCurrent=typeof player!=='undefined'&&player&&expired.has(player.cur)&&isLocked(player.cur);
  for(const slot of LOADOUT_SLOTS){
    const selected=loadout&&loadout[slot];
    if(selected&&expired.has(selected)&&isLocked(selected)){
      if(typeof player!=='undefined'&&player&&player.cur===selected)expiredCurrent=true;
      if(slot==='utility'&&typeof utilityOut!=='undefined')utilityOut=false;
      loadout[slot]=null;liveChanged=true;
    }
    if(forgetSaved&&lastLoadout&&lastLoadout[slot]&&expired.has(lastLoadout[slot])&&isLocked(lastLoadout[slot])){
      lastLoadout[slot]=SHARED_LOADOUT_DEFAULTS[slot];savedChanged=true;
    }
  }
  // Expiry/revoke is immediate, including during a live run. Move the player
  // to the first still-authorized carried weapon; tryFire also rechecks as a
  // final guard so a stale held trigger can never keep the expired gun firing.
  if(expiredCurrent&&typeof player!=='undefined'&&player){
    const next=[loadout.primary,loadout.secondary,loadout.melee].find(key=>key&&WEAPONS[key]&&!isLocked(key));
    const fallback=SHARED_LOADOUT_DEFAULTS.primary;
    if(next&&typeof switchWeapon==='function'&&state==='play')switchWeapon(next);
    else {
      if(typeof cancelFanTheHammer==='function')cancelFanTheHammer();
      player.cur=next||(!isLocked(fallback)?fallback:PRIMARIES.find(key=>WEAPONS[key]&&!isLocked(key)))||'smg';
    }
  }
  if(savedChanged){
    persistLastLoadoutLocal();
    const userId=String(authUser&&authUser.id||'');
    if(persistCloud&&profileLoaded&&userId&&profileOwnerUserId===userId&&lastLoadoutAccountId===userId)queueProfileSave();
  }
  if((liveChanged||savedChanged)&&canRestoreAccountLoadout())restoreLastLoadoutForMode(pendingGameMode);
  return liveChanged||savedChanged;
}
function clearTemporaryWeaponGrants(accountId='',drop=true){
  const old=temporaryGrantKeys();
  temporaryWeaponGrants=Object.create(null);temporaryWeaponGrantUserId=String(accountId||'');temporaryWeaponGrantsLoaded=false;
  temporaryWeaponGrantRequestSeq++;temporaryWeaponGrantRequest=null;temporaryWeaponLaunchVerification=null;
  if(drop&&old.length)dropExpiredTemporaryLoadout(old);
}
function prepareTemporaryWeaponGrantsForAccount(accountId='',drop=true){
  const id=String(accountId||'');
  if(id!==temporaryWeaponGrantUserId)clearTemporaryWeaponGrants(id,drop);
  else if(!id)clearTemporaryWeaponGrants('',drop);
}
function failClosedTemporaryWeaponGrants(userId){
  const old=temporaryGrantKeys();
  temporaryWeaponGrants=Object.create(null);temporaryWeaponGrantUserId=String(userId||'');temporaryWeaponGrantsLoaded=false;
  temporaryWeaponGrantRequestSeq++;
  // A transport failure proves nothing about expiry. Remove effective access,
  // but keep the remembered kit so a later authoritative success can restore it.
  if(old.length)dropExpiredTemporaryLoadout(old,{forgetSaved:false,persistCloud:false});
}
function normalizeOwnTemporaryWeaponGrants(rows){
  const out=Object.create(null),receipt=temporaryGrantMonotonicNow();
  for(const row of Array.isArray(rows)?rows:[]){
    const key=String(row&&row.weapon_key||'').trim().toLowerCase(),expiry=Date.parse(row&&row.expires_at||''),server=Date.parse(row&&row.server_now||'');
    const remaining=expiry-server;
    if(!GEM_SHOP.some(item=>item.key===key)||!isWeaponPublished(key)||!Number.isFinite(expiry)||!Number.isFinite(server)||remaining<=0)continue;
    out[key]={expiresAt:new Date(expiry).toISOString(),deadline:receipt+remaining};
  }
  return out;
}
function syncTemporaryWeaponAccess(){
  const stamp=temporaryGrantMonotonicNow(),expired=[];
  for(const key of temporaryGrantKeys()){
    const deadline=+(temporaryWeaponGrants[key]&&temporaryWeaponGrants[key].deadline);
    if(!Number.isFinite(deadline)||deadline<=stamp){delete temporaryWeaponGrants[key];expired.push(key);continue;}
    const item=GEM_SHOP.find(entry=>entry.key===key);
    if(item && isWeaponPublished(item.key)) gemUnlock(item);
  }
  if(expired.length)dropExpiredTemporaryLoadout(expired);
  return expired;
}
function fetchTemporaryWeaponGrants(expectedUserId,requestVersion){
  if(!sb||!authUser)return Promise.resolve(false);
  const userId=String(expectedUserId||authUser.id||'');
  if(!userId||String(authUser.id||'')!==userId)return Promise.resolve(false);
  if(temporaryWeaponGrantRequest&&temporaryWeaponGrantRequest.userId===userId&&temporaryWeaponGrantRequest.version===requestVersion)
    return temporaryWeaponGrantRequest.promise;
  const token=++temporaryWeaponGrantRequestSeq;temporaryWeaponGrantAttemptAt=temporaryGrantMonotonicNow();
  const request={token,userId,version:requestVersion,promise:null};
  request.promise=(async()=>{
    try{
      const {data,error}=await sb.rpc('get_my_outpost_zero_weapon_grants');
      if(error)throw error;
      if(token!==temporaryWeaponGrantRequestSeq||!authUser||String(authUser.id||'')!==userId||temporaryWeaponGrantUserId!==userId||
         (requestVersion!=null&&requestVersion!==authProfileRequestVersion))return false;
      const old=temporaryGrantKeys();temporaryWeaponGrants=normalizeOwnTemporaryWeaponGrants(data||[]);
      temporaryWeaponGrantsLoaded=true;syncTemporaryWeaponAccess();
      const removed=old.filter(key=>!temporaryWeaponGrants[key]);if(removed.length)dropExpiredTemporaryLoadout(removed);
      // On a reload, `old` is empty even when the cloud loadout remembers a
      // now-revoked gift. Server success is the authority that may clean it.
      const unavailableSaved=LOADOUT_SLOTS.map(slot=>lastLoadout&&lastLoadout[slot]).filter(key=>
        key&&GEM_SHOP.some(item=>item.key===key)&&!gemOwned[key]&&!temporarilyOwnsWeapon(key));
      if(unavailableSaved.length)dropExpiredTemporaryLoadout(unavailableSaved);
      if(profileLoaded&&profileOwnerUserId===userId&&lastLoadoutAccountId===userId&&canRestoreAccountLoadout())
        restoreLastLoadoutForMode(pendingGameMode);
      return true;
    }catch(error){
      if(token===temporaryWeaponGrantRequestSeq&&authUser&&String(authUser.id||'')===userId&&temporaryWeaponGrantUserId===userId)
        failClosedTemporaryWeaponGrants(userId); // fail closed live access without treating transport failure as a revoke
      return false;
    }finally{
      if(temporaryWeaponGrantRequest&&temporaryWeaponGrantRequest.token===token)temporaryWeaponGrantRequest=null;
    }
  })();
  temporaryWeaponGrantRequest=request;return request.promise;
}
function temporaryWeaponGrantTick(){
  if(!authUser||!profileLoaded){if(!authUser&&temporaryWeaponGrantUserId)clearTemporaryWeaponGrants('',true);return;}
  syncTemporaryWeaponAccess();
  if(!temporaryWeaponGrantRequest&&temporaryGrantMonotonicNow()-temporaryWeaponGrantAttemptAt>=TEMP_WEAPON_GRANT_POLL_MS)
    void fetchTemporaryWeaponGrants(String(authUser.id||''),authProfileRequestVersion);
}
function temporaryWeaponLoadoutReady(){
  syncTemporaryWeaponAccess();
  for(const slot of LOADOUT_SLOTS){const key=loadout&&loadout[slot];if(key&&isLocked(key))return false;}
  return true;
}
function temporaryWeaponLoadoutGrantKeys(){
  const out=[];
  for(const slot of LOADOUT_SLOTS){
    const key=loadout&&loadout[slot];
    if(key&&!gemOwned[key]&&temporarilyOwnsWeapon(key)&&!isLocked(key)) out.push(key);
  }
  return out;
}
function verifyTemporaryWeaponLoadoutForLaunch(onVerified,onFailed){
  const keys=temporaryWeaponLoadoutGrantKeys();
  if(!keys.length)return true;
  if(temporaryWeaponLaunchVerification)return false;
  const userId=String(authUser&&authUser.id||''),version=authProfileRequestVersion,
    kit=LOADOUT_SLOTS.map(slot=>loadout&&loadout[slot]||'').join('|'),token={};
  temporaryWeaponLaunchVerification=token;
  void fetchTemporaryWeaponGrants(userId,version).then(ok=>{
    if(temporaryWeaponLaunchVerification!==token)return;
    temporaryWeaponLaunchVerification=null;
    const same=ok&&authUser&&String(authUser.id||'')===userId&&version===authProfileRequestVersion&&
      LOADOUT_SLOTS.map(slot=>loadout&&loadout[slot]||'').join('|')===kit&&
      keys.every(key=>!isLocked(key)&&(temporarilyOwnsWeapon(key)||!!gemOwned[key]));
    if(same){if(typeof onVerified==='function')onVerified();}
    else{syncTemporaryWeaponAccess();dropUnownedFromLoadout();if(typeof onFailed==='function')onFailed();}
  });
  return false;
}
const LOADOUT_SLOTS=['primary','secondary','melee','utility'];
const GUEST_LOADOUT_STORAGE_KEY='oz_loadout_guest_v1',ACCOUNT_LOADOUT_STORAGE_PREFIX='oz_loadout_account_v1:';
function storedLoadoutSlot(key){
  if(typeof key!=='string'||!key) return null;
  if(typeof WEAPON_EDITOR_SLOTS==='object'&&Object.prototype.hasOwnProperty.call(WEAPON_EDITOR_SLOTS,key))
    return WEAPON_EDITOR_SLOTS[key];
  if(PRIMARIES.includes(key)||TEMP_PRIMARY.includes(key)||VAULT_SLOTS[key]==='primary') return 'primary';
  if(SECONDARIES.includes(key)||TEMP_SECONDARY.includes(key)||VAULT_SLOTS[key]==='secondary') return 'secondary';
  if(MELEES.includes(key)||TEMP_MELEE.includes(key)||VAULT_SLOTS[key]==='melee') return 'melee';
  if(UTILKEYS.includes(key)||TEMP_UTILITY.includes(key)||VAULT_SLOTS[key]==='utility') return 'utility';
  return null;
}
function storedLastLoadout(candidate=lastLoadout){
  const source=candidate&&typeof candidate==='object'?candidate:{}, result={};
  for(const slot of LOADOUT_SLOTS){
    const has=Object.prototype.hasOwnProperty.call(source,slot), value=has?source[slot]:SHARED_LOADOUT_DEFAULTS[slot];
    result[slot]=value==null?null:(storedLoadoutSlot(value)===slot?value:SHARED_LOADOUT_DEFAULTS[slot]);
  }
  return result;
}
function localLoadoutStorageKey(accountId=lastLoadoutAccountId){
  const id=String(accountId||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,80);
  return id?ACCOUNT_LOADOUT_STORAGE_PREFIX+id:GUEST_LOADOUT_STORAGE_KEY;
}
function readLastLoadoutLocal(accountId=''){
  try{
    const raw=localStorage.getItem(localLoadoutStorageKey(accountId));
    return raw?storedLastLoadout(JSON.parse(raw)):null;
  }catch(e){ return null; }
}
function persistLastLoadoutLocal(){
  try{ localStorage.setItem(localLoadoutStorageKey(),JSON.stringify(storedLastLoadout())); return true; }
  catch(e){ return false; }
}
function usableLastLoadoutKey(key,slot){
  if(!key||storedLoadoutSlot(key)!==slot||isLocked(key)) return false;
  return slot==='utility'?!!UTILITIES[key]:!!WEAPONS[key];
}
function availableLoadoutFallback(slot){
  const preferred=SHARED_LOADOUT_DEFAULTS[slot];
  if(preferred&&usableLastLoadoutKey(preferred,slot))return preferred;
  const pool=slot==='primary'?[...PRIMARIES,...TEMP_PRIMARY]:
    slot==='secondary'?[...SECONDARIES,...TEMP_SECONDARY]:
    slot==='melee'?[...MELEES,...TEMP_MELEE]:
    slot==='utility'?[...UTILKEYS,...TEMP_UTILITY]:[];
  return pool.find(key=>usableLastLoadoutKey(key,slot))||null;
}
function playableLastLoadout(candidate=lastLoadout){
  const saved=storedLastLoadout(candidate), result={};
  for(const slot of LOADOUT_SLOTS){
    const key=saved[slot];
    const fallback=typeof availableLoadoutFallback==='function'?availableLoadoutFallback(slot):SHARED_LOADOUT_DEFAULTS[slot];
    result[slot]=key==null?null:(usableLastLoadoutKey(key,slot)?key:fallback);
  }
  return result;
}
function modeAllowsUtility(mode){
  // Signed-in Casual 1v1 is the one duel route that carries the optional
  // utility slot. Ranked, CPU, and team duel routes remain weapon-only.
  const key=String(mode||'').toLowerCase();
  return !key.startsWith('ranked')&&
    !['arena2v2','ai1v1','ai2v2','partycpu2v2','ranked','ranked1v1','ranked2v2'].includes(key);
}
function restoreLastLoadoutForMode(mode=pendingGameMode){
  loadout=playableLastLoadout(lastLoadout);
  if(!modeAllowsUtility(mode)) loadout.utility=null;
  return loadout;
}
function prepareLastLoadoutForAccount(accountId=''){
  const id=String(accountId||'');
  if(id===lastLoadoutAccountId) return lastLoadout;
  lastLoadoutAccountId=id;
  lastLoadout=readLastLoadoutLocal(id)||storedLastLoadout(SHARED_LOADOUT_DEFAULTS);
  if(canRestoreAccountLoadout()) restoreLastLoadoutForMode(pendingGameMode);
  return lastLoadout;
}
function rememberLoadoutSlot(slot,value){
  if(!LOADOUT_SLOTS.includes(slot)) return false;
  if(value!=null&&(storedLoadoutSlot(value)!==slot||isLocked(value))) return false;
  lastLoadout=storedLastLoadout(Object.assign({},lastLoadout,{[slot]:value==null?null:value}));
  saveMeta();
  return true;
}
function canRestoreAccountLoadout(){
  const liveArena=typeof arena!=='undefined'&&arena&&(arena.active||arena.queueChannel||arena.matchChannel);
  const cpuSession=typeof partyCpuSessionOpen==='function'&&partyCpuSessionOpen();
  return typeof state!=='undefined'&&state==='select'&&!liveArena&&!cpuSession&&
    !(typeof soloPractice!=='undefined'&&soloPractice)&&!(typeof tryLoadoutBackup!=='undefined'&&tryLoadoutBackup);
}
function applyProfile(m){
  if(!m) return false;
  const cloudTasksCurrent=m.tasksV===DAILY_TASK_SCHEMA_VERSION&&dailyTaskSetIsCurrent(m.tasks);
  const today=todayIndex();
  let profileMigrated=!cloudTasksCurrent||m.date!==today;
  profileOwnerUserId=authUser?String(authUser.id||''):profileOwnerUserId;
  // the account is the source of truth for what you own: a purchase made elsewhere arrives,
  // and an item an admin removed actually goes away (a union here would ignore every revoke)
  const take=(cloud, local)=>{ const o={}; for(const k in (cloud||{})) if(cloud[k]) o[k]=true; return (cloud==null)?(local||{}):o; };
  gemOwned      = take(m.owned, {});                 // a legacy missing field is empty, never the prior account's inventory
  cosmeticOwned = take(m.cos,   cosmeticOwned);
  animOwned     = take(m.anim,  animOwned);
  dropUnownedFromLoadout();
  // the account is the source of truth for spendable balances
  gems=savedGemBalance(m); gemResetVersion=Math.max(GEM_RESET_VERSION,+m.gre||0);
  if(typeof m.coins==='number') coins=m.coins;
  // ---- daily tasks: merge account progress without mixing the two OR paths ----
  if(typeof m.date==='string' && cloudTasksCurrent){
    if(m.date===tasksDate){
      // Same day on both: merge each side of every OR independently. Progress
      // from unlike choices is never added together.
      dailyTasks=mergeDailyTaskSets(dailyTasks,m.tasks);
    } else if(m.date===today && tasksDate!==today){
      tasksDate=m.date; dailyTasks=normalizedDailyTaskSet(m.tasks); // this device was behind; take the account's day
    }
  }
  if(typeof m.hi==='number') hiScore=Math.max(hiScore, m.hi);   // best score is the best of both
  if(typeof m.mv==='number') musicVol=m.mv;
  if(typeof m.mt==='string'&&typeof normalizedMusicTrack==='function') musicTrack=normalizedMusicTrack(m.mt);
  if(typeof m.sv==='number') sfxVol=m.sv;
  try{ if(musicGain) musicGain.gain.value=musicVol*0.7; if(sfxGain) sfxGain.gain.value=sfxVol; }catch(e){}
  if(typeof m.wr==='number') wheelReady=m.wr>0?1:0;
  if(typeof m.wa==='number') wheelAcc=wheelReady?0:clamp(m.wa,0,WHEEL_MS-1);
  if(typeof applyWheelEngagementSnapshot==='function'){
    const cloudHasWheel=typeof m.wd==='string'||typeof m.we==='number'||typeof m.wt==='number';
    if(cloudHasWheel)applyWheelEngagementSnapshot({day:m.wd,earned:m.we,tier:m.wt});
    else normalizeWheelEngagement();
    saveWheelEngagementLocal(profileOwnerUserId);
  }
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
  profileMigrated=normalizeDailyRewards()||profileMigrated;
  for(const k in animEquipped){ const id=animEquipped[k];
    if(id!=='none' && !animOwned[animKey(k,id)]) delete animEquipped[k]; }
  lastLoadoutAccountId=authUser?String(authUser.id||''):'';
  // A profile without this field predates shared loadouts. Give that account
  // clean defaults; never adopt another account's or the guest's device kit.
  lastLoadout=m.loadout&&typeof m.loadout==='object'
    ?storedLastLoadout(m.loadout):storedLastLoadout(SHARED_LOADOUT_DEFAULTS);
  const unpublishedPurged=syncOwnedWeapons();          // purge storage-only items before restoring or exposing them
  if(canRestoreAccountLoadout()) restoreLastLoadoutForMode(pendingGameMode);
  return unpublishedPurged||profileMigrated;
}
// an older account may have a leaderboard score but no saved profile yet
async function fetchOwnBest(){
  if(!sb || !authUser) return;
  const userId=String(authUser.id||''),requestVersion=authProfileRequestVersion;
  try{
    const { data,error } = await sb.from('scores').select('game,score')
      .eq('user_id',userId).in('game',['outpost-zero','outpost-zero-arena-wins']);
    if(error)throw error;
    if(!authUser||String(authUser.id||'')!==userId||profileOwnerUserId!==userId||requestVersion!==authProfileRequestVersion)return;
    const rows=Array.isArray(data)?data:[],endless=rows.find(row=>row.game==='outpost-zero'),wins=rows.find(row=>row.game==='outpost-zero-arena-wins');
    arenaOwnWinTotal=Math.max(0,Math.floor(+(wins&&wins.score)||0));
    if(endless&&typeof endless.score==='number'&&endless.score>hiScore){hiScore=endless.score;saveMetaLocal();}
  }catch(e){}
}
async function fetchProfile(expectedUserId,requestVersion,scheduledMutationVersion){
  if(!sb || !authUser) return false;
  const userId=String(expectedUserId||authUser.id);
  if(String(authUser.id)!==userId) return false;
  prepareAccountProgressForAuth(userId);
  const retainedLoadedProfile=profileLoaded&&profileOwnerUserId===userId,
    mutationAtStart=Number.isFinite(scheduledMutationVersion)?scheduledMutationVersion:profileMutationVersion;
  try{
    const { data, error } = await sb.from('profiles').select('data').eq('user_id', userId).maybeSingle();
    if(error) throw error;                            // a failed read is not a new account
    if(!authUser || String(authUser.id)!==userId ||
       (requestVersion!=null && requestVersion!==authProfileRequestVersion)) return false;
    // A match or purchase may finish while a clean same-account refresh is in
    // flight. Keep that newer local snapshot; its serialized save is the next
    // authority instead of letting this older read erase it.
    if(retainedLoadedProfile&&profileMutationVersion!==mutationAtStart)return true;
    if(data && data.data){
      const migrateGems=data.data.gv!==GEM_ECONOMY_VERSION;
      const resetGems=(+data.data.gre||0)<GEM_RESET_VERSION;
      const migrateDailyTasks=data.data.tasksV!==DAILY_TASK_SCHEMA_VERSION||!dailyTaskSetIsCurrent(data.data.tasks);
      const removeLegacyBotTrain=Object.prototype.hasOwnProperty.call(data.data,'botTrain');
      const hasOnboarding=Object.prototype.hasOwnProperty.call(data.data,'onboardV') &&
        data.data.onboardV!==null && Number.isFinite(Number(data.data.onboardV));
      const hasLoadout=!!(data.data.loadout&&typeof data.data.loadout==='object');
      // Profiles created before account onboarding existed are established
      // players. Migrate them as already seen instead of surprising everyone
      // with a first-login tutorial after an update.
      onboardingVersion=hasOnboarding ? Math.max(0,Math.floor(Number(data.data.onboardV))) : ONBOARDING_VERSION;
      const unpublishedPurged=applyProfile(data.data);profileLoaded=true;
      const flushedDailyTasks=flushPendingDailyTaskEvents();saveMetaLocal();
      if(onboardingVersion<ONBOARDING_VERSION) firstAccountTutorialUserId=userId;
      else if(firstAccountTutorialUserId===userId) firstAccountTutorialUserId='';
      if(migrateGems||resetGems||migrateDailyTasks||!hasOnboarding||removeLegacyBotTrain||!hasLoadout||unpublishedPurged||flushedDailyTasks)
        await saveProfile(true); // persist migrations and any events held during the authoritative read
    }
    else {                                            // a new account never inherits another account's device gems
      onboardingVersion=0;
      firstAccountTutorialUserId=userId;
      // Auth can switch from a rich account straight to a never-seen account
      // without reloading the page. Clear every account-owned field before the
      // first cloud write; keep only device preferences such as music/SFX.
      gems=0;gemResetVersion=GEM_RESET_VERSION;coins=0;hiScore=0;
      gemOwned={};cosmeticOwned={};cosmeticEquipped={};animOwned={};animEquipped={};powerStock={};
      tasksDate=todayIndex();dailyTasks=freshDailyTasks();streakDays=0;streakLongest=0;streakLastDay='';
      referralUsed=false;referralPaid=0;wheelReady=0;wheelAcc=0;
      if(typeof resetWheelEngagement==='function')resetWheelEngagement();
      lastLoadoutAccountId=userId; lastLoadout=storedLastLoadout(SHARED_LOADOUT_DEFAULTS);
      if(canRestoreAccountLoadout()) restoreLastLoadoutForMode(pendingGameMode);
      saveMetaLocal();
      profileLoaded=true;flushPendingDailyTaskEvents();
      // Finish the initial onboardV=0 write before exposing START. Otherwise a
      // slow first write could land after the button's onboardV=1 save and make
      // the same account look new again on its next login.
      await saveProfile(true);
    }
    if(!authUser || String(authUser.id)!==userId ||
       (requestVersion!=null && requestVersion!==authProfileRequestVersion)) return false;
    return true;
  }catch(e){
    if(requestVersion==null || requestVersion===authProfileRequestVersion)profileLoaded=retainedLoadedProfile;
    return false;
  }
}
function profileWritesPending(){return profilePending||profileSaveQueued>0;}
function saveProfile(force){
  if(!sb||!authUser||(!force&&!profileLoaded))return Promise.resolve(false);
  const userId=String(authUser.id),payload=metaPayload(),version=profileMutationVersion,
    requestSerial=++profileSaveRequestSerial;
  profileLatestSaveSerialByUser[userId]=requestSerial;
  // A final/forced snapshot supersedes an older in-flight snapshot for the
  // same account. Cancelling it lets sign-out persist the newest reward first.
  if(force&&profileActiveSaveController&&profileActiveSaveUserId===userId)
    try{profileActiveSaveController.abort();}catch(error){}
  // Snapshot writes are serialized. When Supabase supports abort signals, a
  // timed-out request is cancelled before the next snapshot may start; without
  // abort support we wait for settlement so an older write can never arrive
  // after a newer task reward and overwrite it.
  profileSaveQueued++;
  const job=profileSaveTail.then(async()=>{
    if(profileLatestSaveSerialByUser[userId]!==requestSerial)return false;
    if(!authUser||String(authUser.id)!==userId)return false;
    let timer=null,controller=null;
    try{
      let write=sb.from('profiles').upsert({user_id:userId,data:payload,updated_at:new Date().toISOString()});
      controller=typeof AbortController==='function'?new AbortController():null;
      const canAbort=!!(controller&&write&&typeof write.abortSignal==='function');
      if(canAbort){write=write.abortSignal(controller.signal);profileActiveSaveController=controller;profileActiveSaveUserId=userId;}
      const result=canAbort
        ?await Promise.race([write,new Promise((resolve,reject)=>{timer=setTimeout(()=>{
          controller.abort();reject(new Error('profile save timed out'));
        },8000);})])
        :await write;
      const {error}=result||{};
      if(error)throw error;
      if(authUser&&String(authUser.id)===userId&&profileMutationVersion===version){
        profilePending=false;profilePendingUserId='';
      }
      return true;
    }catch(error){
      if(authUser&&String(authUser.id)===userId){
        profilePending=true;profilePendingUserId=userId;profileSaveT=Date.now()+3000;
      }
      return false;
    }finally{
      if(timer!==null)clearTimeout(timer);
      if(profileActiveSaveController===controller){profileActiveSaveController=null;profileActiveSaveUserId='';}
    }
  });
  const settled=job.finally(()=>{profileSaveQueued=Math.max(0,profileSaveQueued-1);});
  profileSaveTail=settled.catch(()=>false);return settled;
}
function queueProfileSave(){                          // debounce: batch rapid changes into one write
  if(!sb || !authUser) return;
  profileMutationVersion++;profilePending=true;profilePendingUserId=String(authUser.id);profileSaveT=Date.now()+1200;
}
function loadMeta(){
  // Retire the old device/account-specific training cache without importing
  // its client-forgeable value into the shared global total.
  try{ localStorage.removeItem('oz_bot_training_v1'); }catch(e){}
  try{
    const m=JSON.parse(localStorage.getItem('oz_meta')||'{}');
    // `owner:''` is a real guest cache. A UUID belongs to that account. Older
    // caches without the marker are unknown and get one fail-closed reset when
    // a cloud client starts, rather than being trusted as guest ownership.
    profileOwnerUserId=Object.prototype.hasOwnProperty.call(m,'owner')&&typeof m.owner==='string'?m.owner:null;
    gems=savedGemBalance(m); gemResetVersion=Math.max(GEM_RESET_VERSION,+m.gre||0); gemOwned=m.owned||{}; tasksDate=m.date||'';
    dailyTasks=m.tasksV===DAILY_TASK_SCHEMA_VERSION&&Array.isArray(m.tasks)?m.tasks:[];
    coins=m.coins||0; cosmeticOwned=m.cos||{}; cosmeticEquipped=m.cosEq||{}; powerStock=m.pow||{};
    animOwned=m.anim||{}; animEquipped=(m.animEq && typeof m.animEq==='object') ? m.animEq : {};
    streakDays=m.stk||0; streakLongest=m.stkMax||streakDays; streakLastDay=m.stkDay||'';
    referralUsed=!!m.refUsed; referralPaid=m.refPaid||0;
    wheelReady=m.wr>0?1:0; wheelAcc=wheelReady?0:clamp(m.wa||0,0,WHEEL_MS-1);
    if(typeof applyWheelEngagementSnapshot==='function'){
      applyWheelEngagementSnapshot(loadWheelEngagementLocal(profileOwnerUserId)||{day:m.wd,earned:m.we,tier:m.wt});
      wheelCheckpointMinute=Math.floor(wheelAcc/60000);
    }
    hiScore=m.hi||0;
    lastLoadoutAccountId='';
    lastLoadout=readLastLoadoutLocal('')||storedLastLoadout(SHARED_LOADOUT_DEFAULTS);
    if(typeof m.mv==='number') musicVol=m.mv;
    if(typeof m.mt==='string'&&typeof normalizedMusicTrack==='function') musicTrack=normalizedMusicTrack(m.mt);
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
  syncOwnedWeapons();                               // clean the local cache; authoritative cloud data is applied after publication sync
  saveMetaLocal();                                  // persist reset, reward normalization, and ownership cleanup
  restoreLastLoadoutForMode(pendingGameMode);
}
function dropUnownedFromLoadout(){                    // a removed weapon must leave your hands too
  for(const slot of ['primary','secondary','melee','utility']){
    const k=loadout[slot];
    if(k && isLocked(k)) loadout[slot]=null;
  }
  for(const k in animEquipped){ const id=animEquipped[k];
    if(id!=='none' && !animOwned[animKey(k,id)]) delete animEquipped[k]; }
}
function syncOwnedWeapons(purge=true){                 // owned, published shop weapons must exist in the rosters
  const publicationReady=typeof weaponDefsLoaded!=='boolean'||weaponDefsLoaded||
    (typeof sb!=='undefined'&&!sb);
  const unpublishedPurged=purge&&publicationReady?purgeUnpublishedWeaponState():false;
  for(const it of GEM_SHOP){
    if(gemOwned[it.key] && isWeaponPublished(it.key)) gemUnlock(it);
  }
  syncTemporaryWeaponAccess();
  return unpublishedPurged;
}
function isWeaponPublished(k){
  if(typeof sb!=='undefined'&&sb&&typeof weaponDefsLoaded==='boolean'&&!weaponDefsLoaded)return false;
  if(typeof savedWeaponPublished==='function') return !!savedWeaponPublished(k);
  if(typeof FALL_KEYS!=='undefined'&&FALL_KEYS.includes(k)) return false;
  if(typeof VAULT_ACTIVE!=='undefined' && Object.prototype.hasOwnProperty.call(VAULT_ACTIVE,k)) return !!VAULT_ACTIVE[k];
  return !!((typeof WEAPONS!=='undefined'&&WEAPONS[k])||(typeof UTILITIES!=='undefined'&&UTILITIES[k]));
}
// A stored weapon is not an entitlement. Publication is the hard boundary:
// legacy profile flags, temporary gifts, remembered kits, and a weapon held
// during a live unpublish are all revoked together.
function purgeUnpublishedWeaponState(keys){
  const candidates=Array.isArray(keys)?keys:[
    ...Object.keys(typeof WEAPON_EDITOR_SLOTS==='object'?WEAPON_EDITOR_SLOTS:{}),
    ...Object.keys(gemOwned||{}),...Object.keys(temporaryWeaponGrants||{}),
    ...LOADOUT_SLOTS.map(slot=>loadout&&loadout[slot]),
    ...LOADOUT_SLOTS.map(slot=>lastLoadout&&lastLoadout[slot]),
    typeof player!=='undefined'&&player?player.cur:null,
  ];
  const unpublished=new Set(candidates.filter(k=>k&&!isWeaponPublished(k)));
  const blocked=new Set([...unpublished].filter(k=>
    !(typeof FALL_KEYS!=='undefined'&&FALL_KEYS.includes(k)&&typeof fallEligible==='function'&&fallEligible())));
  if(!unpublished.size)return false;
  let changed=false,liveChanged=false,savedChanged=false,currentBlocked=false;
  for(const key of unpublished){
    if(gemOwned&&gemOwned[key]){delete gemOwned[key];changed=true;}
    if(temporaryWeaponGrants&&temporaryWeaponGrants[key]){delete temporaryWeaponGrants[key];changed=true;}
  }
  for(const key of blocked){
    if(typeof player!=='undefined'&&player&&player.cur===key)currentBlocked=true;
  }
  if(!blocked.size)return changed;                   // authorized next-season preview; never a permanent entitlement
  // Stop delayed actions that would otherwise keep healing or dealing damage
  // after their source item was unpublished during a live game.
  if(blocked.has('medkit')&&typeof cancelMedHeal==='function')cancelMedHeal();
  if(blocked.has('revolver')&&typeof cancelFanTheHammer==='function')cancelFanTheHammer(true);
  if(blocked.has('bdaggers')&&typeof daggersOut!=='undefined')daggersOut=null;
  if(blocked.has('terafists')&&typeof fistFlurryUntil!=='undefined')fistFlurryUntil=0;
  if(blocked.has('twinsai')&&typeof parryUntil!=='undefined'){
    parryUntil=0;if(typeof parrySeq!=='undefined')parrySeq++;
  }
  if(blocked.has('chainsaw')&&typeof sawChargeUntil!=='undefined'){
    sawChargeUntil=0;if(typeof sawChargeTick!=='undefined')sawChargeTick=0;
  }
  if(blocked.has('scythe')&&typeof player!=='undefined'&&player){player.dashUntil=0;player.dashSpd=14;}
  if(typeof loadout!=='undefined'&&loadout)for(const slot of LOADOUT_SLOTS){
    const key=loadout[slot];
    if(key&&blocked.has(key)){
      loadout[slot]=null;liveChanged=true;
      if(slot==='utility'&&typeof utilityOut!=='undefined')utilityOut=false;
    }
  }
  if(typeof lastLoadout!=='undefined'&&lastLoadout)for(const slot of LOADOUT_SLOTS){
    if(lastLoadout[slot]&&blocked.has(lastLoadout[slot])){
      lastLoadout[slot]=typeof availableLoadoutFallback==='function'?availableLoadoutFallback(slot):SHARED_LOADOUT_DEFAULTS[slot];
      savedChanged=true;changed=true;
    }
  }
  if(currentBlocked&&typeof player!=='undefined'&&player){
    if(typeof cancelFanTheHammer==='function')cancelFanTheHammer();
    let next=LOADOUT_SLOTS.slice(0,3).map(slot=>loadout&&loadout[slot]).find(key=>key&&WEAPONS[key]&&!isLocked(key));
    if(!next){
      for(const slot of LOADOUT_SLOTS.slice(0,3)){
        const fallback=typeof availableLoadoutFallback==='function'?availableLoadoutFallback(slot):SHARED_LOADOUT_DEFAULTS[slot];
        if(fallback){next=fallback;if(typeof loadout!=='undefined'&&loadout){loadout[slot]=fallback;liveChanged=true;}break;}
      }
    }
    if(next&&typeof state!=='undefined'&&state==='play'&&typeof switchWeapon==='function'&&loadout&&
       [loadout.primary,loadout.secondary,loadout.melee].includes(next))switchWeapon(next);
    else player.cur=next||'smg';                     // visual fallback stays attack-locked if every slot is unpublished
  }
  if(savedChanged&&typeof persistLastLoadoutLocal==='function')persistLastLoadoutLocal();
  if((liveChanged||savedChanged)&&canRestoreAccountLoadout())restoreLastLoadoutForMode(pendingGameMode);
  return changed||liveChanged||savedChanged||currentBlocked;
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
  const item=GEM_SHOP.find(entry=>entry.key===String(it&&it.key||''));
  if(!item||!isWeaponPublished(item.key)){sfx('dry');return false;}
  if(gemOwned[item.key]){ sfx('dry'); return false; }
  if(gems<item.cost){ sfx('dry'); return false; }
  gems-=item.cost; gemOwned[item.key]=true; gemUnlock(item); saveMeta(); sfx('pickup'); return true;
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
function dailyTaskGameplayEligible(){
  return gemRewardsEnabled()&&!(typeof unrankedRun!=='undefined'&&unrankedRun)&&
    !(typeof adminUsed!=='undefined'&&adminUsed)&&
    !(typeof practiceMode!=='undefined'&&practiceMode&&practiceMode!=='arena');
}
function dailyTaskOwnerKey(){
  if(!sb)return 'offline';
  return String(authUser&&authUser.id||'');
}
function dailyTaskOwnerMatches(owner){
  const current=dailyTaskOwnerKey();return !!current&&current===String(owner||'');
}
function dailyTaskAccountReady(){
  if(!sb)return true;
  const id=String(authUser&&authUser.id||'');
  return !!id&&profileLoaded&&profileOwnerUserId===id;
}
function dailyTaskRewardsEnabled(){
  return dailyTaskGameplayEligible()&&dailyTaskAccountReady();
}
function queueDailyTaskEvent(eventId,amount){
  const id=String(authUser&&authUser.id||''),day=todayIndex();
  if(!sb||!id||!dailyTaskGameplayEligible())return false;
  if(pendingDailyTaskOwner!==id||pendingDailyTaskDay!==day){
    pendingDailyTaskEvents=Object.create(null);pendingDailyTaskOwner=id;pendingDailyTaskDay=day;
  }
  pendingDailyTaskEvents[eventId]=Math.max(0,Math.floor(+pendingDailyTaskEvents[eventId]||0))+amount;
  return true;
}
function announceDailyTaskBatch(beforeDone,beforeGems){
  const completed=dailyTasks.filter(task=>task.done&&!beforeDone.has(task.id)).length;
  if(completed<2)return false;
  const reward=Math.max(0,gems-beforeGems);
  waveMsg='\uD83D\uDC8E '+completed+' DAILY TASKS COMPLETE +'+reward+' GEMS';waveMsgT=now+3000;
  return true;
}
function dailyDuelTaskProgressText(){
  const route=[['games','duels','DUELS','PLAY'],['eliminations','duels','KOs','ELIMS'],['victories','duels','WINS','WIN']];
  return 'TASKS \u00b7 '+route.map(([taskId,pathId,label,rowLabel])=>{
    const task=dailyTasks.find(item=>item.id===taskId),def=dailyTaskDefinition(taskId),path=def&&def.paths.find(item=>item.id===pathId);
    if(!task||!path)return label+' 0/?';
    if(task.done){
      const via=task.completedBy==='endless'?'ENDLESS':task.completedBy==='chests'?'CHEST':'DUELS';
      return rowLabel+' \u2713 VIA '+via;
    }
    return label+' '+Math.min(path.goal,Math.max(0,Math.floor(+task.progress[pathId]||0)))+'/'+path.goal;
  }).join(' \u00b7 ');
}
function flushPendingDailyTaskEvents(){
  if(!dailyTaskRewardsEnabled())return false;
  const id=String(authUser&&authUser.id||''),day=todayIndex();
  if(pendingDailyTaskOwner!==id||pendingDailyTaskDay!==day){
    pendingDailyTaskEvents=Object.create(null);pendingDailyTaskOwner=id;pendingDailyTaskDay=day;return false;
  }
  const entries=Object.entries(pendingDailyTaskEvents);if(!entries.length)return false;
  pendingDailyTaskEvents=Object.create(null);
  const beforeDone=new Set(dailyTasks.filter(task=>task.done).map(task=>task.id)),beforeGems=gems;
  let changed=false;
  dailyTaskBatchDepth++;
  try{for(const [eventId,amount] of entries)changed=taskProgress(eventId,amount)||changed;}
  finally{dailyTaskBatchDepth=Math.max(0,dailyTaskBatchDepth-1);}
  announceDailyTaskBatch(beforeDone,beforeGems);
  return changed;
}
function taskProgress(eventId,n=1){
  const target=DAILY_TASK_EVENTS[eventId],amount=Math.max(0,Math.floor(+n||0));
  if(!target||!amount)return false;
  if(['endless_game','endless_kill','mod_chest'].includes(eventId)&&
     typeof dailyEndlessTaskOwner!=='undefined'&&!dailyTaskOwnerMatches(dailyEndlessTaskOwner))return false;
  if(!dailyTaskGameplayEligible())return false;
  // A same-account token refresh can finish while a match is in progress.
  // Hold those events until the authoritative profile is back instead of
  // marking a reward complete in memory and then losing it to the cloud read.
  if(!dailyTaskAccountReady())return queueDailyTaskEvent(eventId,amount);
  // Reset before applying an event so a noon-UTC boundary can never advance
  // yesterday's task for one frame.
  if(typeof tasksDate!=='undefined'&&typeof todayIndex==='function'){
    const today=todayIndex();
    if(tasksDate!==today){ tasksDate=today; dailyTasks=freshDailyTasks(); saveMeta(); }
  }
  normalizeDailyRewards();
  const task=dailyTasks.find(item=>item.id===target.task),def=dailyTaskDefinition(target.task);
  const path=def&&def.paths.find(item=>item.id===target.path);
  if(!task||!def||!path||task.done) return false;
  task.progress[path.id]=clamp((+task.progress[path.id]||0)+amount,0,path.goal);
  let completedNow=false;
  if(task.progress[path.id]>=path.goal){
    task.done=true; task.completedBy=path.id; addGems(def.reward);
    completedNow=true;
    waveMsg='\uD83D\uDC8E DAILY TASK COMPLETE +'+def.reward+' GEMS'; waveMsgT=now+2600; sfx('pickup');
  }
  saveMeta();
  if(completedNow&&!dailyTaskBatchDepth&&sb&&authUser&&typeof saveProfile==='function')void saveProfile(true);
  return true;
}
function recordDailyDuelOutcome(eliminated,completed,won){
  const beforeDone=new Set(dailyTasks.filter(task=>task.done).map(task=>task.id)),beforeGems=gems;
  let knockout=false,played=false,victory=false;
  dailyTaskBatchDepth++;
  try{
    knockout=eliminated?taskProgress('duel_elimination',1):false;
    played=completed?taskProgress('duel_game',1):false;
    victory=completed&&won?taskProgress('duel_win',1):false;
  }finally{dailyTaskBatchDepth=Math.max(0,dailyTaskBatchDepth-1);}
  announceDailyTaskBatch(beforeDone,beforeGems);
  const changed=knockout||played||victory,
    completedTask=changed&&dailyTasks.some(task=>task.done&&!beforeDone.has(task.id));
  if((completed||completedTask)&&changed&&sb&&authUser&&typeof saveProfile==='function')void saveProfile(true);
  return changed;
}
function recordDailyDuelElimination(){ return recordDailyDuelOutcome(true,false,false); }
function recordDailyDuelMatch(won){ return recordDailyDuelOutcome(false,true,won); }
const LOCKED_KEYS = ['fireworks','solarrifle','bdaggers','beachball'];   // seasonal = sign-in only
const TEMP_KEYS = ['flamethrower','fireworks','bdaggers','beachball'];  // Summer Flaming Update
function isLocked(k){
  if(FALL_KEYS.includes(k)) return !fallEligible();  // unreleased: admins in Test Mode only
  if(typeof isWeaponPublished==='function'&&!isWeaponPublished(k)) return true; // publication outranks ownership, offline preview, and Test Mode
  if(!sb) return false;                              // preview/offline: everything open
  if(testMode) return false;                         // TEST MODE: published shop gear is free; unpublished gear stays locked
  if(GEM_SHOP.some(it=>it.key===k)) return !gemOwned[k]&&!temporarilyOwnsWeapon(k); // timed gifts never enter gemOwned
  return !authUser && LOCKED_KEYS.includes(k);       // seasonal weapons: sign-in only; utilities free
}
