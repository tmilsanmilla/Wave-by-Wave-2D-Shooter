"use strict";

// The server roster/teams never change here. This pre-combat exchange only
// replaces each participant's own kit, within the existing peer-hosted model.
const MATCH_LOADOUT_MS=10000, MATCH_LOADOUT_GRACE_MS=15000;
let onlineLoadoutEditor=null, onlinePlayRects=[];
function primaryOnlyMode(mode){return ['endless','ai1v1','ai2v2'].includes(String(mode||''));}
function primaryOnlyKit(raw){return {primary:raw&&raw.primary||null,secondary:null,melee:null,utility:null};}
function matchKitEqual(a,b){return !!a&&!!b&&['primary','secondary','melee','utility'].every(k=>(a[k]||null)===(b[k]||null));}
function matchLoadoutCreate(id,members,self,remaining=MATCH_LOADOUT_MS,clock=Date.now()){
  if(typeof id!=='string'||!id||id.length>160||!Array.isArray(members)||members.length<2||members.length>4||
     new Set(members).size!==members.length||!members.includes(self)||!Number.isFinite(remaining)||remaining<0||remaining>MATCH_LOADOUT_MS)return null;
  return {id,members:members.slice(),self,deadline:clock+remaining,opened:clock,commits:{},sealed:false,lastSend:0};
}
function matchLoadoutCommit(window,from,raw,validate){
  if(!window||window.sealed||!window.members.includes(from))return false;
  const kit=validate(raw);if(!kit)return false;
  if(window.commits[from])return matchKitEqual(window.commits[from],kit);
  window.commits[from]=Object.assign({},kit);return true;
}
function matchLoadoutSeal(window,raw,validate,clock=Date.now()){
  if(!window||clock<window.deadline||!window.commits[window.self]||!raw||Array.isArray(raw)||
     Object.keys(raw).length!==window.members.length)return false;
  const kits={};
  for(const id of window.members){const kit=validate(raw[id]);if(!kit)return false;kits[id]=kit;}
  if(!matchKitEqual(kits[window.self],window.commits[window.self]))return false;
  // A second seal can repeat the same snapshot, never change it.
  if(window.sealed&&!window.members.every(id=>matchKitEqual(window.kits[id],kits[id])))return false;
  window.kits=kits;window.sealed=true;return true;
}
function onlineLoadoutTarget(){
  if(typeof multidevice!=='undefined'&&multidevice&&multidevice.round===0&&['setup','loadout'].includes(multidevice.phase))
    return {kind:'multi',owner:multidevice,mode:multidevice.source==='party'?'partyduel_'+multidevice.mode:multidevice.ranked?'ranked'+multidevice.mode:multidevice.mode==='1v1'?'arena':'arena2v2',page:'multidevice'};
  if(typeof arena!=='undefined'&&arena&&!arena.active&&['queue','room','lobby','loadout'].includes(arena.phase)&&
     (arena.queueChannel||arena.matchChannel))return {kind:'arena',owner:arena,mode:'arena',page:'arena'};
  if(typeof duelService!=='undefined'&&duelService.queue)
    return {kind:'queue',owner:duelService,mode:duelService.ranked?'ranked'+duelService.mode:duelService.mode==='1v1'?'arena':'arena2v2',page:'multidevice'};
  return null;
}
function onlineLoadoutEditing(){
  const target=onlineLoadoutTarget();return !!(onlineLoadoutEditor&&target&&target.owner===onlineLoadoutEditor.owner&&target.kind===onlineLoadoutEditor.kind);
}
function openOnlineLoadoutEditor(){
  const target=onlineLoadoutTarget();if(!target||target.owner.loadoutWindow?.commits[authUser&&authUser.id])return false;
  if(!authUser||target.kind==='multi'&&String(authUser.id)!==target.owner.selfId||
     target.owner.loadoutWindow&&String(authUser.id)!==target.owner.loadoutWindow.self)return false;
  onlineLoadoutEditor=target;pendingGameMode=target.mode;detailKey=null;selPage='loadout';sfx('swap');return true;
}
function closeOnlineLoadoutEditor(){
  if(!onlineLoadoutEditor)return false;
  const page=onlineLoadoutEditor.page;onlineLoadoutEditor=null;detailKey=null;pendingGameMode=null;selPage=page;return true;
}
function onlineLoadoutRemaining(){
  const target=onlineLoadoutTarget(),window=target&&target.owner.loadoutWindow;
  return window?Math.max(0,Math.ceil((window.deadline-Date.now())/1000)):null;
}
function onlineLoadoutSave(){
  if(!onlineLoadoutEditing()||!arenaLoadoutReady())return false;
  return closeOnlineLoadoutEditor(); // Selection already uses the saved-slot path; no queue leave/rejoin.
}
function matchLoadoutLocalKit(mode,raw=loadout){
  const kit=Object.assign({},raw);if(mode!=='arena')kit.utility=null;
  const valid=arenaRemoteLoadout(kit);
  return valid&&(!Object.values(valid).some(k=>k&&typeof isLocked==='function'&&isLocked(k)))?valid:null;
}
function arenaLoadoutWindowReceive(p){
  if(!authUser||!arena.opponent||p.from!==arena.hostId||p.epoch!==arena.matchEpoch||arena.active||arena.round>0||
     !['lobby','map_reveal','map_vote','loadout'].includes(arena.phase))return false;
  const id='arena:'+arena.matchEpoch;
  if(p.windowId!==id||!Number.isFinite(p.remaining)||p.remaining<0||p.remaining>MATCH_LOADOUT_MS)return false;
  if(arena.loadoutWindow&&arena.loadoutWindow.id!==id)return false;
  const first=!arena.loadoutWindow;
  if(first)arena.loadoutWindow=matchLoadoutCreate(id,[String(authUser.id),String(arena.opponent.id)],String(authUser.id),p.remaining);
  else arena.loadoutWindow.deadline=Math.min(arena.loadoutWindow.deadline,Date.now()+p.remaining);
  if(first)arena.loadoutWindow.initialKit=matchLoadoutLocalKit('arena');
  arena.phase='loadout';arena.status='CHOOSE YOUR LOADOUT · 10 SECONDS';
  if(first)openOnlineLoadoutEditor();return true;
}
function arenaLoadoutWindowOpen(){
  if(arena.loadoutWindow)return true;
  const p={from:authUser.id,epoch:arena.matchEpoch,windowId:'arena:'+arena.matchEpoch,remaining:MATCH_LOADOUT_MS};
  if(!arenaLoadoutWindowReceive(p))return false;
  arenaSend('loadout_window',p);return true;
}
function arenaLoadoutSeal(p){
  const window=arena.loadoutWindow;
  if(!window||p.loadoutWindow!==window.id||!matchLoadoutSeal(window,p.loadouts,arenaRemoteLoadout))return false;
  loadout=Object.assign({},window.kits[authUser.id]);arena.opponent.loadout=Object.assign({},window.kits[arena.opponent.id]);
  arena.opponent.remoteLoadoutValid=true;onlineLoadoutEditor=null;detailKey=null;return true;
}
function arenaLoadoutTick(clock){
  const window=arena&&arena.loadoutWindow;if(!window||arena.phase!=='loadout'||window.sealed)return;
  if(!authUser||String(authUser.id)!==window.self)return;
  const self=String(authUser.id),host=self===String(arena.hostId);
  if(clock>=window.deadline&&!window.commits[self]){
    const kit=matchLoadoutLocalKit('arena')||matchLoadoutLocalKit('arena',window.initialKit);
    if(!kit){leaveArena('Choose a valid published loadout before queuing again.',true);return;}
    matchLoadoutCommit(window,self,kit,arenaRemoteLoadout);loadout=Object.assign({},kit);window.lastSend=0;closeOnlineLoadoutEditor();
  }
  if(clock>=window.lastSend){
    window.lastSend=clock+400;
    if(host)arenaSend('loadout_window',{epoch:arena.matchEpoch,windowId:window.id,remaining:Math.max(0,window.deadline-clock)});
    if(window.commits[self])arenaSend('loadout_commit',{epoch:arena.matchEpoch,windowId:window.id,kit:window.commits[self]});
  }
  if(host&&clock>=window.deadline&&window.members.every(id=>window.commits[id]))arenaHostStartRound();
  else if(clock>window.deadline+MATCH_LOADOUT_GRACE_MS)leaveArena('Loadout confirmation timed out. No match result was recorded.',true);
}
function multideviceLoadoutWindowReceive(m,p){
  if(!multideviceEnvelope(m,p,true,false)||m.round!==0||!['setup','loadout'].includes(m.phase)||
     p.windowId!=='multi:'+m.epoch||!Number.isFinite(p.remaining)||p.remaining<0||p.remaining>MATCH_LOADOUT_MS)return false;
  const first=!m.loadoutWindow;
  if(first)m.loadoutWindow=matchLoadoutCreate(p.windowId,m.roster.map(a=>a.id),m.selfId,p.remaining);
  else m.loadoutWindow.deadline=Math.min(m.loadoutWindow.deadline,Date.now()+p.remaining);
  if(first)m.loadoutWindow.initialKit=matchLoadoutLocalKit('multi')||matchLoadoutLocalKit('multi',m.actors[m.selfId].loadout);
  m.phase='loadout';m.status='CHOOSE YOUR LOADOUT · 10 SECONDS';
  if(first)openOnlineLoadoutEditor();return true;
}
function multideviceLoadoutSeal(m,p){
  if(!m.loadoutWindow||p.loadoutWindow!==m.loadoutWindow.id||
     !matchLoadoutSeal(m.loadoutWindow,p.loadouts,kit=>multideviceLoadoutKit(kit)))return false;
  for(const actor of Object.values(m.actors))actor.loadout=Object.assign({},m.loadoutWindow.kits[actor.id]);
  loadout=Object.assign({},m.actors[m.selfId].loadout);onlineLoadoutEditor=null;detailKey=null;return true;
}
function multideviceLoadoutKit(raw){const kit=arenaRemoteLoadout(raw);return kit&&!kit.utility?kit:null;}
function multideviceLoadoutTick(m,clock){
  const window=m.loadoutWindow;if(!window||m.phase!=='loadout'||window.sealed)return;
  if(!authUser||String(authUser.id)!==m.selfId)return;
  if(clock>=window.deadline&&!window.commits[m.selfId]){
    const kit=matchLoadoutLocalKit('multi')||matchLoadoutLocalKit('multi',window.initialKit);
    if(!kit){multideviceAbort('Choose a valid published loadout before queuing again.');return;}
    matchLoadoutCommit(window,m.selfId,kit,multideviceLoadoutKit);loadout=Object.assign({},kit);window.lastSend=0;closeOnlineLoadoutEditor();
  }
  if(clock>=window.lastSend){
    window.lastSend=clock+400;
    if(m.selfId===m.hostId)multideviceSend('loadout_window',{windowId:window.id,remaining:Math.max(0,window.deadline-clock)});
    if(window.commits[m.selfId])multideviceSend('loadout_commit',{windowId:window.id,kit:window.commits[m.selfId]});
  }
  if(m.selfId===m.hostId&&clock>=window.deadline&&window.members.every(id=>window.commits[id]))multideviceHostBegin();
  else if(clock>window.deadline+MATCH_LOADOUT_GRACE_MS)multideviceAbort('Loadout confirmation timed out. No ranked result was submitted.');
}
function quickOnlineMatch(mode){
  if(!chooseGameMode(mode,'onlineplay'))return false;
  for(const slot of ['primary','secondary','melee'])if(!loadout[slot])loadout[slot]=availableLoadoutFallback(slot);
  return launchSelectedMode();
}
function drawPlayLanding(offline=false){
  selBg();onlinePlayRects=[];
  const w=Math.min(620,W-32),x=(W-w)/2,small=H<520,top=small?18:36;
  ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#e8b658';ctx.font='700 '+(small?25:36)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(offline?'OFFLINE':'PLAY ONLINE',W/2,top);
  ctx.fillStyle='#a7af95';ctx.font=(W<440?9:12)+'px ui-monospace,Consolas,monospace';
  ctx.fillText(offline?'PICK ONE PRIMARY. JUMP IN.':'QUEUE NOW · EDIT WHILE SEARCHING · 10s TO CHOOSE',W/2,top+(small?36:50));
  const choices=offline?[
    ['endless','ENDLESS','Survive waves with your primary'],['cpu1','1v1 VS CPU','Choose difficulty and your primary'],['cpu2','2v2 VS CPU','You + an ally CPU']
  ]:[['arena','QUICK PLAY · 1v1','Casual · first to five'],['arena2v2','QUICK PLAY · 2v2','Team up · four players'],
    ['ranked','RANKED','1v1 / 2v2 · rank + Elo'],['party','PLAY WITH FRIENDS','Party matches · including party-only 1v1v1']];
  const gap=small?8:12,y0=top+(small?65:90),h=Math.min(small?53:76,(H-y0-92-gap*(choices.length-1))/choices.length);
  choices.forEach(([id,title,sub],i)=>{
    const y=y0+i*(h+gap);duelUiButton(onlinePlayRects,id,title,x,y,w,h,true);
    // Keep the label above the supporting line, even on short screens.
    ctx.fillStyle='rgba(12,18,13,.96)';ctx.fillRect(x+2,y+2,w-4,h-4);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=i===0?'#e8b658':'#e8d9a8';ctx.font='700 '+(small?13:18)+'px ui-monospace,Consolas,monospace';
    ctx.fillText(fitLine(title,w-20),W/2,y+h*.35);
    ctx.fillStyle='#a7af95';ctx.font=(W<440?9:11)+'px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(sub,w-20),W/2,y+h*.72);
  });
  const notice=modeBoardNotice&&now<modeBoardNoticeT?modeBoardNotice:offline?'PRACTICE STILL HAS FULL WEAPON TESTING':'NEW / BETA · YOUR SAVED LOADOUT IS USED TO QUEUE';
  ctx.fillStyle='#a7af95';ctx.font='9px ui-monospace,Consolas,monospace';ctx.fillText(fitLine(notice,w),W/2,H-61);
  backRect={x,y:H-44,w:120,h:30};duelUiButton([],'back','‹ HOME',x,H-44,120,30);
  duelUiButton(onlinePlayRects,'boards','MODES / LEADERBOARDS',x+130,H-44,w-130,30);
  ctx.textBaseline='alphabetic';
}
