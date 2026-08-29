"use strict";

// MAIN ADMINS have every power; CO-ADMINS get the shared ones (test mode, commands) but not storage.
const MAIN_ADMINS = ['tmilsanmilla@gmail.com'];     // full access
const CO_ADMINS   = [];                             // add co-admin emails here
function adminEmail(){ return String((authUser&&authUser.email)||'').toLowerCase(); }
function isCreator(){ return !sb || adminEmail()===ROOT_ADMIN; }   // tmilsanmilla: always top rank
function isMainAdmin(){ return isCreator() || MAIN_ADMINS.includes(adminEmail()) || adminRoles[adminEmail()]==='main'; }
function isCoAdmin(){ return CO_ADMINS.includes(adminEmail()) || adminRoles[adminEmail()]==='co'; }
function myRank(){ return isCreator()?'creator' : isMainAdmin()?'main' : isCoAdmin()?'co' : ''; }
function adminRoster(){                              // creator first, then the table
  const r=[{email:ROOT_ADMIN, rank:'creator'}];
  for(const e of Object.keys(adminRoles)) if(e!==ROOT_ADMIN) r.push({email:e, rank:adminRoles[e]==='main'?'main':'co'});
  return r;
}
function isAdmin(){ return isMainAdmin() || isCoAdmin(); }   // any admin (preview !sb -> main)
let unrankedRun=false;                              // next-season (early access) weapons -> no leaderboard
let adminOpen=false, adminUsed=false, adminBtnRect={x:-99,y:-99,w:0,h:0}, adminRects=[];
let testMode=false;                                 // test mode (all admins); storage is a viewer popout now
let adminPanelOpen=false, adminHubBtnRect=null, adminPanelRects=[];
let aiLearningOpen=false, aiLearningRects=[], aiLearningDifficulty=4, aiLearningNotice='',aiLearningSelectedModelId='',aiLearningRestoreBusyId='';
const ROOT_ADMIN='tmilsanmilla@gmail.com';          // can never be kicked or demoted
let adminRoles={};                                  // email -> 'main'|'co' (from the Supabase admins table)
let banners=[], pendingBanners=[], bannerFetchSeq=0, bannerDraftEpoch=0, updatesFeed={staff:[],player:[]};
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
    const message=document.getElementById('postmsg'),status=document.getElementById('poststatus');
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
  clearAdminAuditCache();scoreReqs=[];updatesOpen=false;updatesFeed={staff:[],player:[]};updatesResolved=[];
  aiLearningOpen=false;adminsOpen=false;storageOpen=false;clearPostComposerPrivateState();staffReport=false;
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
function scrubPrivilegedUiForAccountChange(){
  adminPrivacyEpoch++;adminRosterFetchSeq++;bannerFetchSeq++;bannerDraftEpoch++;pendingBanners=[];adminRoles={};
  adminOpen=adminPanelOpen=aiLearningOpen=adminsOpen=msgsOpen=updatesOpen=archOpen=storageOpen=scoresOpen=false;
  if(typeof playersOpen!=='undefined')playersOpen=false;
  if(typeof promoAdminOpen!=='undefined')promoAdminOpen=false;
  if(typeof weaponEditOpen!=='undefined')weaponEditOpen=false;
  if(typeof layoutMode!=='undefined')layoutMode=false;
  inboxTab='msgs';composePickOpen=false;scoreReqs=[];adminMsgs=[];unreadMsgs=0;updatesFeed={staff:[],player:[]};updatesResolved=[];
  clearAdminAuditCache();clearPrivatePlayerEditor();scoreRequestDecisionBusy.clear();
  if(typeof banList!=='undefined')banList=[];if(typeof appealList!=='undefined')appealList=[];
  if(typeof appealDecisionBusy!=='undefined')appealDecisionBusy.clear();if(typeof playerBanActionBusy!=='undefined')playerBanActionBusy.clear();
  if(typeof appealOperationReceipt!=='undefined')appealOperationReceipt=null;if(typeof appealSubmitBusy!=='undefined')appealSubmitBusy=false;
  if(typeof clearReaderState==='function')clearReaderState();
  msgOpen=false;msgTo='';clearPostComposerPrivateState();staffReport=false;if(typeof appealOpen!=='undefined')appealOpen=false;
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
  if(!isAdmin()&&previousRank)scrubPrivilegedUiForAccountChange();
  else if(typeof enforceReaderAccess==='function')enforceReaderAccess();
}
let lookupBtnRect=null;
// Public lookup is username + high score only. Private account state is loaded
// only through the existing admin-only RPC after an admin enters an email.
function canSeeStats(){ return isAdmin(); }
function canEditPlayer(){ return isMainAdmin(); }
function canEditLoadedPlayer(){ return canEditPlayer()&&peData&&!peData.publicOnly&&peTarget.indexOf('@')>0; }
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
      grantedBy:String(entry&&entry.granted_by_email||''),durationMinutes:null,draft:false};
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
    if(isAdmin()&&q.indexOf('@')>0){
      const {data,error}=await sb.rpc('admin_get_player',{target_email:q.toLowerCase()});
      if(error) throw error;
      if(session!==peEditorSession)return;
      const d=Array.isArray(data)?data[0]:data; if(!d) throw new Error('not found');
      peData=normalizedPlayerData(d,false);
      peTarget=q.toLowerCase();
      if(isMainAdmin()){
        try{
          const grants=await sb.rpc('admin_list_outpost_zero_weapon_grants',{p_target_email:peTarget});
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
      await callReceiptRpc('admin_set_outpost_zero_weapon_grant',{p_target_email:applyTarget,p_weapon_key:row.key,
        p_duration_minutes:row.durationMinutes,p_note:'Player Lookup temporary gift',p_operation_id:row.operationId});
    }
    for(const row of temp.revoke){
      assertCurrentApply();
      await callReceiptRpc('admin_revoke_outpost_zero_weapon_grant',{p_target_email:applyTarget,p_weapon_key:row.key,
        p_note:'Player Lookup temporary gift revoked',p_operation_id:row.operationId});
    }
    assertCurrentApply();
    if(hasPermanent&&isCreator()){ await applyPlayerEdit(applyTarget,pt,permanentOperationId); fetchBoard(); }
    else if(hasPermanent){
      await submitPlayerEditRequest(applyTarget,pt,permanentOperationId);
      fetchScoreReqs();
    }
    assertCurrentApply();
    if(editorSession===peEditorSession&&peTarget===applyTarget){
      await lookupPlayer(applyTarget);
      if(peTarget===applyTarget)peNotice=hasPermanent&&!isCreator()?'Temporary gifts applied. Permanent edits were sent to the creator.':'Changes applied and logged.';
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
    const {data,error}=await sb.rpc('list_outpost_zero_player_requests',{p_limit:20});
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
function submitPlayerEditRequest(email,patch,operationId=adminOperationUuid()){
  return adminReceiptRpc('submit_outpost_zero_player_request',{p_target_email:String(email||'').toLowerCase(),p_patch:patch},operationId);
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
  // Admin edit/ban targets private email; normal player lookup targets username.
  for(const id of ['scoreval','pgems','pcoins','pgrant','prevoke']) $(id).style.display='none';
  $('pban').style.display   = banning?'':'none';
  $('pscopes').style.display= banning?'':'none';
  $('pnote').style.display  = banning?'':'none';
  $('scoretitle').textContent = banning ? '\u26D4 BAN PLAYER'
                              : canEditPlayer() ? '\u270E PLAYER EDIT' : '\uD83D\uDD0D PLAYER LOOKUP';
  const privateEmailMode=banning||isAdmin(), targetInput=$('scoreemail');
  targetInput.type=privateEmailMode?'email':'text';
  targetInput.inputMode=privateEmailMode?'email':'text';
  targetInput.autocomplete='off';
  targetInput.autocapitalize='none';
  $('scorehint').textContent = banning
    ? 'Who are you banning? Pick how long, what it covers, and leave a note.'
    : isAdmin() ? 'Enter the player\u2019s private account email.'
    : 'Enter the player\u2019s username.';
  targetInput.placeholder=privateEmailMode?'player@email.com':'username';
  $('scoresend').textContent = banning ? (canBan()?'BAN':'REQUEST BAN') : 'LOOK UP';
  scoreEditBusy=false;scoreEditOperationReceipt=null;$('scoresend').disabled=false;
  try{ $('scoreemail').focus(); }catch(e){}
}
function itemList(v){
  return String(v||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).slice(0,20);
}
function buildPatch(){                                // read the form into a patch, or return an error
  const email=String($('scoreemail').value||'').trim().toLowerCase();
  if(!email || email.indexOf('@')<0) return {err:'enter a valid email'};
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
  if(ban && ban!=='unban' && email===ROOT_ADMIN) return {err:'the creator cannot be banned'};
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
  return {email, patch:pt};
}
async function applyPlayerEdit(email, patch, operationId=adminOperationUuid()){ // server re-checks rank + receipts retries
  email=String(email).toLowerCase();
  if(patch && patch.ban && patch.ban!=='unban' && email===ROOT_ADMIN) throw new Error('creator cannot be banned');
  let lastError=null;const actor=currentAuthUserId(),privacyEpoch=adminPrivacyEpoch;
  for(let attempt=0;attempt<2;attempt++){
    if(!adminPrivacyRequestCurrent(privacyEpoch,actor))throw new Error('account changed');
    const {data,error}=await sb.rpc('outpost_zero_admin_edit_player',{p_target_email:email,p_patch:patch,p_operation_id:operationId});
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
    const query=String($('scoreemail').value||'').trim();
    if(isAdmin()){
      if(!query||query.indexOf('@')<1){ $('scorestatus').textContent='enter a valid email'; return; }
    } else if(!/^[A-Za-z0-9_]{3,32}$/.test(query)){
      $('scorestatus').textContent='enter a valid username'; return;
    }
    if(!sb){ $('scorestatus').textContent='preview build \u2014 works on the live site'; return; }
    $('scorestatus').textContent='looking up...';setScoreEditBusy(true);
    try{
      await lookupPlayer(query);
      if(!peData){ $('scorestatus').textContent=isAdmin()?'no player with that email':'username not found'; return; }
    }finally{setScoreEditBusy(false);}
    closeScoreEdit(); scoresOpen=true; peStep='panel';
    return;
  }
  const f=buildPatch();
  if(f.err){ $('scorestatus').textContent=f.err; return; }
  if(!sb){ $('scorestatus').textContent='preview build \u2014 works on the live site'; return; }
  if(!canEditPlayer()){ $('scorestatus').textContent='not allowed'; return; }
  const fingerprint=f.email+'\n'+JSON.stringify(f.patch);
  if(!scoreEditOperationReceipt||scoreEditOperationReceipt.fingerprint!==fingerprint)
    scoreEditOperationReceipt={fingerprint,operationId:adminOperationUuid()};
  const operationId=scoreEditOperationReceipt.operationId;
  $('scorestatus').textContent='working...';setScoreEditBusy(true);
  let completed=false;
  try{
    if(isCreator() || (peMode==='ban' && canBan())){      // mains can ban outright
      await applyPlayerEdit(f.email, f.patch,operationId);
      $('scorestatus').textContent='player updated';
      fetchBoard(); fetchPlayersData();
    } else {
      await submitPlayerEditRequest(f.email,f.patch,operationId);
      $('scorestatus').textContent='sent to the creator for approval';
    }
    completed=true;scoreEditOperationReceipt=null;
    setTimeout(()=>{setScoreEditBusy(false);closeScoreEdit();},1200);
  }catch(err){ $('scorestatus').textContent='failed \u2014 check the email and try again'; }
  finally{if(!completed)setScoreEditBusy(false);}
}
async function approveScoreReq(r){                  // creator only
  if(!isCreator() || !sb) return;
  const key=String(r&&r.id||'');if(!key||scoreRequestDecisionBusy.has(key))return;
  scoreRequestDecisionBusy.add(key);const operationId=adminOperationUuid();
  try{
    await resolvePlayerEditRequest(r.id,'approve',operationId);
    fetchBoard();
  }catch(e){}finally{await fetchScoreReqs();scoreRequestDecisionBusy.delete(key);}
}
async function rejectScoreReq(r){
  if(!isCreator() || !sb) return;
  const key=String(r&&r.id||'');if(!key||scoreRequestDecisionBusy.has(key))return;
  scoreRequestDecisionBusy.add(key);const operationId=adminOperationUuid();
  try{ await resolvePlayerEditRequest(r.id,'reject',operationId); }catch(e){}finally{await fetchScoreReqs();scoreRequestDecisionBusy.delete(key);}
}
let archOpen=false, archTab='msgs', archRects=[], storageOpen=false, storageRects=[], archHubBtnRect=null;
let updatesResolved=[];
let adminMsgs=[], unreadMsgs=0, msgOpen=false, msgTo='';
function normalizeAdminAuditRow(row){
  const r=row&&typeof row==='object'?row:{};
  return {eventId:/^\d+$/.test(String(r.event_id||''))?String(r.event_id):'',actor:String(r.actor_email||'?'),target:String(r.target_email||''),
    action:String(r.action||'admin.action'),result:String(r.result||'ok'),details:r.details&&typeof r.details==='object'?r.details:{},
    createdAt:String(r.created_at||'')};
}
function adminAuditPageRows(){ return adminAuditPages[adminAuditPage]||[]; }
function adminAuditFormatValue(value){
  if(value===null||value===undefined) return 'none';
  if(typeof value==='boolean') return value?'YES':'NO';
  if(typeof value==='number' && Number.isFinite(value)) return String(value);
  if(typeof value==='string') return value.trim()||'empty';
  if(Array.isArray(value)) return value.map(item=>adminAuditFormatValue(item)).join(', ');
  if(typeof value==='object') return JSON.stringify(value);
  return String(value);
}
function adminAuditLabelize(field){
  return String(field||'field')
    .replace(/[._-]+/g,' ')
    .replace(/\s+/g,' ')
    .replace(/(^|\\s)[a-z]/g,m=>m.toUpperCase())
    .trim();
}

function adminAuditDetailsSummary(row){
  const details=row&&typeof row==='object'?row.details:{};
  if(!details||typeof details!=='object'||!Object.keys(details).length) return 'No extra details.';
  return Object.keys(details).map((key)=>adminAuditLabelize(key)+': '+adminAuditFormatValue(details[key])).join(' • ');
}
function adminAuditDetailsText(row){
  if(!row) return '';
  const detailLines=['ACTION: '+adminAuditLabelize(row.action),
    'RESULT: '+adminAuditLabelize(row.result),
    'ACTOR: '+row.actor,'TARGET: '+(row.target||'GLOBAL'),'TIME: '+(row.createdAt||'unknown')],
    extra=adminAuditDetailsSummary(row);
  detailLines.push('',extra); return detailLines.join('\n');
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
    const {data,error}=await sb.rpc('list_outpost_zero_admin_audit',{p_before_event_id:before,p_limit:ADMIN_AUDIT_PAGE_SIZE+1});
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
    const { data } = await sb.from('admin_msgs').select('id,from_email,to_email,message,read,read_at,archived,created_at')
      .order('id',{ascending:false}).limit(30);
    if(!adminPrivacyRequestCurrent(epoch,userId)||!isAdmin())return false;
    adminMsgs=data||[];
    const me=adminEmail();
    unreadMsgs=adminMsgs.filter(m=>m.to_email===me && !m.read).length;
    return true;
  }catch(e){return false;}
}
function msgArchived(m){                             // manual archive, or auto 7 days after being read
  if(m.archived) return true;
  if(m.read && m.read_at && (Date.now()-Date.parse(m.read_at)) > 7*86400000) return true;
  return false;
}
async function markMsgsRead(){
  const me=adminEmail(),ts=new Date().toISOString(),epoch=adminPrivacyEpoch,userId=currentAuthUserId();
  if(sb && authUser){
    try{ await sb.from('admin_msgs').update({read:true, read_at:ts}).eq('to_email',me).eq('read',false); }catch(e){}
  }
  if(!adminPrivacyRequestCurrent(epoch,userId)||!isAdmin())return false;
  for(const m of adminMsgs) if(m.to_email===me && !m.read){ m.read=true; m.read_at=ts; }
  unreadMsgs=0;
  return true;
}
async function archiveMsg(id){                        // recipients can tuck a message away early
  const me=adminEmail();
  const m=adminMsgs.find(x=>x.id===id);
  if(m && m.to_email===me){ m.archived=true; }
  if(sb && authUser){ try{ await sb.from('admin_msgs').update({archived:true}).eq('id',id); }catch(e){} }
}
let composePickOpen=false;
function openComposePick(){ composePickOpen=true; fetchAdmins(); }
function drawComposePick(){
  ctx.fillStyle='rgba(4,6,3,0.96)'; ctx.fillRect(0,0,W,H);
  const pw=Math.min(420,W-24), ph=Math.min(400,H-24), px=W/2-pw/2, py=H/2-ph/2;
  ctx.fillStyle='#0a0c0e'; ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#a7c15e'; ctx.lineWidth=1.5; ctx.strokeRect(px+0.5,py+0.5,pw,ph);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#cfe0a8'; ctx.font='700 16px ui-monospace,Consolas,monospace';
  ctx.fillText('\u270E WHO TO?', W/2, py+26);
  ctx.fillStyle='#8a9268'; ctx.font='9px ui-monospace,Consolas,monospace';
  ctx.fillText('pick an admin to message', W/2, py+42);
  msgsRects=[];                                      // the picker owns the rects while it is up
  const x0=px+16, rw=pw-32; let y=py+56;
  const me=adminEmail();
  const list=adminRoster().filter(r=>r.email!==me);
  if(!list.length){
    ctx.fillStyle='#5a5648'; ctx.fillText('no other admins yet', W/2, y+14);
  }
  for(const r of list.slice(0,8)){
    const h=30;
    if(y+h>py+ph-52) break;
    msgsRects.push({x:x0,y,w:rw,h,id:'to:'+r.email});
    const hv=mouse.x>=x0&&mouse.x<=x0+rw&&mouse.y>=y&&mouse.y<=y+h;
    ctx.fillStyle=hv?'rgba(167,193,94,0.28)':'rgba(0,0,0,0.35)'; ctx.fillRect(x0,y,rw,h);
    ctx.strokeStyle='#5a5648'; ctx.lineWidth=1; ctx.strokeRect(x0+0.5,y+0.5,rw,h);
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle='#cdd6b0'; ctx.font='700 9px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(r.email, rw-90), x0+10, y+h/2);
    ctx.textAlign='right'; ctx.fillStyle='#8a9268'; ctx.font='8px ui-monospace,Consolas,monospace';
    ctx.fillText(r.rank==='creator'?'CREATOR':r.rank==='main'?'MAIN':'CO', x0+rw-10, y+h/2);
    ctx.textBaseline='alphabetic';
    y+=h+5;
  }
  const cbw=Math.min(140,pw-40), cbh=28, cbx=W/2-cbw/2, cby=py+ph-36;
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
    peNotice='Player messages need Administration 03 and creator/main access.';sfx('dry');return false;
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
  if(!contextCurrent()||!adminNotificationComposerAvailable()){$('msgstatus').textContent='Administration 03 or creator/main access is required.';return false;}
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
      if(adminNotificationRpcMissing(lastError)){socialNotificationSqlReady=false;throw new Error('Administration 03 is not installed.');}
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
      /ADMINISTRATION 03/.test(text)?'Run Administration 03 before sending player messages.':'Could not send. Review the message and try again.';
    return false;
  }finally{
    if(adminNotificationSendOp===op){adminNotificationSendOp=null;if(contextCurrent())setAdminNotificationComposerBusy(false);}
  }
}
function closeMsgCompose(){
  if(msgKind==='player_notification'&&adminNotificationSendOp)return false;
  msgOpen=false; $('msgwrap').style.display='none'; msgKind='admin'; socialMessageTo=null;
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
    adminMsgs.unshift({id:Date.now(), from_email:'preview', to_email:msgTo, message:txt.slice(0,500), read:false, created_at:new Date().toISOString()});
    $('msgstatus').textContent='sent (preview only)'; $('msgmsg').value='';
    setTimeout(closeMsgCompose, 900); return;
  }
  $('msgstatus').textContent='sending...';
  try{
    const { error } = await sb.from('admin_msgs').insert({ from_email: adminEmail()||'admin', to_email: msgTo, message: txt.slice(0,500) });
    if(error) throw error;
    $('msgstatus').textContent='sent!';
    $('msgmsg').value='';
    setTimeout(closeMsgCompose, 900);
  }catch(err){ $('msgstatus').textContent='could not send \u2014 try again'; }
}
let bannerXRect=null, hubPostsRect=null, bannerDismissed=+((typeof localStorage!=='undefined'&&localStorage.getItem('oz_banner_dismiss'))||0);
async function fetchAdmins(){
  if(!sb || !authUser) return;
  const request=++adminRosterFetchSeq,epoch=adminPrivacyEpoch,userId=currentAuthUserId(),previousRank=myRank();
  try{
    const {data,error}=await sb.rpc('list_outpost_zero_admin_roster');
    if(error)throw error;
    if(request!==adminRosterFetchSeq||!adminPrivacyRequestCurrent(epoch,userId))return;
    adminRoles={}; (data||[]).forEach(r=>{ adminRoles[String(r.email||'').toLowerCase()]=r.role; });
  }catch(e){
    if(request!==adminRosterFetchSeq||!adminPrivacyRequestCurrent(epoch,userId))return;
    adminRoles={};                                  // role refresh failures fail closed
  }
  if(request!==adminRosterFetchSeq||!adminPrivacyRequestCurrent(epoch,userId))return;
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
  const read=async(approved,limit)=>{
    const rpc=await sb.rpc('list_outpost_zero_updates',{
      p_approved:approved,p_before_id:null,p_limit:limit
    });
    if(!rpc.error)return rpc.data||[];
    // Rollout fallback: keep the public Home/Inbox feed visible before Admin
    // 02 is pasted, but never fall back to a direct mutation. Approval is
    // filtered before the limit so a draft backlog cannot hide live updates.
    // Pending text fails closed: client-side isMainAdmin() is not authority.
    if(!approved)throw rpc.error;
    // Legacy author may be an email before Admin 02 sanitizes it. It is unused,
    // so never request it into an ordinary player's browser memory.
    const legacy=await sb.from('banners').select('id,message,approved,created_at')
      .eq('approved',approved).order('id',{ascending:false}).limit(limit);
    if(legacy.error)throw legacy.error;
    return legacy.data||[];
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
async function fetchUpdatesFeed(){
  if(!sb||!isMainAdmin()){ updatesFeed={staff:[],player:[]}; updatesResolved=[]; return; }
  const epoch=adminPrivacyEpoch,userId=currentAuthUserId();
  try{
    const { data } = await sb.from('reports').select('id,name,message,created_at,meta,resolved')
      .order('id',{ascending:false}).limit(40);
    if(!adminPrivacyRequestCurrent(epoch,userId)||!isMainAdmin())return;
    const all=data||[];
    const isStaff=r=>(r.meta&&r.meta.staff) || String(r.message||'').indexOf('[STAFF]')===0;
    const open=all.filter(r=>!r.resolved);
    updatesFeed={ staff: open.filter(isStaff), player: open.filter(r=>!isStaff(r)) };
    updatesResolved=all.filter(r=>r.resolved);
  }catch(e){ if(adminPrivacyRequestCurrent(epoch,userId)){updatesFeed={staff:[],player:[]};updatesResolved=[];} }
}
async function resolveReport(id){                    // mains: mark handled; it moves to the archive
  if(!isMainAdmin()) return;
  if(!sb){
    for(const k of ['staff','player']){
      const i=updatesFeed[k].findIndex(r=>r.id===id);
      if(i>=0){ const r=updatesFeed[k][i]; r.resolved=true; updatesResolved.unshift(r); updatesFeed[k].splice(i,1); }
    }
    return;
  }
  try{ await sb.from('reports').update({resolved:true}).eq('id',id); }catch(e){}
  fetchUpdatesFeed();
}
function setPostBusy(busy){
  postBusy=!!busy;
  const send=$('postsend'),cancel=$('postcancel');
  if(send){send.disabled=postBusy;send.textContent=postBusy?'POSTING...':'POST';}
  if(cancel)cancel.disabled=postBusy;
}
function openPost(){
  postRequestSeq++;setPostBusy(false);postOpen=true;adminPanelOpen=false;
  $('postwrap').style.display='flex';$('poststatus').textContent='';
  try{$('postmsg').focus();}catch(e){}
}
function closePost(force=false){
  if(postBusy&&!force)return;
  postRequestSeq++;setPostBusy(false);postOpen=false;$('postwrap').style.display='none';
}
async function sendPost(){
  if(postBusy)return;
  const msg=($('postmsg').value||'').trim();
  if(!msg){ $('poststatus').textContent='write something first'; return; }
  const token=++postRequestSeq,owner=currentAuthUserId();
  const current=()=>postBusy&&token===postRequestSeq&&owner===currentAuthUserId();
  setPostBusy(true);
  if(!sb){                                          // preview: banner goes up locally, instantly
    banners.unshift({id:Date.now(), author:'preview', message:msg.slice(0,300), approved:true});
    $('poststatus').textContent='posted (preview only)'; $('postmsg').value='';
    setTimeout(()=>{if(current())closePost(true);},900); return;
  }
  $('poststatus').textContent='posting...';
  try{
    const {data,error}=await sb.rpc('post_outpost_zero_update',{p_message:msg.slice(0,300)});
    if(error) throw error;
    if(!current())return;
    const row=Array.isArray(data)?data[0]:data;
    const live=!!(row&&row.approved);                // server role decides live vs pending
    $('poststatus').textContent= live ? 'posted — live for everyone!' : 'submitted — awaiting main-admin approval';
    $('postmsg').value='';
    await fetchBanners();
    if(current())setTimeout(()=>{if(current())closePost(true);},1100);
  }catch(err){
    if(current()){
      $('poststatus').textContent='could not post — run Administration 02, then retry';
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
async function kickAdmin(email){
  if(!isMainAdmin()) return;                         // co-admins cannot manage the roster
  email=String(email||'').toLowerCase(); if(email===ROOT_ADMIN) return;
  if(!sb){ delete adminRoles[email]; return; }
  try{
    const {data,error}=await sb.rpc('remove_outpost_zero_admin',{p_email:email});
    if(error)throw error;if(data!==true)return;
  }catch(e){return;}
  await fetchAdmins();
}
async function promoteAdmin(email){
  if(!isMainAdmin()) return;                         // co-admins cannot manage the roster
  email=String(email||'').toLowerCase(); if(email===ROOT_ADMIN) return;
  if(!sb){ adminRoles[email]='main'; return; }
  try{
    const {data,error}=await sb.rpc('promote_outpost_zero_admin',{p_email:email});
    if(error)throw error;if(data!==true)return;
  }catch(e){return;}
  await fetchAdmins();
}
async function addCoAdmin(){
  if(!isMainAdmin()) return;                         // co-admins cannot manage the roster
  let em; try{ em=window.prompt('co-admin email:'); }catch(e){ em=null; }
  em=String(em||'').trim().toLowerCase(); if(!em || em.indexOf('@')<0) return;
  if(!sb){ adminRoles[em]='co'; return; }
  try{
    const {data,error}=await sb.rpc('add_outpost_zero_co_admin',{p_email:em});
    if(error)throw error;if(!data||(Array.isArray(data)&&!data.length))return;
  }catch(e){return;}
  await fetchAdmins();
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
async function saveGemPrice(key,cost){
  if(!setGemPrice(key,cost)) return;
  if(!sb) return;                                    // preview: local only
  try{ await sb.from('weapon_prices').upsert({key, cost:Math.round(GEM_SHOP.find(i=>i.key===key).cost/GEM_PRICE_SCALE)}); }catch(e){}
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
function saveMetaLocal(){ try{ localStorage.setItem('oz_meta', JSON.stringify({owner:profileOwnerUserId==null?null:String(profileOwnerUserId), gems, gv:GEM_ECONOMY_VERSION, gre:gemResetVersion, owned:gemOwned, date:tasksDate, tasks:dailyTasks, coins, cos:cosmeticOwned, cosEq:cosmeticEquipped, pow:powerStock, anim:animOwned, animEq:animEquipped, stk:streakDays, stkMax:streakLongest, stkDay:streakLastDay, refUsed:referralUsed, refPaid:referralPaid, wr:wheelReady, wa:Math.round(wheelAcc), hi:hiScore, mv:musicVol, sv:sfxVol})); persistLastLoadoutLocal(); }catch(e){} }
function saveMeta(){ saveMetaLocal(); queueProfileSave(); }
