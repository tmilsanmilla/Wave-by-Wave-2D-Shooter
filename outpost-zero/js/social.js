"use strict";

const SOCIAL_PROFILE_TABLE='social_profiles', SOCIAL_FRIEND_TABLE='friendships', SOCIAL_MESSAGE_TABLE='private_messages';
let socialRects=[], socialProfile=null, socialProfiles={}, socialFriends=[], socialMessages=[];
let socialLoading=false, socialStatus='', socialLastFetch=0, socialChannel=null;
let socialBackend={profiles:null,friends:null,messages:null};
// Social is one page at a time: the Friends directory or the private Inbox.
// Each friend bucket owns its own page so a busy Incoming list can never hide
// Outgoing requests or current friends.
let socialView='friends', socialFriendPage=0, socialMessagePage=0;
let socialFriendPages={incoming:0,outgoing:0,current:0};
let socialMessageTo=null, msgKind='admin';
let socialDomPageActive=false;
let socialFetchVersion=0, socialAccountId='', socialFetchUserId='', socialFetchPromise=null, socialFetchQueued=false;
const SOCIAL_REALTIME_RETRY_MS=3000, SOCIAL_CPU_INVITE_POLL_MS=7000;
const SOCIAL_PARTY_PRESENCE_MS=30000, SOCIAL_PARTY_PRESENCE_FRESH_MS=90000, SOCIAL_PARTY_INVITE_POLL_MS=7000;
let socialRealtimeRetryAt=0, socialCpuInvitePollAt=0, socialCpuInvitePolling=false;
let socialCpuInvitePromptedIds=new Set();
let socialCpuInvitePromptUserId='';
let socialPartyPresenceAt=0,socialPartyPresencePromise=null,socialPartyPresenceOwner='',socialPartyServerOffsetMs=0;
let socialPartyInviteSqlReady=null,socialPartyInvites=[],socialPartyInvitePollAt=0,socialPartyInvitePolling=false;
let socialPartyInvitePromptedIds=new Set(),socialPartyInvitePromptUserId='',socialPartyInviteClaimBusy=false,socialPartyInviteClaimOp=null;
let socialPartyInviteUiKeys=new Map(),socialPartyInviteUiSequence=0,socialPartyPresenceLifecycleReady=false;
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
      ? 'The Social 05 database update is required before you can choose or change a username. Your sign-in email remains private.'
      : 'Open Settings to choose the unique public username shown on leaderboards, parties, friends, and messages. Your sign-in email is visible only in this private setup.')
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
  // During a staggered deploy, Social 05 may not be installed yet. Existing
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
function prepareSocialForAccount(userId){
  const id=String(userId||'');
  if(socialAccountId===id) return false;
  if((socialCpuInvitePromptUserId||socialPartyInvitePromptUserId)&&typeof formOpen!=='undefined'&&formOpen&&typeof closeForm==='function') closeForm();
  socialCpuInvitePromptUserId='';socialPartyInvitePromptUserId='';
  if(usernameClaimUserId&&usernameClaimUserId!==id) closeUsernameClaim(true);
  socialAccountId=id;
  socialFetchVersion++;
  socialFetchUserId=''; socialFetchPromise=null; socialFetchQueued=false;
  socialDropRealtime(); socialProfile=null; socialProfiles={}; socialFriends=[]; socialMessages=[];
  socialBackend={profiles:null,friends:null,messages:null}; socialLoading=false; socialLastFetch=0;
  socialAccountSettingsSqlReady=null;
  socialView='friends'; socialFriendPage=0; socialMessagePage=0;
  socialFriendPages={incoming:0,outgoing:0,current:0};
  socialCpuInvitePollAt=0; socialCpuInvitePolling=false; socialCpuInvitePromptedIds=new Set();
  socialPartyPresenceAt=0;socialPartyPresencePromise=null;socialPartyPresenceOwner=id;socialPartyServerOffsetMs=0;
  socialPartyInviteSqlReady=null;socialPartyInvites=[];socialPartyInvitePollAt=0;socialPartyInvitePolling=false;
  socialPartyInvitePromptedIds=new Set();socialPartyInviteClaimBusy=false;socialPartyInviteClaimOp=null;socialPartyInviteUiKeys.clear();socialPartyInviteUiSequence=0;
  socialStatus=id?'CHECKING YOUR USERNAME...':'SIGN IN FOR FRIENDS + DIRECT MESSAGES';
  return true;
}
function resetSocialState(message){
  socialAccountId=''; socialFetchVersion++;
  if((socialCpuInvitePromptUserId||socialPartyInvitePromptUserId)&&typeof formOpen!=='undefined'&&formOpen&&typeof closeForm==='function') closeForm();
  socialCpuInvitePromptUserId='';socialPartyInvitePromptUserId='';
  socialFetchUserId=''; socialFetchPromise=null; socialFetchQueued=false;
  socialDropRealtime(); socialProfile=null; socialProfiles={}; socialFriends=[]; socialMessages=[];
  socialBackend={profiles:null,friends:null,messages:null}; socialLoading=false; socialLastFetch=0;
  socialAccountSettingsSqlReady=null;
  socialView='friends'; socialFriendPage=0; socialMessagePage=0;
  socialFriendPages={incoming:0,outgoing:0,current:0};
  socialCpuInvitePollAt=0; socialCpuInvitePolling=false; socialCpuInvitePromptedIds=new Set();
  socialPartyPresenceAt=0;socialPartyPresencePromise=null;socialPartyPresenceOwner='';socialPartyServerOffsetMs=0;
  socialPartyInviteSqlReady=null;socialPartyInvites=[];socialPartyInvitePollAt=0;socialPartyInvitePolling=false;
  socialPartyInvitePromptedIds=new Set();socialPartyInviteClaimBusy=false;socialPartyInviteClaimOp=null;socialPartyInviteUiKeys.clear();socialPartyInviteUiSequence=0;
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
      ch=ch.on('postgres_changes',{event,schema:'public',table:SOCIAL_FRIEND_TABLE},()=>{socialCpuInvitePollAt=0;void fetchSocial(true);});
      ch=ch.on('postgres_changes',{event,schema:'public',table:SOCIAL_MESSAGE_TABLE},()=>{socialCpuInvitePollAt=0;void fetchSocial(true);});
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
      // The server target token lets an accepted friend use the Social 06
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
  // Social 06 owns the remote wrappers. Until that migration is installed,
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
    // Presence is per account, not per tab. A hidden tab must never clear a
    // heartbeat maintained by another open device; expiry handles true exits.
    if(authUser&&document.visibilityState!=='hidden'){
      socialPartyPresenceAt=0;void socialTouchPartyPresence(true);socialPartyInvitePollAt=0;
    }
  });
}
async function socialTouchPartyPresence(force=false){
  const owner=authUser?String(authUser.id||''):'',clock=Date.now();
  if(!sb||!owner||typeof navigator!=='undefined'&&navigator.onLine===false||socialBackend.profiles!==true)return false;
  setupSocialPartyPresenceLifecycle();
  if(!force&&socialPartyPresenceOwner===owner&&clock<socialPartyPresenceAt)return socialPartyInviteSqlReady===true;
  if(socialPartyPresencePromise&&socialPartyPresenceOwner===owner)return socialPartyPresencePromise;
  socialPartyPresenceOwner=owner;
  const request=(async()=>{
    try{
      const result=await sb.rpc('touch_outpost_zero_social_presence');
      if(!authUser||String(authUser.id||'')!==owner)return false;
      if(result&&result.error)throw result.error;
      const row=Array.isArray(result&&result.data)?result.data[0]:result&&result.data,
        serverNow=Date.parse(row&&row.server_now||''),onlineUntil=Date.parse(row&&row.online_until||'');
      if(!Number.isFinite(serverNow)||!Number.isFinite(onlineUntil)||onlineUntil<=serverNow||onlineUntil>serverNow+SOCIAL_PARTY_PRESENCE_FRESH_MS+5000)
        throw new Error('INVALID_PARTY_PRESENCE_RESPONSE');
      socialPartyServerOffsetMs=serverNow-Date.now();socialPartyInviteSqlReady=true;
      socialPartyPresenceAt=Date.now()+SOCIAL_PARTY_PRESENCE_MS;return true;
    }catch(error){
      if(authUser&&String(authUser.id||'')===owner){
        if(socialPartyInviteRpcMissing(error))socialPartyInviteSqlReady=false;
        socialPartyPresenceAt=Date.now()+SOCIAL_PARTY_PRESENCE_MS;
      }
      return false;
    }
  })();
  socialPartyPresencePromise=request;
  try{return await request;}finally{if(socialPartyPresencePromise===request)socialPartyPresencePromise=null;}
}
async function socialLeavePartyPresence(){
  const owner=authUser?String(authUser.id||''):'';
  socialPartyPresenceAt=0;
  if(!sb||!owner||socialPartyInviteSqlReady!==true)return false;
  try{
    const result=await sb.rpc('leave_outpost_zero_social_presence');
    if(!authUser||String(authUser.id||'')!==owner)return false;
    if(result&&result.error)throw result.error;
    return result&&result.data===true||Array.isArray(result&&result.data)&&result.data[0]===true;
  }catch(error){if(socialPartyInviteRpcMissing(error))socialPartyInviteSqlReady=false;return false;}
}
async function socialFetchOnlinePartyInviteTargets(){
  const owner=authUser?String(authUser.id||''):'';
  if(!owner||!await socialTouchPartyPresence(true))return {ready:false,targets:[]};
  try{
    const result=await sb.rpc('list_outpost_zero_party_invite_targets',{p_limit:40});
    if(!authUser||String(authUser.id||'')!==owner)return {ready:false,targets:[]};
    if(result&&result.error)throw result.error;
    const clock=socialPartyInviteServerNow(),targets=[];
    for(const row of Array.isArray(result&&result.data)?result.data:[]){
      const deliveryKey=socialPartyInviteUuid(row&&row.target_token),handle=socialPartyInviteSafeHandle(row&&row.username),
        friend=row&&row.is_friend===true,online=row&&row.is_online===true,onlineUntil=Date.parse(row&&row.online_until||'');
      if(!deliveryKey||!handle||!friend&&(!online||!Number.isFinite(onlineUntil)||onlineUntil<=clock||
         onlineUntil>clock+SOCIAL_PARTY_PRESENCE_FRESH_MS+5000))continue;
      targets.push({handle,source:friend?'friend':'online',isOnline:online&&Number.isFinite(onlineUntil)&&onlineUntil>clock&&
        onlineUntil<=clock+SOCIAL_PARTY_PRESENCE_FRESH_MS+5000,deliveryKey,recipientId:''});
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
    if(socialPartyInviteSqlReady!==true&&!await socialTouchPartyPresence(force))return false;
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
      onCancel:()=>{socialCpuInvitePromptUserId='';socialStatus=(normal?'PARTY':'CPU 2v2')+' INVITE DISMISSED · IT REMAINS IN YOUR INBOX UNTIL IT EXPIRES';},
      onSave:()=>{
        if(!authUser||String(authUser.id||'')!==owner){socialCpuInvitePromptUserId='';closeForm();return;}
        const fresh=normal?(typeof socialPartyInvite==='function'&&socialPartyInvite(row.body)):socialCpuGameInvite(row.body);
        if(!fresh||!socialAcceptedFriend(senderId)){formError('That '+(normal?'Party':'CPU 2v2')+' invite expired or is no longer from a friend.');return;}
        socialCpuInvitePromptUserId='';
        closeForm();
        const joined=normal
          ?(typeof partyJoinFriendInvite==='function'&&partyJoinFriendInvite({...fresh,senderId}))
          :(typeof partyJoinCpuInvite==='function'&&partyJoinCpuInvite({...fresh,senderId}));
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
  socialRealtimeRetryAt=0; socialCpuInvitePollAt=0;socialPartyPresenceAt=0;socialPartyInvitePollAt=0;
  if(authUser&&sb&&!(typeof navigator!=='undefined'&&navigator.onLine===false))void fetchSocial(true);
}
function socialTick(clock=Date.now()){
  if(!authUser||!sb||typeof navigator!=='undefined'&&navigator.onLine===false)return;
  if(!socialChannel&&socialBackend.friends===true&&socialBackend.messages===true&&clock>=socialRealtimeRetryAt)setupSocialRealtime();
  if(socialBackend.profiles===true&&clock>=socialPartyPresenceAt)void socialTouchPartyPresence();
  if(typeof state!=='undefined'&&state==='select'&&clock>=socialPartyInvitePollAt)void socialPollPartyInvites();
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

    const sent=await sb.from(SOCIAL_MESSAGE_TABLE).select('id,sender_id,recipient_id,body,read_at,created_at').eq('sender_id',userId).order('created_at',{ascending:false}).limit(40);
    if(!stillCurrent()) return false;
    if(sent.error){ socialBackend.messages=false; throw sent.error; }
    const received=await sb.from(SOCIAL_MESSAGE_TABLE).select('id,sender_id,recipient_id,body,read_at,created_at').eq('recipient_id',userId).order('created_at',{ascending:false}).limit(40);
    if(!stillCurrent()) return false;
    if(received.error){ socialBackend.messages=false; throw received.error; }
    socialBackend.messages=true;
    socialMessages=socialMergeRows(sent.data,received.data).sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0)).slice(0,60);

    const ids=new Set([userId]);
    for(const row of socialFriends) ids.add(socialFriendOther(row));
    for(const row of socialMessages){ ids.add(String(row.sender_id||'')); ids.add(String(row.recipient_id||'')); }
    const wanted=[...ids].filter(Boolean);
    if(wanted.length){
      const people=await sb.from(SOCIAL_PROFILE_TABLE).select('user_id,handle,handle_key,display_name').in('user_id',wanted);
      if(!stillCurrent()) return false;
      if(!people.error) for(const p of people.data||[]) socialProfiles[String(p.user_id)]=p;
    }
    socialStatus=socialAccountSettingsSqlReady===false
      ? 'SOCIAL READY · RUN SOCIAL 05 FOR USERNAME SETTINGS'
      : usernameNeedsClaim(socialProfile,authUser)
        ? 'CHOOSE YOUR USERNAME · THIS REPLACES THE TEMPORARY ACCOUNT NAME EVERYWHERE'
        : 'INBOX READY · DIRECT MESSAGES ARE FRIENDS-ONLY';
    socialLastFetch=Date.now();
    setupSocialRealtime();
    socialPartyPresenceAt=0;socialPartyInvitePollAt=0;
    void socialTouchPartyPresence(true).then(()=>socialPollPartyInvites(true));
    const unread=socialMessages.some(m=>String(m.recipient_id)===userId&&!m.read_at);
    if(unread){
      try{ await sb.from(SOCIAL_MESSAGE_TABLE).update({read_at:new Date().toISOString()}).eq('recipient_id',userId).is('read_at',null); }catch(e){}
      if(!stillCurrent()) return false;
      for(const m of socialMessages) if(String(m.recipient_id)===userId&&!m.read_at) m.read_at=new Date().toISOString();
    }
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
  if(socialAccountSettingsSqlReady===false){ showError('Install Social 05 in Supabase before choosing or changing a username.'); return false; }
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
        : socialSetupMissing(error)?'Username Settings needs the Social 05 SQL update.':'That username is unavailable. Try another one.');
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
  // Social 05 fallback: accepted friends retain the existing RLS-protected
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
    socialStatus='ONLINE PARTY INVITES NEED THE SOCIAL 06 DATABASE UPDATE';sfx('dry');return false;
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
      socialStatus='ONLINE PARTY INVITES NEED THE SOCIAL 06 DATABASE UPDATE';
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
async function socialAcceptFriend(rowId){
  if(!sb||!authUser) return;
  try{
    const r=await sb.from(SOCIAL_FRIEND_TABLE).update({status:'accepted',blocked_by:null}).eq('id',rowId).eq('addressee_id',authUser.id).eq('status','pending');
    if(r&&r.error) throw r.error; socialStatus='FRIEND REQUEST ACCEPTED'; await fetchSocial(true); sfx('swap');
  }catch(error){ socialStatus=socialSetupMissing(error)?socialSetupStatus():'COULD NOT ACCEPT THAT REQUEST'; sfx('dry'); }
}
async function socialBlockFriend(rowId){
  if(!sb||!authUser) return;
  try{
    const r=await sb.from(SOCIAL_FRIEND_TABLE).update({status:'blocked',blocked_by:authUser.id}).eq('id',rowId);
    if(r&&r.error) throw r.error; socialStatus='PLAYER BLOCKED · DIRECT MESSAGES STOPPED'; await fetchSocial(true); sfx('swap');
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
  openForm({title:'NEW PRIVATE MESSAGE',hint:'Enter an accepted friend\'s username.',saveLabel:'WRITE MESSAGE',
    fields:[{id:'handle',label:'FRIEND USERNAME',type:'text',placeholder:'operator_7'}],onSave:v=>{
      const key=socialHandleKey(v.handle), p=Object.values(socialProfiles).find(x=>socialHandleKey(x.handle_key||x.handle)===key);
      if(!p||!socialAcceptedFriend(p.user_id)){ formError('private messages are only for accepted friends'); return; }
      closeForm(); openSocialMessageCompose(p.user_id,p.handle);
    }});
}
function openSocialMessageCompose(userId,handle){
  if(!socialAcceptedFriend(userId)){ socialStatus='DIRECT MESSAGES ARE ONLY FOR ACCEPTED FRIENDS'; sfx('dry'); return; }
  msgKind='social'; socialMessageTo=String(userId); msgTo=String(handle||'friend'); msgOpen=true; adminsOpen=false;
  $('msgwrap').style.display='flex'; $('msgstatus').textContent=''; $('msgmsg').value=''; $('msgto').textContent='private to: @'+msgTo;
  const title=$('msgbox').querySelector('h2'); if(title) title.textContent='✉ PRIVATE MESSAGE';
  try{ $('msgmsg').focus(); }catch(e){}
}
async function sendSocialMessage(){
  const txt=($('msgmsg').value||'').trim();
  if(!txt){ $('msgstatus').textContent='write something first'; return; }
  if(!sb||!authUser||!socialMessageTo){ $('msgstatus').textContent='sign in and reconnect first'; return; }
  if(!socialAcceptedFriend(socialMessageTo)){ $('msgstatus').textContent='messages require an accepted friendship'; return; }
  $('msgstatus').textContent='sending privately...';
  try{
    const result=await sb.from(SOCIAL_MESSAGE_TABLE).insert({sender_id:authUser.id,recipient_id:socialMessageTo,body:txt.slice(0,500)});
    if(result&&result.error) throw result.error;
    $('msgstatus').textContent='sent!'; $('msgmsg').value=''; await fetchSocial(true); setTimeout(closeMsgCompose,700);
  }catch(error){ $('msgstatus').textContent=socialSetupMissing(error)?socialSetupStatus():'could not send — accepted friends only'; }
}
