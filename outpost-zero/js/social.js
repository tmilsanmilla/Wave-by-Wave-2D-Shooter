"use strict";

const SOCIAL_PROFILE_TABLE='social_profiles', SOCIAL_FRIEND_TABLE='friendships', SOCIAL_MESSAGE_TABLE='private_messages';
let socialRects=[], socialProfile=null, socialProfiles={}, socialFriends=[], socialMessages=[];
let socialLoading=false, socialStatus='', socialLastFetch=0, socialChannel=null;
let socialBackend={profiles:null,friends:null,messages:null};
let socialFriendPage=0, socialMessagePage=0;
let socialMessageTo=null, msgKind='admin';
let socialDomPageActive=false;
let socialFetchVersion=0, socialAccountId='', socialFetchUserId='', socialFetchPromise=null, socialFetchQueued=false;
let usernameClaimOpen=false, usernameClaimMode='closed', usernameClaimUserId='';

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
    ? 'Open Settings to choose the unique public username shown on leaderboards, parties, friends, and messages. Your sign-in email is visible only in this private setup.'
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
function socialSetupStatus(){ return 'SECURE SOCIAL STORAGE IS NOT ENABLED · RUN SOCIAL SQL SETUP'; }
function socialDropRealtime(){
  if(socialChannel&&sb){ try{ sb.removeChannel(socialChannel); }catch(e){} }
  socialChannel=null;
}
function prepareSocialForAccount(userId){
  const id=String(userId||'');
  if(socialAccountId===id) return false;
  if(usernameClaimUserId&&usernameClaimUserId!==id) closeUsernameClaim(true);
  socialAccountId=id;
  socialFetchVersion++;
  socialFetchUserId=''; socialFetchPromise=null; socialFetchQueued=false;
  socialDropRealtime(); socialProfile=null; socialProfiles={}; socialFriends=[]; socialMessages=[];
  socialBackend={profiles:null,friends:null,messages:null}; socialLoading=false; socialLastFetch=0;
  socialFriendPage=0; socialMessagePage=0;
  socialStatus=id?'CHECKING YOUR USERNAME...':'SIGN IN FOR FRIENDS + PRIVATE MESSAGES';
  return true;
}
function resetSocialState(message){
  socialAccountId=''; socialFetchVersion++;
  socialFetchUserId=''; socialFetchPromise=null; socialFetchQueued=false;
  socialDropRealtime(); socialProfile=null; socialProfiles={}; socialFriends=[]; socialMessages=[];
  socialBackend={profiles:null,friends:null,messages:null}; socialLoading=false; socialLastFetch=0;
  socialFriendPage=0; socialMessagePage=0;
  socialStatus=message||'SIGN IN FOR FRIENDS + PRIVATE MESSAGES';
  closeUsernameClaim();
}
function setupSocialRealtime(){
  if(!sb||!authUser||socialChannel||socialBackend.friends!==true||socialBackend.messages!==true||typeof sb.channel!=='function') return;
  try{
    let ch=sb.channel('oz-social-'+authUser.id);
    // DELETE change payloads cannot be filtered through row-level security
    // after their row is gone. Listen only for inserts/updates; a removed
    // friendship is picked up by the normal page refresh/poll instead of
    // leaking its row ID to unrelated signed-in subscribers.
    for(const event of ['INSERT','UPDATE']){
      ch=ch.on('postgres_changes',{event,schema:'public',table:SOCIAL_FRIEND_TABLE},()=>fetchSocial(true));
      ch=ch.on('postgres_changes',{event,schema:'public',table:SOCIAL_MESSAGE_TABLE},()=>fetchSocial(true));
    }
    ch.subscribe(); socialChannel=ch;
  }catch(e){ socialChannel=null; }
}
function socialFriendOther(row){
  if(!row||!authUser) return '';
  return String(row.requester_id)===String(authUser.id)?String(row.addressee_id||''):String(row.requester_id||'');
}
function socialFriendshipWith(userId){
  const id=String(userId||''); return socialFriends.find(r=>socialFriendOther(r)===id)||null;
}
function socialAcceptedFriend(userId){ const r=socialFriendshipWith(userId); return !!(r&&r.status==='accepted'); }
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
    let profileResult=await sb.from(SOCIAL_PROFILE_TABLE).select('user_id,handle,handle_key,display_name,username_changed_at,updated_at').eq('user_id',userId).maybeSingle();
    if(!stillCurrent()) return false;
    if(profileResult.error){ socialBackend.profiles=false; throw profileResult.error; }
    socialBackend.profiles=true;
    if(!profileResult.data){
      const handle=socialDefaultHandle();
      const made=await sb.from(SOCIAL_PROFILE_TABLE).insert({user_id:userId,handle,handle_key:handle,display_name:handle});
      if(!stillCurrent()) return false;
      if(made&&made.error){ socialBackend.profiles=false; throw made.error; }
      profileResult=await sb.from(SOCIAL_PROFILE_TABLE).select('user_id,handle,handle_key,display_name,username_changed_at,updated_at').eq('user_id',userId).maybeSingle();
      if(!stillCurrent()) return false;
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
    socialStatus=usernameNeedsClaim(socialProfile,authUser)
      ? 'CHOOSE YOUR USERNAME · THIS REPLACES THE TEMPORARY ACCOUNT NAME EVERYWHERE'
      : 'SOCIAL READY · PRIVATE MESSAGES ARE FRIENDS-ONLY';
    socialLastFetch=Date.now();
    setupSocialRealtime();
    const unread=socialMessages.some(m=>String(m.recipient_id)===userId&&!m.read_at);
    if(unread){
      try{ await sb.from(SOCIAL_MESSAGE_TABLE).update({read_at:new Date().toISOString()}).eq('recipient_id',userId).is('read_at',null); }catch(e){}
      if(!stillCurrent()) return false;
      for(const m of socialMessages) if(String(m.recipient_id)===userId&&!m.read_at) m.read_at=new Date().toISOString();
    }
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
function socialPromptEditHandle(){
  socialPromptEditProfile();
}
function socialPromptEditProfile(){
  if(!authUser){ toggleAuth(); return; }
  const firstChoice=usernameNeedsClaim(socialProfile,authUser);
  if(typeof openAccountSettings==='function'){
    openAccountSettings({focus:'username',requiredUsername:firstChoice}); return;
  }
  openForm({title:firstChoice?'CHOOSE USERNAME':'EDIT USERNAME',hint:(firstChoice
      ? 'Your account has a temporary private-safe label. Choose the public username shown on leaderboards, parties, friends, and messages.'
      : 'This unique username is shown everywhere and is how friends find you. Username changes are limited to once every 21 days. Email stays private.'),saveLabel:firstChoice?'CHOOSE USERNAME':'SAVE USERNAME',
    fields:[{id:'handle',label:'USERNAME',type:'text',value:firstChoice?'':socialProfile&&socialProfile.handle||'',placeholder:'operator_7'}],
    onSave:v=>socialUpdateHandle(v.handle)});
}
async function socialUpdateHandle(value,requiredClaim=false){
  const username=String(value||'').trim().replace(/^@/,'');
  const settingsOpen=typeof accountSettingsOpen!=='undefined'&&accountSettingsOpen;
  const showError=message=>{
    if(requiredClaim) usernameClaimBusy(false);
    if(settingsOpen&&typeof accountSettingsSetStatus==='function') accountSettingsSetStatus('username',message,true);
    else if(requiredClaim){ const el=usernameClaimElements(); if(el.status) el.status.textContent=usernameClaimPrivateStatus(message); }
    else formError(message);
  };
  if(!/^[A-Za-z0-9_]{3,32}$/.test(username)){ showError('Use 3–32 letters, numbers, or _.'); return false; }
  const key=username.toLowerCase();
  if(usernameIsGeneratedForUser(username,authUser&&authUser.id)){ showError('Choose a real username, not the temporary account label.'); return false; }
  if(!sb||!authUser){ showError('Sign in and reconnect first.'); return false; }
  const userId=String(authUser.id||'');
  if(requiredClaim) usernameClaimBusy(true,'Saving your unique username...');
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
    if(settingsOpen&&typeof accountSettingsSync==='function') accountSettingsSync(true);
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
function socialCpuPartyInviteCode(value){
  const match=/^OUTPOST ZERO · CPU 2V2 INVITE · PARTY CODE ([A-Z0-9]{6})$/.exec(String(value||'').trim().toUpperCase());
  return match?match[1]:'';
}
async function socialSendCpuPartyInvite(recipientId,code){
  const recipient=String(recipientId||''),clean=socialPartyCodeClean(code),owner=authUser?String(authUser.id||''):'';
  if(!sb||!owner||clean.length!==6||!socialAcceptedFriend(recipient)){socialStatus='CPU 2v2 INVITES REQUIRE AN ACCEPTED FRIEND';sfx('dry');return false;}
  try{
    const body='OUTPOST ZERO · CPU 2V2 INVITE · PARTY CODE '+clean;
    const result=await sb.from(SOCIAL_MESSAGE_TABLE).insert({sender_id:owner,recipient_id:recipient,body});
    if(result&&result.error)throw result.error;
    if(!authUser||String(authUser.id||'')!==owner)return false;
    socialStatus='CPU 2v2 INVITE SENT PRIVATELY';void fetchSocial(true);sfx('pickup');return true;
  }catch(error){
    if(authUser&&String(authUser.id||'')===owner){socialStatus=socialSetupMissing(error)?socialSetupStatus():'COULD NOT SEND THAT CPU 2v2 INVITE';sfx('dry');}
    return false;
  }
}
function socialSetDomPageActive(active){
  socialDomPageActive=!!active;
  for(const id of ['socialidentity','socialpartyjoinwrap']){
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
  const copy=document.getElementById('socialhandlecopy'), edit=document.getElementById('socialprofileedit');
  if(!box||!authUser){ if(box) box.style.display='none'; return; }
  const ready=!!socialProfile;
  box.classList.toggle('narrow',rect.w<500);
  const firstChoice=ready&&usernameNeedsClaim(socialProfile,authUser);
  if(text) text.textContent=ready?(firstChoice?'USERNAME REQUIRED · CHOOSE ONE NOW':'USERNAME  @'+socialProfile.handle):'LOADING YOUR USERNAME...';
  if(copy) copy.disabled=!ready||firstChoice;
  if(edit){ edit.disabled=!ready; edit.textContent=ready&&usernameNeedsClaim(socialProfile,authUser)?'CHOOSE USERNAME':'EDIT USERNAME'; }
  socialPlaceDomElement(box,rect);
}
function socialLayoutPartyJoin(rect,enabled){
  const box=document.getElementById('socialpartyjoinwrap'), field=document.getElementById('socialpartycode'), join=document.getElementById('socialpartyjoin');
  if(!box) return;
  if(field) field.disabled=!enabled; if(join) join.disabled=!enabled;
  socialPlaceDomElement(box,rect);
}
function socialPartyJoinFromInline(){
  const field=document.getElementById('socialpartycode'), code=socialPartyCodeClean(field&&field.value);
  if(field) field.value=code;
  if(typeof partyPromptJoin!=='function'){ socialStatus='PARTY JOIN IS NOT READY'; sfx('dry'); return false; }
  // The shared join form remains the final validator. Forward partial input as
  // a prefill so a player can finish typing there instead of losing their work.
  return partyPromptJoin(code);
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
  const field=document.getElementById('socialpartycode'), join=document.getElementById('socialpartyjoin');
  const copy=document.getElementById('socialhandlecopy'), edit=document.getElementById('socialprofileedit');
  if(field){
    field.addEventListener('input',()=>{ const clean=socialPartyCodeClean(field.value); if(field.value!==clean) field.value=clean; });
    field.addEventListener('keydown',event=>{ if(event.key==='Enter'){ event.preventDefault(); socialPartyJoinFromInline(); } });
  }
  if(join) join.addEventListener('click',socialPartyJoinFromInline);
  if(copy) copy.addEventListener('click',socialCopyOwnHandle);
  if(edit) edit.addEventListener('click',socialPromptEditProfile);
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
    if(r&&r.error) throw r.error; socialStatus='PLAYER BLOCKED · PRIVATE MESSAGES STOPPED'; await fetchSocial(true); sfx('swap');
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
  if(!socialAcceptedFriend(userId)){ socialStatus='PRIVATE MESSAGES ARE ONLY FOR ACCEPTED FRIENDS'; sfx('dry'); return; }
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
