"use strict";

const SOCIAL_PROFILE_TABLE='social_profiles', SOCIAL_FRIEND_TABLE='friendships', SOCIAL_MESSAGE_TABLE='private_messages';
let socialRects=[], socialProfile=null, socialProfiles={}, socialFriends=[], socialMessages=[];
let socialLoading=false, socialStatus='', socialLastFetch=0, socialChannel=null;
let socialBackend={profiles:null,friends:null,messages:null};
let socialFriendPage=0, socialMessagePage=0;
let socialMessageTo=null, msgKind='admin';

function socialHandleKey(value){
  return String(value||'').trim().replace(/^@/,'').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,32);
}
function socialDefaultHandle(){
  const suffix=String(authUser&&authUser.id||'guest').replace(/-/g,'').slice(0,20).toLowerCase();
  return ('op_'+suffix).slice(0,32);
}
function socialSafeDisplayName(){
  const meta=authUser&&authUser.user_metadata||{};
  return String(meta.full_name||meta.name||socialProfile&&socialProfile.handle||'operator').slice(0,48);
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
  socialDropRealtime(); socialProfile=null; socialProfiles={}; socialFriends=[]; socialMessages=[];
  socialBackend={profiles:null,friends:null,messages:null}; socialLoading=false; socialLastFetch=0;
  socialFriendPage=0; socialMessagePage=0;
  socialStatus=message||'SIGN IN FOR FRIENDS + PRIVATE MESSAGES';
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
  return {handle:String(p.handle||'operator'),display:String(p.display_name||p.handle||'operator')};
}
function socialMergeRows(a,b){
  const byId=new Map(); for(const row of [...(a||[]),...(b||[])]) if(row&&row.id!=null) byId.set(String(row.id),row);
  return [...byId.values()];
}
async function fetchSocial(force=false){
  if(!authUser){ resetSocialState(); return false; }
  if(!sb||typeof navigator!=='undefined'&&navigator.onLine===false){ socialStatus='SOCIAL IS OFFLINE · PARTY ALSO NEEDS A CONNECTION'; return false; }
  if(socialLoading||(!force&&Date.now()-socialLastFetch<2500)) return false;
  socialLoading=true; socialStatus='SYNCING SOCIAL...';
  try{
    let profileResult=await sb.from(SOCIAL_PROFILE_TABLE).select('user_id,handle,handle_key,display_name,updated_at').eq('user_id',authUser.id).maybeSingle();
    if(profileResult.error){ socialBackend.profiles=false; throw profileResult.error; }
    socialBackend.profiles=true;
    if(!profileResult.data){
      const handle=socialDefaultHandle();
      const made=await sb.from(SOCIAL_PROFILE_TABLE).insert({user_id:authUser.id,handle,handle_key:handle,display_name:socialSafeDisplayName()});
      if(made&&made.error){ socialBackend.profiles=false; throw made.error; }
      profileResult=await sb.from(SOCIAL_PROFILE_TABLE).select('user_id,handle,handle_key,display_name,updated_at').eq('user_id',authUser.id).maybeSingle();
      if(profileResult.error||!profileResult.data) throw profileResult.error||new Error('Social profile could not be created.');
    }
    socialProfile=profileResult.data; socialProfiles={[String(authUser.id)]:socialProfile};

    const fr=await sb.from(SOCIAL_FRIEND_TABLE).select('id,requester_id,addressee_id,status,blocked_by,created_at,updated_at').order('updated_at',{ascending:false}).limit(60);
    if(fr.error){ socialBackend.friends=false; throw fr.error; }
    socialBackend.friends=true; socialFriends=fr.data||[];

    const sent=await sb.from(SOCIAL_MESSAGE_TABLE).select('id,sender_id,recipient_id,body,read_at,created_at').eq('sender_id',authUser.id).order('created_at',{ascending:false}).limit(40);
    if(sent.error){ socialBackend.messages=false; throw sent.error; }
    const received=await sb.from(SOCIAL_MESSAGE_TABLE).select('id,sender_id,recipient_id,body,read_at,created_at').eq('recipient_id',authUser.id).order('created_at',{ascending:false}).limit(40);
    if(received.error){ socialBackend.messages=false; throw received.error; }
    socialBackend.messages=true;
    socialMessages=socialMergeRows(sent.data,received.data).sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0)).slice(0,60);

    const ids=new Set([String(authUser.id)]);
    for(const row of socialFriends) ids.add(socialFriendOther(row));
    for(const row of socialMessages){ ids.add(String(row.sender_id||'')); ids.add(String(row.recipient_id||'')); }
    const wanted=[...ids].filter(Boolean);
    if(wanted.length){
      const people=await sb.from(SOCIAL_PROFILE_TABLE).select('user_id,handle,handle_key,display_name').in('user_id',wanted);
      if(!people.error) for(const p of people.data||[]) socialProfiles[String(p.user_id)]=p;
    }
    socialStatus='SOCIAL SYNCED · PRIVATE MESSAGES ARE FRIENDS-ONLY'; socialLastFetch=Date.now();
    setupSocialRealtime();
    const unread=socialMessages.some(m=>String(m.recipient_id)===String(authUser.id)&&!m.read_at);
    if(unread){
      try{ await sb.from(SOCIAL_MESSAGE_TABLE).update({read_at:new Date().toISOString()}).eq('recipient_id',authUser.id).is('read_at',null); }catch(e){}
      for(const m of socialMessages) if(String(m.recipient_id)===String(authUser.id)&&!m.read_at) m.read_at=new Date().toISOString();
    }
    return true;
  }catch(error){
    console.warn('social sync failed',error);
    if(socialSetupMissing(error)) socialStatus=socialSetupStatus();
    else socialStatus='SOCIAL COULD NOT SYNC · CHECK YOUR CONNECTION AND TRY AGAIN';
    socialDropRealtime(); return false;
  }finally{ socialLoading=false; }
}
function socialPromptAddFriend(){
  if(!authUser){ toggleAuth(); return; }
  openForm({title:'ADD FRIEND',hint:'Enter their Outpost handle. Email addresses are never exposed here.',saveLabel:'SEND REQUEST',
    fields:[{id:'handle',label:'HANDLE',type:'text',placeholder:'op_...'}],onSave:v=>socialSendFriendRequest(v.handle)});
}
async function socialSendFriendRequest(value){
  const key=socialHandleKey(value);
  if(key.length<3){ formError('enter a valid handle (3–32 letters, numbers, or _)'); return false; }
  if(!sb||!authUser){ formError('sign in and reconnect first'); return false; }
  try{
    const found=await sb.from(SOCIAL_PROFILE_TABLE).select('user_id,handle,display_name').eq('handle_key',key).maybeSingle();
    if(found.error) throw found.error;
    if(!found.data){ formError('no player has that handle'); return false; }
    if(String(found.data.user_id)===String(authUser.id)){ formError('that is your own handle'); return false; }
    if(socialFriendshipWith(found.data.user_id)){ formError('a friend request or friendship already exists'); return false; }
    const sent=await sb.from(SOCIAL_FRIEND_TABLE).insert({requester_id:authUser.id,addressee_id:found.data.user_id,status:'pending'});
    if(sent&&sent.error) throw sent.error;
    closeForm(); socialStatus='FRIEND REQUEST SENT TO @'+found.data.handle; await fetchSocial(true); sfx('swap'); return true;
  }catch(error){ formError(socialSetupMissing(error)?socialSetupStatus():'could not send — the request may already exist'); return false; }
}
function socialPromptEditHandle(){
  if(!authUser){ toggleAuth(); return; }
  openForm({title:'YOUR SOCIAL HANDLE',hint:'Friends use this handle to find you. Email stays private.',saveLabel:'SAVE HANDLE',
    fields:[{id:'handle',label:'HANDLE',type:'text',value:socialProfile&&socialProfile.handle||socialDefaultHandle()}],onSave:v=>socialUpdateHandle(v.handle)});
}
async function socialUpdateHandle(value){
  const key=socialHandleKey(value);
  if(key.length<3){ formError('use 3–32 letters, numbers, or _'); return false; }
  try{
    const result=await sb.from(SOCIAL_PROFILE_TABLE).update({handle:key,handle_key:key,display_name:socialSafeDisplayName()}).eq('user_id',authUser.id);
    if(result&&result.error) throw result.error;
    closeForm(); await fetchSocial(true); socialStatus='YOUR HANDLE IS NOW @'+key; sfx('swap'); return true;
  }catch(error){ formError(socialSetupMissing(error)?socialSetupStatus():'that handle is unavailable'); return false; }
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
  openForm({title:'NEW PRIVATE MESSAGE',hint:'Enter an accepted friend\'s handle.',saveLabel:'WRITE MESSAGE',
    fields:[{id:'handle',label:'FRIEND HANDLE',type:'text',placeholder:'op_...'}],onSave:v=>{
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
