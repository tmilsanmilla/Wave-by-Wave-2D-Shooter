"use strict";

/* ---------------- public party lobby: up to four, no sign-in required ----------------
   The lobby is ephemeral and casual. Supabase Presence supplies liveness;
   the elected host owns the four-seat roster and versioned assignment plan. */
function partyServiceAvailable(){ return !!(sb&&navigator.onLine!==false&&typeof sb.channel==='function'); }
function partyCleanName(v){ return String(v||'').replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,32); }
function partySessionIdentity(chosenName){
  let sid='';
  try{ sid=sessionStorage.getItem('oz_party_session_v1')||''; }catch(e){}
  if(!/^[A-Za-z0-9_-]{8,40}$/.test(sid)){
    const a=new Uint32Array(3);
    if(globalThis.crypto&&crypto.getRandomValues) crypto.getRandomValues(a); else for(let i=0;i<a.length;i++) a[i]=(Math.random()*0xffffffff)>>>0;
    sid=Array.from(a,n=>n.toString(36)).join('').slice(0,20);
    try{ sessionStorage.setItem('oz_party_session_v1',sid); }catch(e){}
  }
  // Keep the Presence key per-tab even for signed-in accounts, so opening a
  // second local player does not silently collapse two party seats into one.
  const id=(authUser?('user:'+authUser.id+':'+sid):('guest:'+sid)).slice(0,80);
  const profile=typeof socialProfile!=='undefined'&&socialProfile;
  let fallback=authUser?partyCleanName(profile&&profile.handle):('GUEST-'+sid.slice(-4).toUpperCase());
  // Signed-in players always use their canonical Outpost username. Only
  // guests may choose a temporary Party alias.
  let name=authUser
    ? (partyCleanName(fallback)||'OPERATOR')
    : (partyCleanName(chosenName)||partyCleanName(fallback)||'OPERATOR');
  try{ sessionStorage.setItem('oz_party_name_v1',name); }catch(e){}
  return {id,name,joined:Date.now(),order:1,ready:false,team:''};
}
function partyDefaultName(){
  if(authUser){
    const profile=typeof socialProfile!=='undefined'&&socialProfile;
    return partyCleanName(profile&&profile.handle);
  }
  try{ return partyCleanName(sessionStorage.getItem('oz_party_name_v1')); }catch(e){ return ''; }
}
function partyRefreshUsername(){
  const username=partyDefaultName();
  if(!authUser||!username||!party||!party.accepted||!party.self) return false;
  party.self.name=username;
  const mine=partyMember(party.self.id); if(mine) mine.name=username;
  try{
    const tracked=party.channel&&party.channel.track({id:party.self.id,name:username,joined:party.self.joined});
    if(tracked&&typeof tracked.catch==='function') tracked.catch(()=>{});
  }catch(e){}
  // Do not alter Party lobby state in the middle of the shared CPU session.
  // Presence still carries the new username; the next lobby state will too.
  if(typeof partyCpuSessionOpen==='function'&&partyCpuSessionOpen()) return true;
  if(partyIsHost()) partyHostCommit('Username updated to @'+username+'.');
  else partySend('identity_update',{name:username});
  return true;
}
function partyPresence(ch){ return arenaPresenceList(ch).map(m=>({id:String(m.id||''),name:partyCleanName(m.name),joined:+m.joined||0})); }
function partyIsHost(){ return !!(party.accepted&&party.self&&party.hostId===party.self.id); }
function partyMember(id){ return party.members.find(m=>m.id===id); }
function partyRequirePlayers(min=PARTY_MIN_PLAYERS){
  if(!party||!party.accepted||party.members.length>=min) return true;
  const message='YOU NEED AT LEAST '+min+' PLAYERS IN THE PARTY TO DO THAT';
  party.status=message; modeBoardNotice=message; modeBoardNoticeT=performance.now()+3000;
  arena.status=message; sfx('dry'); return false;
}
function partyModeLabel(mode){ return mode==='endless'?'ENDLESS ROOMS':mode==='1v1'?'1v1 MATCH SETS':mode==='1v1v1'?'1v1v1 MATCH':mode==='2v2'?'2v2 MATCH':'PARTY PLAN'; }
function partySend(event,payload){
  if(!party.channel||!party.self) return;
  // Sender metadata always comes from this tab. Payload fields cannot replace it.
  const body=Object.assign({},payload||{},{from:party.self.id,code:party.code});
  try{ party.channel.send({type:'broadcast',event,payload:body}); }catch(e){}
}
function partyDropChannel(ch){
  if(!ch||!sb) return;
  try{ ch.untrack(); }catch(e){}
  try{ sb.removeChannel(ch); }catch(e){}
}
function partyMemberCopy(m){
  return {id:String(m.id||'').slice(0,80),name:partyCleanName(m.name)||'OPERATOR',joined:+m.joined||0,
          order:Math.max(1,Math.floor(+m.order||1)),ready:!!m.ready,team:String(m.team||'').slice(0,8)};
}
function partyCleanChat(v){
  return String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,PARTY_CHAT_MAX);
}
function partyAcceptChat(raw){
  if(!raw) return false;
  const id=String(raw.id||'').replace(/[^A-Za-z0-9:_-]/g,'').slice(0,80);
  const authorId=String(raw.authorId||'').slice(0,80), author=partyMember(authorId), text=partyCleanChat(raw.text);
  if(!id||!author||!text||party.chatSeen.has(id)) return false;
  if(party.chatScroll>0) party.chatScroll++;
  party.chatSeen.add(id); party.chatSeenOrder.push(id);
  while(party.chatSeenOrder.length>PARTY_CHAT_KEEP*4){ party.chatSeen.delete(party.chatSeenOrder.shift()); }
  party.chat.push({id,authorId,author:author.name,text,at:Math.max(0,Math.floor(+raw.at||Date.now()))});
  if(party.chat.length>PARTY_CHAT_KEEP) party.chat.splice(0,party.chat.length-PARTY_CHAT_KEEP);
  party.chatScroll=Math.min(party.chatScroll,Math.max(0,party.chat.length-Math.max(1,party.chatPageSize)));
  return true;
}
function partyHostRelayChat(authorId,value){
  if(!partyIsHost()||!party.chatEnabled||party.kickedIds.has(authorId)) return false;
  const author=partyMember(authorId), text=partyCleanChat(value), clock=Date.now();
  if(!author||!text||clock-(party.chatRate[authorId]||0)<PARTY_CHAT_RATE_MS) return false;
  party.chatRate[authorId]=clock;
  const message={id:party.hostEpoch+':'+(++party.chatSeq)+':'+clock,authorId,text,at:clock};
  if(!partyAcceptChat(message)) return false;
  partySend('chat_message',{hostEpoch:party.hostEpoch,message});
  return true;
}
function partySendChat(value){
  if(!party.accepted||!party.self||!party.chatEnabled) return false;
  const text=partyCleanChat(value), clock=Date.now();
  if(!text||clock-party.lastChatSend<PARTY_CHAT_RATE_MS) return false;
  party.lastChatSend=clock;
  if(partyIsHost()) return partyHostRelayChat(party.self.id,text);
  partySend('chat_request',{text}); return true;
}
function partyPromptChat(){
  if(!party.chatEnabled){ party.status='Party chat is disabled by the host.'; sfx('dry'); return; }
  if(party.chatComposing||formOpen) return;
  party.chatComposing=true;
  openForm({title:'PARTY CHAT',hint:'Party-only message \u00b7 maximum '+PARTY_CHAT_MAX+' characters.',saveLabel:'SEND',
    fields:[{id:'message',label:'MESSAGE',type:'text',value:'',placeholder:'TYPE A MESSAGE'}],
    onCancel:()=>{ party.chatComposing=false; },
    onSave:v=>{ const text=partyCleanChat(v.message); if(!text){ formError('Enter a message.'); return; }
      if(!partySendChat(text)){ formError(party.chatEnabled?'Please wait a moment before sending again.':'Party chat is disabled.'); return; }
      party.chatComposing=false; closeForm(); sfx('pickup'); }});
  const input=$('ff_message'); if(input) input.maxLength=PARTY_CHAT_MAX;
}
function partyToggleChat(){
  if(!partyIsHost()) return false;
  party.chatEnabled=!party.chatEnabled;
  partyHostCommit(party.chatEnabled?'Party chat enabled.':'Party chat disabled by the host.'); sfx('swap'); return true;
}
function partyKickMember(id){
  id=String(id||'');
  if(!partyIsHost()||!id||id===party.self.id||!partyMember(id)) return false;
  const kicked=partyMember(id); party.kickedIds.add(id);
  partySend('kick',{to:id,hostEpoch:party.hostEpoch,reason:'REMOVED BY PARTY HOST'});
  party.members=party.members.filter(m=>m.id!==id); delete party.missingSince[id]; delete party.chatRate[id];
  partySetDefaultPairings(); partyHostCommit(kicked.name+' was removed from the party.'); sfx('dry'); return true;
}
function partyChatScroll(direction){
  const max=Math.max(0,party.chat.length-Math.max(1,party.chatPageSize));
  party.chatScroll=clamp(party.chatScroll+(direction<0?Math.max(1,party.chatPageSize):(-Math.max(1,party.chatPageSize))),0,max);
  sfx('swap');
}
function partySetDefaultPairings(){
  const ms=party.members.slice().sort((a,b)=>(a.order-b.order)||a.id.localeCompare(b.id)), n=ms.length;
  if(party.mode==='endless'){
    const rooms=Math.max(1,Math.ceil(n/3)), base=Math.floor(n/rooms), extra=n%rooms;
    let at=0;
    for(let r=1;r<=rooms;r++) for(let j=0;j<base+(r<=extra?1:0);j++) if(ms[at]) ms[at++].team='R'+r;
  } else if(party.mode==='1v1'){
    ms.forEach((m,i)=>m.team='S'+(i+1));
  } else if(party.mode==='1v1v1'){
    ms.forEach((m,i)=>m.team=i<3?'M':'W');
  } else if(party.mode==='2v2'){
    ms.forEach((m,i)=>m.team=String.fromCharCode(65+Math.floor(i/2)));
  } else {
    party.mode='1v1'; ms.forEach((m,i)=>m.team='S'+(i+1));
  }
}
function partyBuildPlan(){
  const ms=party.members.slice().sort((a,b)=>(a.order-b.order)||a.id.localeCompare(b.id));
  const name=m=>m?m.name:'OPEN SLOT', rows=[];
  if(party.mode==='endless'){
    const groups={}; for(const m of ms) (groups[m.team]||(groups[m.team]=[])).push(m);
    for(const key of Object.keys(groups).sort()) rows.push({title:'ROOM '+key.slice(1)+'  \u00b7  '+groups[key].length+'/3',body:groups[key].map(name).join(' + '),ready:groups[key].length<=3});
  } else if(party.mode==='1v1'){
    const seeded=ms.slice().sort((a,b)=>(parseInt(a.team.slice(1))||99)-(parseInt(b.team.slice(1))||99));
    if(seeded.length<2) rows.push({title:'NEED 2+ PLAYERS',body:'Invite another operator.',ready:false});
    else {
      let match=1, i=0;
      for(;i+1<seeded.length;i+=2) rows.push({title:(seeded.length===2?'1v1 MATCH':'1v1 SET '+match++),body:name(seeded[i])+'  VS  '+name(seeded[i+1]),ready:true});
      if(i<seeded.length) rows.push({title:'UNPAIRED',body:name(seeded[i])+' waits',ready:true});
    }
  } else if(party.mode==='1v1v1'){
    const active=ms.filter(m=>m.team==='M'), waiting=ms.filter(m=>m.team!=='M');
    rows.push({title:active.length===3?'1v1v1 MATCH':('1v1v1  \u00b7  '+active.length+'/3'),
      body:active.length?active.map(name).join('  VS  '):'Assign three operators to the match.',ready:active.length===3});
    if(waiting.length) rows.push({title:'RESERVE',body:waiting.map(name).join(' + '),ready:true});
  } else if(party.mode==='2v2'){
    const cap=2, teams={};
    for(const m of ms) (teams[m.team]||(teams[m.team]=[])).push(m);
    const full=Object.keys(teams).filter(k=>teams[k].length===cap).sort();
    const incomplete=Object.keys(teams).filter(k=>teams[k].length!==cap).sort();
    for(const k of incomplete) rows.push({title:'TEAM '+k+'  \u00b7  '+teams[k].length+'/'+cap,body:teams[k].map(name).join(' + ')||'OPEN',ready:false});
    if(full.length<2) rows.push({title:'NEED TWO FULL TEAMS',body:'Move players to fill both teams.',ready:false});
    else rows.push({title:'2v2 MATCH',body:'TEAM '+full[0]+'  VS  TEAM '+full[1],ready:true});
  }
  return rows.slice(0,6);
}
function partySnapshot(){
  return {from:party.self.id,code:party.code,hostId:party.hostId,hostEpoch:party.hostEpoch,revision:party.revision,
          mode:party.mode,locked:false,chatEnabled:!!party.chatEnabled,
          kickedIds:Array.from(party.kickedIds),members:party.members.map(partyMemberCopy),plan:party.plan};
}
function partyHostCommit(message){
  if(!partyIsHost()) return;
  party.members=party.members.slice(0,PARTY_MAX).map(partyMemberCopy).sort((a,b)=>(a.order-b.order)||a.id.localeCompare(b.id));
  party.members.forEach((m,i)=>m.order=i+1);
  // The compact lobby has no lock step. Pairing edits are always live and
  // synchronized by the host, so an older saved/sent lock cannot strand it.
  party.locked=false;
  if(party.members.length<PARTY_MIN_PLAYERS){
    party.members.forEach(m=>m.ready=false);
  }
  party.revision++; party.plan=partyBuildPlan(); party.phase='lobby';
  if(message) party.status=message;
  partySend('party_state',partySnapshot()); party.nextStateSend=Date.now()+1000;
}
function partyApplyState(p,force){
  if(!p||p.code!==party.code||!Array.isArray(p.members)||p.members.length>PARTY_MAX||!party.self) return false;
  const hostId=String(p.hostId||''), epoch=Math.max(0,Math.floor(+p.hostEpoch||0)), rev=Math.max(0,Math.floor(+p.revision||0));
  if(!force){
    if(epoch<party.hostEpoch) return false;
    if(epoch===party.hostEpoch&&party.hostId&&hostId!==party.hostId) return false;
    if(epoch===party.hostEpoch&&rev<=party.revision) return false;
  }
  const members=p.members.map(partyMemberCopy);
  if(!hostId||String(p.from||'')!==hostId||!members.some(m=>m.id===hostId)) return false;
  if(!members.some(m=>m.id===party.self.id)){
    // A newer authoritative roster is also the fallback if a targeted kick
    // broadcast was dropped. Never keep a removed player in the lobby UI.
    if(party.accepted&&!force) leaveParty('YOU WERE REMOVED FROM THE PARTY.',false);
    return false;
  }
  party.hostId=hostId; party.hostEpoch=epoch; party.revision=rev; party.members=members;
  const validMode=['endless','1v1','1v1v1','2v2'].includes(p.mode);
  party.mode=validMode?p.mode:'endless'; party.locked=false; party.chatEnabled=p.chatEnabled!==false;
  party.kickedIds=new Set((Array.isArray(p.kickedIds)?p.kickedIds:[]).map(id=>String(id||'').slice(0,80)).filter(Boolean));
  if(!validMode) partySetDefaultPairings();
  party.plan=validMode&&Array.isArray(p.plan)?p.plan.slice(0,6).map(r=>({title:String(r.title||'').slice(0,42),body:String(r.body||'').slice(0,110),ready:!!r.ready})):partyBuildPlan();
  party.accepted=true; party.phase='lobby'; party.status='Party connected. '+party.members.length+'/'+PARTY_MAX+' players.';
  return true;
}
function partyReceive(event,p){
  if(!p||p.code!==party.code||!party.self) return;
  const from=String(p.from||'');
  if(String(event||'').startsWith('cpu_')){ partyCpuReceive(event,p); return; }
  if(event==='join_request'){
    if(!partyIsHost()||!from||from===party.self.id) return;
    if(party.kickedIds.has(from)){ partySend('join_reject',{to:from,reason:'REMOVED BY PARTY HOST'}); return; }
    if(partyCpuSessionOpen()){ partySend('join_reject',{to:from,reason:'PARTY MATCH IN PROGRESS'}); return; }
    const existing=partyMember(from);
    if(existing){ partySend('join_accept',{to:from,state:partySnapshot()}); return; }
    if(party.members.length>=PARTY_MAX){ partySend('join_reject',{to:from,reason:'PARTY FULL \u00b7 MAX 4'}); return; }
    const nextOrder=party.members.reduce((n,m)=>Math.max(n,m.order||0),0)+1;
    party.members.push({id:from,name:partyCleanName(p.name)||'OPERATOR',joined:+p.joined||Date.now(),order:nextOrder,ready:false,team:''});
    partySetDefaultPairings(); partyHostCommit('A new operator joined.');
    partySend('join_accept',{to:from,state:partySnapshot()}); return;
  }
  if(event==='identity_update'&&partyIsHost()){
    const member=partyMember(from), username=partyCleanName(p.name);
    if(member&&username&&!(typeof partyCpuSessionOpen==='function'&&partyCpuSessionOpen())){
      member.name=username; partyHostCommit('A player updated their username.');
    }
    return;
  }
  if(event==='join_accept'&&String(p.to||'')===party.self.id&&!party.accepted){
    if(p.state&&from===String(p.state.hostId||'')&&partyApplyState(p.state,true)) partySend('state_request',{to:party.hostId}); return;
  }
  if(event==='join_reject'&&String(p.to||'')===party.self.id&&!party.accepted){ leaveParty(String(p.reason||'Could not join party.'),false); return; }
  if(event==='state_request'&&partyIsHost()&&(!p.to||String(p.to)===party.self.id)){ partySend('party_state',partySnapshot()); return; }
  if(event==='party_state'){
    if(p.from!==String(p.hostId||'')) return;
    partyApplyState(p,false); return;
  }
  if(event==='kick'&&String(p.to||'')===party.self.id&&from===party.hostId&&Math.floor(+p.hostEpoch||0)===party.hostEpoch){
    leaveParty(String(p.reason||'REMOVED BY PARTY HOST'),false); sfx('dry'); return;
  }
  if(event==='chat_request'&&partyIsHost()){
    if(partyMember(from)&&!party.kickedIds.has(from)) partyHostRelayChat(from,p.text);
    return;
  }
  if(event==='chat_message'){
    if(from!==party.hostId||Math.floor(+p.hostEpoch||0)!==party.hostEpoch) return;
    partyAcceptChat(p.message); return;
  }
  if(event==='action_request'&&partyIsHost()){
    if(!partyMember(from)) return;
    if(p.action==='ready'){
      if(!partyRequirePlayers()) return;
      partyMember(from).ready=!!p.value; partyHostCommit(partyMember(from).name+(p.value?' is ready.':' is not ready.'));
    }
    return;
  }
  if(event==='leave'&&partyIsHost()&&partyMember(from)){
    party.members=party.members.filter(m=>m.id!==from); delete party.chatRate[from]; partySetDefaultPairings(); partyHostCommit('An operator left the party.');
  }
}
function partyPresenceSync(ch){
  if(ch!==party.channel||!party.self) return;
  const live=partyPresence(ch), clock=Date.now(); party.liveIds=new Set(live.map(m=>m.id));
  if(party.accepted) party.liveIds.add(party.self.id);
  if(partyIsHost()) partySend('party_state',partySnapshot());
  else if(party.accepted) partySend('state_request',{to:party.hostId});
  for(const m of party.members){
    if(party.liveIds.has(m.id)) delete party.missingSince[m.id];
    else if(!party.missingSince[m.id]) party.missingSince[m.id]=clock;
  }
}
function partyConnect(code,creating,name){
  if(!partyServiceAvailable()){ party=freshParty('PARTIES NEED AN INTERNET CONNECTION.'); selPage='party'; sfx('dry'); return false; }
  leaveParty('',false);
  const self=partySessionIdentity(name), clean=String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
  if(clean.length!==6){ party=freshParty('Enter a full 6-character party code.'); selPage='party'; sfx('dry'); return false; }
  party=freshParty(creating?'Opening party...':'Looking for that party...');
  party.phase='joining'; party.code=clean; party.self=self; party.creating=!!creating; party.joinDeadline=Date.now()+PARTY_JOIN_MS;
  if(creating){ party.accepted=true; party.hostId=self.id; party.hostEpoch=1; party.members=[self]; partySetDefaultPairings(); }
  const ch=sb.channel('oz-party-v1-'+clean,{config:{presence:{key:self.id}}}); party.channel=ch;
  ch.on('presence',{event:'sync'},()=>partyPresenceSync(ch));
  for(const event of ['join_request','join_accept','join_reject','state_request','party_state','identity_update','action_request','kick','chat_request','chat_message','leave',
                       'cpu_prepare','cpu_ready','cpu_cancel','cpu_abort','cpu_round_start','cpu_player_state','cpu_bot_snapshot','cpu_bot_shot','cpu_damage','cpu_hit','cpu_round_result'])
    ch.on('broadcast',{event},msg=>partyReceive(event,msg&&msg.payload));
  ch.subscribe(async st=>{
    if(ch!==party.channel) return;
    if(st==='SUBSCRIBED'){
      try{ await ch.track({id:self.id,name:self.name,joined:self.joined}); }catch(e){}
      if(creating){ party.phase='lobby'; partyHostCommit('Party created. Share code '+clean+'.'); }
      else { party.nextJoinRequest=0; partyTick(Date.now()); }
    } else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'||st==='CLOSED'){
      if(party.channel===ch){
        if(partyCpuSessionOpen()) partyCpuReturnToLobby('Party CPU match ended because the connection was lost.');
        party.status='Party connection lost. Leave and reconnect.';
      }
    }
  });
  selPage='party'; return true;
}
function partyPromptCreate(){
  if(!partyServiceAvailable()){ party.status='PARTIES NEED AN INTERNET CONNECTION.'; sfx('dry'); return; }
  const signedIn=!!authUser, username=partyDefaultName();
  if(signedIn&&!username){ party.status='YOUR USERNAME IS STILL LOADING. TRY AGAIN IN A MOMENT.'; fetchSocial(true); sfx('dry'); return; }
  openForm({title:'CREATE PARTY',hint:signedIn?('You will appear as @'+username+', your Outpost username.'):'No sign-in needed. Choose a temporary guest name.',saveLabel:'CREATE',
    fields:signedIn?[]:[{id:'name',label:'GUEST NAME',type:'text',value:username,placeholder:'OPERATOR'}],
    onSave:v=>{ const name=signedIn?username:partyCleanName(v.name); if(!name){ formError('Enter a guest name.'); return; } closeForm(); partyConnect(randomArenaCode(),true,name); }});
}
function partyPromptJoin(prefill=''){
  if(!partyServiceAvailable()){ party.status='PARTIES NEED AN INTERNET CONNECTION.'; sfx('dry'); return; }
  const initialCode=String(prefill||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
  if(party.accepted&&party.code&&initialCode.length===6&&initialCode===party.code){
    selPage='party'; sfx('swap'); return true;
  }
  const signedIn=!!authUser, username=partyDefaultName();
  if(signedIn&&!username){ party.status='YOUR USERNAME IS STILL LOADING. TRY AGAIN IN A MOMENT.'; fetchSocial(true); sfx('dry'); return; }
  openForm({title:'JOIN PARTY',hint:signedIn?('Enter the code. You will appear as @'+username+'.'):'Enter the code and choose a temporary guest name.',saveLabel:'JOIN',
    fields:[{id:'code',label:'PARTY CODE',type:'text',value:initialCode,placeholder:'ABC123',upper:true}]
      .concat(signedIn?[]:[{id:'name',label:'GUEST NAME',type:'text',value:username,placeholder:'OPERATOR'}]),
    onSave:v=>{ const code=String(v.code||'').replace(/[^A-Z0-9]/g,'').slice(0,6),name=signedIn?username:partyCleanName(v.name);
      if(code.length!==6){ formError('Enter the full 6-character code.'); return; }
      if(!name){ formError('Enter a guest name.'); return; }
      if(party.accepted&&party.code&&code===party.code){ closeForm(); selPage='party'; sfx('swap'); return true; }
      if(party.accepted&&party.code&&code!==party.code){
        const warning='Joining another party will leave your current party. Continue?';
        let confirmed=false;
        try{ confirmed=window.confirm(warning); }catch(error){ try{ confirmed=confirm(warning); }catch(ignore){} }
        if(!confirmed) return false;
      }
      closeForm(); partyConnect(code,false,name); return true; }});
  return true;
}
function partyCopyCode(){
  if(!party.code) return;
  try{ const p=navigator.clipboard&&navigator.clipboard.writeText(party.code);
    if(p&&p.then) p.then(()=>party.status='Party code copied: '+party.code).catch(()=>party.status='Party code: '+party.code);
    else party.status='Party code: '+party.code;
  }catch(e){ party.status='Party code: '+party.code; }
  sfx('pickup');
}
function partySetupPlayerCount(mode){ return mode==='1v1'?2:mode==='1v1v1'?3:mode==='2v2'?4:0; }
function partyModeNotice(message){
  party.status=message; modeBoardNotice=message; modeBoardNoticeT=performance.now()+3000;
  arena.status=message; sfx('dry'); return false;
}
function partyChooseSetupMode(mode){
  const required=partySetupPlayerCount(mode), label=mode==='1v1v1'?'1v1v1':mode==='1v1'?'1v1':mode==='2v2'?'2v2':'';
  if(!required) return partyModeNotice('THAT PARTY SETUP IS NOT AVAILABLE');
  if(!partyIsHost()) return partyModeNotice('ONLY THE PARTY LEADER CAN EDIT PAIRINGS');
  if(!party.accepted||party.members.length!==required) return partyModeNotice(label+' NEEDS EXACTLY '+required+' PARTY PLAYERS');
  if(!partySetMode(mode,label+' PAIRINGS READY \u00b7 GAMEPLAY COMING SOON')) return false;
  selPage='party'; return true;
}
function partySetMode(mode,message){
  if(!partyIsHost()||!['endless','1v1','1v1v1','2v2'].includes(mode)||!partyRequirePlayers()) return false;
  party.mode=mode; party.members.forEach(m=>m.ready=false); partySetDefaultPairings();
  partyHostCommit(message||partyModeLabel(mode)+' selected.'); sfx('swap'); return true;
}
function partyMoveMember(id,dir){
  if(!partyIsHost()||!partyRequirePlayers()) return;
  const m=partyMember(id); if(!m) return;
  const ordered=party.members.slice().sort((a,b)=>(a.order-b.order)||a.id.localeCompare(b.id));
  if(ordered.length<2) return;
  const at=ordered.indexOf(m), to=(at+(dir<0?-1:1)+ordered.length)%ordered.length, other=ordered[to];
  const oldOrder=m.order; m.order=other.order; other.order=oldOrder;
  // Pairing slots are adjacent roster positions. Rebuild the legacy mode/team
  // fields from that edited order so older clients remain wire-compatible.
  partySetDefaultPairings();
  party.members.forEach(x=>x.ready=false); partyHostCommit('Pairings updated.'); sfx('swap');
}
function partyToggleReady(){
  if(!party.accepted||!party.self||!partyRequirePlayers()) return;
  const mine=partyMember(party.self.id); if(!mine) return;
  const value=!mine.ready;
  if(partyIsHost()){ mine.ready=value; partyHostCommit(value?'You are ready.':'You are not ready.'); }
  else partySend('action_request',{action:'ready',value});
  sfx('swap');
}
function partyToggleLock(){
  if(!partyIsHost()||!partyRequirePlayers()) return;
  party.locked=!party.locked; partyHostCommit(party.locked?'Plan locked. Players can mark ready.':'Plan unlocked for changes.'); sfx('swap');
}

/* ---------------- shared team-vs-CPU combat ----------------
   Party 2v2 stays on the existing Party channel and requires exactly two
   humans on Team A. Offline 2v2 has one local human plus an ally CPU. Both
   modes face two authority-simulated Team B CPUs through the neutral core. */
function partyCpuKit(raw){
  const primary=String(raw&&raw.primary||''), secondary=String(raw&&raw.secondary||''), melee=String(raw&&raw.melee||'');
  if(!PRIMARIES.concat(TEMP_PRIMARY).includes(primary)||!SECONDARIES.concat(TEMP_SECONDARY).includes(secondary)||!MELEES.concat(TEMP_MELEE).includes(melee)) return null;
  return {primary,secondary,melee,utility:null};
}
function partyCpuEnvelope(p,hostOnly){
  if(!partyCpuSessionOpen()||!p||Math.floor(+p.matchEpoch||0)!==partyCpuMatch.epoch||Math.floor(+p.hostEpoch||0)!==partyCpuMatch.hostEpoch) return false;
  if(hostOnly&&String(p.from||'')!==partyCpuMatch.hostId) return false;
  return true;
}
function partyCpuHostPrepare(){
  if(!partyIsHost()||!party.channel){ party.status='Only the party host can start 2v2 vs CPUs.'; sfx('dry'); return false; }
  if(!partyRequirePlayers()) return false;
  if(party.members.length!==2){
    const message='THE PARTY IS TOO BIG FOR THIS QUEUE';
    party.status=message; modeBoardNotice=message; modeBoardNoticeT=performance.now()+2800; sfx('dry'); return false;
  }
  if(partyCpuSessionOpen()){ party.status='A Party CPU match is already being prepared.'; sfx('dry'); return false; }
  const members=party.members.slice().sort((a,b)=>(a.order-b.order)||a.id.localeCompare(b.id));
  const p={from:party.self.id,hostId:party.self.id,hostEpoch:party.hostEpoch,matchEpoch:Math.max(Date.now(),partyCpuMatch.epoch+1),
    humanIds:members.map(m=>m.id),humanNames:Object.fromEntries(members.map(m=>[m.id,m.name]))};
  if(!partyCpuApplyPrepare(p)) return false;
  partySend('cpu_prepare',p);
  for(const wait of [350,950]) setTimeout(()=>{
    if(partyCpuSessionOpen()&&partyCpuMatch.epoch===p.matchEpoch&&partyCpuMatch.phase!=='fight') partySend('cpu_prepare',p);
  },wait);
  return true;
}
function partyCpuApplyPrepare(p){
  if(!p||String(p.from||'')!==party.hostId||String(p.hostId||'')!==party.hostId||Math.floor(+p.hostEpoch||0)!==party.hostEpoch) return false;
  const ids=Array.isArray(p.humanIds)?p.humanIds.map(String):[];
  if(ids.length!==2||new Set(ids).size!==ids.length||!party.self||!ids.includes(party.self.id)) return false;
  if(ids.some(id=>!partyMember(id))) return false;
  const epoch=Math.floor(+p.matchEpoch||0); if(!epoch) return false;
  if(partyCpuSessionOpen()&&epoch<partyCpuMatch.epoch) return false;
  if(partyCpuSessionOpen()&&epoch===partyCpuMatch.epoch) return true;
  const available=state==='select'&&!arena.active&&!arena.queueChannel&&!arena.matchChannel&&!formOpen&&['party','modeboard','hub'].includes(selPage);
  if(!available){
    if(party.self.id!==String(p.hostId||'')){
      const unavailable={matchEpoch:epoch,hostEpoch:party.hostEpoch,reason:'A party member is busy in another game or menu.'};
      partySend('cpu_cancel',unavailable);for(const wait of [350,950])setTimeout(()=>{if(party.channel)partySend('cpu_cancel',unavailable);},wait);
    }
    return false;
  }
  const savedLoadout={primary:loadout.primary,secondary:loadout.secondary,melee:loadout.melee,utility:loadout.utility};
  partyCpuMatch=freshPartyCpuMatch();
  partyCpuMatch.savedLoadout=savedLoadout;
  partyCpuMatch.phase='loadout'; partyCpuMatch.epoch=epoch; partyCpuMatch.hostEpoch=party.hostEpoch;
  partyCpuMatch.hostId=party.hostId; partyCpuMatch.humanIds=ids;
  for(const id of ids){ const member=partyMember(id); partyCpuMatch.humanNames[id]=partyCleanName(p.humanNames&&p.humanNames[id])||(member&&member.name)||'OPERATOR'; }
  pendingGameMode=PARTY_CPU_MODE; loadoutBackPage='party'; modeBoardMode=null;
  restoreLastLoadoutForMode(PARTY_CPU_MODE); selPage='loadout';
  party.status='Choose three weapons for 2v2 vs CPUs. Utilities and rewards are disabled.'; sfx('swap');
  return true;
}
function partyCpuSubmitLoadout(){
  if(!partyCpuSessionOpen()||!party.self||!partyCpuMatch.humanIds.includes(party.self.id)) return false;
  if(!partyRequirePlayers()) { partyCpuAbort('YOU NEED AT LEAST 2 PLAYERS IN THE PARTY TO DO THAT',true); return false; }
  if(party.members.length!==2){ partyCpuAbort('THE PARTY IS TOO BIG FOR THIS QUEUE',true); sfx('dry'); return false; }
  const kit=partyCpuKit(loadout); if(!kit){ pracNeedMsgT=now+1600; sfx('dry'); return false; }
  partyCpuMatch.localLoadout=kit; partyCpuMatch.loadouts[party.self.id]=kit; partyCpuMatch.ready[party.self.id]=true;
  partyCpuMatch.phase='waiting'; party.status='Loadout ready. Waiting for the rest of the party...';
  const readyPacket={matchEpoch:partyCpuMatch.epoch,hostEpoch:partyCpuMatch.hostEpoch,loadout:kit};
  partySend('cpu_ready',readyPacket);
  for(const wait of [350,950]) setTimeout(()=>{
    if(partyCpuSessionOpen()&&partyCpuMatch.epoch===readyPacket.matchEpoch&&partyCpuMatch.ready[party.self.id]) partySend('cpu_ready',readyPacket);
  },wait);
  selPage='party'; pendingGameMode=PARTY_CPU_MODE; sfx('swap');
  partyCpuMaybeStart(); return true;
}
function partyCpuMaybeStart(){
  if(!partyCpuIsHost()||partyCpuMatch.humanIds.length!==2||!partyRequirePlayers()||!partyCpuMatch.humanIds.every(id=>partyCpuMatch.ready[id]&&partyCpuKit(partyCpuMatch.loadouts[id]))) return false;
  if(partyCpuMatch.round>0||partyCpuMatch.phase==='countdown'||partyCpuMatch.phase==='fight') return false;
  if(state!=='select'||selPage!=='party'){ partyCpuAbort('Party CPU match setup was cancelled because the host left the Party menu.',true); return false; }
  partyCpuHostStartRound(); return true;
}
function partyCpuMakeBot(id,team,x,y,startAt){
  const w=WEAPONS.ar;
  const localMatch=isLocalCpu2v2(),difficulty=localMatch?(team==='A'?0:clamp(Math.floor(+partyCpuMatch.botDifficulty||0),0,4)):2,
    modelId=localMatch?(partyCpuMatch.botModelId||(typeof activeBotModelId==='string'?activeBotModelId:'apex-v5')):'',
    tuning=localMatch&&typeof arenaBotTuning==='function'?arenaBotTuning(difficulty,modelId):{reactionMs:450};
  const seed=typeof cpuAiSeed==='function'?cpuAiSeed(partyCpuMatch.aiSeed,partyCpuMatch.round,arena&&arena.mapId,id):1;
  const bot={id,team,name:team==='A'?'ALLY CPU':'',r:15,hp:PARTY_CPU_HP,x,y,tx:x,ty:y,angle:team==='A'?0:Math.PI,cur:'ar',
    mag:w.mag,reloadEnd:0,lastShot:0,flash:0,hitT:0,thinkAt:startAt,aimNoiseAt:startAt,aimNoise:0,
    strafe:1,strafeUntil:startAt,reactionAt:startAt+tuning.reactionMs,moveX:0,moveY:0,lastThinkX:x,lastThinkY:y,
    botDifficulty:difficulty,botModelId:modelId,
    aiSeed:seed,aiRng:seed,aiTracks:{},aiRole:team==='A'?'guardian':(String(id).endsWith('1')?'anchor':'flanker'),
    aiTactic:'hold',aiTacticUntil:startAt,targetId:'',targetLockUntil:0,targetThinkAt:startAt,tntThinkAt:startAt,tntPlan:null,
    aiStuckTicks:0,aiStuckUntil:0,aiFailedMoveX:0,aiFailedMoveY:0,aiNavPath:[],aiNavUntil:0,aiUsingPortal:false,
    aiTrainingTntAvoided:new Set(),aiTrainingWallAt:0,
    lastAttackerId:'',underFireUntil:0};
  bot.strafe=typeof cpuAiNext==='function'&&cpuAiNext(bot)<.5?-1:1;
  bot.strafeUntil=startAt+(typeof cpuAiRange==='function'?cpuAiRange(bot,700,1300):1000);
  return bot;
}
// Shared four-actor simulation setup. Party mode supplies wall-clock values
// and transport-owned human IDs; Offline 2v2 supplies the pausable game clock
// and one local human. No channel or packet work is allowed in this core.
function cpuTeamBeginRound(options){
  const round=Math.max(1,Math.floor(+options.round||1));
  const clock=Number.isFinite(+options.clock)?+options.clock:cpuTeamClock();
  const startDelay=clamp(+options.startDelay||0,0,10000);
  const selectedMap=typeof arenaMapValid==='function'&&arenaMapValid(options.mapId)?String(options.mapId):'arena';
  const localId=cpuTeamLocalId(); if(!localId) return false;
  const kits={};
  for(const id of partyCpuMatch.humanIds){ const kit=partyCpuKit(options.kits&&options.kits[id]); if(!kit)return false;kits[id]=kit; }
  const mine=kits[localId]; if(!mine)return false;
  resetHeldGameplayInput();
  partyCpuMatch.loadouts=kits;partyCpuMatch.localLoadout=mine;
  loadout={primary:mine.primary,secondary:mine.secondary,melee:mine.melee,utility:null};
  startGame();
  practiceMode='arena';arena=freshArena(options.status||'2v2 vs CPUs');arena.mode=options.mode;arena.active=true;arena.phase='countdown';
  arena.botDifficulty=options.mode==='ai2v2'?clamp(Math.floor(+partyCpuMatch.botDifficulty||0),0,4):2;
  arena.botModelId=options.mode==='ai2v2'?partyCpuMatch.botModelId:'';
  arena.matchEpoch=partyCpuMatch.epoch;arena.mapId=selectedMap;arena.mapVotePhase=options.mode==='ai2v2'?'locked':'idle';
  partyCpuMatch.mapId=selectedMap;
  arena.round=round;arena.roundStartAt=clock+startDelay;arena.roundEndAt=arena.roundStartAt+PARTY_CPU_ROUND_MS;
  partyCpuMatch.round=round;partyCpuMatch.scores={allies:Math.max(0,Math.floor(+options.scores?.allies||0)),cpus:Math.max(0,Math.floor(+options.scores?.cpus||0))};
  partyCpuMatch.roundStartAt=arena.roundStartAt;partyCpuMatch.roundEndAt=arena.roundEndAt;partyCpuMatch.nextRoundAt=0;
  partyCpuMatch.roundResolved=false;partyCpuMatch.phase='countdown';partyCpuMatch.seenHits=new Set();partyCpuMatch.seenShots=new Set();
  partyCpuMatch.shots=[];partyCpuMatch.humans={};partyCpuMatch.bots=[];
  partyCpuMatch.simAt=clock;partyCpuMatch.simClock=clock;partyCpuMatch.simAcc=0;
  partyCpuMatch.threat={A:{},B:{}};
  partyCpuMatch.aiSeed=typeof cpuAiSeed==='function'?cpuAiSeed(partyCpuMatch.epoch,round,selectedMap,'cpu-team'):1;
  perks.maxhp=PARTY_CPU_HP;player.hp=PARTY_CPU_HP;player.hurtCd=0;player.hurtFlash=0;
  bullets=[];ebullets=[];enemies=[];particles=[];pickups=[];damageNumbers=[];grenades=[];pearls=[];balls=[];flames=[];freezeFx=[];
  abilityCD={};quickReadyT=0;sawFuel=100;sawLock=false;daggersOut=null;comboStep=0;comboNextT=0;
  fanShots=0;fanNextT=0;fanBurstUntil=0;parryUntil=0;parrySeq=0;teraHitCharge=15;fistFlurryUntil=0;sawChargeUntil=0;
  player.cur=mine.primary;player.reloadEnd=0;player.equipEnd=now+600;player.bloom=0;player.lastShot=0;
  for(const k of [mine.primary,mine.secondary,mine.melee]){
    player.mags[k]=magSize(k);player.reserve[k]=WEAPONS[k].melee?Infinity:magSize(k)*5;
  }
  if(typeof arenaResetMapRuntime==='function')arenaResetMapRuntime();
  const cx=WORLD.w/2,cy=WORLD.h/2,count=partyCpuMatch.humanIds.length,
    mapped=options.mode==='ai2v2'&&typeof isOfflineCpuTeamMapArena==='function'&&isOfflineCpuTeamMapArena(),
    mapSpawns=mapped&&typeof cpuTeamArenaSpawns==='function'?cpuTeamArenaSpawns():null;
  partyCpuMatch.humanIds.forEach((id,i)=>{
    const spawn=mapSpawns?mapSpawns.allies[Math.min(i,1)]:null,
      x=spawn?spawn.x:cx-500,y=spawn?spawn.y:cy+(count===1?0:(i===0?-125:125)),kit=kits[id];
    partyCpuMatch.humans[id]={id,name:partyCpuMatch.humanNames[id]||'OPERATOR',team:'A',r:15,hp:PARTY_CPU_HP,x,y,tx:x,ty:y,angle:0,cur:kit.primary,
      parrySeq:0,parryUsedSeq:-1,parryUntil:0,parryReadyAt:0};
    if(id===localId){player.x=x;player.y=y;cam.x=x;cam.y=y;}
  });
  const allySpawn=mapSpawns?mapSpawns.allies[1]:{x:cx-500,y:cy+150},
    redOne=mapSpawns?mapSpawns.cpus[0]:{x:cx+500,y:cy-145},redTwo=mapSpawns?mapSpawns.cpus[1]:{x:cx+500,y:cy+145};
  if(count===1)partyCpuMatch.bots.push(partyCpuMakeBot('cpu-ally','A',allySpawn.x,allySpawn.y,arena.roundStartAt));
  partyCpuMatch.bots.push(partyCpuMakeBot('cpu-red-1','B',redOne.x,redOne.y,arena.roundStartAt));
  partyCpuMatch.bots.push(partyCpuMakeBot('cpu-red-2','B',redTwo.x,redTwo.y,arena.roundStartAt));
  if(mapped){const bounds=activeArenaBounds();cam.x=(bounds.left+bounds.right)/2;cam.y=(bounds.top+bounds.bottom)/2;zoom=duelArenaFitZoom();}
  state='play';menuOpen=false;aiming=false;rmbAim=false;pendingGameMode=options.pendingMode||pendingGameMode;
  waveMsg='ROUND '+round+' — GET READY';waveMsgT=now+2800;sfx('wave');return true;
}
function partyCpuHostStartRound(){
  if(!partyCpuIsHost()) return false;
  const loadouts={};
  for(const id of partyCpuMatch.humanIds){ const kit=partyCpuKit(partyCpuMatch.loadouts[id]); if(!kit) return false; loadouts[id]=kit; }
  // The authority creates one privacy-minimized event for the whole first-to-5.
  // Guests never mirror it. The fixed unranked Party profile is tagged as the
  // full Apex V5 tactical behavior at the agreed difficulty-2 execution slot.
  if(!partyCpuMatch.aiTrainingEventId&&typeof initializeAiTrainingMatch==='function'){
    partyCpuMatch.botLadderMode='party2v2';partyCpuMatch.botDifficulty=2;partyCpuMatch.botModelId='apex-v5';
    initializeAiTrainingMatch(partyCpuMatch);
  }
  const p={from:party.self.id,matchEpoch:partyCpuMatch.epoch,hostEpoch:partyCpuMatch.hostEpoch,round:partyCpuMatch.round+1,
    startDelay:3000,scores:{allies:partyCpuMatch.scores.allies||0,cpus:partyCpuMatch.scores.cpus||0},loadouts};
  if(!partyCpuApplyRoundStart(p)) return false;
  partySend('cpu_round_start',p);
  for(const wait of [350,950]) setTimeout(()=>{
    if(party.channel&&partyCpuSessionOpen()&&partyCpuMatch.epoch===p.matchEpoch&&partyCpuMatch.round===p.round) partySend('cpu_round_start',p);
  },wait);
  return true;
}
function partyCpuApplyRoundStart(p){
  if(!partyCpuEnvelope(p,true)) return false;
  const round=Math.max(0,Math.floor(+p.round||0)); if(round<=partyCpuMatch.round) return false;
  const continuing=isPartyCpuMatch()&&state==='play'&&partyCpuMatch.phase==='round_end';
  if(!continuing&&(state!=='select'||selPage!=='party')){
    if(!partyCpuIsHost())partySend('cpu_cancel',{matchEpoch:partyCpuMatch.epoch,hostEpoch:partyCpuMatch.hostEpoch,reason:'A party member left the Party menu.'});
    return false;
  }
  const kits={};
  for(const id of partyCpuMatch.humanIds){ const kit=partyCpuKit(p.loadouts&&p.loadouts[id]); if(!kit) return false; kits[id]=kit; }
  const mine=kits[party.self.id]; if(!mine) return false;
  if(party.chatComposing&&formOpen)closeForm();party.chatComposing=false;party.chatOpen=false;
  return cpuTeamBeginRound({round,startDelay:p.startDelay,scores:p.scores,kits,clock:Date.now(),mode:'partycpu',status:'Party 2v2 vs CPUs',pendingMode:PARTY_CPU_MODE});
}
// Fully local one-human team match. It intentionally reuses only the neutral
// CPU simulation; Party presence, envelopes, retries, and Supabase channels
// are never created or consulted by this lifecycle.
function startOfflineCpu2v2(options={}){
  options=options&&typeof options==='object'?options:{};
  if(options.ladderReady!==true&&typeof deferBotLadderMatchStart==='function'&&
     deferBotLadderMatchStart('ai2v2',()=>startOfflineCpu2v2({ladderReady:true})))return true;
  const mine=partyCpuKit(loadout);if(!mine){pracNeedMsgT=now+1600;sfx('dry');return false;}
  if(partyCpuSessionOpen()){
    arena.status='Finish or leave the current CPU team match first.';sfx('dry');return false;
  }
  if(arena&&(arena.queueChannel||arena.matchChannel))leaveArena('',false);
  const savedLoadout={primary:loadout.primary,secondary:loadout.secondary,melee:loadout.melee,utility:loadout.utility};
  partyCpuMatch=freshPartyCpuMatch();partyCpuMatch.local=true;partyCpuMatch.phase='setup';
  initializeBotLadderMatch(partyCpuMatch,'ai2v2',botLadderReadyForMatch()?botLadder.tier:0,false);
  partyCpuMatch.epoch=Math.max(1,Math.floor(now));partyCpuMatch.hostEpoch=1;partyCpuMatch.hostId=LOCAL_CPU2V2_PLAYER;
  partyCpuMatch.humanIds=[LOCAL_CPU2V2_PLAYER];partyCpuMatch.humanNames[LOCAL_CPU2V2_PLAYER]='YOU';
  partyCpuMatch.loadouts[LOCAL_CPU2V2_PLAYER]=mine;partyCpuMatch.localLoadout=mine;partyCpuMatch.savedLoadout=savedLoadout;
  partyCpuMatch.phase='map_vote';
  arena=freshArena('Vote for the Offline 2v2 map.');arena.mode='ai2v2';arena.active=true;arena.matchEpoch=partyCpuMatch.epoch;
  if(typeof arenaStartMapVote==='function'&&arenaStartMapVote())return true;
  return offlineCpu2v2BeginRound();
}
function offlineCpu2v2BeginRound(){
  if(!isLocalCpu2v2())return false;
  const mapId=typeof arenaMapValid==='function'&&arenaMapValid(arena&&arena.mapId)?arena.mapId:'arena';
  return cpuTeamBeginRound({round:partyCpuMatch.round+1,startDelay:3000,scores:partyCpuMatch.scores,kits:partyCpuMatch.loadouts,clock:now,
    mode:'ai2v2',status:'Offline 2v2 vs CPUs',pendingMode:'ai2v2',mapId});
}
function offlineCpu2v2RoundTick(){
  if(!isLocalCpu2v2()||!arena.active)return;
  if(partyCpuMatch.phase==='countdown'&&now>=partyCpuMatch.roundStartAt){
    partyCpuMatch.phase='fight';arena.phase='fight';waveMsg='FIGHT';waveMsgT=now+800;
  }
  if(partyCpuMatch.phase==='fight'&&now>=partyCpuMatch.roundEndAt){
    const alliesHp=partyCpuActors('A').reduce((total,a)=>total+a.hp,0),cpusHp=partyCpuActors('B').reduce((total,a)=>total+a.hp,0);
    offlineCpu2v2Resolve(alliesHp===cpusHp?null:(alliesHp>cpusHp?'allies':'cpus'));
  }
  if(partyCpuMatch.phase==='round_end'&&partyCpuMatch.nextRoundAt&&now>=partyCpuMatch.nextRoundAt){
    partyCpuMatch.nextRoundAt=0;offlineCpu2v2BeginRound();
  }
}
function offlineCpu2v2Resolve(winner){
  if(!isLocalCpu2v2()||partyCpuMatch.phase!=='fight'||partyCpuMatch.roundResolved)return false;
  const scores={allies:partyCpuMatch.scores.allies||0,cpus:partyCpuMatch.scores.cpus||0};if(winner)scores[winner]++;
  partyCpuMatch.roundResolved=true;partyCpuMatch.scores=scores;arena.clearProjectiles=true;resetHeldGameplayInput();
  const matchOver=!!winner&&scores[winner]>=PARTY_CPU_TARGET;
  if(matchOver){
    if(typeof recordCompletedAiTrainingMatch==='function')recordCompletedAiTrainingMatch(winner==='allies',partyCpuMatch);
    recordCompletedBotLadderMatch(winner==='allies',partyCpuMatch);
    partyCpuMatch.phase='match_end';arena.phase='match_end';arena.active=false;partyCpuMatch.nextRoundAt=0;
    state='select';selPage='arena';menuOpen=false;aiming=false;rmbAim=false;pendingGameMode='ai2v2';loadoutBackPage='offlinecpu';
    arena.status=winner==='allies'?'YOUR TEAM BEAT THE CPUs!':'THE CPUs WON. RUN IT BACK!';sfx(winner==='allies'?'pickup':'die');
  }else{
    partyCpuMatch.phase='round_end';arena.phase='round_end';partyCpuMatch.nextRoundAt=now+2600;
    waveMsg=winner?(winner==='allies'?'ROUND WON':'ROUND LOST'):'ROUND DRAW';waveMsgT=now+2200;sfx(winner==='allies'?'pickup':'die');
  }
  return true;
}
function offlineCpu2v2Rematch(options={}){
  if(!isLocalCpu2v2()||partyCpuMatch.phase!=='match_end')return false;
  if(!botLadderMatchSettled(partyCpuMatch)){arena.status='Saving your ladder result before Play Again…';sfx('dry');return false;}
  if(!(options&&options.ladderReady===true)&&
     deferBotLadderMatchStart('ai2v2',()=>offlineCpu2v2Rematch({ladderReady:true})))return true;
  initializeBotLadderMatch(partyCpuMatch,'ai2v2',botLadderReadyForMatch()?botLadder.tier:0,false);
  partyCpuMatch.epoch=Math.max(partyCpuMatch.epoch+1,Math.floor(now));partyCpuMatch.round=0;partyCpuMatch.scores={allies:0,cpus:0};
  partyCpuMatch.roundResolved=false;partyCpuMatch.phase='map_vote';
  arena.active=true;arena.phase='lobby';arena.matchEpoch=partyCpuMatch.epoch;
  if(typeof arenaStartMapVote==='function'&&arenaStartMapVote())return true;
  return offlineCpu2v2BeginRound();
}
function offlineCpu2v2Leave(status,toHub=false){
  if(!partyCpuMatch.local&&!isLocalCpu2v2())return false;
  if(partyCpuMatch.local&&typeof cancelBotLadderSubmission==='function')cancelBotLadderSubmission(partyCpuMatch);
  const saved=partyCpuMatch.savedLoadout;
  practiceMode=null;enemies=[];bullets=[];ebullets=[];pickups=[];damageNumbers=[];grenades=[];pearls=[];balls=[];flames=[];freezeFx=[];splitBalls=[];
  daggersOut=null;comboStep=0;comboNextT=0;parryUntil=0;parrySeq=0;fistFlurryUntil=0;sawChargeUntil=0;
  partyCpuMatch=freshPartyCpuMatch();arena=freshArena(status||'Offline 2v2 vs CPUs ready.');
  if(saved)loadout={primary:saved.primary||null,secondary:saved.secondary||null,melee:saved.melee||null,utility:saved.utility||null};
  pendingGameMode=null;modeBoardMode=toHub?null:'endless';state='select';selPage=toHub?'hub':'offlinecpu';menuOpen=false;aiming=false;rmbAim=false;resetHeldGameplayInput();
  return true;
}
function partyCpuLocalActor(){ const id=cpuTeamLocalId();return id&&partyCpuMatch.humans[id]; }
function partyCpuSyncLocalActor(){
  const a=partyCpuLocalActor(); if(!a) return;
  a.x=player.x; a.y=player.y; a.tx=player.x; a.ty=player.y; a.angle=aimAngle(); a.cur=WEAPONS[player.cur]?player.cur:a.cur; a.hp=clamp(player.hp,0,PARTY_CPU_HP);
  a.parrySeq=parrySeq; a.parryUntil=now<parryUntil?cpuTeamClock()+Math.max(0,parryUntil-now):0;
}
function partyCpuActors(team){
  return Object.values(partyCpuMatch.humans).concat(partyCpuMatch.bots).filter(a=>a.team===team&&a.hp>0);
}
function partyCpuNearest(actor,team){
  let best=null,bd=Infinity;
  for(const target of partyCpuActors(team)){ const d=dist2(actor.x,actor.y,target.x,target.y); if(d<bd){ bd=d; best=target; } }
  return best;
}
function partyCpuAiClock(){return Number.isFinite(+partyCpuMatch.simClock)&&partyCpuMatch.simClock>0?+partyCpuMatch.simClock:cpuTeamClock();}
function partyCpuRecordThreat(attackerId,victimTeam,dmg,clock=partyCpuAiClock()){
  attackerId=String(attackerId||'');victimTeam=String(victimTeam||'');
  if(!attackerId||!['A','B'].includes(victimTeam)||!Number.isFinite(+dmg)||+dmg<=0)return false;
  if(!partyCpuMatch.threat||typeof partyCpuMatch.threat!=='object')partyCpuMatch.threat={A:{},B:{}};
  const ledger=partyCpuMatch.threat[victimTeam]||(partyCpuMatch.threat[victimTeam]={}),old=ledger[attackerId]||{value:0,at:clock},
    oldAt=Number.isFinite(+old.at)?+old.at:clock;
  const decayed=Math.max(0,(+old.value||0)*(1-clamp((clock-oldAt)/6000,0,1)));
  ledger[attackerId]={value:Math.min(120,decayed+clamp(+dmg,0,PARTY_CPU_HP)),at:clock};return true;
}
function partyCpuThreatValue(victimTeam,attackerId,clock){
  const row=partyCpuMatch.threat&&partyCpuMatch.threat[victimTeam]&&partyCpuMatch.threat[victimTeam][String(attackerId||'')];
  if(!row)return 0;
  const rowAt=Number.isFinite(+row.at)?+row.at:clock;
  return Math.max(0,(+row.value||0)*(1-clamp((clock-rowAt)/6000,0,1)));
}
function partyCpuThreatScore(bot,target,clock){
  if(!bot||!target||target.hp<=0)return -Infinity;
  const dx=target.x-bot.x,dy=target.y-bot.y,d=Math.hypot(dx,dy)||1;
  const blocked=(typeof cpuAiLosBlocked==='function'?cpuAiLosBlocked:losBlocked)(bot.x,bot.y,target.x,target.y);
  const proximity=1-clamp(d/1100,0,1),missing=1-clamp((+target.hp||0)/PARTY_CPU_HP,0,1);
  const threat=partyCpuThreatValue(bot.team,target.id,clock)/120;
  const facing=Number.isFinite(+target.angle)&&Math.cos(Math.atan2(bot.y-target.y,bot.x-target.x)-target.angle)>.72?1:0;
  const incumbent=String(bot.targetId||'')===String(target.id)?1:0;
  const attacker=String(bot.lastAttackerId||'')===String(target.id)&&clock<(bot.underFireUntil||0)?1:0;
  const tie=(typeof cpuAiSeed==='function'?cpuAiSeed(bot.aiSeed,target.id)%1000:0)/50000;
  return (blocked?0:1)+proximity*.55+missing*.45+threat*1.1+facing*.30+incumbent*.20+attacker*.7+tie;
}
function partyCpuThreatTarget(bot,enemyTeam,clock){
  const candidates=partyCpuActors(enemyTeam),current=candidates.find(t=>String(t.id)===String(bot.targetId||''));
  const attacker=candidates.find(t=>String(t.id)===String(bot.lastAttackerId||''));
  if(attacker&&clock<(bot.underFireUntil||0)&&attacker!==current){bot.targetThinkAt=0;bot.targetLockUntil=0;}
  if(current&&clock<(bot.targetLockUntil||0))return current;
  if(current&&clock<(bot.targetThinkAt||0))return current;
  let best=null,bestScore=-Infinity;
  for(const target of candidates){const score=partyCpuThreatScore(bot,target,clock);if(score>bestScore){best=target;bestScore=score;}}
  if(current&&best&&best!==current&&bestScore<partyCpuThreatScore(bot,current,clock)+.15)best=current;
  if(!best)return null;
  if(best!==current)bot.targetLockUntil=clock+(typeof cpuAiRange==='function'?cpuAiRange(bot,450,750):600);
  bot.targetId=String(best.id);bot.targetThinkAt=clock+250;return best;
}
function partyCpuSpawnBotShot(bot,target,profile){
  if(!cpuTeamIsAuthority()||partyCpuMatch.phase!=='fight') return;
  const spread=profile&&Number.isFinite(+profile.shotJitter)?+profile.shotJitter:.028,
    jitter=typeof cpuAiRange==='function'?cpuAiRange(bot,-spread,spread):0;
  const a=bot.angle+jitter, speed=weaponBulletSpeed('ar'), id=partyCpuMatch.epoch+':'+partyCpuMatch.round+':shot:'+(++partyCpuMatch.shotSeq);
  const shot={id,ownerId:bot.id,team:bot.team,targetId:target&&target.id||'',x:bot.x+Math.cos(a)*7,y:bot.y+Math.sin(a)*7,
    vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:weaponBulletLife('ar',1200),dmg:Math.min(18,WEAPONS.ar.dmg*.85),dist:0,rng:WEAPONS.ar.range,fall:WEAPONS.ar.fall};
  partyCpuMatch.seenShots.add(id); partyCpuMatch.shots.push(shot);
  if(typeof recordAiTrainingBotSignal==='function')recordAiTrainingBotSignal(bot,'bot_shots');
  if(!isLocalCpu2v2())partySend('cpu_bot_shot',{matchEpoch:partyCpuMatch.epoch,hostEpoch:partyCpuMatch.hostEpoch,round:partyCpuMatch.round,shot});
}
function partyCpuHostStep(dtms,clock){
  if(!cpuTeamIsAuthority()||partyCpuMatch.phase!=='fight'||partyCpuMatch.roundResolved) return;
  const dt=dtms/16.667,w=WEAPONS.ar,partyProfile={approach:560,retreat:260,maxRange:1050,leadFactor:.68,maxLeadMs:220,
    aimNoise:.075,shotJitter:.028,fireAimError:.11,turnRate:.07,moveSpeed:2.75,thinkMs:150},
    shotProfile={damage:Math.min(18,w.dmg*.85),rng:w.range,fall:w.fall,maxRange:1050};
  for(const b of partyCpuMatch.bots){
    if(b.hp<=0) continue;
    const localMatch=isLocalCpu2v2(),profile=localMatch?Object.assign({},arenaBotTuning(b.botDifficulty,b.botModelId||partyCpuMatch.botModelId),{approach:560,retreat:260,maxRange:1050}):partyProfile;
    const enemyTeam=b.team==='A'?'B':'A',foes=partyCpuActors(enemyTeam),allies=partyCpuActors(b.team);
    const target=partyCpuThreatTarget(b,enemyTeam,clock);if(!target)continue;
    if(!localMatch||profile.usePrediction)cpuAiTrackTarget(b,target,dtms);
    if(b.reloadEnd&&clock>=b.reloadEnd){ b.reloadEnd=0; b.mag=w.mag; }
    if((!localMatch||profile.useTnt)&&clock>=(b.tntThinkAt||0)){
      b.tntThinkAt=clock+CPU_AI_TNT_RETHINK_MS;b.tntPlan=cpuAiTntPlan(b,foes,allies,shotProfile,clock);
    }else if(localMatch&&!profile.useTnt)b.tntPlan=null;
    if(clock>=b.thinkAt){
      if((!localMatch||profile.useStuckRecovery)&&cpuAiObserveMovement(b,clock)){
        b.aiTacticUntil=clock;if(typeof recordAiTrainingBotSignal==='function')recordAiTrainingBotSignal(b,'bot_stuck_recoveries');
      }
      b.thinkAt=clock+profile.thinkMs;
      if(clock>=b.aimNoiseAt){b.aimNoise=cpuAiRange(b,-profile.aimNoise,profile.aimNoise);b.aimNoiseAt=clock+cpuAiRange(b,450,750);}
      const move=cpuAiPickMove(b,target,allies,clock,profile,b.tntPlan);b.moveX=move.x;b.moveY=move.y;
    }
    const lead=cpuAiLeadPoint(b,target,'ar',!localMatch||profile.usePrediction?profile.leadFactor:0,!localMatch||profile.usePrediction?profile.maxLeadMs:0),liveTnt=activeArenaTnt(),
      plannedTnt=b.tntPlan&&b.tntPlan.targetId?liveTnt.find(t=>String(t.id)===String(b.tntPlan.targetId)):null;
    let aimX=lead.x,aimY=lead.y,aimTntId='';
    if(plannedTnt&&!cpuAiLosBlocked(b.x,b.y,b.tntPlan.aimX,b.tntPlan.aimY,plannedTnt.id)){
      aimX=b.tntPlan.aimX;aimY=b.tntPlan.aimY;aimTntId=String(plannedTnt.id);
    }
    const desired=Math.atan2(aimY-b.y,aimX-b.x)+(b.aimNoise||0),turn=cpuAiAngleDelta(desired,b.angle);
    b.angle+=clamp(turn,-profile.turnRate*dt,profile.turnRate*dt);
    const tacticSpeed=b.aiTactic==='hold'?.38:b.aiTactic==='flank'?.94:b.aiTactic==='cover'?.9:1,spd=profile.moveSpeed*tacticSpeed*dt,
      moveStartX=b.x,moveStartY=b.y,nx=b.x+b.moveX*spd,ny=b.y+b.moveY*spd,
      blockedX=pointInRects(nx,b.y),blockedY=pointInRects(b.x,ny);
    if(!blockedX)b.x=nx; if(!blockedY)b.y=ny;
    clampActorToArena(b);collideRects(b);clampActorToArena(b);
    if(typeof recordAiTrainingBotSignal==='function'){
      recordAiTrainingBotSignal(b,'bot_distance_px',Math.hypot(b.x-moveStartX,b.y-moveStartY));
      if((blockedX||blockedY)&&clock>=(b.aiTrainingWallAt||0)){
        b.aiTrainingWallAt=clock+250;recordAiTrainingBotSignal(b,'bot_wall_contacts');
      }
    }
    const usedPortal=typeof isOfflineCpuTeamMapArena==='function'&&isOfflineCpuTeamMapArena()&&typeof arenaPortalStep==='function'&&arenaPortalStep(b,clock);
    if(usedPortal&&typeof recordAiTrainingBotSignal==='function')recordAiTrainingBotSignal(b,'bot_portal_uses');
    b.tx=b.x;b.ty=b.y;
    if(clock<b.reactionAt||b.reloadEnd)continue;
    if(aimTntId){
      const fresh=cpuAiTntPlan(b,foes,allies,shotProfile,clock),freshTnt=liveTnt.find(t=>String(t.id)===String(fresh.targetId));
      b.tntPlan=fresh;b.tntThinkAt=clock+CPU_AI_TNT_RETHINK_MS;
      if(freshTnt){aimTntId=String(freshTnt.id);aimX=fresh.aimX;aimY=fresh.aimY;}
      else{aimTntId='';aimX=lead.x;aimY=lead.y;}
    }
    const blocked=aimTntId?cpuAiLosBlocked(b.x,b.y,aimX,aimY,aimTntId):(!lead.visible||cpuAiLosBlocked(b.x,b.y,target.x,target.y));
    if(blocked)continue;
    const dx=aimX-b.x,dy=aimY-b.y,d=Math.hypot(dx,dy)||1,targetA=Math.atan2(dy,dx),aimErr=Math.abs(cpuAiAngleDelta(targetA,b.angle));
    if(d>profile.maxRange||aimErr>profile.fireAimError)continue;
    if(b.mag<=0){ b.reloadEnd=clock+w.reload; continue; }
    const interval=w.fireRate*1.55; if(clock-b.lastShot<interval) continue;
    b.lastShot=b.lastShot>0&&clock-b.lastShot<interval*4?b.lastShot+interval:clock;b.mag--;b.flash=clock+55;
    partyCpuSpawnBotShot(b,aimTntId?{id:aimTntId,kind:'tnt'}:target,profile);if(b.mag<=0)b.reloadEnd=clock+w.reload;
  }
}
function partyCpuTakeLocalDamage(dmg){
  if(!isCpuTeamArena()||partyCpuMatch.phase!=='fight'||player.hp<=0) return;
  const hit=clamp(+dmg||0,0,PARTY_CPU_HP); if(!hit) return;
  damagePlayerHp(hit); player.hurtFlash=1; player.hurtCd=140; burst(player.x,player.y,'#d05548',5,3); sfx('hurt');
  partyCpuSyncLocalActor(); partyCpuMatch.syncAt=0;
  if(player.hp<=0){ resetHeldGameplayInput(); bullets=[]; grenades=[]; waveMsg='YOU ARE DOWN — TEAMMATES STILL FIGHTING'; waveMsgT=now+1800; }
  if(cpuTeamIsAuthority()) partyCpuHostEvaluate();
}
function partyCpuHostTryParry(target,shot){
  if(!cpuTeamIsAuthority()||!target||!shot) return false;
  const local=target.id===cpuTeamLocalId();
  const active=local
    ? now<parryUntil
    : cpuTeamClock()<(target.parryUntil||0)&&target.parryUsedSeq!==target.parrySeq;
  if(!active) return false;
  if(local) parryUntil=0;
  else { target.parryUntil=0; target.parryUsedSeq=target.parrySeq; }
  const source=partyCpuMatch.bots.find(b=>b.id===String(shot.ownerId||'')&&b.team==='B'&&b.hp>0);
  const reflected=source?Math.min(source.hp,120):0;
  if(source){
    if(typeof recordAiTrainingBotSignal==='function')recordAiTrainingBotSignal(source,'bot_damage_taken',reflected);
    source.hp=Math.max(0,source.hp-120);source.lastAttackerId=String(target.id||'');source.underFireUntil=partyCpuAiClock()+900;
    partyCpuRecordThreat(target.id,source.team,reflected,partyCpuAiClock());partyCpuMatch.snapshotAt=0;
    if(local) addDamageNumber(source,reflected,true);
  }
  if(!local&&!isLocalCpu2v2()){
    const packet={to:target.id,matchEpoch:partyCpuMatch.epoch,hostEpoch:partyCpuMatch.hostEpoch,round:partyCpuMatch.round,
      id:String(shot.id)+':parry',shotId:String(shot.id),dmg:0,hp:target.hp,parried:true,
      sourceId:source&&source.id||'',reflected};
    partySend('cpu_damage',packet);for(const wait of [180,520])setTimeout(()=>{if(party.channel&&partyCpuSessionOpen())partySend('cpu_damage',packet);},wait);
  }
  burst(target.x,target.y,'#bfe8ff',8,4);sfx('hit');partyCpuHostEvaluate();return true;
}
function partyCpuHostDamageHuman(target,shot,dmg){
  if(!cpuTeamIsAuthority()||!target||target.team!=='A'||target.hp<=0||partyCpuMatch.phase!=='fight')return false;
  const hit=clamp(+dmg||0,0,PARTY_CPU_HP);if(!hit)return false;
  if(partyCpuHostTryParry(target,shot))return true;
  const before=target.id===cpuTeamLocalId()?Math.max(0,+player.hp||0):Math.max(0,+target.hp||0),dealt=Math.min(before,hit);
  if(typeof recordAiTrainingBotSignalById==='function'){
    recordAiTrainingBotSignalById(shot.ownerId,'bot_hits');recordAiTrainingBotSignalById(shot.ownerId,'bot_damage_dealt',dealt);
  }
  partyCpuRecordThreat(shot.ownerId,target.team,hit,partyCpuAiClock());
  if(target.id===cpuTeamLocalId())partyCpuTakeLocalDamage(hit);
  else {
    target.hp=Math.max(0,target.hp-hit);
    if(!isLocalCpu2v2()){
      const packet={to:target.id,matchEpoch:partyCpuMatch.epoch,hostEpoch:partyCpuMatch.hostEpoch,round:partyCpuMatch.round,
        id:String(shot.id)+':damage',shotId:String(shot.id),dmg:hit,hp:target.hp};
      partySend('cpu_damage',packet);for(const wait of [180,520])setTimeout(()=>{if(party.channel&&partyCpuSessionOpen())partySend('cpu_damage',packet);},wait);
    }
  }
  partyCpuHostEvaluate();return true;
}
function partyCpuApplyDamage(p){
  if(!partyCpuEnvelope(p,true)||p.round!==partyCpuMatch.round||String(p.to||'')!==party.self.id||partyCpuMatch.phase!=='fight')return false;
  const id=String(p.id||'').slice(0,140);if(!id||partyCpuMatch.seenHits.has(id))return false;
  const dmg=clamp(+p.dmg||0,0,PARTY_CPU_HP);if(!p.parried&&!dmg)return false;
  partyCpuMatch.seenHits.add(id);partyCpuMatch.shots=partyCpuMatch.shots.filter(s=>s.id!==String(p.shotId||''));
  if(p.parried){
    parryUntil=0;
    const source=partyCpuMatch.bots.find(b=>b.id===String(p.sourceId||''));
    const reflected=clamp(+p.reflected||0,0,120); if(source&&reflected) addDamageNumber(source,reflected,true);
    burst(player.x,player.y,'#bfe8ff',8,4);sfx('hit');waveMsg='TWIN SAI PARRY';waveMsgT=now+900;return true;
  }
  const targetHp=Number.isFinite(+p.hp)?clamp(+p.hp,0,PARTY_CPU_HP):Math.max(0,player.hp-dmg);
  if(player.hp>targetHp)partyCpuTakeLocalDamage(player.hp-targetHp);return true;
}
function partyCpuStepShots(dtms){
  const dt=dtms/16.667;
  for(let i=partyCpuMatch.shots.length-1;i>=0;i--){
    const b=partyCpuMatch.shots[i]; b.life-=dtms; let dead=b.life<=0;
    const mx=b.vx*dt,my=b.vy*dt,steps=Math.max(1,Math.ceil(Math.hypot(mx,my)/7));
    for(let s=0;s<steps&&!dead;s++){
      b.x+=mx/steps;b.y+=my/steps;b.dist+=Math.hypot(mx,my)/steps;
      if(projectileOutsideArena(b,3)){dead=true;break;}
      const fall=b.dist<=b.rng?1:Math.max(b.fall,1-(1-b.fall)*Math.min(1,(b.dist-b.rng)/b.rng));
      if(cpuTeamIsAuthority()&&typeof isOfflineCpuTeamMapArena==='function'&&isOfflineCpuTeamMapArena()&&
         activeArenaMapId()==='construction'&&arenaTryTriggerTntAt(b.x,b.y,'cpu',3,b.dmg*fall,b.ownerId)){
        dead=true;break;
      }
      if(pointInRects(b.x,b.y)){dead=true;break;}
      if(cpuTeamIsAuthority()){
        if(b.team==='B'){
          const target=partyCpuMatch.humans[b.targetId];
          if(target&&target.hp>0&&dist2(b.x,b.y,target.x,target.y)<(target.r+4)*(target.r+4)){
            partyCpuHostDamageHuman(target,b,b.dmg*fall);dead=true;
          }
        }
        if(!dead)for(const target of partyCpuMatch.bots){
          if(target.team===b.team||target.hp<=0||target.id===b.ownerId||target.id!==b.targetId) continue;
          if(dist2(b.x,b.y,target.x,target.y)<(target.r+4)*(target.r+4)){
            const dealt=Math.min(target.hp,b.dmg);target.hp=Math.max(0,target.hp-b.dmg);
            if(b.team==='B'&&typeof recordAiTrainingBotSignalById==='function'){
              recordAiTrainingBotSignalById(b.ownerId,'bot_hits');recordAiTrainingBotSignalById(b.ownerId,'bot_damage_dealt',dealt);
            }
            if(target.team==='B'&&typeof recordAiTrainingBotSignal==='function')recordAiTrainingBotSignal(target,'bot_damage_taken',dealt);
            partyCpuRecordThreat(b.ownerId,target.team,dealt,partyCpuAiClock());
            target.lastAttackerId=b.ownerId;target.underFireUntil=partyCpuAiClock()+900;
            dead=true;partyCpuMatch.snapshotAt=0;partyCpuHostEvaluate();break;
          }
        }
      }
    }
    if(dead) partyCpuMatch.shots.splice(i,1);
  }
}
function partyCpuFixedStep(dtms,clock){
  if(!isCpuTeamArena()) return;
  if(Number.isFinite(+clock))partyCpuMatch.simClock=+clock;
  partyCpuSyncLocalActor();
  if(partyCpuMatch.phase==='fight'){ partyCpuHostStep(dtms,clock); partyCpuStepShots(dtms); }
}
function partyCpuWallTick(clock){
  if(!partyCpuSessionOpen()) return;
  if(partyCpuMatch.local)return; // Offline 2v2 is stepped exactly once by the pausable 60 Hz game clock.
  const hostMissing=!partyMember(partyCpuMatch.hostId)||(!party.liveIds.has(partyCpuMatch.hostId)&&party.missingSince[partyCpuMatch.hostId]&&clock-party.missingSince[partyCpuMatch.hostId]>=PARTY_MISSING_MS);
  if(hostMissing||party.hostId!==partyCpuMatch.hostId){ partyCpuReturnToLobby('Party CPU match ended because the host disconnected.'); return; }
  if(partyCpuIsHost()) for(const id of partyCpuMatch.humanIds){
    if(!partyMember(id)){ partyCpuAbort('Party CPU match ended because a player left.',true); return; }
  }
  if(!isPartyCpuMatch()) return;
  if(partyCpuMatch.phase==='countdown'&&clock>=partyCpuMatch.roundStartAt){ partyCpuMatch.phase='fight';arena.phase='fight';waveMsg='FIGHT';waveMsgT=now+800; }
  if(partyCpuIsHost()&&partyCpuMatch.phase==='fight'&&clock>=partyCpuMatch.roundEndAt){
    const ahp=partyCpuActors('A').reduce((n,a)=>n+a.hp,0),bhp=partyCpuActors('B').reduce((n,a)=>n+a.hp,0);
    partyCpuHostResolve(ahp===bhp?null:(ahp>bhp?'allies':'cpus'));
  }
  if(partyCpuIsHost()&&partyCpuMatch.phase==='round_end'&&partyCpuMatch.nextRoundAt&&clock>=partyCpuMatch.nextRoundAt){ partyCpuMatch.nextRoundAt=0;partyCpuHostStartRound(); }
  const elapsed=partyCpuMatch.simAt?clamp(clock-partyCpuMatch.simAt,0,250):16.667; partyCpuMatch.simAt=clock;partyCpuMatch.simAcc+=elapsed;
  let steps=0; while(partyCpuMatch.simAcc>=PARTY_CPU_STEP&&steps<8){
    const stepClock=(partyCpuMatch.simClock||clock-elapsed)+PARTY_CPU_STEP;
    partyCpuFixedStep(PARTY_CPU_STEP,stepClock);partyCpuMatch.simAcc-=PARTY_CPU_STEP;steps++;
  }
  if(steps===8&&partyCpuMatch.simAcc>=PARTY_CPU_STEP)partyCpuMatch.simAcc=0;
  const alpha=1-Math.pow(.78,elapsed/16.667);
  for(const h of Object.values(partyCpuMatch.humans)) if(!party.self||h.id!==party.self.id){ h.x+=(h.tx-h.x)*alpha;h.y+=(h.ty-h.y)*alpha; }
  if(!partyCpuIsHost()) for(const b of partyCpuMatch.bots){ b.x+=(b.tx-b.x)*alpha;b.y+=(b.ty-b.y)*alpha; }
}
function partyCpuSyncTick(clock){
  if(!isPartyCpuMatch()||!party.channel||!party.self) return;
  if(clock>=partyCpuMatch.syncAt){
    partyCpuMatch.syncAt=clock+PARTY_CPU_SYNC_MS; partyCpuSyncLocalActor();
    partySend('cpu_player_state',{matchEpoch:partyCpuMatch.epoch,hostEpoch:partyCpuMatch.hostEpoch,round:partyCpuMatch.round,
      x:player.x,y:player.y,angle:aimAngle(),cur:player.cur,hp:Math.max(0,player.hp),parrySeq,parryMs:Math.max(0,parryUntil-now)});
  }
  if(partyCpuIsHost()&&clock>=partyCpuMatch.snapshotAt){
    partyCpuMatch.snapshotAt=clock+PARTY_CPU_SYNC_MS;
    partySend('cpu_bot_snapshot',{matchEpoch:partyCpuMatch.epoch,hostEpoch:partyCpuMatch.hostEpoch,round:partyCpuMatch.round,
      bots:partyCpuMatch.bots.map(b=>({id:b.id,x:b.x,y:b.y,angle:b.angle,cur:b.cur,hp:b.hp,flash:b.flash||0})),
      humanHp:Object.fromEntries(partyCpuMatch.humanIds.map(id=>[id,Math.max(0,partyCpuMatch.humans[id]?.hp||0)]))});
  }
}
function partyCpuApplyPlayerState(p){
  if(!partyCpuEnvelope(p,false)||p.round!==partyCpuMatch.round||!partyCpuMatch.humanIds.includes(String(p.from||''))) return false;
  const h=partyCpuMatch.humans[p.from]; if(!h||p.from===party.self.id) return false;
  if(Number.isFinite(+p.x))h.tx=clamp(+p.x,40,WORLD.w-40); if(Number.isFinite(+p.y))h.ty=clamp(+p.y,40,WORLD.h-40);
  if(Number.isFinite(+p.angle))h.angle=+p.angle; if(WEAPONS[p.cur])h.cur=p.cur;
  const seq=clamp(Math.floor(+p.parrySeq||0),0,1000000000);
  if(seq>h.parrySeq){
    h.parrySeq=seq;
    const clock=Date.now(), left=clamp(+p.parryMs||0,0,TWIN_SAI_PARRY_MS);
    const ownsSai=partyCpuMatch.loadouts&&partyCpuMatch.loadouts[h.id]&&partyCpuMatch.loadouts[h.id].melee==='twinsai';
    if(ownsSai&&left>0&&clock>=(h.parryReadyAt||0)){
      h.parryUsedSeq=-1;h.parryUntil=clock+left;h.parryReadyAt=clock+ABILITY_CD.twinsai;
    } else { h.parryUsedSeq=seq;h.parryUntil=0; }
  }
  h.hp=Math.min(h.hp,clamp(+p.hp||0,0,PARTY_CPU_HP)); // no healing in this mode; late packets cannot resurrect a teammate
  if(partyCpuIsHost()) partyCpuHostEvaluate(); return true;
}
function partyCpuApplyBotSnapshot(p){
  if(!partyCpuEnvelope(p,true)||p.round!==partyCpuMatch.round||partyCpuIsHost()||!Array.isArray(p.bots)) return false;
  for(const raw of p.bots.slice(0,3)){
    const b=partyCpuMatch.bots.find(x=>x.id===String(raw.id||'')); if(!b)continue;
    if(Number.isFinite(+raw.x))b.tx=clamp(+raw.x,40,WORLD.w-40);if(Number.isFinite(+raw.y))b.ty=clamp(+raw.y,40,WORLD.h-40);
    if(Number.isFinite(+raw.angle))b.angle=+raw.angle;if(WEAPONS[raw.cur])b.cur=raw.cur;
    b.hp=Math.min(b.hp,clamp(+raw.hp||0,0,PARTY_CPU_HP));b.flash=Math.max(0,+raw.flash||0);
  }
  if(p.humanHp&&Object.prototype.hasOwnProperty.call(p.humanHp,party.self.id)&&Number.isFinite(+p.humanHp[party.self.id])){
    const authoritative=clamp(+p.humanHp[party.self.id],0,PARTY_CPU_HP);
    if(player.hp>authoritative)partyCpuTakeLocalDamage(player.hp-authoritative);
  }
  return true;
}
function partyCpuApplyBotShot(p){
  if(!partyCpuEnvelope(p,true)||p.round!==partyCpuMatch.round||partyCpuMatch.phase!=='fight') return false;
  const s=p.shot||{},id=String(s.id||'').slice(0,100),owner=partyCpuMatch.bots.find(b=>b.id===String(s.ownerId||''));
  if(!id||partyCpuMatch.seenShots.has(id)||!owner||s.team!==owner.team) return false;
  const nums=['x','y','vx','vy','life','dmg','dist','rng','fall'];if(nums.some(k=>!Number.isFinite(+s[k])))return false;
  if(Math.hypot(+s.vx,+s.vy)>30||+s.life<=0||+s.life>7000||+s.dmg<=0||+s.dmg>50)return false;
  partyCpuMatch.seenShots.add(id);if(partyCpuMatch.seenShots.size>500)partyCpuMatch.seenShots=new Set([...partyCpuMatch.seenShots].slice(-250));
  partyCpuMatch.shots.push({id,ownerId:owner.id,team:owner.team,targetId:String(s.targetId||''),x:clamp(+s.x,ARENA_EDGE,WORLD.w-ARENA_EDGE),y:clamp(+s.y,ARENA_EDGE,WORLD.h-ARENA_EDGE),
    vx:+s.vx,vy:+s.vy,life:+s.life,dmg:+s.dmg,dist:Math.max(0,+s.dist),rng:clamp(+s.rng,1,3000),fall:clamp(+s.fall,0,1)});return true;
}
function partyCpuHitBot(target,dmg,kind){
  const localId=cpuTeamLocalId();
  if(!isCpuTeamArena()||partyCpuMatch.phase!=='fight'||!target||target.team!=='B'||target.hp<=0||!localId)return false;
  const p={from:localId,matchEpoch:partyCpuMatch.epoch,hostEpoch:partyCpuMatch.hostEpoch,round:partyCpuMatch.round,
    id:localId+':'+partyCpuMatch.round+':'+(++partyCpuMatch.hitSeq),targetId:target.id,dmg:clamp(+dmg||0,0,PARTY_CPU_HP),kind:String(kind||'shot').slice(0,16)};
  if(!p.dmg)return false;
  addDamageNumber(target,Math.min(target.hp,p.dmg),p.kind==='crit');
  if(isLocalCpu2v2())cpuTeamApplyBotHit(target,p.dmg,localId);
  else if(partyCpuIsHost())partyCpuHostApplyHit(p);else partySend('cpu_hit',p);return true;
}
function cpuTeamApplyBotHit(target,dmg,attackerId=cpuTeamLocalId()){
  if(!cpuTeamIsAuthority()||partyCpuMatch.phase!=='fight'||!target||target.team!=='B'||target.hp<=0)return false;
  const hit=clamp(+dmg||0,0,PARTY_CPU_HP);if(!hit)return false;
  const dealt=Math.min(Math.max(0,+target.hp||0),hit);
  if(typeof recordAiTrainingBotSignal==='function')recordAiTrainingBotSignal(target,'bot_damage_taken',dealt);
  target.hp=Math.max(0,target.hp-hit);target.lastAttackerId=String(attackerId||'');target.underFireUntil=partyCpuAiClock()+900;
  partyCpuRecordThreat(attackerId,target.team,hit,partyCpuAiClock());
  partyCpuMatch.snapshotAt=0;partyCpuHostEvaluate();return true;
}
function partyCpuHostApplyHit(p){
  if(!partyCpuIsHost()||!partyCpuEnvelope(p,false)||p.round!==partyCpuMatch.round||partyCpuMatch.phase!=='fight'||!partyCpuMatch.humanIds.includes(String(p.from||'')))return false;
  const id=String(p.id||'').slice(0,120);if(!id||partyCpuMatch.seenHits.has(id))return false;
  const target=partyCpuMatch.bots.find(b=>b.id===String(p.targetId||'')&&b.team==='B'&&b.hp>0);const dmg=clamp(+p.dmg||0,0,PARTY_CPU_HP);if(!target||!dmg)return false;
  partyCpuMatch.seenHits.add(id);if(partyCpuMatch.seenHits.size>500)partyCpuMatch.seenHits=new Set([...partyCpuMatch.seenHits].slice(-250));
  target.hp=Math.max(0,target.hp-dmg);target.lastAttackerId=String(p.from||'');target.underFireUntil=partyCpuAiClock()+900;
  partyCpuRecordThreat(p.from,target.team,dmg,partyCpuAiClock());
  partyCpuMatch.snapshotAt=0;partyCpuHostEvaluate();return true;
}
function partyCpuHostEvaluate(){
  if(!cpuTeamIsAuthority()||partyCpuMatch.phase!=='fight'||partyCpuMatch.roundResolved)return;
  const allies=partyCpuActors('A').length,cpus=partyCpuActors('B').length;
  if(!allies&&!cpus)partyCpuHostResolve(null);else if(!allies)partyCpuHostResolve('cpus');else if(!cpus)partyCpuHostResolve('allies');
}
function partyCpuHostResolve(winner){
  if(!cpuTeamIsAuthority()||partyCpuMatch.phase!=='fight'||partyCpuMatch.roundResolved)return false;
  if(isLocalCpu2v2())return offlineCpu2v2Resolve(winner);
  const scores={allies:partyCpuMatch.scores.allies||0,cpus:partyCpuMatch.scores.cpus||0};if(winner)scores[winner]++;
  const matchOver=!!winner&&scores[winner]>=PARTY_CPU_TARGET;
  const p={from:party.self.id,matchEpoch:partyCpuMatch.epoch,hostEpoch:partyCpuMatch.hostEpoch,round:partyCpuMatch.round,winner,scores,matchOver,nextDelay:matchOver?0:2600};
  partySend('cpu_round_result',p);partyCpuApplyRoundResult(p);
  for(const wait of [350,950])setTimeout(()=>{if(party.channel&&party.code)partySend('cpu_round_result',p);},wait);return true;
}
function partyCpuApplyRoundResult(p){
  if(!partyCpuEnvelope(p,true)||p.round!==partyCpuMatch.round)return false;
  if(partyCpuMatch.roundResolved&&(partyCpuMatch.phase==='round_end'||partyCpuMatch.phase==='match_end'))return false;
  partyCpuMatch.roundResolved=true;partyCpuMatch.scores={allies:Math.max(0,Math.floor(+p.scores?.allies||0)),cpus:Math.max(0,Math.floor(+p.scores?.cpus||0))};
  bullets=[];partyCpuMatch.shots=[];resetHeldGameplayInput();
  if(p.matchOver){
    partyCpuMatch.phase='match_end';const won=p.winner==='allies';sfx(won?'pickup':'die');
    if(typeof recordCompletedAiTrainingMatch==='function')recordCompletedAiTrainingMatch(won,partyCpuMatch);
    partyCpuReturnToLobby(won?'YOUR TEAM WON THE 2v2 VS CPUs MATCH!':'THE CPUs WON THE 2v2 MATCH.');
  }else{
    partyCpuMatch.phase='round_end';arena.phase='round_end';partyCpuMatch.nextRoundAt=Date.now()+clamp(+p.nextDelay||0,0,10000);
    waveMsg=p.winner?(p.winner==='allies'?'ROUND WON':'ROUND LOST'):'ROUND DRAW';waveMsgT=now+2200;sfx(p.winner==='allies'?'pickup':'die');
  }
  return true;
}
function partyCpuReceive(event,p){
  if(event==='cpu_prepare'){ partyCpuApplyPrepare(p);return; }
  if(!partyCpuSessionOpen())return;
  if(event==='cpu_ready'){
    if(!partyCpuIsHost()||!partyCpuEnvelope(p,false)||!partyCpuMatch.humanIds.includes(String(p.from||'')))return;
    const kit=partyCpuKit(p.loadout);if(!kit)return;partyCpuMatch.loadouts[p.from]=kit;partyCpuMatch.ready[p.from]=true;
    party.status=(partyCpuMatch.humanNames[p.from]||'An operator')+' is ready for 2v2 vs CPUs.';partyCpuMaybeStart();return;
  }
  if(event==='cpu_cancel'){
    if(partyCpuIsHost()&&partyCpuEnvelope(p,false)&&partyCpuMatch.humanIds.includes(String(p.from||'')))partyCpuAbort('Party CPU match setup was cancelled.',true);return;
  }
  if(event==='cpu_abort'){
    if(partyCpuEnvelope(p,true))partyCpuReturnToLobby(String(p.reason||'Party CPU match ended.').slice(0,100));return;
  }
  if(event==='cpu_round_start'){partyCpuApplyRoundStart(p);return;}
  if(event==='cpu_player_state'){partyCpuApplyPlayerState(p);return;}
  if(event==='cpu_bot_snapshot'){partyCpuApplyBotSnapshot(p);return;}
  if(event==='cpu_bot_shot'){partyCpuApplyBotShot(p);return;}
  if(event==='cpu_damage'){partyCpuApplyDamage(p);return;}
  if(event==='cpu_hit'){partyCpuHostApplyHit(p);return;}
  if(event==='cpu_round_result')partyCpuApplyRoundResult(p);
}
function partyCpuReturnToLobby(message){
  const was=partyCpuSessionOpen()||isPartyCpuMatch();
  const saved=partyCpuMatch&&partyCpuMatch.savedLoadout,
    trainingNotice=typeof aiTrainingMatchStatusText==='function'?aiTrainingMatchStatusText(partyCpuMatch,true):'';
  if(isPartyCpuMatch()||practiceMode==='arena'){
    practiceMode=null;enemies=[];bullets=[];ebullets=[];pickups=[];damageNumbers=[];grenades=[];pearls=[];balls=[];flames=[];freezeFx=[];splitBalls=[];
    daggersOut=null;comboStep=0;comboNextT=0;parryUntil=0;parrySeq=0;fistFlurryUntil=0;sawChargeUntil=0;
  }
  partyCpuMatch=freshPartyCpuMatch();arena=freshArena('Party 2v2 vs CPUs ready.');pendingGameMode=null;modeBoardMode=null;
  if(saved)loadout={primary:saved.primary||null,secondary:saved.secondary||null,melee:saved.melee||null,utility:saved.utility||null};
  if(was){state='select';selPage='party';menuOpen=false;aiming=false;rmbAim=false;resetHeldGameplayInput();}
  if(message)party.status=(trainingNotice?trainingNotice+' · ':'')+message;
}
function partyCpuAbort(reason,broadcast){
  if(!partyCpuSessionOpen())return;
  const payload={matchEpoch:partyCpuMatch.epoch,hostEpoch:partyCpuMatch.hostEpoch,reason:String(reason||'Party CPU match ended.').slice(0,100)};
  if(broadcast&&party.channel){
    const event=partyCpuIsHost()?'cpu_abort':'cpu_cancel';partySend(event,payload);
    for(const wait of [350,950])setTimeout(()=>{if(party.channel&&party.code)partySend(event,payload);},wait);
  }
  partyCpuReturnToLobby(payload.reason);
}
function leaveParty(status,toHub){
  const old=party;
  if(partyCpuSessionOpen()) partyCpuAbort('Party CPU match ended because a player left.',true);
  if(old&&old.chatComposing&&formOpen) closeForm();
  if(old&&old.channel){ try{ partySend('leave',{}); }catch(e){} partyDropChannel(old.channel); }
  party=freshParty(status||'Create a party or join with a 6-character code.');
  selPage=toHub?'hub':'party';
}
function partyTick(clock){
  if(!party||!party.channel||!party.self) return;
  if(!party.accepted){
    if(clock>=party.joinDeadline){ leaveParty('PARTY NOT FOUND OR NO LONGER OPEN.',false); sfx('dry'); return; }
    if(clock>=party.nextJoinRequest){ party.nextJoinRequest=clock+850; partySend('join_request',{name:party.self.name,joined:party.self.joined}); }
    return;
  }
  const currentHost=partyMember(party.hostId), hostGone=!currentHost||(!party.liveIds.has(party.hostId)&&clock-(party.missingSince[party.hostId]||clock)>=PARTY_MISSING_MS);
  if(hostGone){
    const live=party.members.filter(m=>party.liveIds.has(m.id)).sort((a,b)=>(a.order-b.order)||a.id.localeCompare(b.id));
    if(live.length&&live[0].id===party.self.id){ party.hostId=party.self.id; party.hostEpoch++; party.status='You are the new party host.'; partyHostCommit(); }
  }
  if(partyIsHost()){
    const gone=party.members.filter(m=>m.id!==party.self.id&&!party.liveIds.has(m.id)&&clock-(party.missingSince[m.id]||clock)>=PARTY_MISSING_MS);
    if(gone.length){ party.members=party.members.filter(m=>!gone.includes(m)); partySetDefaultPairings(); partyHostCommit('Disconnected players were removed.'); }
    else if(clock>=party.nextStateSend){ partySend('party_state',partySnapshot()); party.nextStateSend=clock+1000; }
  }
}
function flushLayoutDraftOnExit(){ if(layoutDirty) persistLayoutDraft(); }
addEventListener('pagehide',()=>{
  flushLayoutDraftOnExit();
  try{ if(typeof arenaForfeitOnPageExit==='function') arenaForfeitOnPageExit(); }catch(e){}
});
addEventListener('beforeunload',()=>{
  flushLayoutDraftOnExit();
  try{ if(typeof arenaForfeitOnPageExit==='function') arenaForfeitOnPageExit(); }catch(e){}
  try{ if(party&&party.channel) partySend('leave',{}); }catch(e){}
});
