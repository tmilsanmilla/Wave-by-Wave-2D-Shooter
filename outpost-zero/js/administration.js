"use strict";

// MAIN ADMINS have every power; CO-ADMINS have shared staff tools; TESTERS
// have only Test Mode and the Admin Inbox.
// Legacy attribution callers still use this name. It deliberately returns a
// public username/role label now, never the signed-in account's Auth email.
function adminEmail(){return String(adminSelfUsername||adminSelfRole||'staff').toLowerCase();}
function isCreator(){ return !sb || adminSelfRole==='creator'; }
function isMainAdmin(){ return isCreator() || adminSelfRole==='main'; }
function isCoAdmin(){ return adminSelfRole==='co'; }
function isTester(){ return adminSelfRole==='tester'; }
function myRank(){ return isCreator()?'creator' : isMainAdmin()?'main' : isCoAdmin()?'co' : isTester()?'tester' : ''; }
function adminRoster(){
  if(!sb)return [{username:'preview',rank:'creator',isSelf:true}];
  return adminRosterRows.slice();
}
function isAdmin(){ return isMainAdmin() || isCoAdmin() || isTester(); }   // any staff tier (preview !sb -> main)
function canAccessReports(){ return isMainAdmin(); }
function canManageAdmins(){ return isMainAdmin(); }
function canPostUpdates(){ return isMainAdmin() || isCoAdmin(); }
function canUsePlayerTools(){ return isMainAdmin() || isCoAdmin(); }
function canViewWeaponStorage(){ return isMainAdmin() || isCoAdmin(); }
function canReviewWeaponSuggestions(){ return isMainAdmin(); }
let unrankedRun=false;                              // next-season (early access) weapons -> no leaderboard
let adminOpen=false, adminUsed=false, adminBtnRect={x:-99,y:-99,w:0,h:0}, adminRects=[];
let testMode=false;                                 // test mode (all admins); storage is a viewer popout now
let adminPanelOpen=false, adminHubBtnRect=null, suggestionsHubBtnRect=null, adminPanelRects=[];
let aiLearningOpen=false, aiLearningRects=[], aiLearningDifficulty=4, aiLearningNotice='',aiLearningSelectedModelId='',aiLearningRestoreBusyId='';
let adminRoles={};                                  // public username -> staff rank
let adminRosterRows=[],adminSelfRole='',adminSelfUsername='';
let banners=[], pendingBanners=[], bannerFetchSeq=0, bannerDraftEpoch=0, updatesFeed={reports:[]};
let reportCopyMode='all',reportCopyCustomCount=25,reportCopyBusy=false,reportCopyStatus='',reportBulkAction='copy';
let reportActionMenuOpen=false,reportAmountMenuOpen=false,reportView='open';
let reportScroll=0,reportScrollMax=0,reportScrollViewport=null;
let requestsOpen=false,requestsRects=[],requestsPage=0,requestsBusy=false,requestsStatus='';
let weaponSuggestions=[],weaponSuggestionsOpen=false,weaponSuggestionsRects=[],weaponSuggestionBusy=false,weaponSuggestionStatus='',weaponSuggestionPage=0,weaponSuggestionRequestSeq=0;
let inboxTab='msgs';
let postOpen=false, postBusy=false, postRequestSeq=0, updatesOpen=false, updatesHubBtnRect=null, updatesRects=[], staffReport=false;
let adminsOpen=false, msgsOpen=false, adminsHubBtnRect=null, msgsHubBtnRect=null, adminsRects=[], msgsRects=[];
let auditOpen=false, auditRects=[], auditScroll=0, auditScrollMax=0, auditScrollViewport=null;
let adminAuditPages=[], adminAuditPageMore=[], adminAuditPage=0, adminAuditLoading=false, adminAuditError='', adminAuditHasMore=false;
let adminPrivacyEpoch=0,adminRosterFetchSeq=0;
const ADMIN_AUDIT_PAGE_SIZE=25;
let scoresOpen=false, scoresRects=[], scoreEditOpen=false, scoreEditBusy=false, scoreEditOperationReceipt=null, scoreReqs=[];
const scoreRequestDecisionBusy=new Set();
let pePanelTab='items';
let peGiftMode='permanent', peCustomGiftMinutes=180, peNotice='';
const PE_GIFT_DURATIONS=Object.freeze([
  {id:'permanent',label:'PERMANENT',minutes:0},
  {id:'1h',label:'1 HOUR',minutes:60},
  {id:'1d',label:'1 DAY',minutes:1440},
  {id:'7d',label:'7 DAYS',minutes:10080},
  {id:'30d',label:'30 DAYS',minutes:43200},
  {id:'custom',label:'CUSTOM',minutes:null}
]);
let peStep='choose', peMode='edit', peTarget='', peData=null, peEdit=null, peBusy=false, peBusyToken=0, peEditorSession=0;
let peApplyRetryReceipt=null;
let adminNotificationTargetUsername='',adminNotificationComposerEpoch=0,adminNotificationSendOp=null,adminNotificationRetryReceipt=null,adminNotificationTargetFormOpen=false;
// The loaded-player editor is taller than a phone (and grows as weapons are
// added), so its body scrolls independently while the title/footer stay put.
// Bounds are recalculated by drawScores every frame from the actual content.
let peScroll=0, peScrollMax=0, peScrollViewport=null;
function resetPlayerEditScroll(){ peScroll=0; peScrollMax=0; peScrollViewport=null; scoresRects=[]; }
function scrollPlayerEditBy(delta){
  const before=peScroll;
  peScroll=Math.max(0,Math.min(peScrollMax,peScroll+(Number.isFinite(+delta)?+delta:0)));
  // A wheel event can be followed by a click before the next animation frame.
  // Discard pre-scroll hitboxes so that click can never affect the wrong row.
  if(peScroll!==before) scoresRects=[];
  return peScroll!==before;
}
function playerEditScrollContains(x,y){
  const r=peScrollViewport;
  return !!(scoresOpen&&peStep==='panel'&&r&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);
}
function resetAdminAuditScroll(){ auditScroll=0; auditScrollMax=0; auditScrollViewport=null; auditRects=[]; }
function scrollAdminAuditBy(delta){
  const before=auditScroll;
  auditScroll=Math.max(0,Math.min(auditScrollMax,auditScroll+(Number.isFinite(+delta)?+delta:0)));
  if(auditScroll!==before) auditRects=[];
  return auditScroll!==before;
}
function adminAuditScrollContains(x,y){
  const r=auditScrollViewport;
  return !!(auditOpen&&r&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);
}
function resetReportScroll(){reportScroll=0;reportScrollMax=0;reportScrollViewport=null;updatesRects=[];}
function scrollReportsBy(delta){
  const before=reportScroll;
  reportScroll=Math.max(0,Math.min(reportScrollMax,reportScroll+(Number.isFinite(+delta)?+delta:0)));
  if(reportScroll!==before)updatesRects=[];
  return reportScroll!==before;
}
function reportScrollContains(x,y){
  const r=reportScrollViewport;
  return !!(updatesOpen&&r&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);
}
function currentAuthUserId(){return authUser?String(authUser.id||''):'';}
function adminPrivacyRequestCurrent(epoch,userId){return epoch===adminPrivacyEpoch&&currentAuthUserId()===String(userId||'');}
function clearAdminAuditCache(){
  auditOpen=false;adminAuditPages=[];adminAuditPageMore=[];adminAuditPage=0;adminAuditLoading=false;adminAuditError='';adminAuditHasMore=false;
  resetAdminAuditScroll();
}
function clearPrivatePlayerEditor(){
  peBusyToken++;peEditorSession++;peBusy=false;peStep='choose';peMode='edit';peTarget='';peData=null;peEdit=null;peNotice='';peApplyRetryReceipt=null;
  scoresOpen=false;scoreEditBusy=false;scoreEditOperationReceipt=null;scoreEditOpen=false;resetPlayerEditScroll();
  if(typeof document!=='undefined'){
    const wrap=document.getElementById('scorewrap'),send=document.getElementById('scoresend'),cancel=document.getElementById('scorecancel');
    if(wrap)wrap.style.display='none';if(send)send.disabled=false;if(cancel)cancel.disabled=false;
  }
}
function clearPostComposerPrivateState(){
  postRequestSeq++;setPostBusy(false);postOpen=false;
  if(typeof document!=='undefined'){
    const heading=document.getElementById('postheading'),message=document.getElementById('postmsg'),status=document.getElementById('poststatus');
    if(heading)heading.value='';
    if(message)message.value='';
    if(status)status.textContent='';
  }
}
function clearAdminNotificationComposerState(){
  adminNotificationComposerEpoch++;adminNotificationTargetUsername='';adminNotificationSendOp=null;adminNotificationRetryReceipt=null;
  if(adminNotificationTargetFormOpen&&typeof formOpen!=='undefined'&&formOpen&&typeof closeForm==='function')closeForm();
  adminNotificationTargetFormOpen=false;
  if(typeof document!=='undefined'){
    const subject=document.getElementById('msgsubject');if(subject){subject.value='';subject.hidden=true;subject.disabled=false;}
    const message=document.getElementById('msgmsg'),send=document.getElementById('msgsend'),cancel=document.getElementById('msgcancel');
    if(message)message.disabled=false;if(send)send.disabled=false;if(cancel)cancel.disabled=false;
  }
}
function clearMainOnlyAdminState(){
  const closeStaffReport=!!staffReport;
  bannerDraftEpoch++;pendingBanners=[];
  reportFetchSeq++;reportResolveBusy.clear();reportLoadStatus='';resetReportScroll();
  reportCopyBusy=false;reportCopyStatus='';reportCopyMode='all';reportBulkAction='copy';reportActionMenuOpen=reportAmountMenuOpen=false;reportView='open';
  clearAdminAuditCache();scoreReqs=[];updatesOpen=false;updatesFeed={reports:[]};updatesResolved=[];
  aiLearningOpen=false;adminsOpen=false;storageOpen=false;weaponSuggestionsOpen=false;requestsOpen=false;weaponSuggestionRequestSeq++;weaponSuggestionBusy=false;weaponSuggestions=[];weaponSuggestionPage=0;weaponSuggestionStatus='';clearPostComposerPrivateState();staffReport=false;
  composePickOpen=false;
  if(msgOpen&&typeof msgKind!=='undefined'&&(msgKind==='admin'||msgKind==='player_notification')){msgOpen=false;msgTo='';}
  clearAdminNotificationComposerState();
  if(typeof promoAdminOpen!=='undefined')promoAdminOpen=false;
  if(typeof weaponEditOpen!=='undefined')weaponEditOpen=false;
  if(typeof layoutMode!=='undefined'){layoutMode=false;if(typeof layoutDrag!=='undefined')layoutDrag=null;if(typeof layoutPick!=='undefined')layoutPick=null;}
  if(closeStaffReport&&typeof reportOpen!=='undefined')reportOpen=false;
  if(typeof document!=='undefined')for(const id of ['msgwrap','postwrap'].concat(closeStaffReport?['repwrap']:[])){const el=document.getElementById(id);if(el)el.style.display='none';}
  if(typeof enforceReaderAccess==='function')enforceReaderAccess();
}
function clearCoAndMainAdminState(){
  clearMainOnlyAdminState();
  if(typeof playersOpen!=='undefined')playersOpen=false;
  storageOpen=false;weaponSuggestionsOpen=false;staffReport=false;clearPrivatePlayerEditor();
  if(typeof document!=='undefined')for(const id of ['scorewrap','postwrap','repwrap']){const el=document.getElementById(id);if(el)el.style.display='none';}
}
function scrubPrivilegedUiForAccountChange(){
  adminPrivacyEpoch++;adminRosterFetchSeq++;bannerFetchSeq++;bannerDraftEpoch++;pendingBanners=[];adminRoles={};adminRosterRows=[];adminSelfRole='';adminSelfUsername='';
  adminOpen=adminPanelOpen=aiLearningOpen=adminsOpen=msgsOpen=updatesOpen=archOpen=storageOpen=scoresOpen=weaponSuggestionsOpen=requestsOpen=false;
  if(typeof playersOpen!=='undefined')playersOpen=false;
  if(typeof promoAdminOpen!=='undefined')promoAdminOpen=false;
  if(typeof weaponEditOpen!=='undefined')weaponEditOpen=false;
  if(typeof layoutMode!=='undefined')layoutMode=false;
  reportFetchSeq++;reportResolveBusy.clear();reportLoadStatus='';resetReportScroll();
  reportCopyBusy=false;reportCopyStatus='';reportCopyMode='all';reportBulkAction='copy';reportActionMenuOpen=reportAmountMenuOpen=false;reportView='open';
  inboxTab='msgs';composePickOpen=false;scoreReqs=[];adminMsgs=[];unreadMsgs=0;updatesFeed={reports:[]};updatesResolved=[];weaponSuggestionRequestSeq++;weaponSuggestionBusy=false;weaponSuggestions=[];weaponSuggestionPage=0;weaponSuggestionStatus='';
  clearAdminAuditCache();clearPrivatePlayerEditor();scoreRequestDecisionBusy.clear();
  if(typeof banList!=='undefined')banList=[];if(typeof appealList!=='undefined')appealList=[];
  if(typeof appealDecisionBusy!=='undefined')appealDecisionBusy.clear();if(typeof playerBanActionBusy!=='undefined')playerBanActionBusy.clear();
  if(typeof appealOperationReceipt!=='undefined')appealOperationReceipt=null;if(typeof appealSubmitBusy!=='undefined')appealSubmitBusy=false;
  if(typeof clearReaderState==='function')clearReaderState();
  msgOpen=false;msgTo='';adminMsgOperationId=null;clearPostComposerPrivateState();staffReport=false;if(typeof appealOpen!=='undefined')appealOpen=false;
  clearAdminNotificationComposerState();
  if(typeof document!=='undefined')for(const id of ['scorewrap','msgwrap','appealwrap','postwrap','repwrap']){const el=document.getElementById(id);if(el)el.style.display='none';}
}
function enforceAdminRolePrivacy(previousRank=''){
  if(!isMainAdmin()){
    clearMainOnlyAdminState();
    // Main-only temporary-gift rows and edit controls must not survive a
    // demotion to co-admin. A co-admin may reopen a fresh view-only lookup.
    if(previousRank==='main'||previousRank==='creator')clearPrivatePlayerEditor();
  }
  if(!canUsePlayerTools())clearCoAndMainAdminState();
  if(!isAdmin()&&previousRank)scrubPrivilegedUiForAccountChange();
  else if(typeof enforceReaderAccess==='function')enforceReaderAccess();
}
let lookupBtnRect=null;
// Every player target is a public username. Admin-only RPCs resolve that
// username to Auth privately on the server before returning protected state.
function canSeeStats(){ return canUsePlayerTools(); }
function canEditPlayer(){ return isMainAdmin(); }
function canEditLoadedPlayer(){ return canEditPlayer()&&peData&&!peData.publicOnly; }
function canBan(){ return isMainAdmin(); }            // main admins may ban directly now
function openAiLearning(){
  if(!isMainAdmin()){ aiLearningOpen=false; sfx('dry'); return false; }
  aiLearningDifficulty=4;
  aiLearningSelectedModelId=typeof activeBotModelId==='string'?activeBotModelId:'apex-v5';
  aiLearningNotice='Loading the globally active tactical model…';
  adminPanelOpen=false; aiLearningOpen=true;
  const history=typeof refreshBotModelHistory==='function'?refreshBotModelHistory(true):Promise.resolve(),
    training=typeof refreshAiTrainingSummary==='function'?refreshAiTrainingSummary(true):Promise.resolve();
  void Promise.all([history,training]).then(()=>{
    if(!aiLearningOpen) return;
    aiLearningSelectedModelId=activeBotModelId;
    aiLearningNotice='Tests use Impossible execution for a fair comparison and never change the player ladder.';
  });
  return true;
}
function closeAiLearning(){ aiLearningOpen=false; aiLearningNotice=''; aiLearningRestoreBusyId=''; }
async function confirmAiLearningModelRestore(modelId){
  if(!isMainAdmin()){ closeAiLearning(); sfx('dry'); return false; }
  const model=typeof botModelRelease==='function'?botModelRelease(modelId):null;
  if(!model||model.id===activeBotModelId||aiLearningRestoreBusyId)return false;
  const prompt='Bring back '+model.name+' globally?\n\nFuture CPU matches will use this tactical model. Current matches and every player\'s difficulty/progress stay unchanged.';
  if(typeof confirm!=='function'||!confirm(prompt)){aiLearningNotice='Bring Back Model cancelled.';return false;}
  aiLearningRestoreBusyId=model.id;aiLearningSelectedModelId=model.id;
  aiLearningNotice='Bringing back '+model.name+' for future matches…';
  try{
    const row=await activateBotModelRelease(model.id);
    if(row&&row.accepted===false&&String(row.reason||'')!=='already_active')throw new Error(String(row.reason||'activation rejected'));
    aiLearningSelectedModelId=activeBotModelId;
    aiLearningNotice=model.name+' is LIVE NOW for future matches · current matches and player ladders were unchanged.';
    return true;
  }catch(e){
    aiLearningNotice='Bring Back Model failed · '+String(e&&e.message||'model service unavailable');sfx('dry');return false;
  }finally{aiLearningRestoreBusyId='';}
}
const PE_ITEMS=()=>GEM_SHOP.filter(it=>typeof isWeaponPublished!=='function'||isWeaponPublished(it.key)).map(it=>it.key);
function normalizedPlayerTempGrants(value){
  const out={};
  const put=(key,entry)=>{
    key=String(key||'').trim().toLowerCase();
    if(!PE_ITEMS().includes(key)) return;
    const expiresAt=String(entry&&typeof entry==='object'?(entry.expires_at||entry.expiresAt||''):entry||'');
    const expiry=Date.parse(expiresAt);
    // admin_list RPC already returns server-active rows. The browser clock is
    // display-only here; a skewed device must never hide the Revoke control.
    if(!Number.isFinite(expiry)) return;
    out[key]={expiresAt:new Date(expiry).toISOString(),grantedAt:String(entry&&entry.granted_at||''),
      grantedBy:String(entry&&entry.granted_by_username||'STAFF'),durationMinutes:null,draft:false};
  };
  if(Array.isArray(value)) for(const row of value) put(row&&row.weapon_key,row);
  else if(value&&typeof value==='object') for(const key of Object.keys(value)) put(key,value[key]);
  return out;
}
function clonePlayerTempGrants(value){
  const out={}; for(const key of Object.keys(value||{})) out[key]=Object.assign({},value[key]); return out;
}
function adminOperationUuid(){
  try{if(globalThis.crypto&&typeof globalThis.crypto.randomUUID==='function')return globalThis.crypto.randomUUID();}catch(error){}
  // RFC-4122 v4-shaped fallback for older embedded browsers. It is generated
  // once when an action is staged and then reused for every network retry.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,ch=>{
    const n=Math.floor(Math.random()*16);return (ch==='x'?n:(n&3|8)).toString(16);
  });
}
function peGiftDuration(){
  const preset=PE_GIFT_DURATIONS.find(row=>row.id===peGiftMode);
  return preset&&preset.minutes!=null?preset.minutes:Math.max(5,Math.min(525600,Math.round(+peCustomGiftMinutes||180)));
}
function peGiftDurationLabel(minutes){
  minutes=Math.max(1,Math.round(+minutes||0));
  if(minutes%43200===0) return (minutes/43200)+' month'+(minutes===43200?'':'s');
  if(minutes%10080===0) return (minutes/10080)+' week'+(minutes===10080?'':'s');
  if(minutes%1440===0) return (minutes/1440)+' day'+(minutes===1440?'':'s');
  if(minutes%60===0) return (minutes/60)+' hour'+(minutes===60?'':'s');
  return minutes+' minutes';
}
function peExpiryLabel(value){
  const stamp=Date.parse(value&&typeof value==='object'?value.expiresAt:value);
  if(!Number.isFinite(stamp)) return 'expiry unavailable';
  try{return new Date(stamp).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
  catch(error){return new Date(stamp).toISOString().slice(0,16).replace('T',' ');}
}
function pePermanentDirty(){
  if(!canEditLoadedPlayer()||!peEdit) return false;
  if(peEdit.score!==peData.score||peEdit.gems!==peData.gems||peEdit.coins!==peData.coins) return true;
  for(const k of PE_ITEMS()) if(!!peEdit.owned[k]!==!!peData.owned[k]) return true;
  for(const pu of POWERUPS) if((peEdit.pow[pu.id]||0)!==(peData.pow[pu.id]||0)) return true;
  return false;
}
function peTemporaryChanges(){
  const changes={set:[],revoke:[]};
  if(!canEditLoadedPlayer()||!peEdit||!peData||!peData.tempGrantsLoaded) return changes;
  const before=peData.tempGrants||{},after=peEdit.tempGrants||{};
  for(const key of Object.keys(after)){
    const entry=after[key];
    if(entry&&entry.draft&&Number.isFinite(+entry.durationMinutes)&&entry.operationId)
      changes.set.push({key,durationMinutes:Math.round(+entry.durationMinutes),operationId:String(entry.operationId)});
  }
  for(const key of Object.keys(before)) if(!after[key]&&peEdit.tempRevokes&&peEdit.tempRevokes[key])
    changes.revoke.push({key,operationId:String(peEdit.tempRevokes[key])});
  return changes;
}
function peTemporaryDirty(){ const c=peTemporaryChanges(); return !!(c.set.length||c.revoke.length); }
function pePermanentApplyReceipt(target,patch){
  const fingerprint=String(target||'').toLowerCase()+'\n'+JSON.stringify(patch||{}),stamp=Date.now();
  // Preserve the receipt after an ambiguous timeout. If a main admin stages
  // the same permanent request again, SQL sees the same operation instead of
  // creating a duplicate pending request. A changed patch is a new action.
  if(peApplyRetryReceipt&&peApplyRetryReceipt.fingerprint===fingerprint&&stamp-peApplyRetryReceipt.createdAt<10*60000)
    return peApplyRetryReceipt;
  peApplyRetryReceipt={fingerprint,operationId:adminOperationUuid(),createdAt:stamp};
  return peApplyRetryReceipt;
}
function pePendingSummary(){
  if(!peEdit||!peData) return '';
  const bits=[],pt=pePatch(),tc=peTemporaryChanges();
  if(pt.score!=null)bits.push('score '+pt.score); if(pt.gems!=null)bits.push('gems '+pt.gems); if(pt.coins!=null)bits.push('coins '+pt.coins);
  if(pt.pow)bits.push('upgrades');
  if(pt.grant)bits.push('permanent +'+pt.grant.join('/')); if(pt.revoke)bits.push('permanent -'+pt.revoke.join('/'));
  for(const row of tc.set)bits.push('temporary +'+row.key+' '+peGiftDurationLabel(row.durationMinutes));
  for(const row of tc.revoke)bits.push('temporary revoke '+row.key);
  return bits.join(' · ');
}
function normalizedPlayerOwned(value){
  if(Array.isArray(value)){ const out={}; for(const key of value) out[key]=true; return out; }
  return value&&typeof value==='object'?value:{};
}
function normalizedPlayerData(value,publicOnly){
  const d=value&&typeof value==='object'?value:{};
  return {
    score:Math.max(0,Math.floor(+(d.high_score!=null?d.high_score:d.score)||0)),
    publicMetric:d.public_metric==='arena_wins'?'1v1 WINS':'ENDLESS SCORE',
    gems:Math.max(0,Math.floor(+d.gems||0)),coins:Math.max(0,Math.floor(+d.coins||0)),
    streak:Math.max(0,Math.floor(+d.streak||0)),
    longestStreak:Math.max(0,Math.floor(+(d.longest_streak!=null?d.longest_streak:d.longestStreak)||0)),
    lastLogin:d.last_login||d.lastLogin||'',owned:normalizedPlayerOwned(d.owned),
    pow:d.pow&&typeof d.pow==='object'?d.pow:{},cosmetics:Math.max(0,Math.floor(+d.cosmetics||0)),
    animations:Math.max(0,Math.floor(+d.animations||0)),daily:Array.isArray(d.daily)?d.daily:[],
    wheelSpins:Math.max(0,Math.floor(+(d.wheel_spins!=null?d.wheel_spins:d.wheelSpins)||0)),
    ban:d.ban||null,publicOnly:!!publicOnly,tempGrants:normalizedPlayerTempGrants(d.temp_grants||d.tempGrants),
    tempGrantsLoaded:!!(d.temp_grants_loaded||d.tempGrantsLoaded),tempGrantError:''
  };
}
async function lookupPlayer(target){
  resetPlayerEditScroll();
  const busyToken=++peBusyToken,session=++peEditorSession;
  peBusy=true; peData=null; peEdit=null; peNotice=''; peGiftMode='permanent';
  try{
    const q=String(target||'').trim();
    const privateLookup=typeof canUsePlayerTools==='function'?canUsePlayerTools():isAdmin();
    if(privateLookup){
      if(!/^[A-Za-z0-9_]{3,32}$/.test(q))throw new Error('invalid username');
      const {data,error}=await sb.rpc('outpost_zero_admin_get_player_by_username',{p_target_username:q});
      if(error) throw error;
      if(session!==peEditorSession)return;
      const d=Array.isArray(data)?data[0]:data; if(!d) throw new Error('not found');
      peData=normalizedPlayerData(d,false);
      peTarget=q.toLowerCase();
      if(isMainAdmin()){
        try{
          const grants=await sb.rpc('admin_list_outpost_zero_weapon_grants_by_username',{p_target_username:peTarget});
          if(grants.error) throw grants.error;
          if(session!==peEditorSession)return;
          peData.tempGrants=normalizedPlayerTempGrants(grants.data||[]); peData.tempGrantsLoaded=true;
        }catch(error){
          if(session!==peEditorSession)return;
          peData.tempGrants={}; peData.tempGrantsLoaded=false; peData.tempGrantError='Temporary gifts could not be loaded. Refresh before editing them.';
        }
      }
    } else {
      const publicQuery=/^[A-Za-z0-9_]{3,32}$/.test(q)||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
      if(!publicQuery) throw new Error('invalid public lookup');
      const {data,error}=await sb.rpc('get_outpost_zero_public_player',{p_query:q});
      if(error) throw error;
      if(session!==peEditorSession)return;
      const d=Array.isArray(data)?data[0]:data; if(!d||!d.user_id) throw new Error('not found');
      peData=normalizedPlayerData(d,true);
      peTarget=leaderboardUsername(d);
    }
    if(session!==peEditorSession)return;
    peEdit={score:peData.score, gems:peData.gems, coins:peData.coins,
            owned:Object.assign({}, peData.owned), pow:Object.assign({}, peData.pow),
            tempGrants:clonePlayerTempGrants(peData.tempGrants),tempRevokes:{}};
    peStep='panel';
  }catch(e){ if(session===peEditorSession)peData=null; }
  if(busyToken===peBusyToken)peBusy=false;
}
function peDirty(){
  return pePermanentDirty()||peTemporaryDirty();
}
function pePatch(){
  const pt={};
  if(peEdit.score!==peData.score) pt.score=peEdit.score;
  if(peEdit.gems!==peData.gems)   pt.gems=peEdit.gems;
  if(peEdit.coins!==peData.coins) pt.coins=peEdit.coins;
  const g=[],r=[];
  for(const k of PE_ITEMS()){
    if(peEdit.owned[k] && !peData.owned[k]) g.push(k);
    if(!peEdit.owned[k] && peData.owned[k]) r.push(k);
  }
  if(g.length) pt.grant=g;
  if(r.length) pt.revoke=r;
  const pw={}; let anyPw=false;
  for(const pu of POWERUPS){
    const v=Math.max(0, Math.min(99, Math.round(peEdit.pow[pu.id]||0)));
    if(v!==(peData.pow[pu.id]||0)) anyPw=true;
    if(v) pw[pu.id]=v;
  }
  if(anyPw) pt.pow=pw;                                // upgrades (stocked powerups)
  return pt;
}
async function peApply(){
  if(peBusy||!canEditLoadedPlayer()||!peDirty()) return;
  const applyTarget=String(peTarget||'').toLowerCase(),editorSession=peEditorSession,pt=pePatch(),temp=peTemporaryChanges(),hasPermanent=Object.keys(pt).length>0,
    permanentReceipt=hasPermanent?pePermanentApplyReceipt(applyTarget,pt):null,
    permanentOperationId=permanentReceipt&&permanentReceipt.operationId,
    applyActor=currentAuthUserId(),privacyEpoch=adminPrivacyEpoch;
  const busyToken=++peBusyToken;peBusy=true;
  try{
    const assertCurrentApply=()=>{
      if(editorSession!==peEditorSession||peTarget!==applyTarget||!adminPrivacyRequestCurrent(privacyEpoch,applyActor)||!canEditLoadedPlayer())
        throw new Error('admin session changed');
    };
    const callReceiptRpc=async(name,args)=>{
      let lastError=null;
      for(let attempt=0;attempt<2;attempt++){
        assertCurrentApply();
        const result=await sb.rpc(name,args);
        assertCurrentApply();
        if(!result.error){
          const answer=Array.isArray(result.data)?result.data[0]:result.data;
          if(answer&&answer.accepted!==false)return answer;
          lastError=new Error(String(answer&&answer.reason||'admin action rejected'));
        }else lastError=result.error;
      }
      throw lastError||new Error('admin action unavailable');
    };
    for(const row of temp.set){
      assertCurrentApply();
      await callReceiptRpc('admin_set_outpost_zero_weapon_grant_by_username',{p_target_username:applyTarget,p_weapon_key:row.key,
        p_duration_minutes:row.durationMinutes,p_note:'Player Lookup temporary gift',p_operation_id:row.operationId});
    }
    for(const row of temp.revoke){
      assertCurrentApply();
      await callReceiptRpc('admin_revoke_outpost_zero_weapon_grant_by_username',{p_target_username:applyTarget,p_weapon_key:row.key,
        p_note:'Player Lookup temporary gift revoked',p_operation_id:row.operationId});
    }
    assertCurrentApply();
    if(hasPermanent&&isMainAdmin()){await applyPlayerEdit(applyTarget,pt,permanentOperationId);fetchBoard();}
    assertCurrentApply();
    if(editorSession===peEditorSession&&peTarget===applyTarget){
      await lookupPlayer(applyTarget);
      if(peTarget===applyTarget)peNotice='Changes applied and logged.';
    }
    if(permanentReceipt&&peApplyRetryReceipt===permanentReceipt)peApplyRetryReceipt=null;
  }catch(error){
    if(!adminPrivacyRequestCurrent(privacyEpoch,applyActor)||editorSession!==peEditorSession)return;
    if(editorSession===peEditorSession&&peTarget===applyTarget)peNotice='Could not apply every change · '+String(error&&error.message||'try again');
    // Reload the authoritative server state after any partial success so Retry
    // cannot accidentally extend the same temporary gift twice.
    if(editorSession===peEditorSession&&peTarget===applyTarget){
      await lookupPlayer(applyTarget);
      if(peTarget===applyTarget)peNotice='Could not apply every change. Server state was refreshed; review and try again.';
    }
  }finally{ if(busyToken===peBusyToken)peBusy=false; }
}
function peNum(label, cur, cap){
  let v; try{ v=window.prompt(label, String(cur)); }catch(e){ v=null; }
  if(v===null || String(v).trim()==='') return cur;
  return Math.max(0, Math.min(cap, Math.round(+v||0)));
}
let myBan=null, banMsgT=0, myBanRequestSeq=0, myBanRequest=null, myBanOwnerUserId=null, myBanLastAttemptAt=-Infinity;
const MY_BAN_POLL_MS=60000;                          // {until, note, scopes} when banned
function deviceId(){
  let d=null;
  try{ d=localStorage.getItem('oz_device'); }catch(e){}
  if(!d){
    d='d'+Math.random().toString(36).slice(2)+Date.now().toString(36);
    try{ localStorage.setItem('oz_device', d); }catch(e){}
  }
  return d;
}
function banScopes(){ return (myBan && myBan.scopes) ? myBan.scopes : []; }
function banBlocksPlay(){ const sc=banScopes(); return sc.includes('account')||sc.includes('device'); }
function banBlocksBoard(){ return !!myBan; }          // any live ban keeps you off the leaderboard
function banRefreshMonotonicNow(){return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();}
function clearMyBanForAuthChange(nextUserId=''){
  const deviceBan=!!(myBan&&Array.isArray(myBan.scopes)&&myBan.scopes.includes('device'));
  myBanRequestSeq++;myBanRequest=null;myBan=deviceBan?myBan:null;
  myBanOwnerUserId=deviceBan?String(nextUserId||''):null;myBanLastAttemptAt=-Infinity;
}
function myBanTick(){
  if(sb&&!myBanRequest&&banRefreshMonotonicNow()-myBanLastAttemptAt>=MY_BAN_POLL_MS)void fetchMyBan();
}
async function fetchScoreReqs(){
  if(!sb || !isMainAdmin()) return;
  const epoch=adminPrivacyEpoch,userId=currentAuthUserId();
  try{
    const {data,error}=await sb.rpc('list_outpost_zero_player_requests_by_username',{p_limit:20});
    if(error)throw error;
    if(!adminPrivacyRequestCurrent(epoch,userId)||!isMainAdmin())return;
    scoreReqs=data||[];
  }catch(e){ if(adminPrivacyRequestCurrent(epoch,userId))scoreReqs=[]; }
}
async function adminReceiptRpc(name,args,operationId=adminOperationUuid()){
  let lastError=null;const actor=currentAuthUserId(),privacyEpoch=adminPrivacyEpoch;
  const input=Object.assign({},args,{p_operation_id:operationId});
  for(let attempt=0;attempt<2;attempt++){
    if(!adminPrivacyRequestCurrent(privacyEpoch,actor))throw new Error('account changed');
    const {data,error}=await sb.rpc(name,input);
    if(!adminPrivacyRequestCurrent(privacyEpoch,actor))throw new Error('account changed');
    if(!error){
      const row=Array.isArray(data)?data[0]:data;
      if(row&&row.accepted!==false)return row;
      lastError=new Error(String(row&&row.reason||'admin action rejected'));
    }else lastError=error;
  }
  throw lastError||new Error('admin service unavailable');
}
function submitPlayerEditRequest(username,patch,operationId=adminOperationUuid()){
  return adminReceiptRpc('submit_outpost_zero_player_request_by_username',{p_target_username:String(username||'').trim(),p_patch:patch},operationId);
}
function resolvePlayerEditRequest(id,decision,operationId=adminOperationUuid()){
  return adminReceiptRpc('resolve_outpost_zero_player_request',{p_request_id:id,p_decision:decision},operationId);
}
// a short human summary of a patch, for the pending list
function patchSummary(pt){
  if(!pt) return '';
  const bits=[];
  if(pt.score!=null) bits.push('score '+pt.score);
  if(pt.gems!=null)  bits.push('gems '+pt.gems);
  if(pt.coins!=null) bits.push('coins '+pt.coins);
  if(pt.pow) bits.push('upgrades set');
  if(pt.grant && pt.grant.length) bits.push('+'+pt.grant.join('/'));
  if(pt.revoke && pt.revoke.length) bits.push('-'+pt.revoke.join('/'));
  const sc=(pt.scopes||[]).join('+');
  if(pt.ban==='perm') bits.push('BAN permanent'+(sc?' ['+sc+']':''));
  else if(pt.ban==='unban') bits.push('UNBAN');
  else if(pt.ban) bits.push('BAN '+pt.ban+'d'+(sc?' ['+sc+']':''));
  return bits.join(' \u00b7 ') || 'no changes';
}
async function fetchMyBan(){
  const userId=authUser?String(authUser.id||''):'',requestVersion=authProfileRequestVersion;
  if(!sb){myBan=null;myBanOwnerUserId=userId;return false;}
  if(myBanRequest&&myBanRequest.userId===userId&&myBanRequest.version===requestVersion)return myBanRequest.promise;
  const token=++myBanRequestSeq;myBanLastAttemptAt=banRefreshMonotonicNow();
  const request={token,userId,version:requestVersion,promise:null};
  request.promise=(async()=>{
    try{
      const {data,error}=await sb.rpc('get_my_outpost_zero_ban',{p_device:deviceId()}); // server resolves this account + device
      if(error)throw error;
      if(token!==myBanRequestSeq||(authUser?String(authUser.id||''):'')!==userId||requestVersion!==authProfileRequestVersion)return false;
      const d=Array.isArray(data)?data[0]:data;
      myBanOwnerUserId=userId;
      if(!d||isCreator()){myBan=null;return true;}                                  // successful empty result means expired/lifted
      myBan={until:d.until,note:d.note||'',scopes:Array.isArray(d.scopes)?d.scopes:['account']};
      return true;
    }catch(error){
      // A transport failure cannot prove that a known ban ended. Keep the
      // same identity fail-closed until a successful server poll says empty.
      if(token===myBanRequestSeq&&(authUser?String(authUser.id||''):'')===userId&&myBanOwnerUserId!==userId)myBan=null;
      return false;
    }finally{
      if(myBanRequest&&myBanRequest.token===token)myBanRequest=null;
    }
  })();
  myBanRequest=request;return request.promise;
}
function banBlurb(){
  if(!myBan) return '';
  const when = myBan.until ? ('until '+String(myBan.until).slice(0,10)) : 'permanently';
  const sc=banScopes();
  const what = sc.includes('device') ? 'This device is banned'
             : sc.includes('account') ? 'Your account is banned'
             : 'You are barred from the leaderboard';
  return what+' '+when+(myBan.note?' \u2014 '+myBan.note:'');
}
function openScoreEdit(){
  scoreEditOpen=true; scoresOpen=false; adminPanelOpen=false;
  $('scorewrap').style.display='flex'; $('scorestatus').textContent='';
  for(const id of ['scoreemail','scoreval','pgems','pcoins','pgrant','prevoke','pnote']) $(id).value='';
  $('pban').value='';
  $('pscope_account').checked=true; $('pscope_device').checked=false; $('pscope_board').checked=false;
  const banning = peMode==='ban';
  // Lookup, edits, grants, and bans all use the same public username.
  for(const id of ['scoreval','pgems','pcoins','pgrant','prevoke']) $(id).style.display='none';
  $('pban').style.display   = banning?'':'none';
  $('pscopes').style.display= banning?'':'none';
  $('pnote').style.display  = banning?'':'none';
  $('scoretitle').textContent = banning ? '\u26D4 BAN PLAYER'
                              : canEditPlayer() ? '\u270E PLAYER EDIT' : '\uD83D\uDD0D PLAYER LOOKUP';
  const targetInput=$('scoreemail');
  targetInput.type='text';
  targetInput.inputMode='text';
  targetInput.autocomplete='off';
  targetInput.autocapitalize='none';
  $('scorehint').textContent = banning
    ? 'Enter the player\u2019s username, then choose the ban details.'
    : 'Enter the player\u2019s username.';
  targetInput.placeholder='username';
  $('scoresend').textContent = banning ? (canBan()?'BAN':'REQUEST BAN') : 'LOOK UP';
  scoreEditBusy=false;scoreEditOperationReceipt=null;$('scoresend').disabled=false;
  try{ $('scoreemail').focus(); }catch(e){}
}
function itemList(v){
  return String(v||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).slice(0,20);
}
function buildPatch(){                                // read the form into a patch, or return an error
  const username=String($('scoreemail').value||'').trim().replace(/^@/,'');
  if(!/^[A-Za-z0-9_]{3,32}$/.test(username)) return {err:'enter a valid username'};
  const num=(id,cap)=>{ const raw=String($(id).value||'').trim();
    if(raw==='') return null; return Math.max(0, Math.min(cap, Math.round(+raw||0))); };
  const pt={};
  const sc=num('scoreval',99999999); if(sc!==null) pt.score=sc;
  const gm=num('pgems',9999999);     if(gm!==null) pt.gems=gm;
  const cn=num('pcoins',9999999);    if(cn!==null) pt.coins=cn;
  const g=itemList($('pgrant').value), r=itemList($('prevoke').value);
  if(g.length) pt.grant=g;
  if(r.length) pt.revoke=r;
  const ban=String($('pban').value||'');
  if(ban){
    pt.ban = ban==='perm' ? 'perm' : ban==='unban' ? 'unban' : String(Math.max(1,Math.min(3650,+ban||1)));
    if(ban!=='unban'){
      const sc=[];
      if($('pscope_account').checked) sc.push('account');
      if($('pscope_device').checked)  sc.push('device');
      if($('pscope_board').checked)   sc.push('leaderboard');
      if(!sc.length) return {err:'pick what the ban covers'};
      pt.scopes=sc;
    }
  }
  const note=String($('pnote').value||'').trim().slice(0,200);
  if(note) pt.note=note;
  if(!Object.keys(pt).filter(k=>k!=='note').length) return {err:'nothing to change'};
  if(pt.ban && pt.ban!=='unban' && !pt.note) return {err:'a ban needs a note'};
  return {username, patch:pt};
}
async function applyPlayerEdit(username, patch, operationId=adminOperationUuid()){ // server re-checks rank + receipts retries
  username=String(username||'').trim();
  let lastError=null;const actor=currentAuthUserId(),privacyEpoch=adminPrivacyEpoch;
  for(let attempt=0;attempt<2;attempt++){
    if(!adminPrivacyRequestCurrent(privacyEpoch,actor))throw new Error('account changed');
    const {data,error}=await sb.rpc('outpost_zero_admin_edit_player_by_username',{p_target_username:username,p_patch:patch,p_operation_id:operationId});
    if(!adminPrivacyRequestCurrent(privacyEpoch,actor))throw new Error('account changed');
    if(!error&&data!==false&&data!==null)return true;
    lastError=error||new Error('no such player');
  }
  throw lastError||new Error('player edit unavailable');
}
function setScoreEditBusy(value){
  scoreEditBusy=!!value;
  const button=$('scoresend');if(button)button.disabled=scoreEditBusy;
  const cancel=$('scorecancel');if(cancel)cancel.disabled=scoreEditBusy;
}
function closeScoreEdit(){
  if(scoreEditBusy)return false;
  scoreEditOpen=false; $('scorewrap').style.display='none'; if(!scoresOpen){ scoresOpen=true; peStep=peData?'panel':'choose'; } return true;
}
async function submitScoreEdit(){
  if(scoreEditBusy)return;
  if(peMode!=='ban'){
    const query=String($('scoreemail').value||'').trim().replace(/^@/,'');
    if(typeof canUsePlayerTools==='function'?canUsePlayerTools():isAdmin()){
      if(!/^[A-Za-z0-9_]{3,32}$/.test(query)){ $('scorestatus').textContent='enter a valid username'; return; }
    } else if(!/^[A-Za-z0-9_]{3,32}$/.test(query)){
      $('scorestatus').textContent='enter a valid username'; return;
    }
    if(!sb){ $('scorestatus').textContent='preview build \u2014 works on the live site'; return; }
    $('scorestatus').textContent='looking up...';setScoreEditBusy(true);
    try{
      await lookupPlayer(query);
      if(!peData){ $('scorestatus').textContent='username not found'; return; }
    }finally{setScoreEditBusy(false);}
    closeScoreEdit(); scoresOpen=true; peStep='panel';
    return;
  }
  const f=buildPatch();
  if(f.err){ $('scorestatus').textContent=f.err; return; }
  if(!sb){ $('scorestatus').textContent='preview build \u2014 works on the live site'; return; }
  if(!canEditPlayer()){ $('scorestatus').textContent='not allowed'; return; }
  const fingerprint=f.username.toLowerCase()+'\n'+JSON.stringify(f.patch);
  if(!scoreEditOperationReceipt||scoreEditOperationReceipt.fingerprint!==fingerprint)
    scoreEditOperationReceipt={fingerprint,operationId:adminOperationUuid()};
  const operationId=scoreEditOperationReceipt.operationId;
  $('scorestatus').textContent='working...';setScoreEditBusy(true);
  let completed=false;
  try{
    if(isMainAdmin()){
      await applyPlayerEdit(f.username, f.patch,operationId);
      $('scorestatus').textContent='player updated';
      fetchBoard(); fetchPlayersData();
    }
    completed=true;scoreEditOperationReceipt=null;
    setTimeout(()=>{setScoreEditBusy(false);closeScoreEdit();},1200);
  }catch(err){ $('scorestatus').textContent='failed \u2014 check the username and try again'; }
  finally{if(!completed)setScoreEditBusy(false);}
}
async function approveScoreReq(r){
  if(!isMainAdmin() || !sb) return;
  const key=String(r&&r.id||'');if(!key||scoreRequestDecisionBusy.has(key))return;
  scoreRequestDecisionBusy.add(key);const operationId=adminOperationUuid();
  try{
    await resolvePlayerEditRequest(r.id,'approve',operationId);
    fetchBoard();
  }catch(e){}finally{await fetchScoreReqs();scoreRequestDecisionBusy.delete(key);}
}
async function rejectScoreReq(r){
  if(!isMainAdmin() || !sb) return;
  const key=String(r&&r.id||'');if(!key||scoreRequestDecisionBusy.has(key))return;
  scoreRequestDecisionBusy.add(key);const operationId=adminOperationUuid();
  try{ await resolvePlayerEditRequest(r.id,'reject',operationId); }catch(e){}finally{await fetchScoreReqs();scoreRequestDecisionBusy.delete(key);}
}
let archOpen=false,archRects=[],storageOpen=false,storageRects=[],archHubBtnRect=null;
let updatesResolved=[],reportFetchSeq=0,reportLoadStatus='';
const reportResolveBusy=new Set(),REPORT_FETCH_PAGE_SIZE=250,REPORT_FETCH_PAGE_CAP=200;
let adminMsgs=[], unreadMsgs=0, msgOpen=false, msgTo='',adminMsgOperationId=null;
function normalizeAdminAuditRow(row){
  const r=row&&typeof row==='object'?row:{};
  return {eventId:/^\d+$/.test(String(r.event_id||''))?String(r.event_id):'',actor:String(r.actor_username||'STAFF'),target:String(r.target_username||'SYSTEM'),
    action:String(r.action||'admin.action'),result:String(r.result||'ok'),details:r.details&&typeof r.details==='object'?r.details:{},
    createdAt:String(r.created_at||'')};
}
function adminAuditPageRows(){ return adminAuditPages[adminAuditPage]||[]; }
const ADMIN_AUDIT_ACTION_TITLES=Object.freeze({
  'temporary_weapon.grant':'Temporary weapon grant',
  'temporary_weapon.extend':'Temporary weapon extension',
  'temporary_weapon.revoke':'Temporary weapon removal',
  'permanent_weapon.grant':'Permanent weapon grant',
  'permanent_weapon.revoke':'Permanent weapon removal',
  'score.edit':'Player score change','currency.edit':'Player currency change','upgrades.edit':'Player upgrade change',
  'ban.apply':'Player ban','ban.unban':'Player unban','player.edit':'Player edit',
  'player.edit.receipt':'Player edit completed','player_request.submit':'Player edit requested',
  'player_request.approve':'Player edit request approval','player_request.reject':'Player edit request rejection',
  'player_request.resolve':'Player edit request reviewed','ban_appeal.submit':'Ban appeal submitted',
  'ban_appeal.lift':'Ban appeal approval','ban_appeal.deny':'Ban appeal denial','ban_appeal.resolve':'Ban appeal review',
  'weapon.definition.edit':'Weapon settings changed'
});
const ADMIN_AUDIT_REASON_TEXT=Object.freeze({
  target_not_found:'that player was not found',creator_approval_required:'creator approval is required',
  creator_protected:'the creator account is protected',legacy_edit_rejected:'the saved player edit was rejected',
  edit_rejected:'the player edit was rejected',already_at_requested_values:'the player already had the requested values',
  granted:'access was granted',extended:'the expiration was extended',not_extended:'the existing access already lasts longer',
  revoked:'access was removed',not_active:'that temporary access was not active',submitted:'it was sent for review',
  approved:'it was approved',rejected:'it was rejected',request_not_found:'the request was not found',
  already_decided:'the request had already been decided',unban_rejected:'the ban could not be removed',
  appeal_not_found:'the appeal was not found',approve:'approved',reject:'rejected',lift:'approved and the ban was removed',deny:'denied',
  lifted:'the ban was removed',denied:'the appeal was denied',
  operation_conflict:'a different saved action used the same request receipt',operation_in_progress:'the same action is still being saved'
});
const ADMIN_AUDIT_FIELD_TEXT=Object.freeze({
  score:'score',gems:'gems',coins:'coins',grant:'permanent weapon access',revoke:'permanent weapon removal',
  pow:'upgrade inventory',ban:'ban status',scopes:'ban coverage',note:'admin note',accepted:'completion status',changed:'values changed'
});
const ADMIN_AUDIT_WEAPON_TEXT=Object.freeze({
  ar:'SCAR-H Rifle',volt:'Volt Pistol',dart:'Dart Pistol',hammer:'War Hammer',twinsai:'Twin Sai',
  railgun:'Arc Railgun',medkit:'Field Medkit',grenade:'Frag Grenade',freezer:'Freezer'
});
const ADMIN_AUDIT_DETAIL_LABELS=Object.freeze({
  field:'Requested change',fields:'Requested changes',grant:'Permanent weapon access',revoke:'Permanent weapon removal',
  weapon_key:'Weapon',weapon_keys:'Weapons',duration_minutes:'Requested duration',
  previous_expires_at:'Previous expiration',expires_at:'New expiration',note:'Admin note',reason:'Explanation',
  before:'Previous value',after:'New value',gems_before:'Previous gems',gems_after:'New gems',
  coins_before:'Previous coins',coins_after:'New coins',request_id:'Request number',appeal_id:'Appeal number',
  decision:'Decision',status:'Saved status',scopes:'Ban coverage',until:'Ban ends',summary:'Summary',sqlstate:'Error code',
  stats:'Weapon stats',price_cost:'Gem price',published:'Published'
});
const ADMIN_AUDIT_HIDDEN_DETAILS=new Set(['operation','request_fingerprint','target_key','accepted','changed']);
function adminAuditLabelize(field){
  return String(field||'action').replace(/[._-]+/g,' ').replace(/\s+/g,' ')
    .replace(/(^|\s)[a-z]/g,m=>m.toUpperCase()).trim();
}
function adminAuditPlainWords(value){
  const key=String(value==null?'':value).trim().toLowerCase();
  if(!key)return 'none';
  if(ADMIN_AUDIT_REASON_TEXT[key])return ADMIN_AUDIT_REASON_TEXT[key];
  if(ADMIN_AUDIT_FIELD_TEXT[key])return ADMIN_AUDIT_FIELD_TEXT[key];
  return key.replace(/[._-]+/g,' ').replace(/\s+/g,' ').trim();
}
function adminAuditWeaponName(value){
  const key=String(value==null?'':value).trim().toLowerCase();
  return ADMIN_AUDIT_WEAPON_TEXT[key]||adminAuditLabelize(key||'unknown weapon');
}
function adminAuditFormatDate(value){
  const stamp=Date.parse(String(value||''));
  if(!Number.isFinite(stamp))return adminAuditPlainWords(value||'unknown');
  try{return new Date(stamp).toLocaleString();}catch(error){return new Date(stamp).toISOString().replace('T',' ').slice(0,16);}
}
function adminAuditDetailLabel(key){return ADMIN_AUDIT_DETAIL_LABELS[key]||adminAuditLabelize(key);}
function adminAuditFormatValue(value,key=''){
  if(value===null||value===undefined)return 'none';
  if(typeof value==='boolean')return value?'yes':'no';
  if(typeof value==='number'&&Number.isFinite(value))return key==='duration_minutes'?value+' minute'+(value===1?'':'s'):String(value);
  if(Array.isArray(value)){
    if(!value.length)return 'none';
    if(key==='weapon_keys')return value.map(adminAuditWeaponName).join(', ');
    if(key==='fields')return value.map(item=>ADMIN_AUDIT_FIELD_TEXT[String(item||'').toLowerCase()]||adminAuditPlainWords(item)).join(', ');
    return value.map(item=>adminAuditFormatValue(item,key)).join('; ');
  }
  if(typeof value==='object'){
    const parts=[];
    for(const nestedKey of Object.keys(value)){
      if(ADMIN_AUDIT_HIDDEN_DETAILS.has(nestedKey))continue;
      parts.push(adminAuditDetailLabel(nestedKey)+': '+adminAuditFormatValue(value[nestedKey],nestedKey));
    }
    return parts.join(', ')||'none';
  }
  const text=String(value).trim();if(!text)return 'empty';
  if(/^(true|false)$/i.test(text))return text.toLowerCase()==='true'?'yes':'no';
  if(key==='weapon_key')return adminAuditWeaponName(text);
  if(ADMIN_AUDIT_REASON_TEXT[text.toLowerCase()]||ADMIN_AUDIT_FIELD_TEXT[text.toLowerCase()])return adminAuditPlainWords(text);
  if(key==='reason'||key==='decision'||key==='status'||key==='result'||key==='fields')return adminAuditPlainWords(text);
  if(/(?:^|_)(?:at|until|expires)$/.test(key)||/(?:_at|_until|_expires_at)$/.test(key))return adminAuditFormatDate(text);
  return text;
}
function adminAuditActionTitle(action){
  const key=String(action||'').toLowerCase();return ADMIN_AUDIT_ACTION_TITLES[key]||adminAuditLabelize(key||'admin action');
}
function adminAuditOutcome(result){
  const key=String(result||'').toLowerCase();
  return ({applied:'completed',ok:'completed',success:'completed',accepted:'accepted',submitted:'sent for review',
    rejected:'rejected',failed:'failed',no_change:'no change was needed',approved:'approved',denied:'denied',lifted:'approved'})[key]||adminAuditPlainWords(key||'unknown');
}
function adminAuditReasonSuffix(details){
  const reason=details&&details.reason;if(reason==null||String(reason).trim()==='')return '';
  return ' Reason: '+adminAuditPlainWords(reason)+'.';
}
function adminAuditHumanSummary(row){
  const r=row&&typeof row==='object'?row:{},action=String(r.action||'').toLowerCase(),result=String(r.result||'').toLowerCase(),
    d=r.details&&typeof r.details==='object'?r.details:{},failed=result==='rejected'||result==='failed',reason=adminAuditReasonSuffix(d),
    fields=adminAuditFormatValue(d.fields,'fields'),weaponValue=d.weapon_key?adminAuditWeaponName(d.weapon_key):adminAuditFormatValue(d.weapon_keys,'weapon_keys'),
    weapon=weaponValue==='none'?'the selected weapon':weaponValue;
  if(action==='score.edit')return failed?'The score change failed.'+reason:d.before===undefined&&d.after===undefined?'Changed the player\'s score.':'Changed the player\'s score from '+adminAuditFormatValue(d.before)+' to '+adminAuditFormatValue(d.after)+'.';
  if(action==='currency.edit'){
    const changes=[];
    if(d.gems_before!==undefined||d.gems_after!==undefined)changes.push('gems from '+adminAuditFormatValue(d.gems_before)+' to '+adminAuditFormatValue(d.gems_after));
    if(d.coins_before!==undefined||d.coins_after!==undefined)changes.push('coins from '+adminAuditFormatValue(d.coins_before)+' to '+adminAuditFormatValue(d.coins_after));
    return failed?'The currency change failed.'+reason:'Changed '+(changes.join(' and ')||'the player\'s currency')+'.';
  }
  if(action==='upgrades.edit')return failed?'The upgrade change failed.'+reason:d.before===undefined&&d.after===undefined?'Changed the player\'s upgrades.':'Changed upgrades from '+adminAuditFormatValue(d.before)+' to '+adminAuditFormatValue(d.after)+'.';
  if(action==='permanent_weapon.grant')return failed?'Could not grant permanent access to '+weapon+'.'+reason:'Granted permanent access to '+weapon+'.';
  if(action==='permanent_weapon.revoke')return failed?'Could not remove permanent access to '+weapon+'.'+reason:'Removed permanent access to '+weapon+'.';
  if(action==='temporary_weapon.grant'||action==='temporary_weapon.extend'){
    const verb=action.endsWith('.grant')?'Granted':'Extended',duration=d.duration_minutes!=null?' for '+adminAuditFormatValue(d.duration_minutes,'duration_minutes'):'',
      expiry=d.expires_at?' Access ends '+adminAuditFormatDate(d.expires_at)+'.':'';
    if(failed)return 'Could not '+verb.toLowerCase()+' temporary access to '+weapon+'.'+reason;
    if(result==='no_change')return 'Temporary access to '+weapon+' was unchanged.'+reason;
    return verb+' temporary access to '+weapon+duration+'.'+expiry;
  }
  if(action==='temporary_weapon.revoke'){
    if(failed)return 'Could not remove temporary access to '+weapon+'.'+reason;
    if(result==='no_change')return 'No temporary access to '+weapon+' was active.';
    return 'Removed temporary access to '+weapon+'.';
  }
  if(action==='weapon.definition.edit'){
    const settings=[];
    if(d.stats&&typeof d.stats==='object')settings.push(adminAuditFormatValue(d.stats,'stats'));
    if(d.price_cost!==undefined)settings.push('Gem price: '+adminAuditFormatValue(d.price_cost));
    if(d.published!==undefined)settings.push('Published: '+adminAuditFormatValue(d.published));
    return 'Changed '+weapon+(settings.length?'. '+settings.join('. '):'')+'.';
  }
  if(action==='ban.apply')return failed?'Could not ban the player.'+reason:d.before===undefined&&d.after===undefined?'Banned the player.':'Banned the player. Ban records changed from '+adminAuditFormatValue(d.before)+' to '+adminAuditFormatValue(d.after)+'.';
  if(action==='ban.unban')return failed?'Could not remove the player\'s ban.'+reason:d.before===undefined&&d.after===undefined?'Removed the player\'s ban.':'Removed the player\'s ban. Ban records changed from '+adminAuditFormatValue(d.before)+' to '+adminAuditFormatValue(d.after)+'.';
  if(action==='player.edit.receipt')return d.changed===false?'Finished the player edit; the requested values already matched.':'Finished the player edit. Requested changes: '+fields+'.';
  if(action==='player.edit'){
    if(result==='no_change')return 'No player values changed because they already matched. Requested changes: '+fields+'.';
    return (failed?'The player edit was rejected.':'The player edit was '+adminAuditOutcome(result)+'.')+' Requested changes: '+fields+'.'+reason;
  }
  if(action.startsWith('player_request.')){
    const id=d.request_id!=null?' #'+d.request_id:'',decision=adminAuditPlainWords(d.decision||action.split('.').pop());
    if(action.endsWith('.submit'))return (failed?'Could not submit':'Submitted')+' player edit request'+id+'. Requested changes: '+fields+'.'+reason;
    if(failed)return 'Player edit request'+id+' could not be completed.'+reason;
    return 'Player edit request'+id+' was '+decision+'.'+reason;
  }
  if(action.startsWith('ban_appeal.')){
    const id=d.appeal_id!=null?' #'+d.appeal_id:'',decision=adminAuditPlainWords(d.decision||action.split('.').pop());
    if(action.endsWith('.submit'))return (failed?'Could not submit':'Submitted')+' ban appeal'+id+'.'+reason;
    if(failed)return 'Ban appeal'+id+' could not be completed.'+reason;
    return 'Ban appeal'+id+' was '+decision+'.'+reason;
  }
  if(action.startsWith('admin.')){
    const before=adminAuditPlainWords(d.before_role||'none'),after=adminAuditPlainWords(d.after_role||'none');
    if(action==='admin.add')return result==='no_change'?'The staff member already had the requested role.':'Added the staff member as '+after+'.';
    if(action==='admin.promote')return failed?'The staff promotion was rejected.'+reason:'Promoted the staff member from '+before+' to '+after+'.';
    if(action==='admin.demote')return failed?'The staff demotion was rejected.'+reason:'Demoted the staff member from '+before+' to '+after+'.';
    if(action==='admin.remove')return failed?'The staff removal was rejected.'+reason:'Removed the '+before+' staff role.';
  }
  return adminAuditActionTitle(action)+' was '+adminAuditOutcome(result)+'.'+reason;
}
function adminAuditReadableDetailLines(row){
  const details=row&&row.details&&typeof row.details==='object'?row.details:{},lines=[];
  for(const key of Object.keys(details)){
    if(ADMIN_AUDIT_HIDDEN_DETAILS.has(key))continue;
    lines.push(adminAuditDetailLabel(key)+': '+adminAuditFormatValue(details[key],key));
  }
  return lines;
}
function adminAuditDetailsSummary(row){return adminAuditHumanSummary(row);}
function adminAuditDetailsText(row){
  if(!row)return '';
  const detailLines=['WHAT HAPPENED: '+adminAuditHumanSummary(row),'OUTCOME: '+adminAuditOutcome(row.result),
    'DONE BY: '+row.actor,'AFFECTED PLAYER: '+(row.target||'no specific player'),'WHEN: '+adminAuditFormatDate(row.createdAt)],
    extra=adminAuditReadableDetailLines(row);
  if(extra.length)detailLines.push('','MORE INFORMATION:',...extra);
  return detailLines.join('\n');
}
async function fetchAdminAuditLog(reset=false){
  if(!sb||!authUser||!isMainAdmin()){
    adminAuditPages=[]; adminAuditPage=0; adminAuditHasMore=false; adminAuditError='Main-admin access required.'; return false;
  }
  if(adminAuditLoading) return false;
  const epoch=adminPrivacyEpoch,userId=currentAuthUserId();
  adminAuditLoading=true; adminAuditError='';
  try{
    if(reset){adminAuditPages=[];adminAuditPageMore=[];adminAuditPage=0;adminAuditHasMore=false;resetAdminAuditScroll();}
    const existing=adminAuditPages[adminAuditPage];
    if(existing){adminAuditHasMore=!!adminAuditPageMore[adminAuditPage];return true;}
    const previous=adminAuditPage>0?adminAuditPages[adminAuditPage-1]:null;
    const before=previous&&previous.length?previous[previous.length-1].eventId:null;
    const {data,error}=await sb.rpc('list_outpost_zero_admin_audit_by_username',{p_before_event_id:before,p_limit:ADMIN_AUDIT_PAGE_SIZE+1});
    if(error) throw error;
    if(!adminPrivacyRequestCurrent(epoch,userId)||!isMainAdmin())return false;
    const fetched=(data||[]).map(normalizeAdminAuditRow).filter(row=>row.eventId);
    adminAuditHasMore=fetched.length>ADMIN_AUDIT_PAGE_SIZE;
    adminAuditPages[adminAuditPage]=fetched.slice(0,ADMIN_AUDIT_PAGE_SIZE);adminAuditPageMore[adminAuditPage]=adminAuditHasMore;resetAdminAuditScroll();
    return true;
  }catch(error){
    if(!adminPrivacyRequestCurrent(epoch,userId))return false;
    adminAuditError=String(error&&error.message||'Audit log unavailable.');
    adminAuditHasMore=false; return false;
  }finally{if(adminPrivacyRequestCurrent(epoch,userId))adminAuditLoading=false;}
}
async function adminAuditOlder(){
  if(adminAuditLoading||!adminAuditHasMore)return false;
  adminAuditPage++; resetAdminAuditScroll();
  const ok=await fetchAdminAuditLog(false);
  if(!ok&&adminAuditPage>0){adminAuditPage--;adminAuditHasMore=!!adminAuditPageMore[adminAuditPage];}
  return ok;
}
function adminAuditNewer(){
  if(adminAuditLoading||adminAuditPage<=0)return false;
  adminAuditPage--;adminAuditHasMore=!!adminAuditPageMore[adminAuditPage];resetAdminAuditScroll();return true;
}
async function fetchMsgs(){
  if(!sb || !authUser || !isAdmin()){ return false; }
  const epoch=adminPrivacyEpoch,userId=currentAuthUserId();
  try{
    const {data,error}=await sb.rpc('list_my_outpost_zero_admin_messages',{p_limit:30});
    if(error)throw error;
    if(!adminPrivacyRequestCurrent(epoch,userId)||!isAdmin())return false;
    adminMsgs=(data||[]).map(row=>({
      id:+row.message_id,from_username:String(row.from_username||'STAFF'),to_username:String(row.to_username||'STAFF'),
      message:String(row.message||''),read:!!row.read,read_at:row.read_at||null,archived:!!row.archived,
      created_at:row.created_at||null,is_incoming:!!row.is_incoming
    }));
    unreadMsgs=adminMsgs.filter(m=>m.is_incoming&&!m.read).length;
    return true;
  }catch(e){return false;}
}
function msgArchived(m){                             // manual archive, or auto 7 days after being read
  if(m.archived) return true;
  if(m.read && m.read_at && (Date.now()-Date.parse(m.read_at)) > 7*86400000) return true;
  return false;
}
async function markMsgsRead(){
  const ts=new Date().toISOString(),epoch=adminPrivacyEpoch,userId=currentAuthUserId();
  if(sb && authUser){
    try{ await sb.rpc('mark_my_outpost_zero_admin_messages_read',{p_message_ids:null}); }catch(e){}
  }
  if(!adminPrivacyRequestCurrent(epoch,userId)||!isAdmin())return false;
  for(const m of adminMsgs) if(m.is_incoming&&!m.read){m.read=true;m.read_at=ts;}
  unreadMsgs=0;
  return true;
}
async function archiveMsg(id){                        // recipients can tuck a message away early
  const m=adminMsgs.find(x=>x.id===id);
  if(m&&m.is_incoming)m.archived=true;
  if(sb&&authUser){try{await sb.rpc('archive_my_outpost_zero_admin_message',{p_message_id:id});}catch(e){}}
}
let composePickOpen=false;
function openComposePick(){ composePickOpen=true; fetchAdmins(); }
function drawComposePick(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const {pw,ph,px,py}=typeof adminInboxBounds==='function'?adminInboxBounds():{pw:W-12,ph:H-12,px:6,py:6};
  ctx.fillStyle='#0a0c0e'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#cfe0a8'; ctx.font='700 16px ui-monospace,Consolas,monospace';
  ctx.fillText('\u270E WHO TO?', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText('pick an admin to message', W/2, py+42);
  msgsRects=[];                                      // the picker owns the rects while it is up
  const x0=px+16, rw=pw-32; let y=py+56;
  const list=adminRoster().filter(r=>!r.isSelf&&r.username);
  if(!list.length){
    ctx.fillStyle='#5a5648'; ctx.fillText('no other admins yet', W/2, y+14);
  }
  const h=36,maxRows=Math.max(1,Math.floor((py+ph-54-y)/(h+6)));
  for(const r of list.slice(0,maxRows)){
    if(y+h>py+ph-52) break;
    msgsRects.push({x:x0,y,w:rw,h,id:'to:'+r.username});
    const hv=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+h;
    ctx.fillStyle=hv?'rgba(167,193,94,0.28)':'rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
    ctx.strokeStyle='#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle='#cdd6b0'; ctx.font='700 9px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine('@'+r.username, rw-90), x0+10, y+h/2);
    ctx.textAlign='right'; ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
    ctx.fillText(r.rank==='creator'?'CREATOR':r.rank==='main'?'MAIN':'CO', x0+rw-10, y+h/2);
    ctx.textBaseline='alphabetic';
    y+=h+5;
  }
  const cbw=Math.min(240,pw-40), cbh=36, cbx=W/2-cbw/2, cby=py+ph-42;
  msgsRects.push({x:cbx,y:cby,w:cbw,h:cbh,id:'pickcancel'});
  const chv=mouse.x>=cbx&&mouse.x<=cbx+cbw&&mouse.y>=cby&&mouse.y<=cby+cbh;
  ctx.fillStyle=chv?'#d05548':'rgba(208,85,72,0.14)'; ctx.fillRect(cbx,cby,cbw,cbh);
  ctx.strokeStyle='#d05548'; ctx.lineWidth=1; ctx.strokeRect(cbx+0.5,cby+0.5,cbw,cbh);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=chv?'#101208':'#e0a8a0'; ctx.font='700 10px ui-monospace,Consolas,monospace';
  ctx.fillText('CANCEL', W/2, cby+cbh/2);
  ctx.textAlign='left'; ctx.textBaseline='top';
}
function openMsgCompose(to){
  msgTo=String(to||'').toLowerCase(); if(!msgTo) return;
  adminMsgOperationId=adminOperationUuid();
  msgKind='admin'; socialMessageTo=null;
  clearAdminNotificationComposerState();
  msgOpen=true; adminsOpen=false;
  $('msgwrap').style.display='flex'; $('msgstatus').textContent='';
  $('msgmsg').value='';
  $('msgmsg').maxLength=500;
  $('msgto').textContent='to: '+msgTo;
  const title=$('msgbox').querySelector('h2'); if(title) title.textContent='✉ MESSAGE';
  try{ $('msgmsg').focus(); }catch(e){}
}
function adminNotificationUsername(value){
  const username=String(value||'').trim().replace(/^@/,'');
  return /^[A-Za-z0-9_]{3,32}$/.test(username)&&!/^(?:username_?not_?set|usernamenotset)$/i.test(username)?username:'';
}
function adminNotificationRpcMissing(error){
  const text=[error&&error.code,error&&error.message,error&&error.details,error&&error.hint].filter(Boolean).join(' ').toLowerCase();
  return /pgrst202|could not find.*function|function .* does not exist/.test(text);
}
function adminNotificationSemanticError(error){
  const code=String(error&&error.code||'').toUpperCase(),message=String(error&&error.message||'').toUpperCase();
  return ['P0001','22023','22004','42501'].includes(code)||/RATE_LIMIT|TARGET_UNAVAILABLE|OPERATION_CONFLICT|ACCESS REQUIRED/.test(message);
}
function adminNotificationComposerAvailable(){
  return !!(sb&&isMainAdmin()&&typeof socialNotificationSqlReady!=='undefined'&&socialNotificationSqlReady===true);
}
function adminOpenPlayerTargetMessage(username=''){
  if(!adminNotificationComposerAvailable()){
    peNotice='Player messages need Admin 03 Inbox and creator/main access.';sfx('dry');return false;
  }
  const target=adminNotificationUsername(username);
  if(!target){
    const owner=currentAuthUserId(),epoch=adminPrivacyEpoch;
    adminNotificationTargetFormOpen=true;
    openForm({title:'MESSAGE A PLAYER',hint:'Enter the player’s chosen public username. Account emails and IDs are never shown here.',saveLabel:'WRITE MESSAGE',
      fields:[{id:'username',label:'PLAYER USERNAME',type:'text',placeholder:'operator_7'}],onSave:values=>{
        if(!adminPrivacyRequestCurrent(epoch,owner)||!isMainAdmin()){adminNotificationTargetFormOpen=false;closeForm();return false;}
        const chosen=adminNotificationUsername(values.username);if(!chosen){formError('Enter a chosen username (3–32 letters, numbers, or _).');return false;}
        adminNotificationTargetFormOpen=false;closeForm();return adminOpenPlayerTargetMessage(chosen);
      },onCancel:()=>{adminNotificationTargetFormOpen=false;}});return true;
  }
  clearAdminNotificationComposerState();
  adminNotificationTargetUsername=target;adminNotificationComposerEpoch++;
  msgKind='player_notification';socialMessageTo=null;msgTo='@'+target;msgOpen=true;adminsOpen=false;
  $('msgwrap').style.display='flex';$('msgstatus').textContent='';$('msgmsg').value='';$('msgmsg').maxLength=600;
  const subject=$('msgsubject');subject.hidden=false;subject.disabled=false;subject.value='';
  $('msgto').textContent='private Inbox notice to: @'+target;
  const title=$('msgbox').querySelector('h2');if(title)title.textContent='✉ MESSAGE PLAYER';
  try{subject.focus();}catch(error){}
  return true;
}
function setAdminNotificationComposerBusy(value){
  const busy=!!value;for(const id of ['msgsubject','msgmsg','msgsend','msgcancel']){const element=$(id);if(element)element.disabled=busy;}
}
async function sendAdminPlayerNotification(){
  if(adminNotificationSendOp)return false;
  const owner=currentAuthUserId(),epoch=adminPrivacyEpoch,composerEpoch=adminNotificationComposerEpoch,
    target=adminNotificationUsername(adminNotificationTargetUsername),subject=String($('msgsubject').value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim(),
    message=String($('msgmsg').value||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
  const contextCurrent=()=>adminPrivacyRequestCurrent(epoch,owner)&&isMainAdmin()&&msgOpen&&msgKind==='player_notification'&&
    adminNotificationComposerEpoch===composerEpoch&&adminNotificationTargetUsername===target;
  if(!contextCurrent()||!adminNotificationComposerAvailable()){$('msgstatus').textContent='Admin 03 Inbox or creator/main access is required.';return false;}
  if(!target){$('msgstatus').textContent='Choose a valid player username.';return false;}
  if(subject.length<1||subject.length>80){$('msgstatus').textContent='Subject must be 1–80 characters.';return false;}
  if(message.length<1||message.length>600){$('msgstatus').textContent='Message must be 1–600 characters.';return false;}
  const fingerprint=target.toLowerCase()+'\n'+subject+'\n'+message;
  if(!adminNotificationRetryReceipt||adminNotificationRetryReceipt.fingerprint!==fingerprint)
    adminNotificationRetryReceipt={fingerprint,operationId:adminOperationUuid()};
  const operationId=adminNotificationRetryReceipt.operationId,
    args={p_recipient_username:target,p_subject:subject,p_message:message,p_operation_id:operationId},op={owner,epoch,composerEpoch,target,operationId};
  adminNotificationSendOp=op;setAdminNotificationComposerBusy(true);$('msgstatus').textContent='sending privately...';
  try{
    let answer=null,lastError=null;
    for(let attempt=0;attempt<2;attempt++){
      if(!contextCurrent()||adminNotificationSendOp!==op)return false;
      const result=await sb.rpc('send_outpost_zero_admin_notification',args);
      if(!contextCurrent()||adminNotificationSendOp!==op)return false;
      if(!result.error){answer=Array.isArray(result.data)?result.data[0]:result.data;break;}
      lastError=result.error;if(adminNotificationSemanticError(lastError))break;
    }
    if(!answer){
      if(adminNotificationRpcMissing(lastError)){socialNotificationSqlReady=false;throw new Error('Admin 03 Inbox is not installed.');}
      throw lastError||new Error('message unavailable');
    }
    const notificationKey=typeof socialNotificationKey==='function'?socialNotificationKey(answer.notification_key):'',recipient=adminNotificationUsername(answer.recipient_username),
      createdAt=Date.parse(answer.created_at||'');
    if(!notificationKey||!recipient||recipient.toLowerCase()!==target.toLowerCase()||!Number.isFinite(createdAt))throw new Error('Invalid message receipt.');
    adminNotificationRetryReceipt=null;peNotice='PRIVATE INBOX MESSAGE SENT TO @'+recipient;
    $('msgstatus').textContent='sent to @'+recipient;if(typeof socialNotificationPollAt!=='undefined')socialNotificationPollAt=0;
    if(typeof socialPollNotifications==='function')void socialPollNotifications(true);
    if(adminNotificationSendOp===op)adminNotificationSendOp=null;
    closeMsgCompose();return true;
  }catch(error){
    if(!contextCurrent()||adminNotificationSendOp!==op)return false;
    const text=String(error&&error.message||error||'').toUpperCase();
    $('msgstatus').textContent=/RATE_LIMIT/.test(text)?'Too many messages. Try again later.':
      /TARGET_UNAVAILABLE/.test(text)?'That chosen username is unavailable.':
      /ADMIN 03 INBOX/.test(text)?'Run Admin 03 Inbox before sending player messages.':'Could not send. Review the message and try again.';
    return false;
  }finally{
    if(adminNotificationSendOp===op){adminNotificationSendOp=null;if(contextCurrent())setAdminNotificationComposerBusy(false);}
  }
}
function closeMsgCompose(){
  if(msgKind==='player_notification'&&adminNotificationSendOp)return false;
  msgOpen=false; $('msgwrap').style.display='none'; msgKind='admin'; socialMessageTo=null;adminMsgOperationId=null;
  clearAdminNotificationComposerState();$('msgmsg').maxLength=500;
  const title=$('msgbox').querySelector('h2'); if(title) title.textContent='✉ MESSAGE';
  return true;
}
async function sendMsg(){
  if(msgKind==='social'){ await sendSocialMessage(); return; }
  if(msgKind==='player_notification'){await sendAdminPlayerNotification();return;}
  const txt=($('msgmsg').value||'').trim();
  if(!txt){ $('msgstatus').textContent='write something first'; return; }
  if(!sb){
    adminMsgs.unshift({id:Date.now(),from_username:'preview',to_username:msgTo,message:txt.slice(0,500),read:false,created_at:new Date().toISOString(),is_incoming:false});
    $('msgstatus').textContent='sent (preview only)'; $('msgmsg').value='';
    setTimeout(closeMsgCompose, 900); return;
  }
  $('msgstatus').textContent='sending...';
  try{
    if(!adminMsgOperationId)adminMsgOperationId=adminOperationUuid();
    const {error}=await sb.rpc('send_outpost_zero_admin_message',{
      p_recipient_username:msgTo,p_message:txt.slice(0,500),p_operation_id:adminMsgOperationId
    });
    if(error) throw error;
    $('msgstatus').textContent='sent!';
    $('msgmsg').value='';
    setTimeout(closeMsgCompose, 900);
  }catch(err){ $('msgstatus').textContent='could not send \u2014 try again'; }
}
let bannerXRect=null, hubPostsRect=null, bannerDismissed=+((typeof localStorage!=='undefined'&&localStorage.getItem('oz_banner_dismiss'))||0);
function adminServerRoleValue(data){
  let value=Array.isArray(data)?data[0]:data;
  if(value&&typeof value==='object')value=value.role??value._outpost_zero_staff_role??value.admin_role??'';
  value=String(value||'').trim().toLowerCase();
  return ['creator','main','co','tester'].includes(value)?value:'';
}
function adminSelfPublicHandle(){
  if(!authUser||typeof socialProfile==='undefined'||!socialProfile||
     String(socialProfile.user_id||'')!==String(authUser.id||''))return '';
  const value=String(socialProfile.handle||'').trim().replace(/^@/,'');
  if(!/^[A-Za-z0-9_]{3,32}$/.test(value))return '';
  if(typeof usernameIsChosenForUser==='function'&&!usernameIsChosenForUser(value,authUser.id))return '';
  return value;
}
async function fetchAdminSelfRoleFallback(stillCurrent){
  for(const rpcName of ['_outpost_zero_staff_role','admin_role']){
    try{
      const result=await sb.rpc(rpcName);
      if(!stillCurrent())return null;
      if(result&&result.error)continue;
      const role=adminServerRoleValue(result&&result.data);
      if(role)return {role,username:adminSelfPublicHandle()};
    }catch(error){if(!stillCurrent())return null;}
  }
  return {role:'',username:''};
}
async function fetchAdmins(){
  if(!sb || !authUser) return;
  const request=++adminRosterFetchSeq,epoch=adminPrivacyEpoch,userId=currentAuthUserId(),previousRank=myRank();
  const stillCurrent=()=>request===adminRosterFetchSeq&&adminPrivacyRequestCurrent(epoch,userId);
  let roles={},rows=[],selfRole='',selfUsername='';
  try{
    const {data,error}=await sb.rpc('list_outpost_zero_admin_roster_by_username');
    if(error)throw error;
    if(!stillCurrent())return;
    for(const value of data||[]){
      const username=String(value&&value.username||'').trim(),role=String(value&&value.role||'').toLowerCase(),isSelf=!!(value&&value.is_self);
      if(!['creator','main','co','tester'].includes(role))continue;
      const publicUsername=/^[A-Za-z0-9_]{3,32}$/.test(username)?username:'';
      if(isSelf){selfRole=role;selfUsername=publicUsername;}
      if(!publicUsername)continue;
      roles[publicUsername.toLowerCase()]=role;rows.push({username:publicUsername,rank:role,isSelf});
    }
    if(!selfRole){
      const fallback=await fetchAdminSelfRoleFallback(stillCurrent);if(!fallback||!stillCurrent())return;
      selfRole=fallback.role;selfUsername=fallback.username;
    }else if(!selfUsername)selfUsername=adminSelfPublicHandle();
    if(selfRole&&selfUsername){
      const key=selfUsername.toLowerCase(),existing=rows.findIndex(row=>row.username.toLowerCase()===key);
      roles[key]=selfRole;
      if(existing<0)rows.push({username:selfUsername,rank:selfRole,isSelf:true});
      else rows[existing]={username:selfUsername,rank:selfRole,isSelf:true};
    }
  }catch(e){
    if(!stillCurrent())return;
    const fallback=await fetchAdminSelfRoleFallback(stillCurrent);if(!fallback||!stillCurrent())return;
    selfRole=fallback.role;selfUsername=fallback.username;
    // A failed roster may recover only this signed-in account. Never retain or
    // reconstruct other staff rows from browser data, and never expose email.
    if(selfRole&&selfUsername){
      roles[selfUsername.toLowerCase()]=selfRole;
      rows=[{username:selfUsername,rank:selfRole,isSelf:true}];
    }
  }
  if(!stillCurrent())return;
  adminRoles=roles;adminRosterRows=rows;adminSelfRole=selfRole;adminSelfUsername=selfUsername;
  const nextRank=myRank();
  if(nextRank!==previousRank)adminPrivacyEpoch++;
  enforceAdminRolePrivacy(previousRank);
  syncFallAccess();                                  // role changes immediately grant/revoke admin preview
  if(nextRank&&nextRank!==previousRank){
    void fetchMsgs();if(typeof fetchPlayersData==='function')void fetchPlayersData();
    if(isMainAdmin()){void fetchScoreReqs();void fetchUpdatesFeed();}
  }
}
async function fetchBanners(){
  if(!sb) return;
  const request=++bannerFetchSeq,reviewer=isMainAdmin();
  if(!reviewer){bannerDraftEpoch++;pendingBanners=[];}
  const draftEpoch=bannerDraftEpoch;
  const normalize=row=>{
    const heading=String(row&&((row.heading!=null?row.heading:row.message))||'').trim(),
      details=String(row&&((row.details!=null?row.details:row.message))||heading).trim();
    return Object.assign({},row,{heading,details,message:heading});
  };
  const read=async(approved,limit)=>{
    const rpc=await sb.rpc('list_outpost_zero_updates_v2',{
      p_approved:approved,p_before_id:null,p_limit:limit
    });
    if(!rpc.error)return (rpc.data||[]).map(normalize);
    const legacyRpc=await sb.rpc('list_outpost_zero_updates',{
      p_approved:approved,p_before_id:null,p_limit:limit
    });
    if(!legacyRpc.error)return (legacyRpc.data||[]).map(normalize);
    // Rollout fallback: keep the public Home/Inbox feed visible before Admin
    // 02 is pasted, but never fall back to a direct mutation. Approval is
    // filtered before the limit so a draft backlog cannot hide live updates.
    // Pending text fails closed: client-side isMainAdmin() is not authority.
    if(!approved)throw legacyRpc.error||rpc.error;
    // Legacy author may be an email before Admin 02 sanitizes it. It is unused,
    // so never request it into an ordinary player's browser memory.
    const legacy=await sb.from('banners').select('id,message,approved,created_at')
      .eq('approved',approved).order('id',{ascending:false}).limit(limit);
    if(legacy.error)throw legacy.error;
    return (legacy.data||[]).map(normalize);
  };
  const publicRowsPromise=read(true,10);
  // Only creator/main reviewers need draft contents. Fetch independently so
  // ten newer drafts can never consume the public feed's ten-row limit.
  const draftRowsPromise=reviewer?read(false,20):Promise.resolve([]);
  const rows=await Promise.allSettled([publicRowsPromise,draftRowsPromise]);
  // A slower earlier refresh must never overwrite a newer post/approval/delete.
  if(request!==bannerFetchSeq)return;
  if(rows[0].status==='fulfilled')banners=rows[0].value.filter(b=>b&&b.approved===true);
  // A draft error must never replace or suppress a successful public result.
  pendingBanners=reviewer&&isMainAdmin()&&draftEpoch===bannerDraftEpoch&&rows[1].status==='fulfilled'
    ?rows[1].value.filter(b=>b&&b.approved===false):[];
}
async function fetchReportRowsByState(resolved){
  const rows=[];let beforeId=null;
  // The RPC returns sanitized keyset pages. Raw report rows (including legacy
  // names/meta) never enter browser memory. Active and resolved reports are
  // queried separately so neither feed can crowd the other out.
  for(let page=0;page<REPORT_FETCH_PAGE_CAP;page++){
    const {data,error}=await sb.rpc('list_outpost_zero_reports',{
      p_resolved:!!resolved,p_before_id:beforeId,p_limit:REPORT_FETCH_PAGE_SIZE
    });
    if(error)throw error;
    const batch=Array.isArray(data)?data:[];
    rows.push(...batch);
    if(batch.length<REPORT_FETCH_PAGE_SIZE)return rows;
    const nextId=Number(batch[batch.length-1]&&batch[batch.length-1].id);
    if(!Number.isSafeInteger(nextId)||nextId<1||nextId===beforeId)throw new Error('REPORT_PAGE_CURSOR_INVALID');
    beforeId=nextId;
  }
  throw new Error('REPORT_PAGE_LIMIT_REACHED');
}
async function fetchUpdatesFeed(){
  const request=++reportFetchSeq;
  if(!sb||!canAccessReports()){
    updatesFeed={reports:[]};updatesResolved=[];reportLoadStatus='';resetReportScroll();return false;
  }
  const epoch=adminPrivacyEpoch,userId=currentAuthUserId();
  reportLoadStatus='REFRESHING REPORTS…';
  try{
    const [open,resolved]=await Promise.all([fetchReportRowsByState(false),fetchReportRowsByState(true)]);
    if(request!==reportFetchSeq||!adminPrivacyRequestCurrent(epoch,userId)||!canAccessReports())return false;
    // A report is a report. Staff metadata may still exist server-side for
    // audit/security purposes, but the reviewer UI never creates a second
    // class of report from it.
    updatesFeed={reports:open};
    updatesResolved=resolved;
    resetReportScroll();
    reportLoadStatus='';
    return true;
  }catch(error){
    // A connection hiccup must not make saved reports appear deleted. Keep the
    // last confirmed lists and make the stale state explicit to the reviewer.
    if(request===reportFetchSeq&&adminPrivacyRequestCurrent(epoch,userId)&&canAccessReports()){
      reportLoadStatus='REFRESH FAILED · SHOWING LAST SAVED REPORT LIST';
      console.warn('report refresh failed',error);
    }
    return false;
  }
}
function reportCopyCount(){return reportCopyMode==='custom'?Math.max(1,Math.min(10000,Math.floor(+reportCopyCustomCount||1))):null;}
function chooseReportCopyAll(){reportCopyMode='all';reportCopyStatus='';}
function chooseReportCopyCustom(){
  let raw=null;try{raw=window.prompt('How many of the newest reports should be '+(reportBulkAction==='resolve'?'resolved':'copied')+'? (1–10,000)',String(reportCopyCustomCount||25));}catch(error){}
  if(raw===null)return false;
  const count=Math.floor(+raw);if(!Number.isFinite(count)||count<1||count>10000){reportCopyStatus='CUSTOM MUST BE 1–10,000.';sfx('dry');return false;}
  reportCopyMode='custom';reportCopyCustomCount=count;reportCopyStatus='READY TO '+reportBulkAction.toUpperCase()+' '+count+' REPORT'+(count===1?'':'S')+'.';return true;
}
function reportExportText(rows,requested){
  const list=Array.isArray(rows)?rows:[],created=new Date().toISOString();
  const out=['OUTPOST ZERO REPORT EXPORT','EXPORTED: '+created,'SELECTION: '+(requested==null?'ALL REPORTS':'NEWEST '+requested),'COPIED: '+list.length,''];
  list.forEach((row,index)=>{
    const meta=row&&row.meta&&typeof row.meta==='object'?row.meta:{},message=String(row&&row.message||'').replace(/^\[STAFF\]\s*/,'');
    // Keep bulk exports focused on the report itself. Reviewer identity and
    // per-row timestamps remain available in the protected Admin Inbox but are
    // intentionally omitted from copied report text.
    out.push('REPORT '+(index+1),'ID: '+String(row&&row.id!=null?row.id:'unknown'),'TYPE: REPORT','STATUS: '+(row&&row.resolved?'RESOLVED':'OPEN'),'MESSAGE: '+message);
    const context=[];
    for(const [key,label] of [['category','CATEGORY'],['screen','SCREEN'],['state','GAME STATE'],['mode','MODE'],['wave','WAVE'],['score','SCORE']])
      if(meta[key]!==undefined&&meta[key]!==null&&String(meta[key])!=='')context.push(label+': '+String(meta[key]));
    if(context.length)out.push(...context);
    out.push('');
  });
  return out.join('\n');
}
async function writeReportExport(text){
  try{if(navigator.clipboard&&typeof navigator.clipboard.writeText==='function'){await navigator.clipboard.writeText(text);return true;}}catch(error){}
  try{window.prompt('Copy all of this report export:',text);return true;}catch(error){return false;}
}
async function copyOutpostZeroReports(){
  if(reportCopyBusy||reportResolveBusy.size||!canAccessReports())return false;
  const requested=reportCopyCount(),owner=currentAuthUserId(),epoch=adminPrivacyEpoch;reportCopyBusy=true;reportCopyStatus='LOADING REPORTS…';
  try{
    let rows=[];
    if(!sb)rows=[...(updatesFeed.reports||[]),...(updatesResolved||[])].sort((a,b)=>(+b.id||0)-(+a.id||0));
    else{
      const result=await sb.rpc('export_outpost_zero_reports',{p_limit:requested});
      if(result.error)throw result.error;
      const payload=Array.isArray(result.data)?result.data[0]:result.data;
      rows=Array.isArray(payload)?payload:Array.isArray(payload&&payload.reports)?payload.reports:[];
    }
    if(!adminPrivacyRequestCurrent(epoch,owner)||!canAccessReports())return false;
    if(requested!=null)rows=rows.slice(0,requested);
    const copied=await writeReportExport(reportExportText(rows,requested));
    reportCopyStatus=copied?'COPIED '+rows.length+' REPORT'+(rows.length===1?'':'S')+' TO CLIPBOARD.':'COPY FAILED · TRY AGAIN.';
    sfx(copied?'pickup':'dry');return copied;
  }catch(error){
    if(adminPrivacyRequestCurrent(epoch,owner)){reportCopyStatus='COULD NOT COPY · RUN ADMIN 03 INBOX, THEN RETRY.';sfx('dry');}return false;
  }finally{if(adminPrivacyRequestCurrent(epoch,owner))reportCopyBusy=false;}
}
function publishResolvedReport(id,savedRow){
  let row=savedRow&&typeof savedRow==='object'?savedRow:null;
  const i=(updatesFeed.reports||[]).findIndex(r=>+r.id===+id);
  if(i>=0){if(!row)row=updatesFeed.reports[i];updatesFeed.reports.splice(i,1);}
  if(row){row={...row,resolved:true};updatesResolved=[row,...updatesResolved.filter(r=>+r.id!==+id)];}
  return row;
}
async function resolveReport(id,refresh=true){       // mains: save first, then move it to the archive
  id=Math.floor(+id||0);
  if(reportCopyBusy||!canAccessReports()||id<1||reportResolveBusy.has(id)) return false;
  if(!sb){
    publishResolvedReport(id);return true;
  }
  const epoch=adminPrivacyEpoch,userId=currentAuthUserId();reportResolveBusy.add(id);reportLoadStatus='SAVING REPORT #'+id+'…';
  try{
    const {data,error}=await sb.rpc('resolve_outpost_zero_report',{p_report_id:id});
    if(error)throw error;
    const saved=Array.isArray(data)?data[0]:data;
    if(!saved||saved.resolved!==true)throw new Error('REPORT_RESOLVE_NOT_SAVED');
    if(!adminPrivacyRequestCurrent(epoch,userId)||!canAccessReports())return false;
    publishResolvedReport(id,saved);
    reportLoadStatus='REPORT #'+id+' SAVED IN ARCHIVE';
    // Reconcile with the server. If this refresh fails, the confirmed archived
    // row remains visible because fetchUpdatesFeed preserves the prior state.
    if(refresh)await fetchUpdatesFeed();
    return true;
  }catch(error){
    if(adminPrivacyRequestCurrent(epoch,userId)&&canAccessReports()){
      reportLoadStatus='COULD NOT RESOLVE #'+id+' · REPORT WAS NOT REMOVED';
      console.warn('report resolve failed',error);
    }
    return false;
  }finally{reportResolveBusy.delete(id);}
}
async function resolveOutpostZeroReports(){
  if(reportCopyBusy||reportResolveBusy.size||!canAccessReports())return false;
  const open=(updatesFeed.reports||[]).filter(row=>row&&Number.isSafeInteger(+row.id)&&+row.id>0),
    requested=reportCopyCount(),rows=requested==null?open:open.slice(0,requested);
  if(!rows.length){reportCopyStatus='NO OPEN REPORTS TO RESOLVE.';sfx('dry');return false;}
  let confirmed=false;
  const selection=requested==null?'ALL currently open reports':'up to '+requested+' newest open report'+(requested===1?'':'s');
  try{confirmed=window.confirm('Resolve '+selection+'? They will remain saved under RESOLVED.');}catch(error){}
  if(!confirmed)return false;
  const owner=currentAuthUserId(),epoch=adminPrivacyEpoch;reportCopyBusy=true;reportCopyStatus='RESOLVING '+selection.toUpperCase()+'…';
  try{
    let changed=0;
    if(sb){
      const result=await sb.rpc('resolve_outpost_zero_reports',{p_limit:requested});
      if(result.error)throw result.error;
      const payload=Array.isArray(result.data)?result.data[0]:result.data;
      changed=Math.max(0,Math.floor(+(payload&&payload.resolved_count)||0));
    }else{
      for(const row of rows)if(publishResolvedReport(row.id))changed++;
    }
    if(!adminPrivacyRequestCurrent(epoch,owner)||!canAccessReports())return false;
    if(sb)await fetchUpdatesFeed();else resetReportScroll();
    reportCopyStatus='RESOLVED '+changed+' REPORT'+(changed===1?'':'S')+' · SAVED UNDER RESOLVED.';
    sfx('pickup');return true;
  }catch(error){
    if(adminPrivacyRequestCurrent(epoch,owner)){reportCopyStatus='COULD NOT RESOLVE · RUN ADMIN 03 INBOX, THEN RETRY.';sfx('dry');}
    return false;
  }finally{if(adminPrivacyRequestCurrent(epoch,owner))reportCopyBusy=false;}
}
function runReportBulkAction(){
  reportActionMenuOpen=reportAmountMenuOpen=false;
  return reportBulkAction==='resolve'?resolveOutpostZeroReports():copyOutpostZeroReports();
}
function setPostBusy(busy){
  postBusy=!!busy;
  const send=$('postsend'),cancel=$('postcancel');
  if(send){send.disabled=postBusy;send.textContent=postBusy?'POSTING...':'POST';}
  if(cancel)cancel.disabled=postBusy;
}
function openPost(){
  if(typeof canPostUpdates==='function'&&!canPostUpdates()){sfx('dry');return false;}
  postRequestSeq++;setPostBusy(false);postOpen=true;adminPanelOpen=false;
  $('postwrap').style.display='flex';$('poststatus').textContent='';
  try{$('postheading').focus();}catch(e){}
}
function closePost(force=false){
  if(postBusy&&!force)return;
  postRequestSeq++;setPostBusy(false);postOpen=false;$('postwrap').style.display='none';
}
async function sendPost(){
  if(postBusy||(typeof canPostUpdates==='function'&&!canPostUpdates()))return;
  const heading=($('postheading').value||'').replace(/\s+/g,' ').trim(),msg=($('postmsg').value||'').trim();
  if(!heading){ $('poststatus').textContent='write a heading first'; return; }
  if(!msg){ $('poststatus').textContent='write the update details'; return; }
  const token=++postRequestSeq,owner=currentAuthUserId();
  const current=()=>postBusy&&token===postRequestSeq&&owner===currentAuthUserId();
  setPostBusy(true);
  if(!sb){                                          // preview: banner goes up locally, instantly
    banners.unshift({id:Date.now(), author:'preview', heading:heading.slice(0,120),details:msg.slice(0,4000),message:heading.slice(0,120), approved:true});
    $('poststatus').textContent='posted (preview only)'; $('postheading').value='';$('postmsg').value='';
    setTimeout(()=>{if(current())closePost(true);},900); return;
  }
  $('poststatus').textContent='posting...';
  try{
    let result=await sb.rpc('post_outpost_zero_update_v2',{p_heading:heading.slice(0,120),p_details:msg.slice(0,4000)});
    // During a staged rollout, an older Admin 02 can still receive a compact
    // combined post. Installing the current SQL restores separate full details.
    if(result.error)result=await sb.rpc('post_outpost_zero_update',{p_message:(heading+(msg===heading?'':' — '+msg)).slice(0,300)});
    const {data,error}=result;if(error) throw error;
    if(!current())return;
    const row=Array.isArray(data)?data[0]:data;
    const live=!!(row&&row.approved);                // server role decides live vs pending
    $('poststatus').textContent= live ? 'posted — live for everyone!' : 'submitted — awaiting main-admin approval';
    $('postheading').value='';$('postmsg').value='';
    await fetchBanners();
    if(current())setTimeout(()=>{if(current())closePost(true);},1100);
  }catch(err){
    if(current()){
      $('poststatus').textContent='could not post — run Admin 02 Admins, then retry';
      setPostBusy(false);
    }
  }
}
async function approveBanner(id){
  if(!sb){ const i=pendingBanners.findIndex(b=>b.id===id); if(i>=0){ pendingBanners[i].approved=true; banners.unshift(pendingBanners[i]); pendingBanners.splice(i,1);} return; }
  try{
    const {error}=await sb.rpc('approve_outpost_zero_update',{p_banner_id:id});
    if(error)throw error;
  }catch(e){return;}
  await fetchBanners();
}
async function rejectBanner(id){
  if(!sb){ const i=pendingBanners.findIndex(b=>b.id===id); if(i>=0) pendingBanners.splice(i,1); return; }
  try{
    const {data,error}=await sb.rpc('reject_outpost_zero_update',{p_banner_id:id});
    if(error)throw error;
    if(data!==true)return;
  }catch(e){return;}
  await fetchBanners();
}
async function kickAdmin(username){
  if(!canManageAdmins()) return;                     // co-admins/testers cannot manage the roster
  username=String(username||'').trim().toLowerCase();if(!username)return;
  if(!sb){delete adminRoles[username];return;}
  try{
    const {data,error}=await sb.rpc('remove_outpost_zero_admin_by_username',{p_username:username});
    if(error)throw error;if(data!==true)return;
  }catch(e){return;}
  await fetchAdmins();
}
async function promoteAdmin(username){
  if(!canManageAdmins()) return;                     // Main: tester -> co. Creator may also promote co -> main.
  username=String(username||'').trim().toLowerCase();if(!username)return;
  const current=adminRoles[username];if(current==='co'&&!isCreator())return;
  if(!sb){adminRoles[username]=adminRoles[username]==='tester'?'co':'main';return;}
  try{
    const {data,error}=await sb.rpc('promote_outpost_zero_admin_by_username',{p_username:username});
    if(error)throw error;if(data!==true)return;
  }catch(e){return;}
  await fetchAdmins();
}
async function demoteAdmin(username){
  if(!canManageAdmins())return;
  username=String(username||'').trim().toLowerCase();if(!username)return;
  const current=adminRoles[username],next=current==='main'?'co':current==='co'?'tester':'';if(!next)return;
  let ok=false;try{ok=typeof window.confirm!=='function'||window.confirm('Demote @'+username+' from '+current.toUpperCase()+' to '+next.toUpperCase()+'?');}catch(error){}
  if(!ok)return;
  if(!sb){adminRoles[username]=next;return;}
  try{const {data,error}=await sb.rpc('demote_outpost_zero_admin_by_username',{p_username:username});if(error)throw error;if(data!==true)return;}catch(error){return;}
  await fetchAdmins();
}
function addAdmin(){
  if(!canManageAdmins())return false;
  openForm({title:'ADD ADMIN',hint:'Testers get only Test Mode and Admin Inbox. Co-admins get shared staff tools.',saveLabel:'ADD',
    fields:[{id:'username',label:'PUBLIC USERNAME',type:'text',placeholder:'player_username'},{id:'role',label:'STARTING TIER',type:'select',value:'tester',options:[{value:'tester',label:'TESTER · LIMITED'},{value:'co',label:'CO-ADMIN · SHARED TOOLS'}]}],
    onSave:async values=>{
      const username=String(values.username||'').trim().replace(/^@/,'').toLowerCase(),role=values.role==='co'?'co':'tester';
      if(!/^[a-z0-9_]{3,32}$/.test(username)){formError('Enter that player\'s public username.');return false;}
      if(!sb){adminRoles[username]=role;closeForm();return true;}
      $('formstatus').textContent='adding '+role+'…';
      try{
        const result=await sb.rpc('add_outpost_zero_admin_by_username',{p_username:username,p_role:role});
        if(result.error)throw result.error;closeForm();await fetchAdmins();return true;
      }catch(error){formError(role==='tester'?'Run Admin 02 Admins to add Testers.':'Could not add that admin.');return false;}
    }});return true;
}
async function fetchWeaponSuggestions(){
  if(!canReviewWeaponSuggestions()){weaponSuggestionRequestSeq++;weaponSuggestionBusy=false;weaponSuggestions=[];weaponSuggestionPage=0;return false;}
  if(weaponSuggestionBusy)return false;
  const request=++weaponSuggestionRequestSeq,epoch=adminPrivacyEpoch,owner=currentAuthUserId(),current=()=>request===weaponSuggestionRequestSeq&&adminPrivacyRequestCurrent(epoch,owner)&&canReviewWeaponSuggestions();
  if(!sb){weaponSuggestions=[];weaponSuggestionPage=0;weaponSuggestionStatus='Suggestions load on the deployed site.';return true;}
  weaponSuggestionBusy=true;weaponSuggestionStatus='LOADING…';
  try{const result=await sb.rpc('list_outpost_zero_weapon_suggestions_by_username',{p_limit:100,p_status:'pending'});if(result.error)throw result.error;
    if(!current())return false;
    weaponSuggestions=Array.isArray(result.data)?result.data:[];weaponSuggestionPage=0;weaponSuggestionStatus=weaponSuggestions.length?weaponSuggestions.length+(weaponSuggestions.length===100?' LOADED':' PENDING'):'NO PENDING SUGGESTIONS';return true;
  }catch(error){if(current()){weaponSuggestions=[];weaponSuggestionPage=0;weaponSuggestionStatus='RUN ADMIN 02 ADMINS TO LOAD SUGGESTIONS.';}return false;}
  finally{if(current())weaponSuggestionBusy=false;}
}
async function reviewWeaponSuggestion(id,decision){
  if(!canReviewWeaponSuggestions()||weaponSuggestionBusy||!['approved','rejected'].includes(decision))return false;
  let rawNote=null;try{rawNote=window.prompt((decision==='approved'?'Approve':'Reject')+' this suggestion. Optional reviewer note:','');}catch(error){return false;}
  if(rawNote===null)return false;
  const note=String(rawNote).trim();
  const request=++weaponSuggestionRequestSeq,epoch=adminPrivacyEpoch,owner=currentAuthUserId(),current=()=>request===weaponSuggestionRequestSeq&&adminPrivacyRequestCurrent(epoch,owner)&&canReviewWeaponSuggestions();
  weaponSuggestionBusy=true;
  try{if(sb){const result=await sb.rpc('review_outpost_zero_weapon_suggestion',{p_suggestion_id:+id,p_decision:decision,p_reviewer_note:note.slice(0,500)});if(result.error||result.data!==true)throw result.error||new Error('not changed');}
    if(!current())return false;
    weaponSuggestions=weaponSuggestions.filter(row=>String(row.id)!==String(id));weaponSuggestionStatus=decision.toUpperCase()+' · '+weaponSuggestions.length+' PENDING';sfx(decision==='approved'?'pickup':'dry');return true;
  }catch(error){if(current()){weaponSuggestionStatus='COULD NOT REVIEW THAT SUGGESTION.';sfx('dry');}return false;}
  finally{if(current())weaponSuggestionBusy=false;}
}
function adminRequestRows(){
  const rows=[];
  for(const row of scoreReqs||[])rows.push({kind:'player',row,createdAt:Date.parse(row.created_at||'')||0});
  for(const row of pendingBanners||[])rows.push({kind:'update',row,createdAt:Date.parse(row.created_at||'')||0});
  for(const row of appealList||[])if(row&&row.status==='open')rows.push({kind:'appeal',row,createdAt:Date.parse(row.created_at||'')||0});
  return rows.sort((a,b)=>b.createdAt-a.createdAt);
}
async function refreshAdminRequests(){
  if(!isMainAdmin()){requestsOpen=false;return false;}
  requestsBusy=true;requestsStatus='REFRESHING REQUESTS…';
  try{
    await Promise.allSettled([fetchScoreReqs(),fetchBanners(),fetchPlayersData()]);
    requestsStatus=adminRequestRows().length?adminRequestRows().length+' PENDING REQUESTS':'NO PENDING REQUESTS';
    return true;
  }finally{requestsBusy=false;}
}
function openAdminRequests(){
  if(!isMainAdmin()){sfx('dry');return false;}
  adminPanelOpen=false;requestsOpen=true;requestsPage=0;void refreshAdminRequests();return true;
}
const LLR_URL   = 'https://www.youtube.com/@AsrtsbLLR';
const MOVES_URL = 'https://movesforamission.org/donate-now/#1740457740469-d24153b1-38c1';
function powerupMax(id){ return (POWERUPS.find(x=>x.id===id)||{}).max||0; }
const GEM_PRICE_SCALE=10;                           // the whole gem economy uses 10x legacy values
const GEM_SHOP=[
  {key:'ar',      cost:120*GEM_PRICE_SCALE, slot:'primary'},
  {key:'volt',    cost:400*GEM_PRICE_SCALE, slot:'secondary'},
  {key:'dart',    cost:75*GEM_PRICE_SCALE,  slot:'secondary'},
  {key:'hammer',  cost:400*GEM_PRICE_SCALE, slot:'melee'},
  {key:'twinsai', cost:90*GEM_PRICE_SCALE,  slot:'melee'},
  {key:'railgun', cost:60*GEM_PRICE_SCALE,  slot:'primary'},
  {key:'medkit',  cost:200*GEM_PRICE_SCALE, slot:'utility'},
  {key:'grenade', cost:30*GEM_PRICE_SCALE,  slot:'utility'},
  {key:'freezer', cost:30*GEM_PRICE_SCALE,  slot:'utility'},
];
const GEM_PRICE_DEFAULTS={};                        // filled below; lets us reset/compare
for(const it of GEM_SHOP) GEM_PRICE_DEFAULTS[it.key]=it.cost;
function setGemPrice(key,cost){
  const it=GEM_SHOP.find(i=>i.key===key); if(!it) return false;
  cost=Math.max(0, Math.min(9999, Math.round(+cost||0)));
  it.cost=cost; return true;
}
async function fetchPrices(){
  if(!sb) return;
  try{
    const { data } = await sb.from('weapon_prices').select('key,cost');
    for(const r of (data||[])) setGemPrice(r.key, r.cost*GEM_PRICE_SCALE);
  }catch(e){}
}
const DAILY_TASK_DEFS=[
  {id:'kills',  d:'Defeat 40 enemies', goal:40, baseReward:5},
  {id:'waves',  d:'Clear 8 waves',     goal:8,  baseReward:10},
  {id:'bosses', d:'Defeat 3 warlords', goal:3,  baseReward:35},
  {id:'chests', d:'Open a mod chest',  goal:1,  baseReward:20},
].map(t=>Object.assign({},t,{reward:t.baseReward*GEM_REWARD_SCALE}));
const DAILY_ACTIVE_IDS=['kills','waves','chests'];
const DAILY_REWARDS=Object.fromEntries(DAILY_TASK_DEFS.map(t=>[t.id,t.reward]));
function freshDailyTasks(){
  return DAILY_ACTIVE_IDS.map(id=>{
    const t=DAILY_TASK_DEFS.find(x=>x.id===id);
    return {id:t.id,d:t.d,goal:t.goal,reward:t.reward,prog:0,done:false};
  });
}
function normalizeDailyRewards(){
  for(const t of dailyTasks){
    const d=DAILY_TASK_DEFS.find(x=>x.id===t.id); if(!d) continue;
    t.d=d.d; t.goal=d.goal; t.reward=d.reward;
    t.prog=clamp(+t.prog||0,0,t.goal); if(t.done) t.prog=t.goal;
  }
}
function saveMetaLocal(){ try{ localStorage.setItem('oz_meta', JSON.stringify({owner:profileOwnerUserId==null?null:String(profileOwnerUserId), gems, gv:GEM_ECONOMY_VERSION, gre:gemResetVersion, owned:gemOwned, date:tasksDate, tasks:dailyTasks, coins, cos:cosmeticOwned, cosEq:cosmeticEquipped, pow:powerStock, anim:animOwned, animEq:animEquipped, stk:streakDays, stkMax:streakLongest, stkDay:streakLastDay, refUsed:referralUsed, refPaid:referralPaid, wr:wheelReady, wa:Math.round(wheelAcc), hi:hiScore, mv:musicVol, mt:typeof musicTrack==='string'?musicTrack:'calm', sv:sfxVol})); persistLastLoadoutLocal(); }catch(e){} }
function saveMeta(){ saveMetaLocal(); queueProfileSave(); }
