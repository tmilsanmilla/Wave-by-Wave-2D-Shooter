"use strict";

const SOCIAL_PROFILE_TABLE='social_profiles', SOCIAL_FRIEND_TABLE='friendships', SOCIAL_MESSAGE_TABLE='private_messages';
const SOCIAL_CONVERSATION_TABLE='private_conversation_states',SOCIAL_INBOX_CONVERSATION_LIMIT=25;
let socialRects=[], socialProfile=null, socialProfiles={}, socialFriends=[], socialMessages=[];
let socialLoading=false, socialStatus='', socialLastFetch=0, socialChannel=null;
let socialBackend={profiles:null,friends:null,messages:null};
// Social is one page at a time: the Friends directory or the private Inbox.
// Each friend bucket owns its own page so a busy Incoming list can never hide
// Outgoing requests or current friends.
let socialView='friends', socialFriendPage=0, socialMessagePage=0;
let socialInboxSection='inbox',socialConversationPeer='',socialConversationPage=0;
let socialConversationStates={},socialConversationSqlReady=null,socialConversationBusy='';
let socialFriendPages={incoming:0,outgoing:0,current:0};
let socialMessageTo=null, msgKind='admin';
let socialDomPageActive=false;
let socialFetchVersion=0, socialAccountId='', socialFetchUserId='', socialFetchPromise=null, socialFetchQueued=false;
const SOCIAL_REALTIME_RETRY_MS=3000, SOCIAL_CPU_INVITE_POLL_MS=7000;
const SOCIAL_PARTY_INVITE_POLL_MS=7000;
const SOCIAL_NOTIFICATION_POLL_MS=10000, SOCIAL_NOTIFICATION_LIMIT=30;
const SOCIAL_LEGACY_INVITE_RECEIPT_STORAGE_KEY='oz_social_legacy_invite_receipts_v1';
const SOCIAL_LEGACY_INVITE_RECEIPT_CAP=96, SOCIAL_LEGACY_INVITE_RECEIPT_MAX_MS=15*60*1000;
let socialRealtimeRetryAt=0, socialCpuInvitePollAt=0, socialCpuInvitePolling=false;
let socialCpuInvitePromptedIds=new Set();
let socialCpuInvitePromptUserId='';
let socialPartyPresenceChannel=null,socialPartyPresencePromise=null,socialPartyPresenceOwner='',socialPartyPresenceReady=false;
let socialPartyPresenceRetryAt=0,socialPartyOnlineHandles=[],socialPartyServerOffsetMs=0;
let socialPartyInviteSqlReady=null,socialPartyInvites=[],socialPartyInvitePollAt=0,socialPartyInvitePolling=false;
let socialPartyInvitePromptedIds=new Set(),socialPartyInvitePromptUserId='',socialPartyInviteClaimBusy=false,socialPartyInviteClaimOp=null;
let socialPartyInviteUiKeys=new Map(),socialPartyInviteUiSequence=0,socialPartyPresenceLifecycleReady=false;
let socialNotificationSqlReady=null,socialNotifications=[],socialNotificationUnreadCount=0,socialNotificationLatestKey='';
let socialNotificationFeedRevision='';
let socialNotificationPollAt=0,socialNotificationPollOp=null,socialNotificationPollPromise=null,socialNotificationServerOffsetMs=0;
let socialNotificationBeforeKey='',socialNotificationHasMore=false,socialNotificationOlderOp=null,socialNotificationOlderPromise=null;
let socialNotificationReadOps=new Map(),socialInboxUiKeys=new Map(),socialInboxRefKeys=new Map(),socialInboxUiSequence=0;
let socialPrivateMessageReadOps=new Map(),socialLegacyInviteHandledIds=new Set(),socialLegacyInviteHandledExpires=new Map(),socialNotificationStateVersion=0;
let socialNotificationFeedGeneration=0;
let socialLegacyInviteReceiptLifecycleReady=false;
let usernameClaimOpen=false, usernameClaimMode='closed', usernameClaimUserId='';
let socialAccountSettingsSqlReady=null;

function socialHandleKey(value){
  return String(value||'').trim().replace(/^@/,'').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,32);
}
function socialDefaultHandle(){
  const suffix=String(authUser&&authUser.id||'guest').replace(/-/g,'').slice(0,20).toLowerCase();
  return ('op_'+suffix).slice(0,32);
}
function usernameIsGeneratedForUser(value,userId){
  const key=socialHandleKey(value), suffix=String(userId||'').replace(/-/g,'').toLowerCase();
  if(!key||key==='username_not_set'||key==='usernamenotset') return true;
  return !!suffix&&(key==='op_'+suffix.slice(0,20)||key==='op_'+suffix.slice(0,8));
}
function usernameIsChosenForUser(value,userId){
  const raw=String(value||'').trim().replace(/^@/,'');
  return /^[A-Za-z0-9_]{3,32}$/.test(raw)&&!usernameIsGeneratedForUser(raw,userId);
}
function usernameClaimMarker(user=authUser){
  if(!user) return '';
  const value=String(user.user_metadata&&user.user_metadata.username||'').trim().replace(/^@/,'');
  return usernameIsChosenForUser(value,user.id)?value:'';
}
function usernameNeedsClaim(profile=socialProfile,user=authUser){
  if(!user) return false;
  const userId=String(user.id||''), profileForUser=profile&&String(profile.user_id||userId)===userId;
  if(!profileForUser||!usernameIsChosenForUser(profile.handle,userId)) return true;
  const marker=usernameClaimMarker(user);
  return !marker||socialHandleKey(marker)!==socialHandleKey(profile.handle);
}
function socialHasGeneratedUsername(profile=socialProfile){
  if(!profile||!authUser) return false;
  return usernameIsGeneratedForUser(profile.handle,profile.user_id||authUser.id);
}
function usernameClaimRequired(){
  return !!(authUser&&!recovering&&usernameNeedsClaim(socialProfile,authUser));
}
function usernameGateBlocksGameplay(){
  return !!(authUser&&!recovering&&(usernameClaimOpen||usernameClaimRequired()));
}
function ownerPrivateDisplayName(user=authUser){
  if(!user||!authUser||String(user.id||'')!==String(authUser.id||'')){
    return typeof displayName==='function'?displayName(user):'operator';
  }
  const profileForUser=socialProfile&&String(socialProfile.user_id||user.id)===String(user.id||'');
  if(profileForUser&&!usernameNeedsClaim(socialProfile,user)) return String(socialProfile.handle||'operator').slice(0,32);
  return String(user.email||'').trim().slice(0,160)||'username required';
}
function usernameClaimPrivateStatus(message){
  const email=authUser&&String(authUser.email||'').trim();
  return (email?'SIGNED IN AS '+email+' · ':'')+String(message||'');
}
function requireResolvedUsernameForGameplay(){
  if(!usernameGateBlocksGameplay()) return true;
  beginUsernameClaimCheck();
  if(authUser&&!socialFetchPromise) void fetchSocial(true);
  return false;
}
function usernameClaimElements(){
  if(typeof document==='undefined') return {wrap:null,title:null,hint:null,input:null,save:null,retry:null,signout:null,status:null};
  return {
    wrap:document.getElementById('usernameclaimwrap'),
    title:document.getElementById('usernameclaimtitle'),
    hint:document.getElementById('usernameclaimhint'),
    input:document.getElementById('usernameclaiminput'),
    save:document.getElementById('usernameclaimsave'),
    retry:document.getElementById('usernameclaimretry'),
    signout:document.getElementById('usernameclaimsignout'),
    status:document.getElementById('usernameclaimstatus')
  };
}
function closeUsernameClaim(force=false){
  // A signed-in player cannot dismiss the gate by Escape, a stale callback,
  // or a direct canvas action. Only sign-out/recovery, or a profile plus Auth
  // marker that agree on the chosen username, may release it.
  if(!force&&usernameClaimRequired()){
    if(!usernameClaimOpen) beginUsernameClaimCheck();
    return false;
  }
  usernameClaimOpen=false; usernameClaimMode='closed'; usernameClaimUserId='';
  const el=usernameClaimElements();
  if(el.wrap){ el.wrap.style.display='none'; el.wrap.className='ui'; }
  if(el.input) el.input.value='';
  if(el.status) el.status.textContent='';
  return true;
}
function openUsernameClaim(mode='checking',message='Checking your account username...'){
  if(!authUser||recovering){ closeUsernameClaim(); return false; }
  // The mandatory username gate outranks the optional account popover. Keep a
  // sign-out confirmation above the gate, but never leave the normal account
  // menu showing stale/private identity behind it.
  if(typeof accountMenuOpen!=='undefined'&&accountMenuOpen&&
     !(typeof accountMenuConfirming!=='undefined'&&accountMenuConfirming)&&typeof closeAccountMenu==='function')closeAccountMenu(true);
  const id=String(authUser.id||'');
  if(!id){ closeUsernameClaim(); return false; }
  const el=usernameClaimElements(), preserveRequiredInput=usernameClaimOpen&&usernameClaimUserId===id&&usernameClaimMode==='required';
  usernameClaimOpen=true; usernameClaimMode=mode; usernameClaimUserId=id;
  const settingsOwnsRequired=mode==='required'&&typeof accountSettingsOpen!=='undefined'&&accountSettingsOpen;
  if(el.wrap){ el.wrap.className='ui '+mode; el.wrap.style.display=settingsOwnsRequired?'none':'flex'; }
  if(el.title) el.title.textContent=mode==='required'?'CHOOSE YOUR USERNAME':mode==='error'?'USERNAME REQUIRED':'CHECKING USERNAME';
  if(el.hint) el.hint.textContent=mode==='required'
    ? (socialAccountSettingsSqlReady===false
      ? 'The Social 02 database update is required before you can choose or change a username.'
      : 'Open Settings to choose the unique public username shown throughout the game. Until then, creator/main staff may use your email as the account label.')
    : mode==='error'?'Your username could not be verified. Retry the secure profile check or sign out.':'Checking the public username attached to your account.';
  if(el.status) el.status.textContent=usernameClaimPrivateStatus(message);
  if(el.save){ el.save.disabled=mode!=='required'; el.save.textContent='OPEN SETTINGS'; }
  if(el.signout) el.signout.disabled=false;
  if(mode==='required'&&!preserveRequiredInput&&el.input){
    const existing=socialProfile&&String(socialProfile.user_id||id)===id&&
      usernameIsChosenForUser(socialProfile.handle,id)?String(socialProfile.handle):'';
    el.input.value=existing;
  }
  if(mode==='required'&&!settingsOwnsRequired) try{ setTimeout(()=>el.save&&el.save.focus(),0); }catch(e){}
  return true;
}
function beginUsernameClaimCheck(){
  if(!authUser||recovering){ closeUsernameClaim(); return false; }
  const profileForUser=socialProfile&&String(socialProfile.user_id||'')===String(authUser.id||'');
  if(profileForUser){ syncUsernameClaim(); return usernameClaimOpen; }
  return openUsernameClaim('checking','Checking your account username...');
}
function syncUsernameClaim(){
  if(!authUser||recovering){ closeUsernameClaim(); return false; }
  if(!socialProfile||String(socialProfile.user_id||'')!==String(authUser.id||'')){
    return openUsernameClaim('checking','Checking your account username...');
  }
  if(usernameNeedsClaim(socialProfile,authUser)){
    openUsernameClaim('required','Use 3–32 letters, numbers, or underscores.');
    return true;
  }
  closeUsernameClaim(); return false;
}
function usernameClaimFailed(message){
  if(!authUser||recovering){ closeUsernameClaim(); return false; }
  // Friends/messages can fail after the canonical profile has already been
  // verified. That is a normal Social error, not a reason to lock gameplay.
  if(!usernameClaimRequired()){ closeUsernameClaim(); return false; }
  openUsernameClaim('error',message||'Could not verify your username. Check your connection and retry.');
  return true;
}
function usernameClaimBusy(busy,status){
  const el=usernameClaimElements();
  if(el.save) el.save.disabled=!!busy;
  if(el.signout) el.signout.disabled=!!busy;
  if(status&&el.status) el.status.textContent=usernameClaimPrivateStatus(status);
}
async function usernameClaimSubmit(){
  if(typeof openAccountSettings==='function')
    return openAccountSettings({focus:'username',requiredUsername:true});
  const el=usernameClaimElements(); return socialUpdateHandle(el.input&&el.input.value,true);
}
async function usernameClaimRetry(){
  if(!authUser) return false;
  const userId=String(authUser.id||'');
  openUsernameClaim('checking','Checking your account username...');
  const ok=await fetchSocial(true);
  if(!authUser||String(authUser.id||'')!==userId) return false;
  if(!ok&&usernameClaimMode==='checking') usernameClaimFailed('Could not verify your username. Check your connection and retry.');
  return ok;
}
function socialSafeDisplayName(){
  // `display_name` is retained in the existing table for compatibility, but
  // Outpost Zero has one public identity: the unique username in `handle`.
  return String(socialProfile&&socialProfile.handle||socialDefaultHandle()||'operator').slice(0,32);
}
function socialSetupMissing(error){
  const text=String(error&&error.message||error||'').toLowerCase();
  return /relation|schema cache|does not exist|permission denied|row-level security|could not find/.test(text);
}
function socialUsernameClockMissing(error){
  const text=[error&&error.code,error&&error.message,error&&error.details,error&&error.hint,error]
    .filter(Boolean).join(' ').toLowerCase();
  return text.includes('username_changed_at')&&/column|schema cache|could not find|does not exist/.test(text);
}
async function socialFetchOwnProfile(userId){
  const currentFields='user_id,handle,handle_key,display_name,username_changed_at,updated_at';
  const legacyFields='user_id,handle,handle_key,display_name,updated_at';
  let result=await sb.from(SOCIAL_PROFILE_TABLE).select(currentFields).eq('user_id',userId).maybeSingle();
  let settingsSqlReady=true;
  // During a staggered deploy, Social 02 may not be installed yet. Existing
  // chosen usernames remain verifiable through the older Social schema, but
  // choosing/changing a name still stays disabled until the secure RPC lands.
  if(result&&result.error&&socialUsernameClockMissing(result.error)){
    result=await sb.from(SOCIAL_PROFILE_TABLE).select(legacyFields).eq('user_id',userId).maybeSingle();
    settingsSqlReady=false;
    if(result&&result.data) result.data={...result.data,username_changed_at:null};
  }
  return {result,settingsSqlReady};
}
function socialSetupStatus(){ return 'SECURE SOCIAL STORAGE IS NOT ENABLED · RUN SOCIAL SQL SETUP'; }
function socialDropRealtime(){
  if(socialChannel&&sb){ try{ sb.removeChannel(socialChannel); }catch(e){} }
  socialChannel=null; socialRealtimeRetryAt=0;
}
function socialLegacyInviteReceiptHash(value){
  const source=String(value||'');if(!source)return '';
  const seeds=[0x811c9dc5,0x9e3779b9,0x85ebca6b,0xc2b2ae35];let output='';
  for(const seed of seeds){
    let hash=seed>>>0;
    for(let i=0;i<source.length;i++)hash=Math.imul((hash^source.charCodeAt(i))>>>0,0x01000193)>>>0;
    hash^=hash>>>16;hash=Math.imul(hash,0x7feb352d)>>>0;hash^=hash>>>15;
    output+=(hash>>>0).toString(16).padStart(8,'0');
  }
  return output;
}
function socialLegacyInviteOwnerReceiptKey(owner){
  const id=String(owner||'');return id?socialLegacyInviteReceiptHash('outpost-zero-owner|'+id):'';
}
function socialLegacyInviteRowReceiptKey(row,owner){
  const id=row&&row.id!=null?String(row.id):'',ownerId=String(owner||'');
  return id&&ownerId?socialLegacyInviteReceiptHash('outpost-zero-invite|'+ownerId+'|'+id):'';
}
function socialLegacyInviteReceiptExpiry(row){
  const invite=row&&(socialCpuGameInviteEnvelope(row.body)||socialPartyInviteEnvelope(row.body)),expiresAt=Math.floor(+(invite&&invite.expiresAt)||0),clock=Date.now();
  return expiresAt>clock&&expiresAt<=clock+SOCIAL_LEGACY_INVITE_RECEIPT_MAX_MS?expiresAt:0;
}
function socialLegacyInviteStoredReceipts(clock=Date.now()){
  const byKey=new Map(),now=Math.floor(+clock||Date.now()),stores=[];
  if(typeof localStorage!=='undefined')stores.push(localStorage);
  if(typeof sessionStorage!=='undefined')stores.push(sessionStorage);
  for(const store of stores){
    let parsed=[];try{parsed=JSON.parse(store.getItem(SOCIAL_LEGACY_INVITE_RECEIPT_STORAGE_KEY)||'[]');}catch(error){parsed=[];}
    if(!Array.isArray(parsed))continue;
    for(const item of parsed){
      const owner=String(item&&item.o||''),invite=String(item&&item.i||''),expiresAt=Math.floor(+(item&&item.e)||0);
      if(!/^[0-9a-f]{32}$/.test(owner)||!/^[0-9a-f]{32}$/.test(invite)||expiresAt<=now||expiresAt>now+SOCIAL_LEGACY_INVITE_RECEIPT_MAX_MS)continue;
      const key=owner+'|'+invite,prior=byKey.get(key);if(!prior||prior.e<expiresAt)byKey.set(key,{o:owner,i:invite,e:expiresAt});
    }
  }
  return [...byKey.values()].sort((a,b)=>a.e-b.e).slice(-SOCIAL_LEGACY_INVITE_RECEIPT_CAP);
}
function socialWriteLegacyInviteReceipts(rows){
  const serialized=JSON.stringify((Array.isArray(rows)?rows:[]).slice(-SOCIAL_LEGACY_INVITE_RECEIPT_CAP));
  if(typeof localStorage!=='undefined')try{
    localStorage.setItem(SOCIAL_LEGACY_INVITE_RECEIPT_STORAGE_KEY,serialized);
    if(typeof sessionStorage!=='undefined')try{sessionStorage.removeItem(SOCIAL_LEGACY_INVITE_RECEIPT_STORAGE_KEY);}catch(error){}
    return true;
  }catch(error){}
  if(typeof sessionStorage!=='undefined')try{sessionStorage.setItem(SOCIAL_LEGACY_INVITE_RECEIPT_STORAGE_KEY,serialized);return true;}catch(error){}
  return false;
}
function socialSetupLegacyInviteReceiptLifecycle(){
  if(socialLegacyInviteReceiptLifecycleReady||typeof window==='undefined'||typeof window.addEventListener!=='function')return;
  socialLegacyInviteReceiptLifecycleReady=true;
  window.addEventListener('storage',event=>{
    if(event&&event.key===SOCIAL_LEGACY_INVITE_RECEIPT_STORAGE_KEY&&socialAccountId)
      socialLoadLegacyInviteHandledReceipts(socialAccountId,false);
  });
}
function socialLoadLegacyInviteHandledReceipts(owner,persistPruned=true){
  const ownerKey=socialLegacyInviteOwnerReceiptKey(owner),rows=socialLegacyInviteStoredReceipts();
  socialLegacyInviteHandledIds.clear();socialLegacyInviteHandledExpires.clear();
  if(ownerKey)for(const row of rows)if(row.o===ownerKey){socialLegacyInviteHandledIds.add(row.i);socialLegacyInviteHandledExpires.set(row.i,row.e);}
  if(persistPruned)socialWriteLegacyInviteReceipts(rows);
  socialSetupLegacyInviteReceiptLifecycle();return socialLegacyInviteHandledIds.size;
}
function socialLegacyInviteHandled(row,owner=authUser&&authUser.id){
  const key=socialLegacyInviteRowReceiptKey(row,owner),expiresAt=key?Number(socialLegacyInviteHandledExpires.get(key)):0;
  if(!key||!socialLegacyInviteHandledIds.has(key)||!Number.isFinite(expiresAt)||expiresAt<=Date.now()){
    if(key){socialLegacyInviteHandledIds.delete(key);socialLegacyInviteHandledExpires.delete(key);}return false;
  }
  return true;
}
function socialPersistLegacyInviteHandled(row,owner=authUser&&authUser.id){
  const ownerId=String(owner||''),ownerKey=socialLegacyInviteOwnerReceiptKey(ownerId),inviteKey=socialLegacyInviteRowReceiptKey(row,ownerId),expiresAt=socialLegacyInviteReceiptExpiry(row);
  if(!ownerKey||!inviteKey||!expiresAt||String(row&&row.recipient_id||'')!==ownerId)return false;
  socialLegacyInviteHandledIds.add(inviteKey);socialLegacyInviteHandledExpires.set(inviteKey,expiresAt);
  const rows=socialLegacyInviteStoredReceipts().filter(item=>item.o!==ownerKey||item.i!==inviteKey);
  rows.push({o:ownerKey,i:inviteKey,e:expiresAt});socialWriteLegacyInviteReceipts(rows);return true;
}
function socialResetNotificationState(){
  socialNotificationSqlReady=null;socialNotifications=[];socialNotificationUnreadCount=0;socialNotificationLatestKey='';socialNotificationFeedRevision='';
  socialNotificationPollAt=0;socialNotificationPollOp=null;socialNotificationPollPromise=null;socialNotificationServerOffsetMs=0;
  socialNotificationBeforeKey='';socialNotificationHasMore=false;socialNotificationOlderOp=null;socialNotificationOlderPromise=null;
  socialNotificationReadOps.clear();socialPrivateMessageReadOps.clear();socialInboxUiKeys.clear();socialInboxRefKeys.clear();socialInboxUiSequence=0;
  socialLegacyInviteHandledIds.clear();socialLegacyInviteHandledExpires.clear();
  socialNotificationStateVersion++;socialNotificationFeedGeneration++;
}
function prepareSocialForAccount(userId){
  const id=String(userId||'');
  if(socialAccountId===id) return false;
  if((socialCpuInvitePromptUserId||socialPartyInvitePromptUserId)&&typeof formOpen!=='undefined'&&formOpen&&typeof closeForm==='function') closeForm();
  socialCpuInvitePromptUserId='';socialPartyInvitePromptUserId='';
  if(usernameClaimUserId&&usernameClaimUserId!==id) closeUsernameClaim(true);
  socialAccountId=id;
  socialFetchVersion++;
  socialFetchUserId=''; socialFetchPromise=null; socialFetchQueued=false;
  socialDropRealtime(); socialDropPartyRealtimePresence(); socialProfile=null; socialProfiles={}; socialFriends=[]; socialMessages=[];
  socialBackend={profiles:null,friends:null,messages:null}; socialLoading=false; socialLastFetch=0;
  socialAccountSettingsSqlReady=null;
  socialView='friends'; socialFriendPage=0; socialMessagePage=0;
  socialInboxSection='inbox';socialConversationPeer='';socialConversationPage=0;
  socialConversationStates={};socialConversationSqlReady=null;socialConversationBusy='';
  socialFriendPages={incoming:0,outgoing:0,current:0};
  socialCpuInvitePollAt=0; socialCpuInvitePolling=false; socialCpuInvitePromptedIds=new Set();
  socialPartyPresenceOwner=id;socialPartyServerOffsetMs=0;
  socialPartyInviteSqlReady=null;socialPartyInvites=[];socialPartyInvitePollAt=0;socialPartyInvitePolling=false;
  socialPartyInvitePromptedIds=new Set();socialPartyInviteClaimBusy=false;socialPartyInviteClaimOp=null;socialPartyInviteUiKeys.clear();socialPartyInviteUiSequence=0;
  socialResetNotificationState();
  if(id)socialLoadLegacyInviteHandledReceipts(id);
  if(typeof clearReaderState==='function')clearReaderState();
  socialStatus=id?'CHECKING YOUR USERNAME...':'SIGN IN FOR FRIENDS + DIRECT MESSAGES';
  return true;
}
function resetSocialState(message){
  socialAccountId=''; socialFetchVersion++;
  if((socialCpuInvitePromptUserId||socialPartyInvitePromptUserId)&&typeof formOpen!=='undefined'&&formOpen&&typeof closeForm==='function') closeForm();
  socialCpuInvitePromptUserId='';socialPartyInvitePromptUserId='';
  socialFetchUserId=''; socialFetchPromise=null; socialFetchQueued=false;
  socialDropRealtime(); socialDropPartyRealtimePresence(); socialProfile=null; socialProfiles={}; socialFriends=[]; socialMessages=[];
  socialBackend={profiles:null,friends:null,messages:null}; socialLoading=false; socialLastFetch=0;
  socialAccountSettingsSqlReady=null;
  socialView='friends'; socialFriendPage=0; socialMessagePage=0;
  socialInboxSection='inbox';socialConversationPeer='';socialConversationPage=0;
  socialConversationStates={};socialConversationSqlReady=null;socialConversationBusy='';
  socialFriendPages={incoming:0,outgoing:0,current:0};
  socialCpuInvitePollAt=0; socialCpuInvitePolling=false; socialCpuInvitePromptedIds=new Set();
  socialPartyPresenceOwner='';socialPartyServerOffsetMs=0;
  socialPartyInviteSqlReady=null;socialPartyInvites=[];socialPartyInvitePollAt=0;socialPartyInvitePolling=false;
  socialPartyInvitePromptedIds=new Set();socialPartyInviteClaimBusy=false;socialPartyInviteClaimOp=null;socialPartyInviteUiKeys.clear();socialPartyInviteUiSequence=0;
  socialResetNotificationState();
  if(typeof clearReaderState==='function')clearReaderState();
  socialStatus=message||'SIGN IN FOR FRIENDS + DIRECT MESSAGES';
  closeUsernameClaim();
}
function setupSocialRealtime(){
  if(!sb||!authUser||socialChannel||socialBackend.friends!==true||socialBackend.messages!==true||typeof sb.channel!=='function') return;
  try{
    const owner=String(authUser.id||'');
    let ch=sb.channel('oz-social-'+authUser.id);
    // DELETE change payloads cannot be filtered through row-level security
    // after their row is gone. Listen only for inserts/updates; a removed
    // friendship is picked up by the normal page refresh/poll instead of
    // leaking its row ID to unrelated signed-in subscribers.
    for(const event of ['INSERT','UPDATE']){
      ch=ch.on('postgres_changes',{event,schema:'public',table:SOCIAL_FRIEND_TABLE},()=>{socialCpuInvitePollAt=0;socialNotificationPollAt=0;void fetchSocial(true);});
      ch=ch.on('postgres_changes',{event,schema:'public',table:SOCIAL_MESSAGE_TABLE},()=>{socialCpuInvitePollAt=0;socialNotificationPollAt=0;void fetchSocial(true);});
      if(typeof socialConversationSqlReady!=='undefined'&&socialConversationSqlReady===true)ch=ch.on('postgres_changes',{event,schema:'public',table:SOCIAL_CONVERSATION_TABLE},()=>{void fetchSocial(true);});
    }
    socialChannel=ch;
    ch.subscribe(status=>{
      if(socialChannel!==ch||!authUser||String(authUser.id||'')!==owner)return;
      if(status==='SUBSCRIBED'){
        socialRealtimeRetryAt=0; socialCpuInvitePollAt=Date.now()+SOCIAL_CPU_INVITE_POLL_MS;
      }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
        socialChannel=null; socialRealtimeRetryAt=Date.now()+SOCIAL_REALTIME_RETRY_MS; socialCpuInvitePollAt=0;
        try{sb.removeChannel(ch);}catch(e){}
      }
    });
  }catch(e){ socialChannel=null; socialRealtimeRetryAt=Date.now()+SOCIAL_REALTIME_RETRY_MS; }
}
function socialFriendOther(row){
  if(!row||!authUser) return '';
  return String(row.requester_id)===String(authUser.id)?String(row.addressee_id||''):String(row.requester_id||'');
}
function socialFriendshipWith(userId){
  const id=String(userId||''); return socialFriends.find(r=>socialFriendOther(r)===id)||null;
}
function socialAcceptedFriend(userId){ const r=socialFriendshipWith(userId); return !!(r&&r.status==='accepted'); }
function socialPartyInviteSafeHandle(value,userId=''){
  const handle=String(value||'').trim().replace(/^@/,'');
  const genericGenerated=!userId&&/^op_[0-9a-f]{8,20}$/i.test(handle);
  return /^[A-Za-z0-9_]{3,32}$/.test(handle)&&!genericGenerated&&!usernameIsGeneratedForUser(handle,userId)?handle:'';
}
function socialLocalPartyInviteTargets(){
  const targets=[],seen=new Set();
  for(const friendship of (Array.isArray(socialFriends)?socialFriends:[])){
    if(!friendship||friendship.status!=='accepted')continue;
    const recipientId=String(socialFriendOther(friendship)||''),profile=socialProfiles&&socialProfiles[recipientId],
      handle=socialPartyInviteSafeHandle(profile&&profile.handle,recipientId);
    if(!recipientId||!handle||seen.has(recipientId))continue;
    seen.add(recipientId);targets.push({recipientId,handle,source:'friend',isOnline:false,deliveryKey:''});
  }
  return targets.sort((a,b)=>a.handle.localeCompare(b.handle,undefined,{sensitivity:'base'}));
}
function socialMergePartyInviteTargets(localTargets,remoteTargets){
  // Usernames are unique case-insensitively. Add accepted friends first so a
  // friend who is also online appears once under FRIENDS, never in both lists.
  const merged=[],byHandle=new Map();
  const append=(row,fallbackSource)=>{
    if(!row)return;
    const recipientId=String(row.recipientId||row.userId||''),handle=socialPartyInviteSafeHandle(row.handle||row.username,recipientId),
      source=row.source==='friend'?'friend':fallbackSource,deliveryKey=String(row.deliveryKey||row.targetKey||''),isOnline=row.isOnline===true;
    const handleKey=handle.toLowerCase();
    if(!handle||source!=='friend'&&!deliveryKey)return;
    if(source==='friend'&&!recipientId&&!deliveryKey)return;
    const existing=byHandle.get(handleKey);
    if(existing){
      // The server target token lets an accepted friend use the Social 03
      // delivery path while the local relationship keeps FRIENDS precedence.
      if(!existing.deliveryKey&&deliveryKey)existing.deliveryKey=deliveryKey;
      if(!existing.recipientId&&recipientId)existing.recipientId=recipientId;
      if(isOnline)existing.isOnline=true;
      if(source==='friend')existing.source='friend';
      return;
    }
    const target={recipientId,handle,source,isOnline,deliveryKey};byHandle.set(handleKey,target);merged.push(target);
  };
  for(const row of Array.isArray(localTargets)?localTargets:[])append(row,'friend');
  for(const row of Array.isArray(remoteTargets)?remoteTargets:[])append(row,'online');
  return merged.sort((a,b)=>{
    if(a.source!==b.source)return a.source==='friend'?-1:1;
    return a.handle.localeCompare(b.handle,undefined,{sensitivity:'base'});
  });
}
async function socialPartyInviteTargets(){
  const local=socialLocalPartyInviteTargets();
  // Social 03 owns the remote wrappers. Until that migration is installed,
  // accepted-friend invitations retain their existing local fallback.
  if(typeof socialFetchOnlinePartyInviteTargets!=='function')return {targets:local,onlineReady:false};
  const remote=await socialFetchOnlinePartyInviteTargets();
  return {targets:socialMergePartyInviteTargets(local,remote&&remote.targets),onlineReady:!!(remote&&remote.ready)};
}
function socialPartyInviteUuid(value){
  const id=String(value||'').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)?id:'';
}
function socialPartyInviteOperationId(){
  try{if(globalThis.crypto&&typeof crypto.randomUUID==='function')return socialPartyInviteUuid(crypto.randomUUID());}catch(e){}
  try{
    const bytes=new Uint8Array(16);if(!(globalThis.crypto&&crypto.getRandomValues))return '';
    crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
    return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
  }catch(e){return '';}
}
function socialPartyInviteServerNow(){return Date.now()+socialPartyServerOffsetMs;}
function socialPartyInviteRpcMissing(error){
  const text=[error&&error.code,error&&error.message,error&&error.details,error&&error.hint].filter(Boolean).join(' ').toLowerCase();
  return /pgrst202|could not find.*function|function .* does not exist/.test(text);
}
function socialPartyInviteSemanticError(error){
  const code=String(error&&error.code||'').toUpperCase(),message=String(error&&error.message||'').toUpperCase();
  return ['P0001','22023','42501','23505'].includes(code)||/RATE_LIMIT|INVALID|UNAVAILABLE|ALREADY_PENDING|IDEMPOTENCY|AUTHENTICATION_REQUIRED/.test(message);
}
function setupSocialPartyPresenceLifecycle(){
  if(socialPartyPresenceLifecycleReady||typeof document==='undefined')return;
  socialPartyPresenceLifecycleReady=true;
  document.addEventListener('visibilitychange',()=>{
    if(authUser&&document.visibilityState!=='hidden'){
      socialPartyPresenceRetryAt=0;void socialEnsurePartyRealtimePresence(true);socialPartyInvitePollAt=0;
    }
  });
}
function socialPartyPresenceSnapshot(ch=socialPartyPresenceChannel){
  if(!ch||ch!==socialPartyPresenceChannel||typeof ch.presenceState!=='function')return [];
  const own=socialPartyInviteSafeHandle(socialProfile&&socialProfile.handle,authUser&&authUser.id).toLowerCase(),seen=new Set(),handles=[];
  let state={};try{state=ch.presenceState()||{};}catch(error){state={};}
  for(const entries of Object.values(state))for(const entry of Array.isArray(entries)?entries:[]){
    const handle=socialPartyInviteSafeHandle(entry&&entry.username),key=handle.toLowerCase();
    if(!handle||key===own||seen.has(key))continue;
    seen.add(key);handles.push(handle);
  }
  socialPartyOnlineHandles=handles.sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})).slice(0,60);
  return socialPartyOnlineHandles;
}
function socialHandlePublicPartyWakeup(message){
  if(!authUser||typeof partyPublicHandleRealtimeWakeup!=='function')return false;
  return partyPublicHandleRealtimeWakeup(message&&message.payload||message||{});
}
async function socialBroadcastPublicPartyWakeup(username,requestId,status){
  const target=socialPartyInviteSafeHandle(username),id=String(requestId||'').toLowerCase(),decision=String(status||'');
  if(!authUser||!target||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)||!['pending','accepted','declined'].includes(decision))return false;
  if(!socialPartyPresenceReady&&!await socialEnsurePartyRealtimePresence(true))return false;
  const ch=socialPartyPresenceChannel;if(!ch||!socialPartyPresenceReady)return false;
  try{const result=await ch.send({type:'broadcast',event:'public_party_request_changed',payload:{to:target,requestId:id,status:decision}});return result==='ok'||result===true;}catch(error){return false;}
}
function socialDropPartyRealtimePresence(){
  const ch=socialPartyPresenceChannel;
  socialPartyPresenceChannel=null;socialPartyPresencePromise=null;socialPartyPresenceReady=false;
  socialPartyPresenceRetryAt=0;socialPartyOnlineHandles=[];
  if(ch&&sb){try{void ch.untrack();}catch(error){}try{sb.removeChannel(ch);}catch(error){}}
}
async function socialEnsurePartyRealtimePresence(force=false){
  const owner=authUser?String(authUser.id||''):'',handle=socialPartyInviteSafeHandle(socialProfile&&socialProfile.handle,owner),clock=Date.now();
  if(!sb||!owner||!handle||typeof sb.channel!=='function'||typeof navigator!=='undefined'&&navigator.onLine===false||socialBackend.profiles!==true)return false;
  setupSocialPartyPresenceLifecycle();
  if(socialPartyPresenceOwner&&socialPartyPresenceOwner!==owner)socialDropPartyRealtimePresence();
  socialPartyPresenceOwner=owner;
  if(socialPartyPresencePromise)return socialPartyPresencePromise;
  if(socialPartyPresenceChannel){
    if(force&&socialPartyPresenceReady)try{await socialPartyPresenceChannel.track({username:handle});}catch(error){}
    socialPartyPresenceSnapshot();return socialPartyPresenceReady;
  }
  if(!force&&clock<socialPartyPresenceRetryAt)return false;
  const ch=sb.channel('oz-social-party-online-v1',{config:{presence:{key:owner}}});
  socialPartyPresenceChannel=ch;socialPartyPresenceReady=false;
  ch.on('presence',{event:'sync'},()=>{if(ch===socialPartyPresenceChannel)socialPartyPresenceSnapshot(ch);});
  ch.on('broadcast',{event:'public_party_request_changed'},message=>{if(ch===socialPartyPresenceChannel)socialHandlePublicPartyWakeup(message);});
  const request=new Promise(resolve=>{
    let settled=false;
    const finish=value=>{if(!settled){settled=true;resolve(value);}};
    ch.subscribe(async status=>{
      if(ch!==socialPartyPresenceChannel||!authUser||String(authUser.id||'')!==owner){finish(false);return;}
      if(status==='SUBSCRIBED'){
        try{await ch.track({username:handle});}catch(error){socialPartyPresenceRetryAt=Date.now()+SOCIAL_REALTIME_RETRY_MS;finish(false);return;}
        if(ch!==socialPartyPresenceChannel||!authUser||String(authUser.id||'')!==owner){finish(false);return;}
        socialPartyPresenceReady=true;socialPartyPresenceRetryAt=0;socialPartyPresenceSnapshot(ch);finish(true);
      }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
        if(ch===socialPartyPresenceChannel){socialPartyPresenceChannel=null;socialPartyPresenceReady=false;socialPartyOnlineHandles=[];socialPartyPresenceRetryAt=Date.now()+SOCIAL_REALTIME_RETRY_MS;try{sb.removeChannel(ch);}catch(error){}}
        finish(false);
      }
    });
    setTimeout(()=>{if(!settled){if(ch===socialPartyPresenceChannel){socialPartyPresenceChannel=null;socialPartyPresenceReady=false;socialPartyOnlineHandles=[];socialPartyPresenceRetryAt=Date.now()+SOCIAL_REALTIME_RETRY_MS;try{sb.removeChannel(ch);}catch(error){}}finish(false);}},6000);
  });
  socialPartyPresencePromise=request;
  try{return await request;}finally{if(socialPartyPresencePromise===request)socialPartyPresencePromise=null;}
}
async function socialFetchOnlinePartyInviteTargets(){
  const owner=authUser?String(authUser.id||''):'';
  if(!owner||!await socialEnsurePartyRealtimePresence(true))return {ready:false,targets:[]};
  try{
    const result=await sb.rpc('list_outpost_zero_party_invite_targets',{p_limit:40,p_online_usernames:socialPartyPresenceSnapshot().slice(0,60)});
    if(!authUser||String(authUser.id||'')!==owner)return {ready:false,targets:[]};
    if(result&&result.error)throw result.error;
    const targets=[];
    for(const row of Array.isArray(result&&result.data)?result.data:[]){
      const deliveryKey=socialPartyInviteUuid(row&&row.target_token),handle=socialPartyInviteSafeHandle(row&&row.username),
        friend=row&&row.is_friend===true,online=row&&row.is_online===true;
      if(!deliveryKey||!handle||!friend&&!online)continue;
      targets.push({handle,source:friend?'friend':'online',isOnline:online,deliveryKey,recipientId:''});
    }
    socialPartyInviteSqlReady=true;return {ready:true,targets:targets.slice(0,40)};
  }catch(error){
    if(authUser&&String(authUser.id||'')===owner&&socialPartyInviteRpcMissing(error))socialPartyInviteSqlReady=false;
    return {ready:false,targets:[]};
  }
}
function socialPartyInviteUiKey(inviteId){
  const id=socialPartyInviteUuid(inviteId);if(!id)return '';
  let key=socialPartyInviteUiKeys.get(id);if(key)return key;
  key='cloud_invite_'+(++socialPartyInviteUiSequence);socialPartyInviteUiKeys.set(id,key);return key;
}
function socialPartyInviteByUiKey(uiKey){
  const key=String(uiKey||'');return socialPartyInvites.find(row=>row&&row.uiKey===key)||null;
}
function socialNormalizePartyInviteMetadata(row){
  const inviteId=socialPartyInviteUuid(row&&row.invite_id),senderUsername=socialPartyInviteSafeHandle(row&&row.sender_username),
    kind=row&&row.kind==='cpu2v2'?'cpu2v2':row&&row.kind==='party'?'party':'',
    createdAt=Date.parse(row&&row.created_at||''),expiresAt=Date.parse(row&&row.expires_at||''),clock=socialPartyInviteServerNow(),
    maxMs=kind==='cpu2v2'?2*60*1000:5*60*1000;
  if(!inviteId||!senderUsername||!kind||!Number.isFinite(createdAt)||!Number.isFinite(expiresAt)||expiresAt<=clock||
     expiresAt<=createdAt||expiresAt>createdAt+maxMs+5000)return null;
  return {inviteId,senderUsername,kind,createdAt,expiresAt,uiKey:socialPartyInviteUiKey(inviteId)};
}
async function socialPollPartyInvites(force=false){
  const owner=authUser?String(authUser.id||''):'',clock=Date.now();
  if(!sb||!owner||typeof navigator!=='undefined'&&navigator.onLine===false||socialPartyInvitePolling)return false;
  if(!force&&clock<socialPartyInvitePollAt)return false;
  socialPartyInvitePollAt=clock+SOCIAL_PARTY_INVITE_POLL_MS;socialPartyInvitePolling=true;
  try{
    const result=await sb.rpc('list_outpost_zero_party_invites',{p_limit:20});
    if(!authUser||String(authUser.id||'')!==owner)return false;
    if(result&&result.error)throw result.error;
    const next=[];
    for(const row of Array.isArray(result&&result.data)?result.data:[]){const invite=socialNormalizePartyInviteMetadata(row);if(invite)next.push(invite);}
    next.sort((a,b)=>b.createdAt-a.createdAt);socialPartyInvites=next.slice(0,20);
    const liveIds=new Set(socialPartyInvites.map(row=>row.inviteId));
    for(const id of socialPartyInviteUiKeys.keys())if(!liveIds.has(id))socialPartyInviteUiKeys.delete(id);
    socialPartyInviteSqlReady=true;socialMaybePromptPartyInvite();return true;
  }catch(error){
    if(authUser&&String(authUser.id||'')===owner&&socialPartyInviteRpcMissing(error)){
      socialPartyInviteSqlReady=false;socialPartyInvites=[];socialPartyInviteUiKeys.clear();
    }
    return false;
  }finally{if(!authUser||String(authUser.id||'')===owner)socialPartyInvitePolling=false;}
}
async function socialClaimPartyInvite(inviteId){
  const owner=authUser?String(authUser.id||''):'',id=socialPartyInviteUuid(inviteId);
  if(!sb||!owner||!id||socialPartyInviteSqlReady!==true)return null;
  try{
    const result=await sb.rpc('claim_outpost_zero_party_invite',{p_invite_id:id});
    if(!authUser||String(authUser.id||'')!==owner)return null;
    if(result&&result.error)throw result.error;
    const row=Array.isArray(result&&result.data)?result.data[0]:result&&result.data,metadata=socialNormalizePartyInviteMetadata(row),
      code=String(row&&row.party_code||''),token=String(row&&row.join_token||'');
    if(!metadata||metadata.inviteId!==id||!/^[A-Z0-9]{6}$/.test(code)||!/^[A-Za-z0-9_-]{20,64}$/.test(token))return null;
    return {...metadata,code,token,serverClaimed:true};
  }catch(error){if(socialPartyInviteRpcMissing(error))socialPartyInviteSqlReady=false;return null;}
}
async function socialDismissPartyInvite(inviteId){
  const owner=authUser?String(authUser.id||''):'',id=socialPartyInviteUuid(inviteId);if(!sb||!owner||!id)return false;
  try{
    const result=await sb.rpc('dismiss_outpost_zero_party_invite',{p_invite_id:id});
    if(!authUser||String(authUser.id||'')!==owner)return false;
    if(result&&result.error)throw result.error;
    socialPartyInvites=socialPartyInvites.filter(row=>row.inviteId!==id);socialPartyInviteUiKeys.delete(id);return result.data===true;
  }catch(error){if(socialPartyInviteRpcMissing(error))socialPartyInviteSqlReady=false;return false;}
}
async function socialClaimAndJoinPartyInvite(uiKey){
  const metadata=socialPartyInviteByUiKey(uiKey),owner=authUser?String(authUser.id||''):'';
  if(!metadata||!owner||socialPartyInviteClaimOp)return false;
  const op={owner,inviteId:metadata.inviteId};socialPartyInviteClaimOp=op;socialPartyInviteClaimBusy=true;socialStatus='VERIFYING PARTY INVITE...';
  try{
    const claimed=await socialClaimPartyInvite(metadata.inviteId);
    if(!authUser||String(authUser.id||'')!==owner)return false;
    if(!claimed||claimed.kind!==metadata.kind){socialStatus='THAT PARTY INVITE EXPIRED OR IS NO LONGER AVAILABLE';sfx('dry');return false;}
    const joined=claimed.kind==='cpu2v2'
      ?(typeof partyJoinCpuInvite==='function'&&partyJoinCpuInvite(claimed))
      :(typeof partyJoinFriendInvite==='function'&&partyJoinFriendInvite(claimed));
    return !!joined;
  }finally{if(socialPartyInviteClaimOp===op){socialPartyInviteClaimOp=null;socialPartyInviteClaimBusy=false;}}
}
function socialMaybePromptPartyInvite(){
  if(socialPartyInvitePromptUserId&&typeof formOpen!=='undefined'&&!formOpen)socialPartyInvitePromptUserId='';
  if(!socialCpuInvitePromptAvailable())return false;
  const owner=String(authUser.id||''),rows=(Array.isArray(socialPartyInvites)?socialPartyInvites:[]).slice().sort((a,b)=>b.createdAt-a.createdAt);
  for(const invite of rows){
    if(!invite||socialPartyInvitePromptedIds.has(invite.inviteId))continue;
    socialPartyInvitePromptedIds.add(invite.inviteId);socialPartyInvitePromptUserId=owner;
    const cpu=invite.kind==='cpu2v2',label=cpu?'CPU 2v2 INVITE':'PARTY INVITE';
    socialStatus=label+' FROM @'+invite.senderUsername+' · '+(cpu?'START':'JOIN')+' OR DISMISS';
    openForm({title:label,hint:'@'+invite.senderUsername+(cpu
        ?' invited you to play together against two CPUs. Start verifies the private invite and joins immediately.'
        :' invited you to their Party. Join verifies the private invite and connects without showing a code.'),
      saveLabel:cpu?'START GAME':'JOIN PARTY',fields:[],
      onCancel:()=>{socialPartyInvitePromptUserId='';socialStatus=label+' DISMISSED';void socialDismissPartyInvite(invite.inviteId);},
      onSave:async()=>{
        if(!authUser||String(authUser.id||'')!==owner){socialPartyInvitePromptUserId='';closeForm();return false;}
        const joined=await socialClaimAndJoinPartyInvite(invite.uiKey);
        if(joined){socialPartyInvitePromptUserId='';closeForm();return true;}
        if(authUser&&String(authUser.id||'')===owner&&typeof formOpen!=='undefined'&&formOpen)formError(socialStatus||'Could not join that invite.');
        return false;
      }});
    return true;
  }
  return false;
}
const SOCIAL_NOTIFICATION_KINDS=new Set(['admin_message','official_update','ban_applied','ban_lifted',
  'weapon_temporary_granted','weapon_temporary_extended','weapon_temporary_revoked','weapon_permanent_granted',
  'weapon_permanent_revoked','currency_updated','upgrades_updated','score_updated','friend_request','friend_accepted']);
function socialNotificationKey(value){
  const key=String(value||'').trim();return /^n_[1-9][0-9]{0,18}$/.test(key)?key:'';
}
function socialNotificationText(value,max){
  return String(value||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);
}
function socialNotificationDisplayTitle(kind,value){
  const raw=socialNotificationText(value,100),lower=raw.toLowerCase(),fallback=socialNotificationFallbackTitle(kind);
  if(!raw) return fallback;
  const looksConfusing=lower==='true'||lower==='false'||lower==='field'||lower==='unknown'||lower==='n/a'||lower==='null'||
    (/^[_a-z]+$/.test(lower)&&lower.includes('_')&&lower.length<=28)||lower.startsWith('field ')||lower.startsWith('field_');
  return looksConfusing?fallback:raw;
}
function socialNotificationFallbackTitle(kind){
  const labels={admin_message:'MESSAGE FROM OUTPOST ZERO',official_update:'OFFICIAL UPDATE',ban_applied:'ACCOUNT NOTICE',
    ban_lifted:'BAN LIFTED',weapon_temporary_granted:'TEMPORARY WEAPON GIFT',weapon_temporary_extended:'TEMPORARY GIFT EXTENDED',
    weapon_temporary_revoked:'TEMPORARY GIFT ENDED',weapon_permanent_granted:'WEAPON GIFT',
    weapon_permanent_revoked:'WEAPON ACCESS UPDATED',currency_updated:'ACCOUNT BALANCE UPDATED',upgrades_updated:'UPGRADES UPDATED',
    score_updated:'SCORE UPDATED',friend_request:'NEW FRIEND REQUEST',friend_accepted:'FRIEND REQUEST ACCEPTED'};
  return labels[kind]||'OUTPOST ZERO NOTICE';
}
function socialNotificationAuthor(value,kind){
  const text=socialNotificationText(value,48),looksPrivate=/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(text),
    looksUuid=/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(text);
  const valueLower=String(text||'').toLowerCase(),looksConfusing=!text||valueLower==='true'||valueLower==='false'||valueLower==='field'||
    valueLower==='field grant'||valueLower.startsWith('field ')||valueLower.startsWith('field_')||
    (/^[_a-z]+$/.test(valueLower)&&valueLower.includes('_')&&valueLower.length<=28);
  if(!looksConfusing&&text&&!looksPrivate&&!looksUuid)return text;
  return kind==='admin_message'?'OUTPOST ZERO STAFF':kind==='official_update'?'OUTPOST ZERO OFFICIAL':'OUTPOST ZERO SYSTEM';
}
function socialInboxUiKey(kind,sourceValue){
  const sourceKey=String(sourceValue||''),ref=String(kind||'')+'|'+sourceKey;if(!sourceKey)return '';
  let key=socialInboxRefKeys.get(ref);if(key)return key;
  key='inbox_item_'+(++socialInboxUiSequence);socialInboxRefKeys.set(ref,key);
  socialInboxUiKeys.set(key,{kind:String(kind||''),sourceKey,owner:String(authUser&&authUser.id||'')});return key;
}
function socialInboxReference(uiKey,kind){
  const ref=socialInboxUiKeys.get(String(uiKey||'')),owner=String(authUser&&authUser.id||'');
  return ref&&ref.owner===owner&&(!kind||ref.kind===kind)?ref:null;
}
function socialNotificationByUiKey(uiKey){
  const ref=socialInboxReference(uiKey,'notification');if(!ref)return null;
  return socialNotifications.find(row=>row&&row.notificationKey===ref.sourceKey)||null;
}
function socialNormalizeNotification(row,serverNow){
  const notificationKey=socialNotificationKey(row&&row.notification_key),kind=String(row&&row.kind||''),
    title=socialNotificationText(row&&row.title,100),message=socialNotificationText(row&&row.message,1600),
    createdAt=Date.parse(row&&row.created_at||''),readAt=row&&row.read_at?Date.parse(row.read_at):NaN,
    effectiveUntil=row&&row.effective_until?Date.parse(row.effective_until):NaN,
    resourceKey=socialNotificationText(row&&row.resource_key,180);
  if(!notificationKey||!SOCIAL_NOTIFICATION_KINDS.has(kind)||!message||!Number.isFinite(createdAt)||
     createdAt>serverNow+5*60000)return null;
  return {notificationKey,kind,title:socialNotificationDisplayTitle(kind,title),message,
    authorLabel:socialNotificationAuthor(row&&row.author_label,kind),resourceKey,
    effectiveUntil:Number.isFinite(effectiveUntil)?effectiveUntil:0,createdAt,
    readAt:Number.isFinite(readAt)?readAt:0,isGlobal:row&&row.is_global===true,
    uiKey:socialInboxUiKey('notification',notificationKey)};
}
function socialMergeNotifications(rows){
  const byKey=new Map();
  for(const row of socialNotifications)if(row&&row.notificationKey)byKey.set(row.notificationKey,row);
  for(const row of rows){
    if(!row||!row.notificationKey)continue;
    const old=byKey.get(row.notificationKey);if(old&&old.readAt&&!row.readAt)row.readAt=old.readAt;
    byKey.set(row.notificationKey,row);
  }
  socialNotifications=[...byKey.values()].sort((a,b)=>b.createdAt-a.createdAt);
}
function socialNotificationServerNow(){return Date.now()+socialNotificationServerOffsetMs;}
async function socialPollNotifications(force=false){
  const owner=authUser?String(authUser.id||''):'',clock=Date.now();
  if(!sb||!owner||typeof navigator!=='undefined'&&navigator.onLine===false)return false;
  if(!force&&clock<socialNotificationPollAt)return socialNotificationSqlReady===true;
  if(socialNotificationPollOp&&socialNotificationPollOp.owner===owner)return socialNotificationPollPromise||false;
  const op={owner,stateVersion:socialNotificationStateVersion};socialNotificationPollOp=op;
  socialNotificationPollAt=clock+SOCIAL_NOTIFICATION_POLL_MS;
  const request=(async()=>{
    try{
      const summaryResult=await sb.rpc('get_my_outpost_zero_notification_summary');
      if(!authUser||String(authUser.id||'')!==owner||socialNotificationPollOp!==op)return false;
      if(summaryResult&&summaryResult.error)throw summaryResult.error;
      const summary=Array.isArray(summaryResult&&summaryResult.data)?summaryResult.data[0]:summaryResult&&summaryResult.data,
        unread=Number(summary&&summary.unread_count),rawLatestKey=summary&&summary.latest_notification_key,
        latestKey=rawLatestKey==null?'':socialNotificationKey(rawLatestKey),
        feedRevision=String(summary&&summary.feed_revision||''),serverNow=Date.parse(summary&&summary.server_now||'');
      if(!Number.isSafeInteger(unread)||unread<0||unread>1000000||rawLatestKey!=null&&!latestKey||
         !/^f_[0-9a-f]{32}$/.test(feedRevision)||!Number.isFinite(serverNow))
        throw new Error('INVALID_NOTIFICATION_SUMMARY');
      const listResult=await sb.rpc('list_my_outpost_zero_notifications',{p_before_notification_key:null,p_limit:SOCIAL_NOTIFICATION_LIMIT});
      if(!authUser||String(authUser.id||'')!==owner||socialNotificationPollOp!==op)return false;
      if(listResult&&listResult.error)throw listResult.error;
      const next=[],seen=new Set();
      for(const raw of Array.isArray(listResult&&listResult.data)?listResult.data:[]){
        const rowNow=Date.parse(raw&&raw.server_now||''),normalized=socialNormalizeNotification(raw,Number.isFinite(rowNow)?rowNow:serverNow);
        if(normalized&&!seen.has(normalized.notificationKey)){seen.add(normalized.notificationKey);next.push(normalized);}
      }
      if(socialNotificationStateVersion!==op.stateVersion){socialNotificationPollAt=0;return false;}
      if(feedRevision!==socialNotificationFeedRevision){
        // Any visible insert/removal changes the server's opaque revision.
        // Reset every cached page so tombstones disappear and a >page insert
        // burst cannot leave a gap behind a cursor from the older revision.
        socialNotificationFeedGeneration++;socialNotificationOlderOp=null;socialNotificationOlderPromise=null;
        socialNotifications=next.sort((a,b)=>b.createdAt-a.createdAt);
        socialNotificationBeforeKey=next.length?next[next.length-1].notificationKey:'';
        socialNotificationHasMore=next.length===SOCIAL_NOTIFICATION_LIMIT;
      }else socialMergeNotifications(next);
      socialNotificationUnreadCount=unread;socialNotificationLatestKey=latestKey;
      socialNotificationFeedRevision=feedRevision;socialNotificationServerOffsetMs=serverNow-Date.now();socialNotificationSqlReady=true;return true;
    }catch(error){
      if(authUser&&String(authUser.id||'')===owner&&(socialPartyInviteRpcMissing(error)||String(error&&error.message||'').includes('INVALID_NOTIFICATION_SUMMARY'))){
        socialNotificationSqlReady=false;socialNotifications=[];socialNotificationUnreadCount=0;socialNotificationLatestKey='';socialNotificationFeedRevision='';
        socialNotificationBeforeKey='';socialNotificationHasMore=false;socialNotificationFeedGeneration++;
        socialNotificationOlderOp=null;socialNotificationOlderPromise=null;
      }
      return false;
    }
  })();
  socialNotificationPollPromise=request;
  try{return await request;}finally{
    if(socialNotificationPollOp===op){socialNotificationPollOp=null;socialNotificationPollPromise=null;}
  }
}
async function socialLoadOlderNotifications(){
  const owner=authUser?String(authUser.id||''):'',before=socialNotificationBeforeKey;
  if(!sb||!owner||socialNotificationSqlReady!==true||!socialNotificationHasMore||!before)return false;
  if(socialNotificationOlderOp&&socialNotificationOlderOp.owner===owner)return socialNotificationOlderPromise||false;
  const op={owner,before,feedGeneration:socialNotificationFeedGeneration};socialNotificationOlderOp=op;
  const request=(async()=>{
    try{
      const result=await sb.rpc('list_my_outpost_zero_notifications',{p_before_notification_key:before,p_limit:SOCIAL_NOTIFICATION_LIMIT});
      if(!authUser||String(authUser.id||'')!==owner||socialNotificationOlderOp!==op||socialNotificationFeedGeneration!==op.feedGeneration)return false;
      if(result&&result.error)throw result.error;
      const rawRows=Array.isArray(result&&result.data)?result.data:[],next=[],seen=new Set();
      for(const raw of rawRows){
        const rowNow=Date.parse(raw&&raw.server_now||''),normalized=socialNormalizeNotification(raw,Number.isFinite(rowNow)?rowNow:socialNotificationServerNow());
        if(normalized&&!seen.has(normalized.notificationKey)){seen.add(normalized.notificationKey);next.push(normalized);}
      }
      if(socialNotificationFeedGeneration!==op.feedGeneration)return false;
      socialMergeNotifications(next);socialNotificationBeforeKey=next.length?next[next.length-1].notificationKey:before;
      socialNotificationHasMore=next.length===SOCIAL_NOTIFICATION_LIMIT;return next.length>0;
    }catch(error){
      if(authUser&&String(authUser.id||'')===owner&&socialPartyInviteRpcMissing(error)){
        socialNotificationSqlReady=false;socialNotificationHasMore=false;
      }
      return false;
    }finally{if(socialNotificationOlderOp===op){socialNotificationOlderOp=null;socialNotificationOlderPromise=null;}}
  })();
  socialNotificationOlderPromise=request;return request;
}
async function socialMarkNotificationRead(uiKey){
  const notice=socialNotificationByUiKey(uiKey),owner=authUser?String(authUser.id||''):'';
  if(!notice||!owner||notice.readAt||socialNotificationSqlReady!==true)return !!(notice&&notice.readAt);
  const existing=socialNotificationReadOps.get(notice.notificationKey);if(existing)return existing.promise;
  const op={owner,notificationKey:notice.notificationKey,promise:null};
  op.promise=(async()=>{
    try{
      const result=await sb.rpc('mark_my_outpost_zero_notifications_read',{p_notification_keys:[notice.notificationKey]});
      if(!authUser||String(authUser.id||'')!==owner||socialNotificationReadOps.get(notice.notificationKey)!==op)return false;
      if(result&&result.error)throw result.error;
      const row=Array.isArray(result&&result.data)?result.data[0]:result&&result.data,
        unread=Number(row&&row.unread_count),serverNow=Date.parse(row&&row.server_now||'');
      if(!Number.isSafeInteger(unread)||unread<0||!Number.isFinite(serverNow))throw new Error('INVALID_NOTIFICATION_READ_RESPONSE');
      const current=socialNotifications.find(item=>item.notificationKey===notice.notificationKey);
      if(current)current.readAt=serverNow;
      socialNotificationUnreadCount=unread;socialNotificationServerOffsetMs=serverNow-Date.now();socialNotificationStateVersion++;
      socialNotificationPollAt=Date.now()+SOCIAL_NOTIFICATION_POLL_MS;return true;
    }catch(error){
      if(authUser&&String(authUser.id||'')===owner&&socialPartyInviteRpcMissing(error))socialNotificationSqlReady=false;
      return false;
    }finally{if(socialNotificationReadOps.get(notice.notificationKey)===op)socialNotificationReadOps.delete(notice.notificationKey);}
  })();
  socialNotificationReadOps.set(notice.notificationKey,op);return op.promise;
}
function socialInboxTimestamp(value){
  const stamp=Number(value);if(!Number.isFinite(stamp))return '';
  try{return new Date(stamp).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
  catch(error){return new Date(stamp).toISOString().slice(0,16).replace('T',' ')+' UTC';}
}
function socialOpenNotification(uiKey){
  const notice=socialNotificationByUiKey(uiKey),owner=authUser?String(authUser.id||''):'';
  if(!notice||!owner||typeof openReader!=='function')return false;
  const effective=notice.effectiveUntil?' · ACTIVE UNTIL '+socialInboxTimestamp(notice.effectiveUntil):'',
    meta=notice.authorLabel+' · '+socialInboxTimestamp(notice.createdAt)+effective;
  let action=null;
  if(notice.kind==='friend_request'||notice.kind==='friend_accepted')action={label:'OPEN FRIENDS',owner,run:()=>{
    if(!authUser||String(authUser.id||'')!==owner)return false;
    if(typeof clearReaderState==='function')clearReaderState();socialView='friends';if(typeof selPage!=='undefined')selPage='social';return true;
  }};
  openReader(notice.title,meta,notice.message,'public',action);
  if(!notice.readAt)void socialMarkNotificationRead(notice.uiKey);
  return true;
}
function socialPrivateMessageUiKey(row){return row&&row.id!=null?socialInboxUiKey('private_message',String(row.id)):'';}
function socialPrivateMessageByUiKey(uiKey){
  const ref=socialInboxReference(uiKey,'private_message');if(!ref)return null;
  return socialMessages.find(row=>row&&String(row.id)===ref.sourceKey)||null;
}
function socialConversationUiKey(peerId){
  const peer=String(peerId||'');return peer?socialInboxUiKey('private_conversation',peer):'';
}
function socialConversationPeerByUiKey(uiKey){
  const ref=socialInboxReference(uiKey,'private_conversation');return ref?String(ref.sourceKey||''):'';
}
function socialConversationState(peerId){
  const state=socialConversationStates[String(peerId||'')];
  return state&&typeof state==='object'?state:{peerId:String(peerId||''),archivedAt:0,deletedBefore:0,updatedAt:0};
}
function socialPrivateMessagePeer(row,owner=authUser&&authUser.id){
  const me=String(owner||''),sender=String(row&&row.sender_id||''),recipient=String(row&&row.recipient_id||'');
  if(!me||sender===me&&recipient===me)return '';
  return sender===me?recipient:recipient===me?sender:'';
}
function socialPrivateMessageVisible(row,owner=authUser&&authUser.id){
  const peer=socialPrivateMessagePeer(row,owner);if(!peer)return false;
  const createdAt=Date.parse(row&&row.created_at||''),deletedBefore=Number(socialConversationState(peer).deletedBefore)||0;
  return Number.isFinite(createdAt)&&createdAt>deletedBefore;
}
function socialConversationPreviewBody(row){
  if(!row)return '';
  if(socialCpuGameInviteEnvelope(row.body))return 'CPU 2v2 GAME INVITE';
  if(socialPartyInviteEnvelope(row.body))return 'PARTY INVITE';
  return String(row.body||'');
}
function socialPrivateConversations(){
  const owner=String(authUser&&authUser.id||'');if(!owner)return [];
  const grouped=new Map();
  for(const row of socialMessages){
    const peer=socialPrivateMessagePeer(row,owner);
    if(!peer||!socialPrivateMessageVisible(row,owner)||socialCpuGameInviteEnvelope(row.body)||socialPartyInviteEnvelope(row.body))continue;
    let conversation=grouped.get(peer);
    if(!conversation){conversation={peerId:peer,messages:[],lastAt:0,last:null,unread:0,archived:false,autoArchived:false,uiKey:socialConversationUiKey(peer)};grouped.set(peer,conversation);}
    const createdAt=Date.parse(row.created_at||'');conversation.messages.push(row);
    if(createdAt>=conversation.lastAt){conversation.lastAt=createdAt;conversation.last=row;}
    if(String(row.recipient_id||'')===owner&&!row.read_at)conversation.unread++;
  }
  const conversations=[...grouped.values()];
  for(const conversation of conversations){
    conversation.messages.sort((a,b)=>Date.parse(a.created_at||'')-Date.parse(b.created_at||''));
    const state=socialConversationState(conversation.peerId);
    conversation.archived=!!(state.archivedAt&&conversation.lastAt<=state.archivedAt);
  }
  conversations.sort((a,b)=>b.lastAt-a.lastAt);
  const active=conversations.filter(row=>!row.archived);
  for(let i=SOCIAL_INBOX_CONVERSATION_LIMIT;i<active.length;i++){active[i].archived=true;active[i].autoArchived=true;}
  return conversations;
}
function socialPrivateConversation(peerId){
  const peer=String(peerId||'');return socialPrivateConversations().find(row=>row.peerId===peer)||null;
}
function socialCanMessageUser(userId){
  const peer=String(userId||''),owner=String(authUser&&authUser.id||'');if(!owner||!peer||peer===owner)return false;
  const friendship=typeof socialFriendshipWith==='function'?socialFriendshipWith(peer):null;
  return !(friendship&&friendship.status==='blocked');
}
function socialOpenPrivateConversation(uiKey){
  const peer=socialConversationPeerByUiKey(uiKey),conversation=socialPrivateConversation(peer);
  if(!peer||!conversation)return false;
  socialConversationPeer=peer;socialConversationPage=1000000;
  void socialMarkPrivateConversationRead(peer);
  return true;
}
function socialClosePrivateConversation(){socialConversationPeer='';socialConversationPage=0;return true;}
function socialNormalizeConversationState(row){
  const peerId=String(row&&row.peer_id||''),archivedAt=Date.parse(row&&row.archived_at||''),deletedBefore=Date.parse(row&&row.deleted_before||''),updatedAt=Date.parse(row&&row.updated_at||'');
  if(!peerId)return null;
  return {peerId,archivedAt:Number.isFinite(archivedAt)?archivedAt:0,deletedBefore:Number.isFinite(deletedBefore)?deletedBefore:0,updatedAt:Number.isFinite(updatedAt)?updatedAt:0};
}
async function socialFetchConversationStates(owner=authUser&&authUser.id){
  const account=String(owner||'');if(!sb||!account)return false;
  try{
    const result=await sb.rpc('list_my_outpost_zero_private_conversation_states');
    if(!authUser||String(authUser.id||'')!==account)return false;
    if(result&&result.error)throw result.error;
    const next={};for(const raw of Array.isArray(result&&result.data)?result.data:[]){const state=socialNormalizeConversationState(raw);if(state)next[state.peerId]=state;}
    socialConversationStates=next;socialConversationSqlReady=true;return true;
  }catch(error){
    if(authUser&&String(authUser.id||'')===account&&socialPartyInviteRpcMissing(error)){socialConversationStates={};socialConversationSqlReady=false;}
    return false;
  }
}
async function socialPersistConversationAction(peerId,action){
  const peer=String(peerId||''),owner=String(authUser&&authUser.id||''),mode=String(action||'');
  if(!sb||!owner||!peer||!['archive','inbox','delete'].includes(mode)||socialConversationBusy)return false;
  socialConversationBusy=peer+':'+mode;
  try{
    const result=await sb.rpc('set_my_outpost_zero_private_conversation_state',{p_peer_id:peer,p_action:mode});
    if(!authUser||String(authUser.id||'')!==owner)return false;
    if(result&&result.error)throw result.error;
    const raw=Array.isArray(result&&result.data)?result.data[0]:result&&result.data,state=socialNormalizeConversationState(raw);
    if(!state||state.peerId!==peer)throw new Error('INVALID_CONVERSATION_STATE');
    socialConversationStates[peer]=state;socialConversationSqlReady=true;
    if(mode==='archive'){socialInboxSection='archive';socialStatus='CONVERSATION ARCHIVED';}
    else if(mode==='inbox'){socialInboxSection='inbox';socialStatus='CONVERSATION MOVED TO INBOX';}
    else socialStatus='ARCHIVED CONVERSATION DELETED FOR YOU';
    socialClosePrivateConversation();sfx('swap');return true;
  }catch(error){
    if(authUser&&String(authUser.id||'')===owner){
      if(socialPartyInviteRpcMissing(error)){socialConversationSqlReady=false;socialStatus='RERUN SOCIAL 01 TO ENABLE ARCHIVE + DELETE';}
      else socialStatus='COULD NOT UPDATE THAT CONVERSATION';
      sfx('dry');
    }
    return false;
  }finally{if(socialConversationBusy===peer+':'+mode)socialConversationBusy='';}
}
function socialPromptDeleteConversation(uiKey,handle='player'){
  const peer=socialConversationPeerByUiKey(uiKey),conversation=socialPrivateConversation(peer);
  if(!peer||!conversation||!conversation.archived)return false;
  openForm({title:'DELETE ARCHIVED CONVERSATION',hint:'Delete your archived history with @'+String(handle||'player')+'? This removes it only from your account. The other player keeps their copy.',saveLabel:'DELETE FOR ME',fields:[],
    onSave:()=>{closeForm();void socialPersistConversationAction(peer,'delete');}});return true;
}
async function socialArchiveConversationOverflow(){
  const owner=String(authUser&&authUser.id||'');if(!sb||!owner||socialConversationSqlReady!==true)return false;
  try{
    const result=await sb.rpc('archive_my_outpost_zero_private_conversation_overflow');
    if(!authUser||String(authUser.id||'')!==owner)return false;
    if(result&&result.error)throw result.error;
    await socialFetchConversationStates(owner);return true;
  }catch(error){if(authUser&&String(authUser.id||'')===owner&&socialPartyInviteRpcMissing(error))socialConversationSqlReady=false;return false;}
}
async function socialMarkPrivateMessageRead(uiKey){
  const row=socialPrivateMessageByUiKey(uiKey),owner=authUser?String(authUser.id||''):'';
  if(!sb||!row||!owner||String(row.recipient_id||'')!==owner||row.read_at)return !!(row&&row.read_at);
  const sourceKey=String(row.id),existing=socialPrivateMessageReadOps.get(sourceKey);if(existing)return existing.promise;
  const op={owner,sourceKey,promise:null};
  op.promise=(async()=>{
    try{
      const stamp=new Date().toISOString(),result=await sb.from(SOCIAL_MESSAGE_TABLE).update({read_at:stamp})
        .eq('id',row.id).eq('recipient_id',owner).is('read_at',null).select('id,read_at');
      if(!authUser||String(authUser.id||'')!==owner||socialPrivateMessageReadOps.get(sourceKey)!==op)return false;
      if(result&&result.error)throw result.error;
      const confirmed=(Array.isArray(result&&result.data)?result.data:[]).some(item=>String(item&&item.id)===sourceKey&&item.read_at);
      if(!confirmed)return false;
      const current=socialMessages.find(item=>item&&String(item.id)===sourceKey&&String(item.recipient_id||'')===owner);
      if(current)current.read_at=String((result.data.find(item=>String(item&&item.id)===sourceKey)||{}).read_at||stamp);
      return true;
    }catch(error){return false;}
    finally{if(socialPrivateMessageReadOps.get(sourceKey)===op)socialPrivateMessageReadOps.delete(sourceKey);}
  })();
  socialPrivateMessageReadOps.set(sourceKey,op);return op.promise;
}
async function socialMarkPrivateConversationRead(peerId){
  const peer=String(peerId||''),owner=authUser?String(authUser.id||''):'';
  if(!sb||!peer||!owner)return false;
  const rows=socialMessages.filter(row=>row&&String(row.sender_id||'')===peer&&String(row.recipient_id||'')===owner&&!row.read_at&&socialPrivateMessageVisible(row,owner));
  const ids=rows.map(row=>row.id).filter(id=>id!=null);if(!ids.length)return true;
  try{
    const stamp=new Date().toISOString(),result=await sb.from(SOCIAL_MESSAGE_TABLE).update({read_at:stamp}).eq('recipient_id',owner).in('id',ids).is('read_at',null).select('id,read_at');
    if(!authUser||String(authUser.id||'')!==owner)return false;
    if(result&&result.error)throw result.error;
    const confirmed=new Map((Array.isArray(result&&result.data)?result.data:[]).map(row=>[String(row&&row.id),String(row&&row.read_at||stamp)]));
    for(const row of socialMessages){const readAt=confirmed.get(String(row&&row.id));if(readAt)row.read_at=readAt;}
    return confirmed.size>0;
  }catch(error){return false;}
}
function socialHandleLegacyInvite(row){
  const owner=authUser?String(authUser.id||''):'';
  if(!row||row.id==null||!owner||String(row.recipient_id||'')!==owner)return false;
  socialPersistLegacyInviteHandled(row,owner);void socialMarkPrivateMessageRead(socialPrivateMessageUiKey(row));return true;
}
function socialOpenInboxMessage(uiKey){
  const row=socialPrivateMessageByUiKey(uiKey),owner=authUser?String(authUser.id||''):'';
  if(!row||!owner)return false;
  const incoming=String(row.recipient_id||'')===owner,outgoing=String(row.sender_id||'')===owner;
  if(!incoming&&!outgoing)return false;
  if(socialCpuGameInviteEnvelope(row.body)||socialPartyInviteEnvelope(row.body))return false;
  const other=String(incoming?row.sender_id:row.recipient_id);
  return socialOpenPrivateConversation(socialConversationUiKey(other));
}
function socialIncomingFriendRequestCount(){
  const owner=authUser?String(authUser.id||''):'';if(!owner)return 0;
  return socialFriends.filter(row=>row&&row.status==='pending'&&String(row.addressee_id||'')===owner).length;
}
function socialUnreadPrivateMessageCount(){
  const owner=authUser?String(authUser.id||''):'';if(!owner)return 0;
  return socialMessages.filter(row=>row&&(typeof socialPrivateMessageVisible!=='function'||socialPrivateMessageVisible(row,owner))&&String(row.recipient_id||'')===owner&&!row.read_at&&
    !socialCpuGameInviteEnvelope(row.body)&&!socialPartyInviteEnvelope(row.body)).length;
}
function socialLiveLegacyPartyInviteCount(){
  const owner=authUser?String(authUser.id||''):'';if(!owner)return 0;
  let count=0;for(const row of socialMessages){
    if(!row||(typeof socialPrivateMessageVisible==='function'&&!socialPrivateMessageVisible(row,owner))||String(row.recipient_id||'')!==owner||socialLegacyInviteHandled(row,owner))continue;
    const sender=String(row.sender_id||'');if(!socialAcceptedFriend(sender))continue;
    if(socialCpuGameInvite(row.body)||socialPartyInvite(row.body))count++;
  }return count;
}
function socialLiveCloudPartyInviteCount(){
  const clock=typeof socialPartyInviteServerNow==='function'?socialPartyInviteServerNow():Date.now();
  return socialPartyInvites.filter(invite=>invite&&invite.expiresAt>clock).length;
}
function socialUnreadSummary(){
  if(!authUser)return {friendRequests:0,privateMessages:0,partyInvites:0,partyRequests:0,notifications:0,total:0,hasAny:false};
  const friendRequests=socialIncomingFriendRequestCount(),privateMessages=socialUnreadPrivateMessageCount(),
    partyInvites=socialLiveLegacyPartyInviteCount()+socialLiveCloudPartyInviteCount(),
    hostRequests=typeof publicPartyHostRequests!=='undefined'&&Array.isArray(publicPartyHostRequests)?publicPartyHostRequests.length:0,
    approvedRequests=typeof publicPartyMyRequests!=='undefined'&&Array.isArray(publicPartyMyRequests)?publicPartyMyRequests.filter(row=>row&&row.status==='accepted'&&row.expiresAt>Date.now()&&row.requestId!==publicPartyAutoJoinRequestId).length:0,
    partyRequests=hostRequests+approvedRequests,
    notifications=Math.max(0,Number(socialNotificationUnreadCount)||0),total=friendRequests+privateMessages+partyInvites+partyRequests+notifications;
  return {friendRequests,privateMessages,partyInvites,partyRequests,notifications,total,hasAny:total>0};
}
function socialHasUnreadActivity(){return socialUnreadSummary().hasAny;}
function socialHasUnreadFriendsActivity(){return socialUnreadSummary().friendRequests>0;}
function socialHasUnreadInboxActivity(){const s=socialUnreadSummary();return s.privateMessages+s.partyInvites+s.notifications>0;}
function socialHasUnreadPartyActivity(){return socialUnreadSummary().partyRequests>0;}
function socialOfficialBannerAlreadyNotified(row){
  if(!authUser||socialNotificationSqlReady!==true||!row)return false;
  const resource='banner:'+String(row.id==null?'':row.id);
  return socialNotifications.some(notice=>notice&&notice.kind==='official_update'&&notice.resourceKey===resource);
}
function socialPerson(userId){
  const p=socialProfiles[String(userId||'')]||{};
  const pending=usernameIsGeneratedForUser(p.handle,userId);
  const owner=typeof authUser!=='undefined'?authUser:null;
  const mine=owner&&String(userId||'')===String(owner.id||'');
  // Only the owner may see their Auth email. Friend/message lists never expose
  // another account login identifier while its username is unfinished.
  const username=pending
    ? (mine?(String(owner.email||'').trim().slice(0,160)||'NEW OPERATOR'):'NEW OPERATOR')
    : String(p.handle||'NEW OPERATOR');
  return {handle:username,display:username};
}
async function socialSetPlayerBlocked(username,blocked){
  const clean=partyCleanName(username);
  if(!sb||!authUser||!clean){socialStatus='SIGN IN AND CHOOSE A VALID PLAYER';sfx('dry');return false;}
  try{
    const result=await sb.rpc('set_outpost_zero_player_block',{p_target_username:clean,p_blocked:!!blocked});
    if(result&&result.error)throw result.error;
    clearReaderState();
    socialStatus=blocked?'@'+clean+' BLOCKED \u00b7 MESSAGES AND INVITES STOPPED':'@'+clean+' UNBLOCKED';
    await fetchSocial(true);sfx(blocked?'dry':'swap');return true;
  }catch(error){
    socialStatus=socialSetupMissing(error)?'RERUN SOCIAL 01 AND SOCIAL 04 TO ENABLE PROFILE BLOCKING':'COULD NOT CHANGE THAT BLOCK';
    sfx('dry');return false;
  }
}
async function socialOpenPlayerProfile(userId,handle=''){
  let id=String(userId||''),profile=id&&socialProfiles[id]||null,key=socialHandleKey(handle||profile&&profile.handle),found=!!profile,highScore=null;
  if(sb&&key){
    try{const result=await sb.rpc('get_outpost_zero_public_player',{p_query:partyCleanName(handle||profile&&profile.handle)}),row=Array.isArray(result&&result.data)?result.data[0]:result&&result.data;
      if(!result.error&&row&&row.user_id){profile={user_id:row.user_id,handle:row.username,display_name:row.username};id=String(row.user_id||'');socialProfiles[id]=profile;found=true;highScore=Math.max(0,Math.floor(+row.high_score||0));}}catch(error){}
  }
  const username=partyCleanName(profile&&profile.handle||handle)||'UNKNOWN OPERATOR';
  if(!username||username==='UNKNOWN OPERATOR'){socialStatus='THAT PLAYER PROFILE IS UNAVAILABLE';sfx('dry');return false;}
  const mine=!!(authUser&&id&&id===String(authUser.id||'')),friend=id?socialFriendshipWith(id):null,
    blockedByMe=!!(friend&&friend.status==='blocked'&&String(friend.blocked_by||'')===String(authUser&&authUser.id||'')),
    relationship=mine?'THIS IS YOU':friend&&friend.status==='accepted'?'CURRENT FRIEND':friend&&friend.status==='pending'?'FRIEND REQUEST PENDING':friend&&friend.status==='blocked'?'BLOCKED':'NOT CURRENTLY FRIENDS',
    hosting=typeof publicPartyRows!=='undefined'&&publicPartyRows.some(row=>socialHandleKey(row.host)===socialHandleKey(username));
  const body=['@'+username,'',found?relationship:'PARTY GUEST · NO ACCOUNT PROFILE FOUND',...(highScore==null?[]:['ENDLESS HIGH SCORE · '+highScore]),hosting?'HOSTING A PUBLIC PARTY NOW':'NO PUBLIC PARTY LISTED','',
    found?'Public profiles show usernames and social status only. Private email and account identifiers are never shown.':'This display name is not connected to a public account profile.'].join('\n');
  const owner=String(authUser&&authUser.id||''),actions=[];
  if(!mine&&id&&socialCanMessageUser(id))actions.push({label:'MESSAGE',owner,run:()=>{clearReaderState();openSocialMessageCompose(id,username);}});
  if(!mine&&id&&authUser&&!friend)actions.push({label:'ADD FRIEND',owner,run:()=>{
    clearReaderState();openForm({title:'ADD @'+username,hint:'Send a friend request to this player?',saveLabel:'SEND REQUEST',fields:[],onSave:()=>socialSendFriendRequest(username)});
  }});
  if(!mine&&id&&authUser)actions.push({label:blockedByMe?'UNBLOCK':'BLOCK',owner,run:()=>{void socialSetPlayerBlocked(username,!blockedByMe);}});
  if(!mine&&id&&authUser)actions.push({label:'REPORT',owner,run:()=>{clearReaderState();if(typeof openReportForUsername==='function')openReportForUsername(username);}});
  if(typeof openReader==='function'){openReader('PLAYER PROFILE','@'+username+' · PUBLIC',body,'public',actions);sfx('swap');return true;}
  return false;
}
function socialMergeRows(a,b){
  const byId=new Map(); for(const row of [...(a||[]),...(b||[])]) if(row&&row.id!=null) byId.set(String(row.id),row);
  return [...byId.values()];
}
function socialCpuInvitePromptAvailable(){
  if(!authUser||typeof state==='undefined'||state!=='select')return false;
  if(typeof formOpen!=='undefined'&&formOpen)return false;
  if(typeof party!=='undefined'&&party&&party.directCpu)return false;
  if(typeof partyCpuSessionOpen==='function'&&partyCpuSessionOpen())return false;
  if(typeof arena!=='undefined'&&arena&&(arena.active||arena.queueChannel||arena.matchChannel))return false;
  if(typeof reportOpen!=='undefined'&&reportOpen||typeof postOpen!=='undefined'&&postOpen||
     typeof msgOpen!=='undefined'&&msgOpen||typeof scoreEditOpen!=='undefined'&&scoreEditOpen||
     typeof appealOpen!=='undefined'&&appealOpen||typeof promoOpen!=='undefined'&&promoOpen||
     typeof accountMenuOpen!=='undefined'&&accountMenuOpen||typeof accountSettingsOpen!=='undefined'&&accountSettingsOpen||
     typeof usernameClaimOpen!=='undefined'&&usernameClaimOpen||typeof dailyGateOpen!=='undefined'&&dailyGateOpen||
     typeof firstAccountWelcomeOpen!=='undefined'&&firstAccountWelcomeOpen||typeof signUpPromptOpen!=='undefined'&&signUpPromptOpen)return false;
  if(typeof topModal==='function'&&topModal())return false;
  return true;
}
function socialMaybePromptCpuGameInvite(){
  if(socialCpuInvitePromptUserId&&typeof formOpen!=='undefined'&&!formOpen)socialCpuInvitePromptUserId='';
  if(!socialCpuInvitePromptAvailable())return false;
  const owner=String(authUser.id||''),rows=(Array.isArray(socialMessages)?socialMessages:[]).slice()
    .sort((a,b)=>Date.parse(b&&b.created_at||0)-Date.parse(a&&a.created_at||0));
  for(const row of rows){
    if(!row||String(row.recipient_id||'')!==owner)continue;
    if(socialLegacyInviteHandled(row,owner))continue;
    const senderId=String(row.sender_id||''),cpuInvite=socialCpuGameInvite(row.body),
      partyInvite=typeof socialPartyInvite==='function'?socialPartyInvite(row.body):null,invite=cpuInvite||partyInvite;
    if(!invite||!socialAcceptedFriend(senderId))continue;
    const promptId=String(row.id==null?(senderId+'|'+row.body):row.id);
    if(socialCpuInvitePromptedIds.has(promptId))continue;
    socialCpuInvitePromptedIds.add(promptId);
    const handle=String(socialPerson(senderId).handle||'FRIEND').slice(0,32);
    const normal=!!partyInvite&&!cpuInvite;
    socialStatus=(normal?'PARTY INVITE':'CPU 2v2 INVITE')+' FROM @'+handle+' · '+(normal?'JOIN':'START')+' OR DISMISS';
    socialCpuInvitePromptUserId=owner;
    openForm({title:normal?'PARTY INVITE':'CPU 2v2 INVITE',hint:normal
        ?('@'+handle+' invited you to their Party. Join connects immediately without showing or typing a code.')
        :('@'+handle+' invited you to play together against two CPUs. Start joins the private game immediately.'),
      saveLabel:normal?'JOIN PARTY':'START GAME',fields:[],
      onCancel:()=>{socialCpuInvitePromptUserId='';socialStatus=(normal?'PARTY':'CPU 2v2')+' INVITE DISMISSED';socialHandleLegacyInvite(row);},
      onSave:()=>{
        if(!authUser||String(authUser.id||'')!==owner){socialCpuInvitePromptUserId='';closeForm();return;}
        const fresh=normal?(typeof socialPartyInvite==='function'&&socialPartyInvite(row.body)):socialCpuGameInvite(row.body);
        if(!fresh||!socialAcceptedFriend(senderId)){formError('That '+(normal?'Party':'CPU 2v2')+' invite expired or is no longer from a friend.');return;}
        socialCpuInvitePromptUserId='';
        closeForm();
        const joined=normal
          ?(typeof partyJoinFriendInvite==='function'&&partyJoinFriendInvite({...fresh,senderId}))
          :(typeof partyJoinCpuInvite==='function'&&partyJoinCpuInvite({...fresh,senderId}));
        if(joined)socialHandleLegacyInvite(row);
        if(!joined)socialStatus=socialStatus||('COULD NOT '+(normal?'JOIN THAT PARTY':'START THAT CPU 2v2 INVITE'));
      }});
    return true;
  }
  return false;
}
async function socialPollCpuGameInvites(force=false){
  const clock=Date.now(),owner=authUser?String(authUser.id||''):'';
  if(!sb||!owner||typeof navigator!=='undefined'&&navigator.onLine===false||socialCpuInvitePolling)return false;
  if(!force&&clock<socialCpuInvitePollAt)return false;
  socialCpuInvitePollAt=clock+SOCIAL_CPU_INVITE_POLL_MS; socialCpuInvitePolling=true;
  try{
    // Query each machine envelope directly. A busy private conversation must
    // never bury a still-live invitation below an arbitrary latest-message cap.
    const inviteRows=marker=>sb.from(SOCIAL_MESSAGE_TABLE).select('id,sender_id,recipient_id,body,read_at,created_at')
      .eq('recipient_id',owner).like('body',marker+'%').order('created_at',{ascending:false}).limit(8);
    const [cpuResult,partyResult]=await Promise.all([
      inviteRows('OUTPOST ZERO · CPU 2V2 GAME INVITE · '),inviteRows('OUTPOST ZERO · PARTY INVITE · ')
    ]);
    if(!authUser||String(authUser.id||'')!==owner)return false;
    if(cpuResult&&cpuResult.error)throw cpuResult.error;if(partyResult&&partyResult.error)throw partyResult.error;
    socialMessages=socialMergeRows(socialMessages,[...(cpuResult&&cpuResult.data||[]),...(partyResult&&partyResult.data||[])])
      .sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0)).slice(0,60);
    socialMaybePromptCpuGameInvite();return true;
  }catch(e){
    if(authUser&&String(authUser.id||'')===owner)socialCpuInvitePollAt=Date.now()+SOCIAL_CPU_INVITE_POLL_MS;
    return false;
  }finally{
    if(!authUser||String(authUser.id||'')===owner)socialCpuInvitePolling=false;
  }
}
function socialResumeSync(){
  socialRealtimeRetryAt=0;socialPartyPresenceRetryAt=0;socialCpuInvitePollAt=0;socialPartyInvitePollAt=0;socialNotificationPollAt=0;
  if(authUser&&sb&&!(typeof navigator!=='undefined'&&navigator.onLine===false))void fetchSocial(true);
}
function socialTick(clock=Date.now()){
  if(!authUser||!sb||typeof navigator!=='undefined'&&navigator.onLine===false)return;
  if(!socialChannel&&socialBackend.friends===true&&socialBackend.messages===true&&clock>=socialRealtimeRetryAt)setupSocialRealtime();
  if(!socialPartyPresenceChannel&&socialBackend.profiles===true&&clock>=socialPartyPresenceRetryAt)void socialEnsurePartyRealtimePresence();
  if(typeof state!=='undefined'&&state==='select'&&clock>=socialPartyInvitePollAt)void socialPollPartyInvites();
  if(typeof state!=='undefined'&&state==='select'&&clock>=socialNotificationPollAt)void socialPollNotifications();
  if(typeof state!=='undefined'&&state==='select'&&clock>=socialCpuInvitePollAt)void socialPollCpuGameInvites();
  if(!socialMaybePromptPartyInvite())socialMaybePromptCpuGameInvite();
}
async function fetchSocial(force=false){
  if(!authUser){ resetSocialState(); return false; }
  if(!sb||typeof navigator!=='undefined'&&navigator.onLine===false){
    socialStatus='SOCIAL IS OFFLINE · PARTY ALSO NEEDS A CONNECTION';
    usernameClaimFailed('Could not verify your username while offline. Reconnect and retry.');
    return false;
  }
  const userId=String(authUser.id||'');
  if(socialAccountId!==userId) prepareSocialForAccount(userId);
  if(socialFetchPromise&&socialFetchUserId===userId){
    // A forced refresh during an in-flight read (notably after a username
    // write or repeated Auth callback) gets one follow-up pass. All callers
    // await the same drain promise instead of racing profile snapshots.
    if(force) socialFetchQueued=true;
    return socialFetchPromise;
  }
  if(!force&&Date.now()-socialLastFetch<2500) return true;
  socialFetchUserId=userId; socialLoading=true; socialStatus='REFRESHING SOCIAL...';
  const request=(async()=>{
    let result=false;
    do{
      socialFetchQueued=false;
      result=await fetchSocialOnce(userId);
    }while(socialFetchQueued&&authUser&&String(authUser.id||'')===userId&&socialAccountId===userId);
    return result;
  })();
  socialFetchPromise=request;
  try{ return await request; }
  finally{
    if(socialFetchPromise===request){
      socialFetchPromise=null; socialFetchUserId=''; socialFetchQueued=false; socialLoading=false;
    }
  }
}
async function fetchSocialOnce(userId){
  const fetchVersion=++socialFetchVersion;
  const stillCurrent=()=>socialFetchVersion===fetchVersion&&authUser&&String(authUser.id||'')===userId;
  try{
    const previousUsername=socialProfile&&String(socialProfile.handle||'');
    let fetchedProfile=await socialFetchOwnProfile(userId),profileResult=fetchedProfile.result;
    if(!stillCurrent()) return false;
    socialAccountSettingsSqlReady=fetchedProfile.settingsSqlReady;
    if(profileResult.error){ socialBackend.profiles=false; throw profileResult.error; }
    socialBackend.profiles=true;
    if(!profileResult.data){
      const handle=socialDefaultHandle();
      const made=await sb.from(SOCIAL_PROFILE_TABLE).insert({user_id:userId,handle,handle_key:handle,display_name:handle});
      if(!stillCurrent()) return false;
      if(made&&made.error){ socialBackend.profiles=false; throw made.error; }
      fetchedProfile=await socialFetchOwnProfile(userId); profileResult=fetchedProfile.result;
      if(!stillCurrent()) return false;
      socialAccountSettingsSqlReady=fetchedProfile.settingsSqlReady;
      if(profileResult.error||!profileResult.data) throw profileResult.error||new Error('Social profile could not be created.');
    }
    socialProfile=profileResult.data; socialProfiles={[userId]:socialProfile};
    syncUsernameClaim();
    if(typeof resumeAfterUsernameClaim==='function') resumeAfterUsernameClaim();
    // Auth metadata can be stale or absent. Repaint as soon as the canonical
    // Social username arrives so the header never keeps showing an old alias.
    if(typeof paintUserbar==='function') paintUserbar();
    if(typeof accountSettingsOpen!=='undefined'&&accountSettingsOpen&&typeof accountSettingsSync==='function') accountSettingsSync();
    if(previousUsername!==String(socialProfile.handle||'')){
      if(typeof partyRefreshUsername==='function') partyRefreshUsername();
      if(typeof arenaRefreshUsername==='function') arenaRefreshUsername();
    }

    const fr=await sb.from(SOCIAL_FRIEND_TABLE).select('id,requester_id,addressee_id,status,blocked_by,created_at,updated_at').order('updated_at',{ascending:false}).limit(60);
    if(!stillCurrent()) return false;
    if(fr.error){ socialBackend.friends=false; throw fr.error; }
    socialBackend.friends=true; socialFriends=fr.data||[];

    const sent=await sb.from(SOCIAL_MESSAGE_TABLE).select('id,sender_id,recipient_id,body,read_at,created_at').eq('sender_id',userId).order('created_at',{ascending:false}).limit(500);
    if(!stillCurrent()) return false;
    if(sent.error){ socialBackend.messages=false; throw sent.error; }
    const received=await sb.from(SOCIAL_MESSAGE_TABLE).select('id,sender_id,recipient_id,body,read_at,created_at').eq('recipient_id',userId).order('created_at',{ascending:false}).limit(500);
    if(!stillCurrent()) return false;
    if(received.error){ socialBackend.messages=false; throw received.error; }
    socialBackend.messages=true;
    socialMessages=socialMergeRows(sent.data,received.data).sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0)).slice(0,1000);
    if(typeof socialFetchConversationStates==='function')await socialFetchConversationStates(userId);
    if(!stillCurrent())return false;

    const ids=new Set([userId]);
    for(const row of socialFriends) ids.add(socialFriendOther(row));
    for(const row of socialMessages){ ids.add(String(row.sender_id||'')); ids.add(String(row.recipient_id||'')); }
    const wanted=[...ids].filter(Boolean);
    if(wanted.length){
      const people=await sb.from(SOCIAL_PROFILE_TABLE).select('user_id,handle,handle_key,display_name').in('user_id',wanted);
      if(!stillCurrent()) return false;
      if(!people.error) for(const p of people.data||[]) socialProfiles[String(p.user_id)]=p;
    }
    if(typeof socialConversationPeer!=='undefined'&&socialConversationPeer&&typeof socialPrivateConversation==='function'&&!socialPrivateConversation(socialConversationPeer)&&typeof socialClosePrivateConversation==='function')socialClosePrivateConversation();
    socialStatus=socialAccountSettingsSqlReady===false
      ? 'SOCIAL READY · RUN SOCIAL 02 FOR USERNAME SETTINGS'
      : usernameNeedsClaim(socialProfile,authUser)
        ? 'CHOOSE YOUR USERNAME · THIS REPLACES THE TEMPORARY ACCOUNT NAME EVERYWHERE'
        : typeof socialConversationSqlReady!=='undefined'&&socialConversationSqlReady===false
          ? 'PRIVATE INBOX READY · RERUN SOCIAL 01 TO SAVE ARCHIVE + DELETE'
          : 'PRIVATE INBOX READY · 25 ACTIVE CONVERSATIONS MAX';
    socialLastFetch=Date.now();
    setupSocialRealtime();
    socialPartyPresenceRetryAt=0;socialPartyInvitePollAt=0;
    void socialEnsurePartyRealtimePresence(true).then(()=>socialPollPartyInvites(true));
    void socialPollNotifications(true);
    if(typeof socialConversationSqlReady!=='undefined'&&socialConversationSqlReady===true&&typeof socialArchiveConversationOverflow==='function')void socialArchiveConversationOverflow();
    socialCpuInvitePollAt=Date.now()+SOCIAL_CPU_INVITE_POLL_MS;
    socialMaybePromptCpuGameInvite();
    return true;
  }catch(error){
    if(!stillCurrent()) return false;
    console.warn('social sync failed',error);
    if(socialSetupMissing(error)) socialStatus=socialSetupStatus();
    else socialStatus='SOCIAL COULD NOT REFRESH · CHECK YOUR CONNECTION AND TRY AGAIN';
    usernameClaimFailed(socialSetupMissing(error)
      ? 'Account usernames need the Social database update. Retry after the update is installed.'
      : 'Could not verify your username. Check your connection and retry.');
    socialDropRealtime(); return false;
  }
}
function socialPromptAddFriend(){
  if(!authUser){ toggleAuth(); return; }
  openForm({title:'ADD FRIEND',hint:'Enter their unique Outpost username. Email addresses are never exposed here.',saveLabel:'SEND REQUEST',
    fields:[{id:'handle',label:'USERNAME',type:'text',placeholder:'operator_7'}],onSave:v=>socialSendFriendRequest(v.handle)});
}
async function socialSendFriendRequest(value){
  const key=socialHandleKey(value);
  if(key.length<3){ formError('enter a valid username (3–32 letters, numbers, or _)'); return false; }
  if(!sb||!authUser){ formError('sign in and reconnect first'); return false; }
  try{
    const found=await sb.from(SOCIAL_PROFILE_TABLE).select('user_id,handle,display_name').eq('handle_key',key).maybeSingle();
    if(found.error) throw found.error;
    if(!found.data){ formError('no player has that username'); return false; }
    if(String(found.data.user_id)===String(authUser.id)){ formError('that is your own username'); return false; }
    if(socialFriendshipWith(found.data.user_id)){ formError('a friend request or friendship already exists'); return false; }
    const sent=await sb.from(SOCIAL_FRIEND_TABLE).insert({requester_id:authUser.id,addressee_id:found.data.user_id,status:'pending'});
    if(sent&&sent.error) throw sent.error;
    closeForm(); socialStatus='FRIEND REQUEST SENT TO @'+found.data.handle; await fetchSocial(true); sfx('swap'); return true;
  }catch(error){ formError(socialSetupMissing(error)?socialSetupStatus():'could not send — the request may already exist'); return false; }
}
function socialPromptEditProfile(){
  if(!authUser){ toggleAuth(); return false; }
  const firstChoice=usernameNeedsClaim(socialProfile,authUser);
  // Social only displays/copies the canonical username. Account changes live
  // in Settings; the sole exception here is mandatory first-time onboarding.
  if(!firstChoice){
    socialStatus='CHANGE YOUR USERNAME IN SETTINGS'; sfx('dry'); return false;
  }
  if(typeof openAccountSettings==='function'){
    openAccountSettings({focus:'username',requiredUsername:true}); return true;
  }
  openForm({title:'CHOOSE USERNAME',
    hint:'Your account has a temporary private-safe label. Choose the public username shown on leaderboards, parties, friends, and messages.',
    saveLabel:'CHOOSE USERNAME',fields:[{id:'handle',label:'USERNAME',type:'text',value:'',placeholder:'operator_7'}],
    onSave:v=>socialUpdateHandle(v.handle,true)}); return true;
}
async function socialUpdateHandle(value,requiredClaim=false){
  const username=String(value||'').trim().replace(/^@/,'');
  const userId=String(authUser&&authUser.id||''),settingsOpen=typeof accountSettingsOpen!=='undefined'&&accountSettingsOpen,
    settingsUserId=typeof accountSettingsUserId==='string'?accountSettingsUserId:userId,
    settingsEpoch=typeof accountSettingsEpoch==='number'?accountSettingsEpoch:null;
  const settingsContextCurrent=()=>settingsOpen&&typeof accountSettingsOpen!=='undefined'&&accountSettingsOpen&&
    (typeof accountSettingsUserId!=='string'||accountSettingsUserId===settingsUserId)&&
    (settingsEpoch===null||typeof accountSettingsEpoch!=='number'||accountSettingsEpoch===settingsEpoch)&&
    !!authUser&&String(authUser.id||'')===userId;
  const showError=message=>{
    if(settingsOpen){
      if(settingsContextCurrent()&&typeof accountSettingsSetStatus==='function')accountSettingsSetStatus('username',message,true);
      return;
    }
    if(requiredClaim){ usernameClaimBusy(false); const el=usernameClaimElements(); if(el.status) el.status.textContent=usernameClaimPrivateStatus(message); }
    else formError(message);
  };
  if(!/^[A-Za-z0-9_]{3,32}$/.test(username)){ showError('Use 3–32 letters, numbers, or _.'); return false; }
  const key=username.toLowerCase();
  if(usernameIsGeneratedForUser(username,authUser&&authUser.id)){ showError('Choose a real username, not the temporary account label.'); return false; }
  if(!sb||!authUser){ showError('Sign in and reconnect first.'); return false; }
  if(socialAccountSettingsSqlReady===false){ showError('Install Social 02 in Supabase before choosing or changing a username.'); return false; }
  if(requiredClaim&&(!settingsOpen||settingsContextCurrent())) usernameClaimBusy(true,'Saving your unique username...');
  let markerFailure=false;
  try{
    const result=await sb.rpc('outpost_zero_set_username',{p_username:username});
    if(result&&result.error) throw result.error;
    if(!authUser||String(authUser.id||'')!==userId) return false;
    const row=Array.isArray(result&&result.data)?result.data[0]:result&&result.data;
    const saved=String(row&&row.username||username).trim();
    // Auth metadata is the durable proof that this account explicitly chose
    // its username. It distinguishes older imported profile labels from a
    // completed claim after verification or a future login.
    markerFailure=true;
    const markerResult=await sb.auth.updateUser({data:{username:saved}});
    if(markerResult&&markerResult.error) throw markerResult.error;
    markerFailure=false;
    if(!authUser||String(authUser.id||'')!==userId) return false;
    const returnedUser=markerResult&&markerResult.data&&markerResult.data.user;
    authUser=returnedUser&&String(returnedUser.id||'')===userId
      ? returnedUser
      : {...authUser,user_metadata:{...(authUser.user_metadata||{}),username:saved}};
    if(socialProfile&&String(socialProfile.user_id||'')===userId){
      socialProfile={...socialProfile,handle:saved,handle_key:saved.toLowerCase(),display_name:saved,
        username_changed_at:row&&row.changed_at||socialProfile.username_changed_at,
        next_username_change_at:row&&row.next_change_at||null};
      socialProfiles[userId]=socialProfile;
    }
    if(requiredClaim) syncUsernameClaim(); else if(!settingsOpen) closeForm();
    if(typeof partyRefreshUsername==='function') partyRefreshUsername();
    if(typeof arenaRefreshUsername==='function') arenaRefreshUsername();
    if(typeof resumeAfterUsernameClaim==='function') resumeAfterUsernameClaim();
    await fetchSocial(true);
    if(!authUser||String(authUser.id||'')!==userId) return false;
    paintUserbar(); fetchBoard(); socialStatus='USERNAME UPDATED · @'+saved;
    if(settingsContextCurrent()&&typeof accountSettingsSync==='function') accountSettingsSync(true);
    sfx('swap'); return true;
  }catch(error){
    if(!authUser||String(authUser.id||'')!==userId) return false;
    const code=String(error&&error.code||''), message=String(error&&error.message||'');
    const cooldown=code==='P0001'&&message.includes('USERNAME_CHANGE_COOLDOWN');
    const retryAt=cooldown&&Date.parse(error&&error.details||'');
    showError(markerFailure
      ? 'The username was saved, but account confirmation failed. Retry the same username to finish.'
      : cooldown
        ? 'Username changes are limited to once every 21 days.'+(Number.isFinite(retryAt)&&typeof accountSettingsDate==='function'?' Try again on '+accountSettingsDate(retryAt)+'.':'')
        : code==='23505'?'That username is already taken. Try another one.'
        : socialSetupMissing(error)?'Username Settings needs the Social 02 SQL update.':'That username is unavailable. Try another one.');
    return false;
  }
}

function socialPartyCodeClean(value){
  return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
}
function socialCpuGameInviteEnvelope(value){
  const match=/^OUTPOST ZERO · CPU 2V2 GAME INVITE · CODE ([A-Z0-9]{6}) · TOKEN ([A-Za-z0-9_-]{20,64}) · EXPIRES ([0-9]{13})$/.exec(String(value||'').trim());
  if(!match)return null;
  return {code:match[1],token:match[2],expiresAt:Math.floor(+match[3]||0)};
}
function socialCpuGameInvite(value,clock=Date.now()){
  const invite=socialCpuGameInviteEnvelope(value);if(!invite)return null;
  const expiresAt=invite.expiresAt,now=Math.floor(+clock||Date.now());
  if(expiresAt<=now||expiresAt>now+10*60*1000)return null;
  return invite;
}
function socialCpuPartyInviteCode(value){
  const invite=socialCpuGameInvite(value);return invite?invite.code:'';
}
function socialPartyInviteEnvelope(value){
  const match=/^OUTPOST ZERO · PARTY INVITE · CODE ([A-Z0-9]{6}) · TOKEN ([A-Za-z0-9_-]{20,64}) · EXPIRES ([0-9]{13})$/.exec(String(value||'').trim());
  if(!match)return null;
  return {code:match[1],token:match[2],expiresAt:Math.floor(+match[3]||0)};
}
function socialPartyInvite(value,clock=Date.now()){
  const invite=socialPartyInviteEnvelope(value);if(!invite)return null;
  const now=Math.floor(+clock||Date.now());
  if(invite.expiresAt<=now||invite.expiresAt>now+10*60*1000)return null;
  return invite;
}
async function socialSendLegacyPartyInvite(recipientId,invite){
  const recipient=String(recipientId||''),clean=socialPartyCodeClean(invite&&invite.code),token=String(invite&&invite.token||''),
    expiresAt=Math.floor(+(invite&&invite.expiresAt)||0),owner=authUser?String(authUser.id||''):'',clock=Date.now();
  if(!sb||!owner||clean.length!==6||!/^[A-Za-z0-9_-]{20,64}$/.test(token)||expiresAt<=clock||expiresAt>clock+10*60*1000||!socialAcceptedFriend(recipient)){
    socialStatus='PARTY INVITES REQUIRE A CURRENT ACCEPTED FRIEND';sfx('dry');return false;
  }
  try{
    const body='OUTPOST ZERO · PARTY INVITE · CODE '+clean+' · TOKEN '+token+' · EXPIRES '+expiresAt;
    const result=await sb.from(SOCIAL_MESSAGE_TABLE).insert({sender_id:owner,recipient_id:recipient,body});
    if(result&&result.error)throw result.error;
    if(!authUser||String(authUser.id||'')!==owner||!socialAcceptedFriend(recipient))return false;
    socialStatus='PARTY INVITE SENT';void fetchSocial(true);sfx('pickup');return true;
  }catch(error){
    if(authUser&&String(authUser.id||'')===owner){socialStatus=socialSetupMissing(error)?socialSetupStatus():'COULD NOT SEND THAT PARTY INVITE · FRIENDSHIP MAY HAVE CHANGED';sfx('dry');}
    return false;
  }
}
async function socialSendPartyInvite(recipientOrTarget,invite){
  const uuidOf=typeof socialPartyInviteUuid==='function'?socialPartyInviteUuid:value=>{
      const id=String(value||'').trim().toLowerCase();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)?id:'';
    },target=recipientOrTarget&&typeof recipientOrTarget==='object'?recipientOrTarget:null,
    recipientId=String(target&&target.recipientId||(!target?recipientOrTarget:'')||''),source=target&&target.source==='online'?'online':'friend',
    deliveryKey=uuidOf(target&&target.deliveryKey),clean=socialPartyCodeClean(invite&&invite.code),
    token=String(invite&&invite.token||''),expiresAt=Math.floor(+(invite&&invite.expiresAt)||0),
    owner=authUser?String(authUser.id||''):'',clock=Date.now(),
    operationCurrent=invite&&typeof invite.isCurrent==='function'?invite.isCurrent:()=>true;
  if(!sb||!owner||clean.length!==6||!/^[A-Za-z0-9_-]{20,64}$/.test(token)||expiresAt<=clock||
     expiresAt>clock+(typeof PARTY_FRIEND_INVITE_MAX_MS==='number'?PARTY_FRIEND_INVITE_MAX_MS:10*60*1000)){
    socialStatus='THAT PARTY INVITE COULD NOT BE SECURED';sfx('dry');return false;
  }
  // Social 02 fallback: accepted friends retain the existing RLS-protected
  // private-message envelope. Online non-friends never use this path.
  if(!deliveryKey){
    if(source==='friend'&&recipientId){
      if(typeof socialSendLegacyPartyInvite==='function')return socialSendLegacyPartyInvite(recipientId,invite);
      if(!socialAcceptedFriend(recipientId)){socialStatus='PARTY INVITES REQUIRE A CURRENT ACCEPTED FRIEND';sfx('dry');return false;}
      try{
        const body='OUTPOST ZERO · PARTY INVITE · CODE '+clean+' · TOKEN '+token+' · EXPIRES '+expiresAt,
          result=await sb.from(SOCIAL_MESSAGE_TABLE).insert({sender_id:owner,recipient_id:recipientId,body});
        if(result&&result.error)throw result.error;
        if(!authUser||String(authUser.id||'')!==owner||!socialAcceptedFriend(recipientId))return false;
        socialStatus='PARTY INVITE SENT';void fetchSocial(true);sfx('pickup');return true;
      }catch(error){if(authUser&&String(authUser.id||'')===owner){socialStatus='COULD NOT SEND THAT PARTY INVITE';sfx('dry');}return false;}
    }
    socialStatus='ONLINE PARTY INVITES NEED THE SOCIAL 03 DATABASE UPDATE';sfx('dry');return false;
  }
  const operationId=uuidOf(invite&&invite.operationId)||(typeof socialPartyInviteOperationId==='function'?socialPartyInviteOperationId():'');
  if(!operationId){socialStatus='THAT PARTY INVITE COULD NOT BE SECURED';sfx('dry');return false;}
  try{
    const args={p_target_token:deliveryKey,p_kind:'party',p_party_code:clean,p_join_token:token,p_operation_id:operationId};
    let result=null;
    for(let attempt=0;attempt<2;attempt++){
      if(!authUser||String(authUser.id||'')!==owner||!operationCurrent())return false;
      try{result=await sb.rpc('send_outpost_zero_party_invite',args);}catch(error){result={error};}
      if(!authUser||String(authUser.id||'')!==owner||!operationCurrent())return false;
      if(!(result&&result.error)||socialPartyInviteRpcMissing(result.error)||socialPartyInviteSemanticError(result.error)||attempt===1)break;
    }
    if(!authUser||String(authUser.id||'')!==owner||!operationCurrent())return false;
    if(result&&result.error)throw result.error;
    const row=Array.isArray(result&&result.data)?result.data[0]:result&&result.data,
      inviteId=socialPartyInviteUuid(row&&row.invite_id),recipientUsername=socialPartyInviteSafeHandle(row&&row.recipient_username),
      createdAt=Date.parse(row&&row.created_at||''),serverExpires=Date.parse(row&&row.expires_at||'');
    if(!inviteId||!recipientUsername||row&&row.recipient_kind!=='friend'&&row&&row.recipient_kind!=='online'||
       !Number.isFinite(createdAt)||!Number.isFinite(serverExpires)||serverExpires<=createdAt||serverExpires>createdAt+PARTY_FRIEND_INVITE_MS+5000)
      throw new Error('INVALID_PARTY_INVITE_RESPONSE');
    socialPartyInviteSqlReady=true;socialStatus='PARTY INVITE SENT';sfx('pickup');return true;
  }catch(error){
    if(!authUser||String(authUser.id||'')!==owner||!operationCurrent())return false;
    if(socialPartyInviteRpcMissing(error)){
      socialPartyInviteSqlReady=false;
      if(source==='friend'&&recipientId)return socialSendLegacyPartyInvite(recipientId,invite);
      socialStatus='ONLINE PARTY INVITES NEED THE SOCIAL 03 DATABASE UPDATE';
    }else socialStatus='THAT PLAYER IS NO LONGER AVAILABLE FOR A PARTY INVITE';
    sfx('dry');return false;
  }
}
async function socialSendCpuGameInvite(recipientId,invite){
  const recipient=String(recipientId||''),clean=socialPartyCodeClean(invite&&invite.code),token=String(invite&&invite.token||''),
    expiresAt=Math.floor(+(invite&&invite.expiresAt)||0),owner=authUser?String(authUser.id||''):'',clock=Date.now();
  if(!sb||!owner||clean.length!==6||!/^[A-Za-z0-9_-]{20,64}$/.test(token)||expiresAt<=clock||expiresAt>clock+10*60*1000||!socialAcceptedFriend(recipient)){
    socialStatus='CPU 2v2 INVITES REQUIRE AN ACCEPTED FRIEND';sfx('dry');return false;
  }
  try{
    const body='OUTPOST ZERO · CPU 2V2 GAME INVITE · CODE '+clean+' · TOKEN '+token+' · EXPIRES '+expiresAt;
    const result=await sb.from(SOCIAL_MESSAGE_TABLE).insert({sender_id:owner,recipient_id:recipient,body});
    if(result&&result.error)throw result.error;
    if(!authUser||String(authUser.id||'')!==owner)return false;
    socialStatus='CPU 2v2 GAME INVITE SENT';void fetchSocial(true);sfx('pickup');return true;
  }catch(error){
    if(authUser&&String(authUser.id||'')===owner){socialStatus=socialSetupMissing(error)?socialSetupStatus():'COULD NOT SEND THAT CPU 2v2 GAME INVITE';sfx('dry');}
    return false;
  }
}
function socialSetDomPageActive(active){
  socialDomPageActive=!!active;
  for(const id of ['socialidentity']){
    const el=document.getElementById(id); if(el&&!socialDomPageActive) el.style.display='none';
  }
}
function socialPlaceDomElement(el,rect,display='flex'){
  if(!el||!rect||!socialDomPageActive){ if(el) el.style.display='none'; return; }
  el.style.left=Math.round(rect.x)+'px'; el.style.top=Math.round(rect.y)+'px';
  el.style.width=Math.max(1,Math.round(rect.w))+'px'; el.style.height=Math.max(1,Math.round(rect.h))+'px';
  el.style.display=display;
}
function socialLayoutIdentity(rect){
  const box=document.getElementById('socialidentity'), text=document.getElementById('socialidentitytext');
  const copy=document.getElementById('socialhandlecopy');
  if(!box||!authUser||!rect){ if(box) box.style.display='none'; return; }
  const ready=!!socialProfile;
  box.classList.toggle('narrow',rect.w<500);
  const firstChoice=ready&&usernameNeedsClaim(socialProfile,authUser);
  if(text) text.textContent=ready?(firstChoice?'USERNAME REQUIRED · CHOOSE ONE NOW':'USERNAME  @'+socialProfile.handle):'LOADING YOUR USERNAME...';
  if(copy) copy.disabled=!ready||firstChoice;
  socialPlaceDomElement(box,rect);
}
async function socialCopyOwnHandle(){
  if(!socialProfile||!socialProfile.handle){ socialStatus='YOUR SOCIAL PROFILE IS STILL LOADING'; sfx('dry'); return false; }
  if(usernameNeedsClaim(socialProfile,authUser)){
    socialStatus='CHOOSE A USERNAME BEFORE COPYING IT';
    socialPromptEditProfile(); sfx('dry'); return false;
  }
  const value='@'+socialProfile.handle;
  try{
    if(!navigator.clipboard||typeof navigator.clipboard.writeText!=='function') throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(value);
  }catch(error){
    try{
      const temp=document.createElement('textarea'); temp.value=value; temp.setAttribute('readonly','');
      temp.style.position='fixed'; temp.style.opacity='0'; document.body.appendChild(temp); temp.select();
      if(!document.execCommand('copy')) throw new Error('copy failed'); temp.remove();
    }catch(fallbackError){ socialStatus='YOUR USERNAME IS '+value; sfx('dry'); return false; }
  }
  socialStatus='USERNAME COPIED · '+value; sfx('pickup'); return true;
}
function bindSocialDomControls(){
  const copy=document.getElementById('socialhandlecopy');
  if(copy) copy.addEventListener('click',socialCopyOwnHandle);
  const claim=usernameClaimElements();
  if(claim.save) claim.save.addEventListener('click',usernameClaimSubmit);
  if(claim.retry) claim.retry.addEventListener('click',usernameClaimRetry);
  if(claim.signout) claim.signout.addEventListener('click',()=>requestSignOut('username'));
  if(claim.input) claim.input.addEventListener('keydown',event=>{
    if(event.key==='Enter'){ event.preventDefault(); usernameClaimSubmit(); }
  });
}
function socialMarkFriendRequestNotice(rowId){
  const resource='friendship:'+String(rowId||'')+':request',notice=socialNotifications.find(row=>row&&row.kind==='friend_request'&&row.resourceKey===resource&&!row.readAt);
  return notice?socialMarkNotificationRead(notice.uiKey):Promise.resolve(false);
}
async function socialAcceptFriend(rowId){
  if(!sb||!authUser) return;
  try{
    const r=await sb.from(SOCIAL_FRIEND_TABLE).update({status:'accepted',blocked_by:null}).eq('id',rowId).eq('addressee_id',authUser.id).eq('status','pending');
    if(r&&r.error) throw r.error; socialStatus='FRIEND REQUEST ACCEPTED';void socialMarkFriendRequestNotice(rowId);await fetchSocial(true); sfx('swap');
  }catch(error){ socialStatus=socialSetupMissing(error)?socialSetupStatus():'COULD NOT ACCEPT THAT REQUEST'; sfx('dry'); }
}
async function socialBlockFriend(rowId){
  if(!sb||!authUser) return;
  try{
    const r=await sb.from(SOCIAL_FRIEND_TABLE).update({status:'blocked',blocked_by:authUser.id}).eq('id',rowId);
    if(r&&r.error) throw r.error; socialStatus='PLAYER BLOCKED · DIRECT MESSAGES STOPPED';void socialMarkFriendRequestNotice(rowId);await fetchSocial(true); sfx('swap');
  }catch(error){ socialStatus=socialSetupMissing(error)?socialSetupStatus():'COULD NOT BLOCK THAT PLAYER'; sfx('dry'); }
}
async function socialRemoveFriend(rowId){
  if(!sb||!authUser) return;
  try{
    const r=await sb.from(SOCIAL_FRIEND_TABLE).delete().eq('id',rowId);
    if(r&&r.error) throw r.error; socialStatus='FRIENDSHIP UPDATED'; await fetchSocial(true); sfx('swap');
  }catch(error){ socialStatus=socialSetupMissing(error)?socialSetupStatus():'COULD NOT UPDATE THAT FRIENDSHIP'; sfx('dry'); }
}
function socialPromptMessage(){
  if(!authUser){ toggleAuth(); return; }
  openForm({title:'NEW PRIVATE MESSAGE',hint:'Enter any player\'s public username. Blocked players cannot message each other.',saveLabel:'WRITE MESSAGE',
    fields:[{id:'handle',label:'PLAYER USERNAME',type:'text',placeholder:'operator_7'}],onSave:async v=>{
      const key=socialHandleKey(v.handle);if(!key){formError('enter a valid username');return;}
      let p=Object.values(socialProfiles).find(x=>socialHandleKey(x.handle_key||x.handle)===key)||null;
      if(!p&&sb){
        const result=await sb.from(SOCIAL_PROFILE_TABLE).select('user_id,handle,handle_key,display_name').eq('handle_key',key).maybeSingle();
        if(result&&result.error){formError('could not find that player');return;}
        p=result&&result.data||null;if(p)socialProfiles[String(p.user_id||'')]=p;
      }
      if(!p||!p.user_id){formError('no player has that username');return;}
      if(!socialCanMessageUser(p.user_id)){formError('you cannot message that player');return;}
      closeForm();openSocialMessageCompose(p.user_id,p.handle);
    }});
}
function openSocialMessageCompose(userId,handle){
  const allowed=typeof socialCanMessageUser==='function'?socialCanMessageUser(userId):socialAcceptedFriend(userId);
  if(!allowed){ socialStatus='YOU CANNOT MESSAGE THAT PLAYER'; sfx('dry'); return; }
  if(typeof clearAdminNotificationComposerState==='function')clearAdminNotificationComposerState();
  msgKind='social'; socialMessageTo=String(userId); msgTo=String(handle||'friend'); msgOpen=true; adminsOpen=false;
  $('msgwrap').style.display='flex'; $('msgstatus').textContent=''; $('msgmsg').value=''; $('msgto').textContent='private to: @'+msgTo;
  $('msgmsg').maxLength=500;const subject=$('msgsubject');if(subject){subject.hidden=true;subject.value='';}
  const title=$('msgbox').querySelector('h2'); if(title) title.textContent='✉ PRIVATE MESSAGE';
  try{ $('msgmsg').focus(); }catch(e){}
}
async function sendSocialMessage(){
  const txt=($('msgmsg').value||'').trim();
  if(!txt){ $('msgstatus').textContent='write something first'; return; }
  if(!sb||!authUser||!socialMessageTo){ $('msgstatus').textContent='sign in and reconnect first'; return; }
  const allowed=typeof socialCanMessageUser==='function'?socialCanMessageUser(socialMessageTo):socialAcceptedFriend(socialMessageTo);
  if(!allowed){ $('msgstatus').textContent='you cannot message that player'; return; }
  $('msgstatus').textContent='sending privately...';
  const sendButton=$('msgsend');if(sendButton)sendButton.disabled=true;
  try{
    const owner=String(authUser.id||''),peer=String(socialMessageTo),person=typeof socialPerson==='function'?socialPerson(peer):(socialProfiles&&socialProfiles[peer]||{}),handle=socialHandleKey(person&&person.handle||(typeof msgTo==='string'?msgTo:''));
    let result=typeof sb.rpc==='function'?await sb.rpc('send_outpost_zero_private_message',{p_recipient_username:handle,p_body:txt.slice(0,500)}):{error:{message:'schema cache'}};
    if(result&&result.error&&(typeof socialPartyInviteRpcMissing!=='function'||socialPartyInviteRpcMissing(result.error))){
      if(typeof socialConversationSqlReady!=='undefined')socialConversationSqlReady=false;
      if(!socialAcceptedFriend(peer))throw new Error('SOCIAL_01_REQUIRED');
      result=await sb.from(SOCIAL_MESSAGE_TABLE).insert({sender_id:owner,recipient_id:peer,body:txt.slice(0,500)});
    }
    if(result&&result.error)throw result.error;
    if(!authUser||String(authUser.id||'')!==owner)return;
    $('msgstatus').textContent='sent!';$('msgmsg').value='';
    if(typeof socialView!=='undefined')socialView='inbox';if(typeof socialInboxSection!=='undefined')socialInboxSection='inbox';
    if(typeof socialConversationPeer!=='undefined')socialConversationPeer=peer;if(typeof socialConversationPage!=='undefined')socialConversationPage=1000000;
    await fetchSocial(true);setTimeout(closeMsgCompose,350);
  }catch(error){
    $('msgstatus').textContent=String(error&&error.message||'').includes('SOCIAL_01_REQUIRED')?'rerun Social 01 to message players who are not friends':
      socialSetupMissing(error)?socialSetupStatus():'could not send — check the username or block status';
  }finally{if(sendButton)sendButton.disabled=false;}
}
