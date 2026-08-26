"use strict";

const SOCIAL_PROFILE_TABLE='social_profiles', SOCIAL_FRIEND_TABLE='friendships', SOCIAL_MESSAGE_TABLE='private_messages';
let socialRects=[], socialProfile=null, socialProfiles={}, socialFriends=[], socialMessages=[];
let socialLoading=false, socialStatus='', socialLastFetch=0, socialChannel=null;
let socialBackend={profiles:null,friends:null,messages:null};
let socialFriendPage=0, socialMessagePage=0;
let socialMessageTo=null, msgKind='admin';
let socialDomPageActive=false;
let socialFetchVersion=0;
let usernameClaimOpen=false, usernameClaimMode='closed', usernameClaimUserId='';

function socialHandleKey(value){
  return String(value||'').trim().replace(/^@/,'').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,32);
}
function socialDefaultHandle(){
  const suffix=String(authUser&&authUser.id||'guest').replace(/-/g,'').slice(0,20).toLowerCase();
  return ('op_'+suffix).slice(0,32);
}
function socialHasGeneratedUsername(profile=socialProfile){
  if(!profile||!authUser) return false;
  const key=socialHandleKey(profile.handle), suffix=String(authUser.id||'').replace(/-/g,'').toLowerCase();
  return !!suffix&&(key==='op_'+suffix.slice(0,20)||key==='op_'+suffix.slice(0,8));
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
function closeUsernameClaim(){
  usernameClaimOpen=false; usernameClaimMode='closed'; usernameClaimUserId='';
  const el=usernameClaimElements();
  if(el.wrap){ el.wrap.style.display='none'; el.wrap.className='ui'; }
  if(el.input) el.input.value='';
  if(el.status) el.status.textContent='';
}
function openUsernameClaim(mode='checking',message='Checking your account username...'){
  if(!authUser||recovering){ closeUsernameClaim(); return false; }
  const id=String(authUser.id||'');
  if(!id){ closeUsernameClaim(); return false; }
  const el=usernameClaimElements(), same=usernameClaimOpen&&usernameClaimUserId===id;
  usernameClaimOpen=true; usernameClaimMode=mode; usernameClaimUserId=id;
  if(el.wrap){ el.wrap.className='ui '+mode; el.wrap.style.display='flex'; }
  if(el.title) el.title.textContent=mode==='required'?'CHOOSE YOUR USERNAME':mode==='error'?'USERNAME REQUIRED':'CHECKING USERNAME';
  if(el.hint) el.hint.textContent=mode==='required'
    ? 'Choose the unique public username shown on leaderboards, parties, friends, and messages. Your email always stays private.'
    : mode==='error'?'Your username could not be verified. Retry the secure profile check or sign out.':'Checking the public username attached to your account.';
  if(el.status) el.status.textContent=message;
  if(el.save) el.save.disabled=mode!=='required';
  if(el.signout) el.signout.disabled=false;
  if(mode==='required'&&!same&&el.input) el.input.value='';
  if(mode==='required') try{ setTimeout(()=>el.input&&el.input.focus(),0); }catch(e){}
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
  if(socialHasGeneratedUsername(socialProfile)){
    openUsernameClaim('required','Use 3–32 letters, numbers, or underscores.');
    return true;
  }
  closeUsernameClaim(); return false;
}
function usernameClaimFailed(message){
  if(!authUser||recovering){ closeUsernameClaim(); return false; }
  openUsernameClaim('error',message||'Could not verify your username. Check your connection and retry.');
  return true;
}
function usernameClaimBusy(busy,status){
  const el=usernameClaimElements();
  if(el.save) el.save.disabled=!!busy;
  if(el.signout) el.signout.disabled=!!busy;
  if(status&&el.status) el.status.textContent=status;
}
async function usernameClaimSubmit(){
  const el=usernameClaimElements();
  return socialUpdateHandle(el.input&&el.input.value,true);
}
async function usernameClaimRetry(){
  if(!authUser) return false;
  openUsernameClaim('checking','Checking your account username...');
  const ok=await fetchSocial(true);
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
function resetSocialState(message){
  socialFetchVersion++;
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
  const username=String(p.handle||'operator');
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
  if(socialLoading||(!force&&Date.now()-socialLastFetch<2500)) return false;
  const userId=String(authUser.id||''), fetchVersion=++socialFetchVersion;
  const stillCurrent=()=>socialFetchVersion===fetchVersion&&authUser&&String(authUser.id||'')===userId;
  socialLoading=true; socialStatus='REFRESHING SOCIAL...';
  try{
    const previousUsername=socialProfile&&String(socialProfile.handle||'');
    let profileResult=await sb.from(SOCIAL_PROFILE_TABLE).select('user_id,handle,handle_key,display_name,updated_at').eq('user_id',userId).maybeSingle();
    if(!stillCurrent()) return false;
    if(profileResult.error){ socialBackend.profiles=false; throw profileResult.error; }
    socialBackend.profiles=true;
    if(!profileResult.data){
      const handle=socialDefaultHandle();
      const made=await sb.from(SOCIAL_PROFILE_TABLE).insert({user_id:userId,handle,handle_key:handle,display_name:handle});
      if(!stillCurrent()) return false;
      if(made&&made.error){ socialBackend.profiles=false; throw made.error; }
      profileResult=await sb.from(SOCIAL_PROFILE_TABLE).select('user_id,handle,handle_key,display_name,updated_at').eq('user_id',userId).maybeSingle();
      if(!stillCurrent()) return false;
      if(profileResult.error||!profileResult.data) throw profileResult.error||new Error('Social profile could not be created.');
    }
    socialProfile=profileResult.data; socialProfiles={[userId]:socialProfile};
    syncUsernameClaim();
    // Auth metadata can be stale or absent. Repaint as soon as the canonical
    // Social username arrives so the header never keeps showing an old alias.
    if(typeof paintUserbar==='function') paintUserbar();
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
    socialStatus=socialHasGeneratedUsername()
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
  }finally{ if(socialFetchVersion===fetchVersion) socialLoading=false; }
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
  const firstChoice=socialHasGeneratedUsername();
  openForm({title:firstChoice?'CHOOSE USERNAME':'EDIT USERNAME',hint:(firstChoice
      ? 'Your account has a temporary private-safe label. Choose the public username shown on leaderboards, parties, friends, and messages.'
      : 'This unique username is shown everywhere and is how friends find you. Username changes are free. Email stays private.'),saveLabel:firstChoice?'CHOOSE USERNAME':'SAVE USERNAME',
    fields:[{id:'handle',label:'USERNAME',type:'text',value:firstChoice?'':socialProfile&&socialProfile.handle||'',placeholder:'operator_7'}],
    onSave:v=>socialUpdateHandle(v.handle)});
}
async function socialUpdateHandle(value,requiredClaim=false){
  const username=String(value||'').trim().replace(/^@/,'');
  const showError=message=>{
    if(requiredClaim){ const el=usernameClaimElements(); if(el.status) el.status.textContent=message; usernameClaimBusy(false); }
    else formError(message);
  };
  if(!/^[A-Za-z0-9_]{3,32}$/.test(username)){ showError('Use 3–32 letters, numbers, or _.'); return false; }
  const key=username.toLowerCase();
  if(socialHasGeneratedUsername({handle:username})){ showError('Choose a real username, not the temporary account label.'); return false; }
  if(!sb||!authUser){ showError('Sign in and reconnect first.'); return false; }
  const userId=String(authUser.id||'');
  if(requiredClaim) usernameClaimBusy(true,'Saving your unique username...');
  try{
    const result=await sb.from(SOCIAL_PROFILE_TABLE).update({handle:username,handle_key:key,display_name:username}).eq('user_id',userId);
    if(result&&result.error) throw result.error;
    if(!authUser||String(authUser.id||'')!==userId) return false;
    if(socialProfile&&String(socialProfile.user_id||'')===userId){
      socialProfile={...socialProfile,handle:username,handle_key:key,display_name:username};
      socialProfiles[userId]=socialProfile;
    }
    if(requiredClaim) syncUsernameClaim(); else closeForm();
    await fetchSocial(true); paintUserbar(); fetchBoard(); socialStatus='USERNAME UPDATED · @'+username; sfx('swap'); return true;
  }catch(error){
    showError(socialSetupMissing(error)?socialSetupStatus():'That username is unavailable. Try another one.'); return false;
  }
}

function socialPartyCodeClean(value){
  return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
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
  const firstChoice=ready&&socialHasGeneratedUsername();
  if(text) text.textContent=ready?(firstChoice?'USERNAME REQUIRED · CHOOSE ONE NOW':'USERNAME  @'+socialProfile.handle):'LOADING YOUR USERNAME...';
  if(copy) copy.disabled=!ready||firstChoice;
  if(edit){ edit.disabled=!ready; edit.textContent=ready&&socialHasGeneratedUsername()?'CHOOSE USERNAME':'EDIT USERNAME'; }
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
  if(socialHasGeneratedUsername()){
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
  if(claim.signout) claim.signout.addEventListener('click',()=>toggleAuth());
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
